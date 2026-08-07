# Sprint 2b — Claims: Ledger Atomicity + Deduction Marker

**Status:** approved to build (2026-07-28)
**Branch:** `sprint2b-claims-deduction-marker`
**Depends on:** Sprint 1 (merged), Sprint 2a (merged)
**Writer of record:** `ClaimService` (state machine) + `InvoiceService` / `BankLedgerService` (money). No other writer.

> This is the **spec of record for the claims money path**. The later GL-posting,
> appeal-resolution, and global-collectPayment-atomicity sprints all descend from
> decisions locked here. Deferred gaps are tracked durably in
> [`KNOWN_RECONCILIATION_GAPS.md`](KNOWN_RECONCILIATION_GAPS.md).

---

## Design decisions locked before build

1. **Ledger fix is claim-settle-only.** `collectPayment` stays `REQUIRES_NEW` +
   log-only-catch for all non-claim callers (OPD/IPD counter). Only the
   SETTLE-driven collection becomes atomic. The still-open global gap is recorded
   in `KNOWN_RECONCILIATION_GAPS.md` (#1) so "one-line propagation flip" survives
   the person who knew why.
2. **`markAdvancesApplied` `REQUIRES_NEW` is OUT of scope** — identical
   log-only-catch flaw; deferred, tracked in `KNOWN_RECONCILIATION_GAPS.md` (#2).
3. **APPEAL is a sub-state of a SETTLED claim, not a new lifecycle status.**
   SETTLED stays terminal. Disposition + holding classification live on an
   append-only deduction record; KPIs read that record.
4. **A deduction may be split across dispositions**, lines summing *exactly* to
   `approved − settled`.
5. **No disposition mutates the invoice in 2b.** WRITE_OFF, APPEAL and
   RECOVER_FROM_PATIENT are all classification-only over the *existing*
   outstanding. WRITE_OFF does **not** post a GL write-off / clear the
   receivable; APPEAL does **not** move money; RECOVER does **not** add a charge.
   This is what makes the §3 invariant (total outstanding unchanged) hold for
   **every** disposition, not just RECOVER. Downstream posting is later-sprint
   work (§7).

---

## §1 — Fold the settlement's bank-ledger write into the settlement transaction

### Problem (today)
`BankLedgerService.creditPayment(...)` runs `@Transactional(propagation = REQUIRES_NEW)`.
`InvoiceService.collectPayment` calls it and **swallows** any failure with a
log-only catch. On a claim SETTLE the `InvoicePayment` row, `invoice.paidAmount`/
status, the `SETTLED` claim status and its `claim_events` all commit in the outer
`REQUIRED` transaction, while the bank CREDIT is a **separate** transaction that
can fail and be swallowed. Result: invoice shows paid, claim shows SETTLED,
**no bank CREDIT row exists** — a silent reconciliation gap, landing *before* any
new money logic §2 adds.

### Change (settlement path only)
- Add `BankLedgerService.creditPaymentRequired(...)` — same body, **default
  `REQUIRED` propagation** (participates in the caller's transaction). Leave the
  existing `creditPayment` (`REQUIRES_NEW`) untouched for every other caller.
- Thread a boolean `atomicLedger` from `ClaimService` SETTLE →
  `InvoiceService.collectPayment` (overload; existing callers unchanged, pass
  `false`).
- When `atomicLedger == true`: `collectPayment` calls `creditPaymentRequired`
  and **does not catch** — a ledger failure propagates and rolls the whole
  settlement back.
- When `false`: unchanged (`REQUIRES_NEW` + log-only catch).

### Transitions / side-effects
- No state-machine change. SETTLE's collection becomes **all-or-nothing** with
  the bank CREDIT: `InvoicePayment` + `invoice.paidAmount`/status +
  `claim.status=SETTLED` + `claim_events` + `BankTransaction(CREDIT)` commit or
  roll back as one unit.
- `recordPayment=false` settlements still skip collection entirely — unchanged.

**§1 ships and passes §6.1 BEFORE any §2 code touches SETTLE. Non-negotiable.**

---

## §2 — Deduction marker (`DEDUCTION_NOTED`)

When a claim is SETTLED with `settledAmount < approvedAmount`, the payer deducted
`approved − settled`. §2 records **why**, split by disposition, without ever
mutating the invoice.

### New action: `NOTE_DEDUCTION`
- **Transition:** `SETTLED → SETTLED` (no status change; SETTLED stays terminal).
- **Precondition:** `settledAmount < approvedAmount` (else `BadRequestException
  "no deduction to note"`). Rejected from any non-SETTLED status via
  `requireState`.
- **Single marking per claim:** if the claim already has deduction lines, reject
  (`"deduction already noted"`). Corrections/reversals are out of scope (§7).
- **Payload (`TransitionRequest.deductions[]`):** each line
  `{ disposition, amount, reason }`.
  - `disposition ∈ { WRITE_OFF, APPEAL, RECOVER_FROM_PATIENT }`
  - `amount > 0` (scale 2, HALF_UP)
  - `reason` required, non-blank (line-level)
  - **`sum(amount) compareTo (approved − settled) == 0`** — exact-decimal, or
    reject with expected vs. supplied figures.

### New append-only entity: `ClaimDeductionLine` (`claim_deduction_lines`)
Insert-only, mirroring `ClaimEvent`'s discipline — **no `@Setter`, no
`@PreUpdate`, no update/delete anywhere**; single writer is `ClaimService`;
written in the **same transaction** as the event it belongs to.
- `id` (UUID), `claim` (LAZY `@ManyToOne`, FK
  `fk_claim_deduction_lines_claim`), `disposition` (varchar), `amount`
  (numeric), `reason` (TEXT), `actor_user_id`, `actor_name`, `created_at`.

### Side-effects of `NOTE_DEDUCTION` (one transaction)
1. Insert N `ClaimDeductionLine` rows.
2. Append one `DEDUCTION_NOTED` `claim_event` — human-readable summary.
3. **No `invoice` write. No `InvoicePayment`. No `BankTransaction`.** (§3.)
4. `pending_with` stays `NONE` (SETTLED).

`ClaimEvent.event_type` gains `DEDUCTION_NOTED` (well under the 40-char column).

---

## §3 — THE TRIPWIRE: RECOVER re-labels, never re-charges

`RECOVER_FROM_PATIENT` (and every other disposition) **classifies** a slice of
the invoice's *already-existing* outstanding as patient-due, dated and visible.
The shortfall already sits in `outstanding = total − paidAmount −
advanceAdjusted` (F4 audit). Marking adds **zero** new charge.

### Invariant (load-bearing)
For any `NOTE_DEDUCTION`, before vs. after:
- `invoice.total`, `invoice.paidAmount`, `invoice.advanceAdjusted` — each **unchanged**.
- ∴ `total − paidAmount − advanceAdjusted` — **unchanged** (`compareTo == 0`).
- No new `InvoicePayment` / charge / `BankTransaction` rows for the invoice.

If total outstanding rises, the patient has been double-charged — the billing
disaster this rule exists to prevent. §6.2 asserts this and fails the build if
outstanding moves.

---

## §4 — WRITE_OFF and APPEAL bucketing

Because the claim stays SETTLED, dispositioned amounts must be readable so
`approved − settled` is never miscounted as either collected or lost.
`ClaimService.getSummary` gains totals aggregated from `claim_deduction_lines`
(hospital-scoped) added to `ClaimsSummary`:
- `deductionWriteOffTotal` — leakage feed (WRITE_OFF sum). Source of truth the
  future leakage dashboard reads; **no dashboard UI in 2b**.
- `deductionAppealTotal` — **holding** bucket (APPEAL sum): neither collected
  nor lost.
- `deductionRecoverTotal` — re-labelled patient-due (RECOVER sum).
- `deductionUnmarkedCount` — worklist signal: SETTLED claims with
  `settled < approved` and **no** deduction lines yet. Mirrors the existing
  `needsEnhancement` detection-only pattern.

Existing `settledAmount` KPI unchanged; these totals sit alongside it so the gap
is explained, not hidden.

---

## §5 — API & frontend touch-points

- **API:** reuse `POST /api/finance/claims/{id}/transition` with
  `action=NOTE_DEDUCTION` + `deductions[]`. New summary fields flow through the
  existing `/summary` response. No new HMS endpoints; finance stays a thin client.
- **finance `Claims.jsx`:** deduction-marker modal on SETTLED claims where
  `settled < approved`; line editor (disposition + amount + reason) with a live
  "must sum to ₹(approved−settled)" check mirroring the server rule; new KPI
  tiles (To write off / Under appeal / To recover from patient / Unexplained
  deductions). No claim tables client-side.

### §5.1 — WRITE_OFF / disposition visibility against invoice outstanding (ADDITION 1)
Decision #5 keeps the money model clean but means a **written-off shortfall still
shows as plain invoice outstanding** until a later GL sprint. That is a **dunning
risk**: someone could chase a patient for money the hospital already decided to
eat. The money model does **not** change; the **UI must become deduction-aware**.

- **Requirement:** everywhere finance shows an invoice's outstanding for a claim's
  invoice, surface the classified portions against it — e.g.
  *"₹12,000 outstanding, of which ₹12,000 written off"* rather than a bare
  *₹12,000*. Break out written-off / under-appeal / recover-tagged slices.
- Classification is already persisted in `claim_deduction_lines`; the UI just
  reads it (via the claim summary / a per-invoice deduction lookup).
- **PARTIAL rule:** if any consumer of invoice outstanding **cannot** cleanly be
  made deduction-aware in 2b (a collections list, statement, reminder/dunning
  job), it is flagged **PARTIAL** and **listed explicitly** in the delivery
  notes — do **not** force it. We must know every place a bare outstanding could
  still mislead. (Running inventory of PARTIAL consumers maintained in the PR
  description and, if it involves money that could be chased, cross-listed in
  `KNOWN_RECONCILIATION_GAPS.md`.)

---

## §6 — VERIFICATION REQUIRED (real runs only)

New harness `ClaimSprint2bVerificationIT`, same rig as
`ClaimSprint1VerificationIT`: `@SpringBootTest(RANDOM_PORT)`,
`@ActiveProfiles("verify")`, throwaway local Postgres, Hibernate-generated
schema, **real HTTP through the real security filter chain and controllers**,
assertions read **real persisted state** via real repositories in fresh
transactions. The run transcript is the evidence — no reconstructed output, no
reading entity classes in lieu of a run. Prove rollback safety and negative
paths, not just happy paths.

### 6.1 — LOAD-BEARING #1: ledger-rollback proof (§1)
Fault injection via `@SpyBean BankLedgerService` throwing **only** on
`creditPaymentRequired` — everything else real; the rollback asserted is the real
transaction manager against the real DB.
- Drive a real SETTLE (with `bankAccountId`, `recordPayment=true`) → spy throws.
- Assert the SETTLE call **fails**, and in a fresh read: claim still
  `APPROVED`/`PARTIALLY_APPROVED` (**not** SETTLED); `invoice.paidAmount` &
  status unchanged; **no** `InvoicePayment` row; **no** `BankTransaction` CREDIT
  row; **no** `STATUS_CHANGE → SETTLED` event. Nothing partial landed.
- Happy path (no spy throw): exactly **one** CREDIT row, atomic with the
  settlement; and assert **no** `"Bank ledger credit failed"` ERROR log on the
  settle path (the swallow is gone).

### 6.2 — LOAD-BEARING #2: outstanding-unchanged proof (§3)
- Real SETTLE with `settled < approved`, leaving a known outstanding; capture
  `total − paid − advance`.
- `NOTE_DEDUCTION` with a single `RECOVER_FROM_PATIENT` line = full gap → assert
  outstanding `compareTo` **unchanged**; `total`/`paid`/`advance` each unchanged;
  no new payment/charge/`BankTransaction` rows; RECOVER amount retrievable from
  `claim_deduction_lines`.
- Repeat with a **mixed** split (WRITE_OFF + APPEAL + RECOVER) summing to the gap
  → outstanding still unchanged.

### 6.3 — Negative paths + rounding boundary (real; each asserts *nothing persisted*)
- `settled == approved` → rejected ("no deduction").
- Lines don't sum to `approved − settled` → rejected; `claim_deduction_lines`
  for that claim **empty** afterward (append-only integrity).
- Second `NOTE_DEDUCTION` on an already-marked claim → rejected.
- Invalid disposition / blank reason / non-positive amount → rejected.
- `NOTE_DEDUCTION` from a non-SETTLED status → rejected.
- **Rounding boundary (ADDITION 2):** for a rounding-sensitive gap (e.g. gap
  ₹1000):
  - exact split `333.33 + 333.33 + 333.34` → **PASSES** (sum `compareTo` gap == 0).
  - naive split `333.33 × 3 = 999.99` → **REJECTS**, nothing persisted.
  This is the exact class of HALF_UP half-paise drift that hides inside a sum
  check.

### 6.4 — Marking-transaction atomicity
Force a failure between the event insert and the line inserts → assert **both**
roll back: no orphan `DEDUCTION_NOTED` event without its lines, and no lines
without the event.

### 6.5 — KPI proof
`getSummary` returns correct `deductionWriteOffTotal` / `deductionAppealTotal` /
`deductionRecoverTotal` / `deductionUnmarkedCount`; appealed amount appears in the
holding bucket and is counted as **neither** collected (`settledAmount`) **nor**
lost.

---

## §7 — OUT OF SCOPE (explicit)

- **`markAdvancesApplied` `REQUIRES_NEW`** — same log-only-catch reconciliation-gap
  shape; deferred. Tracked in `KNOWN_RECONCILIATION_GAPS.md` (#2).
- **Global `collectPayment` atomicity** for non-claim payments (OPD/IPD counter
  keep `REQUIRES_NEW` this sprint). Tracked in `KNOWN_RECONCILIATION_GAPS.md` (#1).
- **Any GL / receivable posting** for WRITE_OFF — no reduction of the invoice
  receivable; classification only. (Leakage dashboard consumes it later. §5.1 is
  the interim UI mitigation for the dunning risk.)
- **Appeal resolution money movement** — no `APPEAL_WON/LOST`, no recovery of
  appealed amounts. Holding classification only.
- **Editing / reversing / superseding a deduction marker** — single marking per
  claim; corrections are a later sprint.
- **The leakage dashboard UI** — 2b produces the data + totals it will read.
- **Auto-marking / forcing a deduction at SETTLE time** — marking is a separate
  desk action; `deductionUnmarkedCount` surfaces the backlog.
- **A new claim lifecycle status for appeal** — deliberately rejected; APPEAL is
  a sub-state on the SETTLED claim.
- **Any patient-facing invoice change or new charge** — the entire point of §3.

---

## §8 — Files

- `service/BankLedgerService.java` — add `creditPaymentRequired` (REQUIRED).
- `service/InvoiceService.java` — `atomicLedger` overload on `collectPayment`;
  atomic branch (no swallow) for `true`.
- `service/ClaimService.java` — `NOTE_DEDUCTION` action; pass `atomicLedger=true`
  on SETTLE; deduction validation; summary aggregation.
- `entity/ClaimDeductionLine.java` *(new)*,
  `repository/ClaimDeductionLineRepository.java` *(new)* — append-only.
- `entity/ClaimEvent.java` — document `DEDUCTION_NOTED` type.
- `dto/ClaimDtos.java` — `DeductionLineRequest`, `TransitionRequest.deductions[]`,
  new `ClaimsSummary` totals.
- `test/.../ClaimSprint2bVerificationIT.java` *(new)*.
- finance `Claims.jsx` (+ any invoice-outstanding view per §5.1) — marker modal,
  KPI tiles, deduction-aware outstanding.
- `docs/schemas/03_*`-style DDL note if a hand-run migration is needed for
  `claim_deduction_lines` on the Supabase instance (Hibernate `ddl-auto` builds
  it in verify; prod DDL captured alongside the prior backfills).

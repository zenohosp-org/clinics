# Known Reconciliation Gaps (deferred, not forgotten)

Durable record of money-path reconciliation gaps we have **consciously deferred**,
so the reasoning survives the person who knew it. Each entry names the gap, why
it's deferred, the exact fix, and the blast radius. When a gap is closed, move it
to the "Closed" section with the commit/sprint that closed it — don't delete it.

> A gap on this list is a decision, not an oversight. Do not "fix" one silently
> in an unrelated change; each has a blast radius that deserves its own
> verification (real run, rollback + negative paths proven).

---

## OPEN

### #1 — `collectPayment` bank-ledger write is atomic for claim settlement only
- **Where:** `InvoiceService.collectPayment` → `BankLedgerService.creditPayment`
  (`@Transactional(propagation = REQUIRES_NEW)`), with a log-only catch in
  `collectPayment`.
- **Gap:** the bank CREDIT runs in its own transaction and its failure is
  swallowed, so a payment can commit (invoice marked paid) with **no
  corresponding bank CREDIT row** — a silent reconciliation gap.
- **What Sprint 2b fixed:** the **claim-settlement** path only. SETTLE now calls
  `collectPayment(..., atomicLedger=true)`, which uses `creditPaymentRequired`
  (`REQUIRED` propagation, no catch) so the ledger write commits/rolls back with
  the settlement. See `sprint2b-claims-deduction-marker.md` §1 + §6.1.
- **Still open:** **every non-claim caller** of `collectPayment` — the OPD/IPD
  cash counter and any other direct payment collection — still uses
  `REQUIRES_NEW` + log-only catch. In current prod this is the **only** payment
  flow actually carrying money (`invoice_claims` is empty), so the live risk
  lives here, not in claims.
- **The fix (when scheduled):** flip those callers to `atomicLedger=true` (or make
  `REQUIRED` the default and drop the swallow). It is a one-line propagation
  change **per call site** — but it changes the failure semantics of the entire
  counter payment flow, so it must ship with its own rollback + negative-path
  verification, not as a drive-by.
- **Deferred because:** Sprint 2b was scoped (by decision) to the claims money
  path; widening the blast radius to all counter payments was held for a
  dedicated sprint with its own evidence bar.

### #2 — `markAdvancesApplied` runs in its own `REQUIRES_NEW` transaction, log-only catch
- **Where:** `InvoiceService.collectPayment` →
  `PatientAdvanceService.markAdvancesApplied` (`REQUIRES_NEW`), wrapped in a
  log-only catch.
- **Gap:** same shape as #1 — on a fully-paid IPD invoice with advance applied,
  if `markAdvancesApplied` fails it is logged and the invoice still commits as
  paid, leaving advance-application reconciliation off until re-applied manually.
- **The fix (when scheduled):** fold it into the caller's `REQUIRED` transaction
  and let it propagate, same pattern as the §1 ledger fix. Prove rollback + no
  partial advance state.
- **Deferred because:** Sprint 2b explicitly scoped section 1 to the bank-ledger
  write only; this sibling was held to keep the sprint focused on
  money-landing-in-bank. Distinct concern (advance reconciliation), distinct
  verification.

### #3 — Invoice-outstanding consumers not yet deduction-aware (dunning risk)
- **Context:** Sprint 2b decision #5 keeps the money model clean — a WRITE_OFF /
  APPEAL / RECOVER marker re-classifies a settled claim's shortfall but does NOT
  change the invoice. So a written-off shortfall still shows as plain invoice
  outstanding until a later GL sprint posts it. §5.1 mitigates this in the UI by
  surfacing the classification wherever outstanding is shown for a claim's invoice.
- **Covered in 2b (deduction-aware):**
  - `HMS-frontend` `ClaimChip.jsx` — now shows "of which ₹X written off · ₹Y under
    appeal · ₹Z to recover" for a settled short-payment, and an amber "short-paid
    — reason not recorded" when unmarked. Renders in `IPDBilling.jsx` and
    `OPDBilling.jsx` beside each invoice's outstanding.
  - Backend `ClaimResponse` carries the per-claim breakdown; `ClaimsSummary` carries
    the write-off / appeal / recover / unmarked buckets.
- **✅ DEPLOY GATE — CLEARED (Part A done).** The three collection-path screens
  that show a bare outstanding at the exact moment a patient pays are now
  deduction-aware, via the shared `InvoiceDeductionNote` (same annotation
  `ClaimChip` uses), each fed by the read-only `claimByInvoice` lookup:
  - `HMS-frontend` `DischargeModal.jsx` ✅
  - `HMS-frontend` `FinalizeIPDBillingModal.jsx` ✅
  - `HMS-frontend` `InvoiceList.jsx` ✅

  Read-side join only; no money change. Proven by real runs (vitest + jsdom):
  the collectible figure is byte-identical with and without the deduction
  annotation (`DischargeModal.test.jsx`), the common no-claim path renders no
  annotation node, and the annotation gating is covered for all three screens by
  the shared-component tests. **This was the last mile: with Part A merged, 2b is
  deployable.**

- **PARTIAL — backlog (flagged, not forced; not deploy-blocking):**
  - **finance `Claims.jsx` marker modal + KPI tiles** — NOT a gap: lives in the
    SEPARATE finance.zenohosp.com repo by the same HMS-owns-tables /
    finance-owns-workspace split as Sprint 1. Backend API is ready
    (`NOTE_DEDUCTION` action + summary buckets + per-claim breakdown); the UI
    (marker modal, live "must sum to gap" check, KPI strip) is a finance-repo build
    against the shipped endpoints.
  - `HMS-frontend` `IPDDetailPane.jsx`, `AdminDashboard.jsx`,
    `AppointmentsDashboard.jsx`, `AmbulanceBilling.jsx` — show invoice outstanding
    with no claim-deduction data joined in, but not at a point-of-payment moment.
- **Why the backlog items are deferred:** making each remaining consumer
  deduction-aware means wiring claim-deduction data into screens that today read
  only invoices — a cross-cutting change per screen. Per the Sprint 2b §5.1 PARTIAL
  rule, these are listed rather than forced. The money model is unaffected either
  way; this is visibility only.
- **The fix (deploy-gate three first, then backlog):** join the per-invoice
  deduction breakdown into each view (the data already exists on `ClaimResponse` /
  `claim_deduction_lines`) and render the same "of which … written off" annotation
  the chip uses. Scoped in
  [`sprint2b-followup-deduction-visibility.md`](sprint2b-followup-deduction-visibility.md).

---

## CLOSED

_(none yet — move entries here with the closing commit/sprint when fixed.)_

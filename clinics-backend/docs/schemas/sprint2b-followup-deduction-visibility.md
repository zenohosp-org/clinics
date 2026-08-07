# Sprint 2b follow-up — Deduction visibility (the last mile before 2b is deployable)

**Status:** Part A DONE (deploy gate cleared); Part B pending (finance repo)
**Parent:** [`sprint2b-claims-deduction-marker.md`](sprint2b-claims-deduction-marker.md) §5.1
**Tracking record:** [`KNOWN_RECONCILIATION_GAPS.md`](KNOWN_RECONCILIATION_GAPS.md) #3

Neither part below is a money-model change. Both are **read-side consumers** of
data that Sprint 2b already persists (`claim_deduction_lines`, surfaced on
`ClaimResponse` and `ClaimsSummary`). Sprint 2b's classification-only invariant
is proven (§6.2); nothing here touches invoice totals, payments, or the ledger.

---

## Part A — HMS-frontend collection-path screens (THIS repo) — ✅ DONE (deploy gate cleared)

**Delivered.** All three screens now render the shared `InvoiceDeductionNote`
beside their collectible figure, fed by the read-only `claimByInvoice` lookup
(single batched `claimsApi.list` per screen, degrades to no-annotation on
failure). The money model is untouched; the annotation reads the claim, the
figure reads the invoice. Verified by real vitest+jsdom runs (see A3).

### A1. Screens (in priority order — all three block deploy)
1. `DischargeModal.jsx`
2. `FinalizeIPDBillingModal.jsx`
3. `InvoiceList.jsx`

### A2. The change (per screen)
- Fetch the claim(s) for the invoice(s) on screen via the existing
  `claimsApi.list(hospitalId)` (already used by `IPDBilling`/`OPDBilling`), build
  the same `claimByInvoice[invoiceId]` map, and pass the claim to the outstanding
  display.
- Where outstanding is rendered, annotate it with the deduction breakdown — reuse
  `ClaimChip` where a chip fits, or render the same "of which ₹X written off ·
  ₹Y under appeal · ₹Z to recover" / amber "short-paid — reason not recorded"
  line where a chip doesn't. All fields already exist on the claim:
  `deductionWrittenOff`, `deductionAppealed`, `deductionToRecover`,
  `deductionTotal`, `deductionUnmarked`.
- **Do not change the outstanding number.** Classification sits *beside* it, never
  subtracts from it. (Same invariant §6.2 proves for the marker itself.)

### A3. Verification (DONE)
- Real vitest+jsdom runs, 13/13:
  - `DischargeModal.test.jsx` — full-screen render: collectible figure
    byte-identical with and without the deduction annotation; common no-claim path
    renders no annotation node; exactly one `claimsApi.list` call (no per-row calls).
  - `InvoiceDeductionNote.test.jsx` — common path renders nothing (no node, no
    layout shift); qualifying settled short-payments render the correct split /
    amber note.
  - `deduction.test.js` — gating logic.
  - `vite build` — all three screens compile.

### A3a. Deferred full mounts — trigger-conditioned, NOT open backlog
Full mounts of `FinalizeIPDBillingModal` and `InvoiceList` were **deliberately not
written**. The byte-identical-figure property lives in the shared
`InvoiceDeductionNote` + `deductionBreakdown()` (both fully proven), and all three
screens render that same component with **additive, identical wiring that does not
touch the collectible figure**. A full mount of the two ~1000-line components would
re-prove the shared logic at real harness cost for marginal coverage.

**This coverage holds ONLY while that wiring stays additive and identical.** The
shared-component proof stops covering `FinalizeIPDBillingModal` / `InvoiceList` the
moment either:
- computes its collectible / "amount due" figure differently (e.g. derives it from
  claim data, or restructures `grandTotal − advance − paid`), **or**
- moves `InvoiceDeductionNote` somewhere it could reflow the payment total (into
  the total row, or a flex/grid cell that resizes the amount).

**Trigger:** if a later change to either screen's billing logic or the note's
placement does the above, add the full mount for that screen then (assert the
collectible figure is unchanged by markers, as `DischargeModal.test.jsx` does).
Until then this is a watch condition, not a task.

### A4. Out of scope for Part A
- The remaining non-payment-moment consumers (`IPDDetailPane`, `AdminDashboard`,
  `AppointmentsDashboard`, `AmbulanceBilling`) — backlog, not deploy-blocking.
- Any GL/receivable posting for written-off amounts (later sprint).

---

## Part B — Finance marker modal + KPI strip (finance.zenohosp.com repo)

Not a gap — the HMS-owns-tables / finance-owns-workspace split from Sprint 1. The
backend API is already shipped; this is a finance-repo build against it.

### B1. Endpoints (already live on HMS)
- `POST /api/finance/claims/{id}/transition` with
  `{ "action": "NOTE_DEDUCTION", "deductions": [{ disposition, amount, reason }, …] }`
  — dispositions `WRITE_OFF | APPEAL | RECOVER_FROM_PATIENT`, amounts must sum
  exactly to `approvedAmount − settledAmount`.
- `GET /api/finance/claims` (`ClaimsSummary`) — carries
  `deductionWriteOffTotal`, `deductionAppealTotal`, `deductionRecoverTotal`,
  `deductionUnmarkedCount`, and per-claim `deductions[]` + breakdown.

### B2. UI
- Deduction-marker modal offered on SETTLED claims where `settled < approved`;
  line editor (disposition + amount + reason) with a **live client-side check that
  lines sum to ₹(approved − settled)** mirroring the server rule (server is
  authoritative — the exact-decimal reject is proven in §6.3).
- KPI tiles: To write off / Under appeal / To recover from patient / Unexplained
  deductions, from the summary buckets.
- Worklist: surface `deductionUnmarkedCount` (SETTLED, short-paid, not yet
  classified) as an action queue.

### B3. Out of scope for Part B
- Editing/reversing a marker (single marking per claim in 2b).
- Appeal resolution (APPEAL_WON/LOST) and the leakage dashboard — later sprints.

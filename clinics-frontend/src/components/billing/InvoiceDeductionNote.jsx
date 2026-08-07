import { deductionBreakdown } from '@/utils/deduction'

// Sprint 2b — the deduction annotation that sits BESIDE an invoice's outstanding
// on the collection-path screens (Discharge / FinalizeIPD / InvoiceList). It reads
// only the claim; it renders nothing for the common no-claim / fully-settled case,
// so the every-patient path is unchanged (no node, no layout shift). It never
// touches the outstanding figure — that is computed from the invoice alone.
//
// Renders exactly what ClaimChip shows in the billing rows, kept in sync via the
// shared deductionBreakdown() helper.
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function InvoiceDeductionNote({ claim }) {
  const d = deductionBreakdown(claim)
  if (!d.show) return null

  return (
    <span className="hms-claim-deduction-note" data-testid="deduction-note">
      {d.hasBreakdown && (
        <span
          className="hms-claim-deduction"
          title="Of the outstanding shown, this portion is a settled-claim deduction — already classified, not fresh patient-due."
        >
          of which {d.parts.map((p) => `${inr(p.amount)} ${p.label}`).join(' · ')}
        </span>
      )}
      {d.unmarked && (
        <span
          className="hms-claim-deduction is-unmarked"
          title="Payer settled short of approval; reason not recorded yet. Do not treat the residual as plain patient-due until Finance classifies it."
        >
          short-paid {inr(d.total)} — reason not recorded
        </span>
      )}
    </span>
  )
}

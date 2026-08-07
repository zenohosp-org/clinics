import InvoiceDeductionNote from '@/components/billing/InvoiceDeductionNote'

// Small status chip for an insurance/TPA claim on an invoice. Read-only: the
// claim lifecycle is worked in the Finance app; billing staff just need to see
// where a claim stands (and how much the payer approved) at a glance.
//
// Sprint 2b — deduction-aware via the shared InvoiceDeductionNote: for a claim
// SETTLED below the payer's approval, the shortfall still sits in the invoice's
// normal outstanding (we do NOT change the money — that would double-charge the
// patient), so beside the chip we surface how it was classified (written off /
// under appeal / to recover), amber when not yet classified. Same annotation the
// collection-path screens use.
const CLAIM_CFG = {
  DRAFT:              { label: 'Claim draft',    cls: 'is-draft' },
  PRE_AUTH:           { label: 'Pre-auth',       cls: 'is-preauth' },
  SUBMITTED:          { label: 'Claim submitted', cls: 'is-submitted' },
  APPROVED:           { label: 'Claim approved', cls: 'is-approved', amountKey: 'approvedAmount' },
  PARTIALLY_APPROVED: { label: 'Partly approved', cls: 'is-approved', amountKey: 'approvedAmount' },
  DENIED:             { label: 'Claim denied',   cls: 'is-denied' },
  SETTLED:            { label: 'Claim settled',  cls: 'is-settled', amountKey: 'settledAmount' },
}

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

export default function ClaimChip({ claim }) {
  if (!claim) return null
  const cfg = CLAIM_CFG[claim.status]
  if (!cfg) return null
  const amount = cfg.amountKey ? claim[cfg.amountKey] : null

  return (
    <span className="hms-claim-chip-wrap">
      <span
        className={`hms-claim-chip ${cfg.cls}`}
        title={`${claim.payerName || 'Payer'}${claim.tpaClaimNo ? ` · claim ${claim.tpaClaimNo}` : ''}${claim.denialReason ? ` · ${claim.denialReason}` : ''}`}
      >
        {cfg.label}{amount != null ? ` ${inr(amount)}` : ''}
      </span>
      <InvoiceDeductionNote claim={claim} />
    </span>
  )
}

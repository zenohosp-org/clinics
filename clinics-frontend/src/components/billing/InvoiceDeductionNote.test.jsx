import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InvoiceDeductionNote from '@/components/billing/InvoiceDeductionNote'

// This one component is what all three collection-path screens (DischargeModal,
// FinalizeIPDBillingModal, InvoiceList) render beside the outstanding figure.
// Proving it renders NOTHING on the common path proves the common path is
// untouched on every screen that uses it.
//
// COVERAGE BOUNDARY (see docs/schemas/sprint2b-followup-deduction-visibility.md
// §A3a): FinalizeIPDBillingModal and InvoiceList are covered here WITHOUT a full
// mount, but only because their wiring is additive and identical — the note sits
// beside a collectible figure computed purely from the invoice, never from a
// claim. If a change makes either screen compute that figure differently, or moves
// this note where it could reflow the payment total, this shared proof STOPS
// covering that screen — add the screen's own full mount then (assert the figure
// is byte-identical with/without markers, as DischargeModal.test.jsx does).
describe('InvoiceDeductionNote — common path renders nothing (no node, no layout shift)', () => {
  it('renders nothing for no claim', () => {
    const { container } = render(<InvoiceDeductionNote claim={null} />)
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('deduction-note')).toBeNull()
  })
  it('renders nothing for a non-settled claim', () => {
    const { container } = render(<InvoiceDeductionNote claim={{ status: 'APPROVED', approvedAmount: 5000 }} />)
    expect(container.firstChild).toBeNull()
  })
  it('renders nothing for a settled claim paid in full', () => {
    const { container } = render(<InvoiceDeductionNote claim={{
      status: 'SETTLED', deductionWrittenOff: 0, deductionAppealed: 0,
      deductionToRecover: 0, deductionUnmarked: false,
    }} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('InvoiceDeductionNote — qualifying settled short-payment', () => {
  it('shows the disposition breakdown', () => {
    render(<InvoiceDeductionNote claim={{
      status: 'SETTLED', deductionTotal: 3000,
      deductionWrittenOff: 1000, deductionAppealed: 1000, deductionToRecover: 1000,
    }} />)
    const note = screen.getByTestId('deduction-note')
    expect(note).toHaveTextContent('₹1,000 written off')
    expect(note).toHaveTextContent('₹1,000 under appeal')
    expect(note).toHaveTextContent('₹1,000 to recover')
  })
  it('shows an amber caution when short-paid but not yet classified', () => {
    render(<InvoiceDeductionNote claim={{
      status: 'SETTLED', deductionTotal: 1000, deductionUnmarked: true,
      deductionWrittenOff: 0, deductionAppealed: 0, deductionToRecover: 0,
    }} />)
    expect(screen.getByTestId('deduction-note')).toHaveTextContent('short-paid ₹1,000 — reason not recorded')
  })
})

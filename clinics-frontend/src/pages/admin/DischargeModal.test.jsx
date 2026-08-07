import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import DischargeModal from '@/pages/admin/DischargeModal'

// Load-bearing read-side analogue of backend §6.2: on a real render of a real
// collection-path screen, the collectible figure must be BYTE-IDENTICAL whether
// or not a settled-claim deduction annotation is shown — the annotation reads the
// claim, the figure reads the invoice, and never the twain shall meet.

const h = vi.hoisted(() => ({ invoice: null, claims: null }))

vi.mock('@/utils/api', () => ({
  invoiceApi: { getAdmissionInvoice: vi.fn(() => Promise.resolve(h.invoice)) },
  admissionApi: { discharge: vi.fn(() => Promise.resolve({})) },
  claimsApi: { list: vi.fn(() => Promise.resolve(h.claims)) },
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { hospitalId: 'h1' } }) }))
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ notify: vi.fn() }) }))

import { invoiceApi, claimsApi } from '@/utils/api'

const admission = { id: 'adm1', patientName: 'Test Patient', admissionNumber: 'A-1', primaryDiagnosis: 'x' }

// Same invoice in every scenario: total 10000, paid 6000 → balance ₹4,000.
const INVOICE = { id: 'inv1', status: 'PARTIAL', total: 10000, paidAmount: 6000 }
const EXPECTED_BALANCE = '₹4,000'

// A settled claim on inv1, paid ₹2,000 short of approval, fully written off.
const WRITTEN_OFF_CLAIM = {
  invoiceId: 'inv1', status: 'SETTLED', settledAmount: 6000, approvedAmount: 8000,
  deductionTotal: 2000, deductionWrittenOff: 2000, deductionAppealed: 0, deductionToRecover: 0,
}

// The balance lives in the inner <strong> ("₹4,000 still due"); scope to it so we
// don't also match the surrounding <p>.
const balanceStrong = () =>
  screen.getByText((_, el) => el?.tagName === 'STRONG' && /still due/i.test(el.textContent || ''))
const balanceText = () => balanceStrong().textContent

beforeEach(() => {
  vi.clearAllMocks()
  cleanup()
})

describe('DischargeModal — collectible figure is independent of claim deductions', () => {
  it('COMMON PATH: no-claim invoice shows the balance and NO annotation, one claims call', async () => {
    h.invoice = INVOICE
    h.claims = { claims: [] } // no claim for this invoice
    render(<DischargeModal admission={admission} onClose={() => {}} onDischarged={() => {}} />)

    await waitFor(() => expect(balanceStrong()).toBeInTheDocument())
    expect(balanceText()).toContain(EXPECTED_BALANCE)
    // Common path: no deduction annotation node at all.
    expect(screen.queryByTestId('deduction-note')).toBeNull()
    // One batched claims call for the whole modal — no per-row lookups.
    expect(claimsApi.list).toHaveBeenCalledTimes(1)
    expect(invoiceApi.getAdmissionInvoice).toHaveBeenCalledTimes(1)
  })

  it('MARKED: written-off claim shows the annotation, and the balance figure is BYTE-IDENTICAL', async () => {
    // First capture the no-claim balance text.
    h.invoice = INVOICE
    h.claims = { claims: [] }
    render(<DischargeModal admission={admission} onClose={() => {}} onDischarged={() => {}} />)
    await waitFor(() => expect(balanceStrong()).toBeInTheDocument())
    const balanceWithoutMarker = balanceText()
    cleanup()

    // Now the same invoice, but the claim carries a full write-off deduction.
    h.claims = { claims: [WRITTEN_OFF_CLAIM] }
    render(<DischargeModal admission={admission} onClose={() => {}} onDischarged={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('deduction-note')).toBeInTheDocument())
    const balanceWithMarker = balanceText()

    // The annotation appears...
    expect(screen.getByTestId('deduction-note')).toHaveTextContent('₹2,000 written off')
    // ...and the collectible figure did NOT move — byte for byte.
    expect(balanceWithMarker).toBe(balanceWithoutMarker)
    expect(balanceWithMarker).toContain(EXPECTED_BALANCE)
  })
})

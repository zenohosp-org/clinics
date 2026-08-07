import { describe, it, expect } from 'vitest'
import { deductionBreakdown } from '@/utils/deduction'

// The gating logic every collection-path screen shares. The common path (no
// claim / not settled / settled-in-full) must produce NOTHING to show, so the
// majority of invoices render exactly as before.
describe('deductionBreakdown — common path shows nothing', () => {
  it('no claim', () => {
    expect(deductionBreakdown(null).show).toBe(false)
    expect(deductionBreakdown(undefined).show).toBe(false)
  })
  it('claim not settled', () => {
    for (const status of ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'DENIED']) {
      expect(deductionBreakdown({ status, deductionWrittenOff: 500 }).show).toBe(false)
    }
  })
  it('settled but paid in full — no gap, no lines', () => {
    expect(deductionBreakdown({
      status: 'SETTLED', deductionWrittenOff: 0, deductionAppealed: 0,
      deductionToRecover: 0, deductionUnmarked: false,
    }).show).toBe(false)
  })
})

describe('deductionBreakdown — qualifying settled short-payments', () => {
  it('single write-off', () => {
    const d = deductionBreakdown({
      status: 'SETTLED', deductionTotal: 2000, deductionWrittenOff: 2000,
      deductionAppealed: 0, deductionToRecover: 0,
    })
    expect(d.show).toBe(true)
    expect(d.hasBreakdown).toBe(true)
    expect(d.unmarked).toBe(false)
    expect(d.parts).toEqual([{ key: 'writeoff', label: 'written off', amount: 2000 }])
  })
  it('mixed dispositions, non-zero parts only, in fixed order', () => {
    const d = deductionBreakdown({
      status: 'SETTLED', deductionTotal: 3000,
      deductionWrittenOff: 1000, deductionAppealed: 0, deductionToRecover: 2000,
    })
    expect(d.parts.map(p => p.key)).toEqual(['writeoff', 'recover']) // appeal omitted (0)
  })
  it('unmarked short-payment flags amber note with no breakdown', () => {
    const d = deductionBreakdown({
      status: 'SETTLED', deductionTotal: 1000, deductionUnmarked: true,
      deductionWrittenOff: 0, deductionAppealed: 0, deductionToRecover: 0,
    })
    expect(d.show).toBe(true)
    expect(d.hasBreakdown).toBe(false)
    expect(d.unmarked).toBe(true)
  })
})

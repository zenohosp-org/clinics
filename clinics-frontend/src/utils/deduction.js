// Sprint 2b — read-side helper for surfacing a settled claim's payer-deduction
// classification next to invoice outstanding. Pure: takes a claim, returns what
// to show. It NEVER computes or alters any money figure — the collectible amount
// is a function of the invoice (total − paid − advance), never of a claim. This
// helper only decides whether, and what, to annotate.
//
// A claim qualifies only when it is SETTLED for less than the payer approved.
// - hasBreakdown: some of the shortfall has been classified (written off / under
//   appeal / to recover) — show the split.
// - unmarked: short-paid but not yet classified — show an amber caution so the
//   residual is not treated as plain patient-due before Finance records why.
const num = (n) => Number(n || 0)
const pos = (n) => num(n) > 0

export function deductionBreakdown(claim) {
  if (!claim || claim.status !== 'SETTLED') return { show: false }

  const writtenOff = num(claim.deductionWrittenOff)
  const appealed = num(claim.deductionAppealed)
  const toRecover = num(claim.deductionToRecover)
  const total = num(claim.deductionTotal)
  const hasBreakdown = pos(writtenOff) || pos(appealed) || pos(toRecover)
  const unmarked = !!claim.deductionUnmarked

  if (!hasBreakdown && !unmarked) return { show: false }

  const parts = []
  if (pos(writtenOff)) parts.push({ key: 'writeoff', label: 'written off', amount: writtenOff })
  if (pos(appealed)) parts.push({ key: 'appeal', label: 'under appeal', amount: appealed })
  if (pos(toRecover)) parts.push({ key: 'recover', label: 'to recover', amount: toRecover })

  return { show: true, hasBreakdown, unmarked, total, parts }
}

// All timestamps from the backend are UTC. This module always converts to IST
// (Asia/Kolkata, UTC+5:30) regardless of the browser's local timezone setting.

const TZ = 'Asia/Kolkata'

export function fmtDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return String(iso) }
}

export function fmtDateMed(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return String(iso) }
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: TZ,
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return String(iso) }
}

export function fmtDateTimeShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: TZ,
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return String(iso) }
}

export function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true })
  } catch { return String(iso) }
}

export function timeAgo(iso) {
  if (!iso) return '—'
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return fmtDateMed(iso)
  } catch { return String(iso) }
}

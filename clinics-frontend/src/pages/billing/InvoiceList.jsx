import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { invoiceApi, bankApi, claimsApi } from "@/utils/api";
import InvoiceDeductionNote from "@/components/billing/InvoiceDeductionNote";
import { fmtId } from "@/utils/idFormat";
import { escapeHtml } from "@/utils/html";
import JsBarcode from "jsbarcode";
import { useNotification } from "@/context/NotificationContext";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PageHeader from "@/components/ui/PageHeader";
import {
  Search, ChevronLeft, Printer, Eye, FileText,
  CheckCircle2, Clock, XCircle, CreditCard, X, Landmark, Loader2,
  Scissors,
} from "lucide-react";

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Insurance']

// Cash → CASH-type drawer; UPI/Card/Bank Transfer → SAVINGS or CURRENT.
const PAYMENT_METHOD_TO_ACCOUNT_TYPES = {
  'Cash':          ['CASH'],
  'UPI':           ['SAVINGS', 'CURRENT'],
  'Card':          ['SAVINGS', 'CURRENT'],
  'Bank Transfer': ['SAVINGS', 'CURRENT'],
  'Insurance':     [],
}

function accountsForMethod(accounts, method) {
  const allowed = PAYMENT_METHOD_TO_ACCOUNT_TYPES[method] || []
  if (allowed.length === 0) return []
  return (accounts || []).filter(a => allowed.includes((a.accountType || '').toUpperCase()))
}

const TYPE_CHIP_CLS = {
  CONSULTATION: 'is-consultation',
  ROOM_CHARGE:  'is-room-charge',
  FOOD:         'is-food',
  RADIOLOGY:    'is-radiology',
  LAB_TEST:     'is-lab-test',
  MEDICINE:     'is-medicine',
  OT:           'is-ot',
  CUSTOM:       'is-custom',
}

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Waiver Modal ────────────────────────────────────────────────────────────
function WaiverModal({ item, invoiceId, onClose, onWaived }) {
  const { notify } = useNotification()
  const [amount, setAmount] = useState(
    item.waiverAmount != null ? String(item.waiverAmount) : ''
  )
  const [reason, setReason] = useState(item.waiverReason || '')
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(false)

  const hasWaiver = Number(item.waiverAmount || 0) > 0
  const max = Number(item.totalPrice || 0)
  const pct = (p) => setAmount(String(((max * p) / 100).toFixed(2)))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed < 0) { notify('Enter a valid waiver amount', 'error'); return }
    if (!reason.trim()) { notify('Waiver reason is required', 'error'); return }
    setSubmitting(true)
    try {
      const updated = await invoiceApi.waiveItem(invoiceId, item.id, parsed, reason.trim())
      notify('Waiver applied successfully', 'success')
      onWaived(updated)
    } catch {
      notify('Failed to apply waiver', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      const updated = await invoiceApi.waiveItem(invoiceId, item.id, 0, '')
      notify('Waiver removed', 'success')
      onWaived(updated)
    } catch {
      notify('Failed to remove waiver', 'error')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="hms-inv-waiver-overlay">
      <div className="hms-inv-waiver">
        <div className="hms-inv-waiver__head">
          <div>
            <h3 className="hms-inv-waiver__title">Apply Waiver</h3>
            <p className="hms-inv-waiver__sub">{item.description}</p>
          </div>
          <button onClick={onClose} className="hms-inv-waiver__close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="hms-inv-waiver__form">
          <div>
            <div className="hms-inv-waiver__field-head">
              <label className="hms-inv-waiver__label">
                Waiver Amount <span className="hms-inv-waiver__label-hint">(max {fmt(max)})</span>
              </label>
            </div>
            <div className="hms-inv-waiver__pcts">
              {[25, 50, 75, 100].map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pct(p)}
                  className="hms-inv-waiver__pct"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="hms-inv-waiver__amt-wrap">
              <span className="hms-inv-waiver__amt-prefix">₹</span>
              <input
                type="number"
                min="0"
                max={max}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="hms-inv-waiver__input has-prefix"
                required
              />
            </div>
          </div>

          <div>
            <label className="hms-inv-waiver__label">
              Reason <span className="hms-inv-waiver__label-req">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Financial hardship, Doctor's discretion, Insurance adjustment…"
              rows={2}
              className="hms-inv-waiver__textarea"
              required
            />
          </div>

          <div className="hms-inv-waiver__actions">
            {hasWaiver && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing || submitting}
                className="zu-btn-secondary"
              >
                {removing
                  ? <><Loader2 className="w-4 h-4 zu-spinner" /> Removing…</>
                  : 'Remove Waiver'
                }
              </button>
            )}
            <button type="button" onClick={onClose} className="zu-btn-secondary">Cancel</button>
            <button
              type="submit"
              disabled={submitting || removing}
              className="hms-inv-waiver__submit"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 zu-spinner" /> Applying…</>
                : 'Apply Waiver'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Invoice Detail Modal ────────────────────────────────────────────────────
export function InvoiceDetailModal({ invoiceId, onClose, onInvoiceUpdated }) {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [detail, setDetail] = useState(null)
  const [claim, setClaim] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waiverItem, setWaiverItem] = useState(null)
  const [bankAccounts, setBankAccounts] = useState([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [paying, setPaying] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [d, accounts, claimsData] = await Promise.all([
        invoiceApi.getDetail(invoiceId),
        user?.hospitalId ? bankApi.list(user.hospitalId).catch(() => []) : Promise.resolve([]),
        // Read-only claim context, one batched call; failures leave the annotation off.
        user?.hospitalId ? claimsApi.list(user.hospitalId).catch(() => null) : Promise.resolve(null),
      ])
      setDetail(d)
      setClaim((claimsData?.claims || []).find(c => String(c.invoiceId) === String(invoiceId)) || null)
      setBankAccounts(accounts)
      const def = accounts.find(a => a.isDefault) ?? accounts[0]
      if (def) setBankAccountId(def.id)
      const balance = Math.max(0, Number(d.total || 0) - Number(d.paidAmount || 0))
      if (balance > 0) setPayAmount(balance.toFixed(2))
    } catch {
      notify('Failed to load invoice details', 'error')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [invoiceId])

  const handleWaived = (updated) => {
    setDetail(updated)
    setWaiverItem(null)
    const newBalance = Math.max(0, Number(updated.total || 0) - Number(updated.paidAmount || 0))
    setPayAmount(newBalance > 0 ? newBalance.toFixed(2) : '')
    onInvoiceUpdated?.()
  }

  const handleCollect = async () => {
    const amt = parseFloat(payAmount)
    if (isNaN(amt) || amt <= 0) { notify('Enter a valid payment amount', 'error'); return }
    setPaying(true)
    try {
      const updated = await invoiceApi.collectPayment(invoiceId, {
        amount: amt,
        paymentMethod: payMethod,
        bankAccountId: bankAccountId || undefined,
        referenceNumber: referenceNumber || undefined,
        collectedBy: user?.name || user?.email,
      })
      setDetail(updated)
      const newBalance = Math.max(0, Number(updated.total || 0) - Number(updated.paidAmount || 0))
      setPayAmount(newBalance > 0 ? newBalance.toFixed(2) : '')
      setReferenceNumber('')
      notify('Payment collected successfully', 'success')
      onInvoiceUpdated?.()
      if (updated.status === 'PAID' || updated.status === 'SETTLED') onClose()
    } catch (err) {
      notify(err?.response?.data?.message || 'Failed to collect payment', 'error')
    } finally {
      setPaying(false)
    }
  }

  const printInvoice = () => {
    if (!detail) return
    const items = detail.items ?? []
    const total = Number(detail.total)
    const discount = Number(detail.discount || 0)
    const subtotalAmt = total + discount
    const statusStyle = {
      PAID: 'background:#d1fae5;color:#065f46', UNPAID: 'background:#fef3c7;color:#92400e',
      PARTIAL: 'background:#ffedd5;color:#9a3412', CANCELLED: 'background:#fee2e2;color:#991b1b',
    }
    // Built as raw SVG markup (not the React <Barcode>) since this view is
    // serialized into a standalone iframe document, outside the React tree.
    const barcodeValue = detail.invoiceNumber ?? ''
    let barcodeSvg = ''
    if (barcodeValue) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svgEl, barcodeValue, { format: 'CODE128', height: 40, width: 1.2, fontSize: 12, margin: 6, displayValue: true })
      barcodeSvg = svgEl.outerHTML
    }
    const rows = items.map(item => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151">${escapeHtml(item.itemType?.replace('_', ' '))}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151">${escapeHtml(item.description)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:center">×${item.quantity}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:right">₹${Number(item.unitPrice).toLocaleString('en-IN')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#111;text-align:right">₹${Number(item.totalPrice).toLocaleString('en-IN')}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoice ${escapeHtml(fmtId(detail.invoiceNumber))}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Lexend', sans-serif;font-size:13px;color:#1a1a1a;padding:36px}table{width:100%;border-collapse:collapse}@media print{body{padding:24px}}</style>
      </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #10b981">
        <div><div style="font-size:22px;font-weight:800;color:#10b981">ZenoHosp HMS</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(user?.hospitalName)}</div></div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700">${escapeHtml(fmtId(detail.invoiceNumber))}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">${detail.createdAt ? new Date(detail.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }) : ''}</div>
          <div style="margin-top:8px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${statusStyle[detail.status] ?? statusStyle.UNPAID}">${escapeHtml(detail.status)}</span></div>
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px">Billed To</div>
        <div style="font-size:15px;font-weight:700">${escapeHtml(detail.patientName) || '—'}</div>
        ${detail.patientUhid ? `<div style="font-size:12px;color:#6b7280">UHID: ${escapeHtml(fmtId(detail.patientUhid))}</div>` : ''}
        ${barcodeSvg ? `<div style="margin-top:10px">${barcodeSvg}</div>` : ''}
      </div>
      <table><thead><tr style="background:#f3f4f6">
        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Type</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Description</th>
        <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Qty</th>
        <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Unit</th>
        <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Total</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><div style="min-width:220px">
        ${discount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#4b5563"><span>Subtotal</span><span>₹${subtotalAmt.toLocaleString('en-IN')}</span></div><div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#ef4444"><span>Waivers</span><span>−₹${discount.toLocaleString('en-IN')}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-size:15px;font-weight:800;color:#111;border-top:2px solid #1a1a1a;margin-top:4px"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
      </div></div>
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
        Generated by ZenoHosp HMS · ${window.location.hostname} · Thank you for your payment
      </div></body></html>`
    const iframe = document.createElement('iframe')
    iframe.className = 'print-frame'
    document.body.appendChild(iframe)
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe)
    }, 250)
  }

  const canWaive = detail?.status === 'UNPAID' || detail?.status === 'PARTIAL' || detail?.status === 'UNSETTLED'
  const canPay   = detail?.status === 'UNPAID' || detail?.status === 'PARTIAL' || detail?.status === 'UNSETTLED'
  const balanceDue = detail ? Math.max(0, Number(detail.total || 0) - Number(detail.paidAmount || 0)) : 0
  const invoiceDate = detail?.createdAt
    ? new Date(detail.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const tax  = Number(detail?.tax || 0)
  const sgst = tax / 2
  const cgst = tax / 2

  const STATUS_CFG = {
    PAID:      { cls: 'is-paid',      Icon: CheckCircle2 },
    SETTLED:   { cls: 'is-settled',   Icon: CheckCircle2 },
    PARTIAL:   { cls: 'is-partial',   Icon: Clock        },
    UNPAID:    { cls: 'is-unpaid',    Icon: Clock        },
    UNSETTLED: { cls: 'is-unsettled', Icon: Clock        },
    CANCELLED: { cls: 'is-cancelled', Icon: XCircle      },
  }
  const sc = STATUS_CFG[detail?.status] ?? STATUS_CFG.UNPAID
  const StatusIcon = sc?.Icon ?? Clock

  return (
    <div className="hms-inv-detail-overlay">
      <div className="hms-inv-detail">

        {/* ── Header ── */}
        <div className="hms-inv-detail__header">
          <div>
            <h2 className="hms-inv-detail__title">
              {loading ? 'Loading…' : fmtId(detail?.invoiceNumber)}
            </h2>
            {!loading && detail && (
              <p className="hms-inv-detail__sub">
                {detail.patientName}{detail.patientUhid ? ` · ${fmtId(detail.patientUhid)}` : ''} · {invoiceDate}
              </p>
            )}
          </div>
          <div className="hms-inv-detail__header-right">
            {!loading && detail && (
              <span className={`hms-inv-detail__status ${sc.cls}`}>
                <StatusIcon className="w-3 h-3" />{detail.status}
              </span>
            )}
            <button onClick={onClose} className="hms-inv-detail__close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {loading ? (
          <div className="hms-inv-detail__loading">
            <Loader2 className="w-6 h-6 zu-spinner" />
          </div>
        ) : (
          <div className="hms-inv-detail__body">

            {/* ════ Left Panel: Services & Bills ════ */}
            <div className="hms-inv-detail__left">
              <div className="hms-inv-detail__panel-head">
                Services and Bills
              </div>

              <div className="hms-inv-detail__items-wrap">
                <table className="hms-inv-detail__items">
                  <thead>
                    <tr>
                      <th className="is-no">No</th>
                      <th className="is-date">Date</th>
                      <th>Services Name</th>
                      <th className="is-amt is-right">Amount</th>
                      <th className="is-gst is-center">Gst %</th>
                      <th className="is-total is-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="is-empty">
                          No line items on this invoice.
                        </td>
                      </tr>
                    ) : (
                      (detail.items || []).map((item, idx) => {
                        const waived   = Number(item.waiverAmount || 0)
                        const effective = Number(item.totalPrice || 0) - waived
                        const chipCls = TYPE_CHIP_CLS[item.itemType] ?? TYPE_CHIP_CLS.CUSTOM
                        return (
                          <tr key={item.id}>
                            <td className="is-no">{idx + 1}</td>
                            <td className="is-date">{invoiceDate}</td>
                            <td>
                              <div className="hms-inv-detail__item-stack">
                                <span className={`hms-inv-detail__type-chip ${chipCls}`}>
                                  {item.itemType?.replace('_', ' ')}
                                </span>
                                <span className="hms-inv-detail__item-desc">{item.description}</span>
                                {item.quantity > 1 && (
                                  <span className="hms-inv-detail__item-qty">×{item.quantity} units</span>
                                )}
                                {(item.waiverReason || canWaive) && (
                                  <div className="hms-inv-detail__item-meta">
                                    {item.waiverReason && (
                                      <span className="hms-inv-detail__item-reason">{item.waiverReason}</span>
                                    )}
                                    {canWaive && (
                                      <button
                                        onClick={() => setWaiverItem(item)}
                                        className={`hms-inv-detail__waive-link ${waived > 0 ? 'is-on' : ''}`}
                                      >
                                        {waived > 0 ? 'Edit waiver' : 'Apply waiver'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="is-amt">
                              {fmt(item.unitPrice)}
                            </td>
                            <td className="is-gst">—</td>
                            <td className="is-total">
                              {waived > 0 ? (
                                <span className="hms-inv-detail__total-stack">
                                  <span className="hms-inv-detail__total-strike">{fmt(item.totalPrice)}</span>
                                  <span className="hms-inv-detail__total-eff">{fmt(effective)}</span>
                                </span>
                              ) : (
                                <span className="hms-inv-detail__total-eff">{fmt(item.totalPrice)}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Totals footer ── */}
              <div className="hms-inv-detail__totals">
                <div className="hms-inv-detail__total-row">
                  <span className="hms-inv-detail__total-row__label">Subtotal:</span>
                  <span className="hms-inv-detail__total-row__amt">{fmt(detail.subtotal ?? detail.total)}</span>
                </div>
                {tax > 0 && (
                  <>
                    <div className="hms-inv-detail__total-row">
                      <span className="hms-inv-detail__total-row__label">SGST:</span>
                      <span className="hms-inv-detail__total-row__amt">{fmt(sgst)}</span>
                    </div>
                    <div className="hms-inv-detail__total-row">
                      <span className="hms-inv-detail__total-row__label">CGST:</span>
                      <span className="hms-inv-detail__total-row__amt">{fmt(cgst)}</span>
                    </div>
                  </>
                )}
                {Number(detail.discount || 0) > 0 && (
                  <div className="hms-inv-detail__total-row is-waiver">
                    <span className="hms-inv-detail__total-row__label">Total Waivers:</span>
                    <span className="hms-inv-detail__total-row__amt font-semibold">−{fmt(detail.discount)}</span>
                  </div>
                )}
                <div className="hms-inv-detail__total-row is-grand">
                  <span>Total:</span>
                  <span className="hms-inv-detail__total-row__amt">{fmt(detail.total)}</span>
                </div>
              </div>
            </div>

            {/* ════ Right Panel: Payment Details ════ */}
            <div className="hms-inv-detail__right">
              <div className="hms-inv-detail__right-head">
                Payment details
              </div>

              <div className="hms-inv-detail__right-body">

                {/* IPD note */}
                {detail.admissionId && (
                  <div className="hms-inv-detail__ipd-note">
                    Patient billing is mapped as cash during admission
                  </div>
                )}

                {/* Record payment form */}
                {canPay && (
                  <div className="hms-inv-detail__pay-form">
                    <div className="hms-inv-detail__pay-grid">
                      <div>
                        <label className="label">Amount</label>
                        <input
                          type="number"
                          className="input"
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value)}
                          placeholder="0.00"
                          min="0.01"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="label">Payment Type</label>
                        <SearchableSelect
                          value={payMethod}
                          onChange={(v) => {
                            setPayMethod(v)
                            const eligible = accountsForMethod(bankAccounts, v)
                            const def = eligible.find(a => a.isDefault) ?? eligible[0]
                            setBankAccountId(def ? def.id : '')
                          }}
                          clearable={false}
                          searchable={false}
                          options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">Reference Number</label>
                      <input
                        type="text"
                        className="input"
                        value={referenceNumber}
                        onChange={e => setReferenceNumber(e.target.value)}
                        placeholder="UTR / Cheque no. / Transaction ID"
                      />
                    </div>
                    {(() => {
                      const eligibleAccounts = accountsForMethod(bankAccounts, payMethod)
                      const allowedTypes = PAYMENT_METHOD_TO_ACCOUNT_TYPES[payMethod] || []
                      if (allowedTypes.length === 0) return null
                      if (eligibleAccounts.length === 0) {
                        return (
                          <div className="hms-inv-detail__pay-warn">
                            No {payMethod === 'Cash' ? 'CASH' : 'SAVINGS / CURRENT'} account found. Configure banks in the Finance app to track this payment.
                          </div>
                        )
                      }
                      return (
                        <div>
                          <label className="label hms-inv-detail__pay-bank-label">
                            <Landmark className="w-3 h-3" />Credit to
                            <span className="hms-inv-detail__pay-bank-label-detail">
                              ({payMethod === 'Cash' ? 'CASH only' : 'SAVINGS / CURRENT only'})
                            </span>
                          </label>
                          <SearchableSelect
                            value={bankAccountId}
                            onChange={setBankAccountId}
                            clearable={false}
                            options={eligibleAccounts.map(a => ({ value: a.id, label: a.accountName }))}
                          />
                        </div>
                      )
                    })()}
                    <div className="hms-inv-detail__pay-actions">
                      <button
                        onClick={handleCollect}
                        disabled={paying}
                        className="zu-btn-primary"
                      >
                        {paying
                          ? <><Loader2 className="w-3.5 h-3.5 zu-spinner" /> Processing…</>
                          : 'Payment Received'
                        }
                      </button>
                      <button onClick={printInvoice} className="zu-btn-secondary">
                        <Printer className="w-3.5 h-3.5" /> Print Invoice
                      </button>
                    </div>
                    {balanceDue > 0 && (
                      <div className="hms-inv-detail__balance-row">
                        <span className="hms-inv-detail__balance-row__label">Balance due</span>
                        <span className="hms-inv-detail__balance-row__amt">{fmt(balanceDue)}</span>
                      </div>
                    )}
                    {/* Beside the balance, never subtracted from it: settled-claim
                        deduction classification (or an amber not-yet-classified note). */}
                    <InvoiceDeductionNote claim={claim} />
                  </div>
                )}

                {/* Payment history entries */}
                {detail.payments?.length > 0 && (
                  <div className="hms-inv-detail__history">
                    {detail.payments.map(p => (
                      <div key={p.id} className="hms-inv-detail__history-row">
                        <p className="hms-inv-detail__history-date">
                          {new Date(p.paidAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </p>
                        <div className="hms-inv-detail__history-body">
                          <p className="hms-inv-detail__history-ref">{p.referenceNumber || p.notes || 'Notes'}</p>
                          <p className="hms-inv-detail__history-method">
                            {p.paymentMethod}
                            {(p.collectedByName || p.collectedBy) && ` · by ${p.collectedByName || p.collectedBy}`}
                          </p>
                        </div>
                        <p className="hms-inv-detail__history-amt">{fmt(p.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* PAID invoices: just show print */}
                {!canPay && (
                  <button onClick={printInvoice} className="zu-btn-secondary is-full">
                    <Printer className="w-4 h-4" /> Print Invoice
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {waiverItem && (
        <WaiverModal
          item={waiverItem}
          invoiceId={invoiceId}
          onClose={() => setWaiverItem(null)}
          onWaived={handleWaived}
        />
      )}
    </div>
  )
}

// ─── Mark as Paid Modal ──────────────────────────────────────────────────────
function MarkAsPaidModal({ invoice, onClose, onPaid }) {
  const { user } = useAuth()
  const { notify } = useNotification()
  const [bankAccounts, setBankAccounts] = useState([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user?.hospitalId) return
    bankApi.list(user.hospitalId).then(accounts => {
      setBankAccounts(accounts)
      // Pre-select for the initial Cash payment method
      const eligible = accountsForMethod(accounts, 'Cash')
      const def = eligible.find(a => a.isDefault) ?? eligible[0]
      if (def) setBankAccountId(def.id)
    }).catch(() => {})
  }, [user?.hospitalId])

  const handlePay = async () => {
    setSubmitting(true)
    try {
      await invoiceApi.markAsPaid(invoice.id, bankAccountId || undefined)
      notify('Invoice marked as paid — bank account credited', 'success')
      onPaid()
    } catch (err) {
      notify(err?.response?.data?.message || 'Failed to mark as paid', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="hms-mark-paid-overlay">
      <div className="hms-mark-paid">
        <div className="hms-mark-paid__head">
          <div>
            <h2 className="hms-mark-paid__title">
              <CreditCard className="hms-mark-paid__title-icon w-4 h-4" /> Mark as Paid
            </h2>
            <p className="hms-mark-paid__sub">{fmtId(invoice.invoiceNumber)} · {fmt(invoice.total)}</p>
          </div>
          <button onClick={onClose} className="hms-mark-paid__close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="hms-mark-paid__body">
          <div>
            <label className="label">Payment Method</label>
            <SearchableSelect
              value={paymentMethod}
              onChange={(v) => {
                setPaymentMethod(v)
                const eligible = accountsForMethod(bankAccounts, v)
                const def = eligible.find(a => a.isDefault) ?? eligible[0]
                setBankAccountId(def ? def.id : '')
              }}
              options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
            />
          </div>

          {(() => {
            const eligibleAccounts = accountsForMethod(bankAccounts, paymentMethod)
            const allowedTypes = PAYMENT_METHOD_TO_ACCOUNT_TYPES[paymentMethod] || []
            if (allowedTypes.length === 0) return null
            if (eligibleAccounts.length === 0) {
              return (
                <div className="hms-inv-detail__pay-warn">
                  No {paymentMethod === 'Cash' ? 'CASH' : 'SAVINGS / CURRENT'} account found. Configure banks in the Finance app to track this payment.
                </div>
              )
            }
            return (
              <div>
                <label className="label hms-inv-detail__pay-bank-label">
                  <Landmark className="w-3.5 h-3.5" /> Credit Payment To
                  <span className="hms-inv-detail__pay-bank-label-detail">
                    ({paymentMethod === 'Cash' ? 'CASH only' : 'SAVINGS / CURRENT only'})
                  </span>
                </label>
                <div className="hms-mark-paid__bank-grid">
                  {eligibleAccounts.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setBankAccountId(a.id)}
                      className={`hms-mark-paid__bank-card ${bankAccountId === a.id ? 'is-on' : ''}`}
                    >
                      <div className="hms-mark-paid__bank-card-head">
                        <p className="hms-mark-paid__bank-card-name">{a.accountName}</p>
                        {bankAccountId === a.id && <CheckCircle2 className="hms-mark-paid__bank-card-check w-3.5 h-3.5" />}
                      </div>
                      <p className="hms-mark-paid__bank-card-sub">
                        {a.accountNumber ? `···${a.accountNumber.slice(-4)}` : a.bankName || 'Cash'}
                      </p>
                      <p className="hms-mark-paid__bank-card-bal">{fmt(a.currentBalance)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        <div className="hms-mark-paid__footer">
          <button onClick={onClose} className="zu-btn-secondary">Cancel</button>
          <button
            onClick={handlePay}
            disabled={submitting}
            className="zu-btn-primary"
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 zu-spinner" /> Processing…</>
              : <><CheckCircle2 className="w-4 h-4" /> Confirm Payment</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice List ────────────────────────────────────────────────────────────
function InvoiceList() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [detailInvoiceId, setDetailInvoiceId] = useState(null);

  const load = () => {
    if (!user?.hospitalId) return
    setIsLoading(true)
    invoiceApi.getByHospital(user.hospitalId).then((data) => {
      setInvoices(Array.isArray(data) ? data : []);
    }).catch(() => {
      notify("Failed to fetch invoices", "error");
    }).finally(() => setIsLoading(false));
  }

  useEffect(() => { load() }, [user?.hospitalId]);

  const filteredInvoices = invoices.filter(
    (inv) => inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase())
      || inv.patientName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusCls = (status) => {
    switch (status) {
      case "PAID":      return "is-paid";
      case "UNPAID":    return "is-unpaid";
      case "CANCELLED": return "is-cancelled";
      default:          return "is-neutral";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "PAID":      return <CheckCircle2 className="w-3.5 h-3.5" />;
      case "UNPAID":    return <Clock className="w-3.5 h-3.5" />;
      case "CANCELLED": return <XCircle className="w-3.5 h-3.5" />;
      default:          return null;
    }
  };

  return (
    <div className="zu-page">
      <PageHeader
        title="Invoice History"
        subtitle="Track all hospital billing and payments"
        onBack={() => navigate("/billing/opd")}
      />
      <div className="hms-inv-list-headrow">
        <div className="hms-inv-list-search">
          <Search className="hms-inv-list-search__icon w-4 h-4" />
          <input
            type="text"
            placeholder="Search invoice or patient…"
            className="hms-inv-list-search__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="hms-inv-list-card">
        <div className="overflow-x-auto">
          <table className="hms-inv-list-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Date</th>
                <th>Total</th>
                <th className="is-center">Status</th>
                <th className="is-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array(5).fill(0).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="hms-inv-list-table__skel" />
                    </tr>
                  ))
                : filteredInvoices.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="hms-inv-list-table__empty">
                        <FileText className="w-12 h-12" />
                        No invoices found
                      </td>
                    </tr>
                  )
                  : filteredInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <div className="hms-inv-list-table__primary">{fmtId(inv.invoiceNumber)}</div>
                        <div className="hms-inv-list-table__sub">
                          {fmtId(inv.admissionNumber) || `ID: ${inv.id?.slice(0, 8)}…`}
                        </div>
                      </td>
                      <td>
                        {inv.patientName || '—'}
                        {inv.patientUhid && <div className="hms-inv-list-table__patient-sub">{fmtId(inv.patientUhid)}</div>}
                      </td>
                      <td>
                        {new Date(inv.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </td>
                      <td>
                        <div className="hms-inv-list-table__amt">{fmt(inv.total)}</div>
                        {Number(inv.discount || 0) > 0 && (
                          <div className="hms-inv-list-table__waived">
                            <Scissors className="w-2.5 h-2.5" /> -{fmt(inv.discount)} waived
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="hms-billing-status-center">
                          <span className={`hms-inv-list-status ${getStatusCls(inv.status)}`}>
                            {getStatusIcon(inv.status)}{inv.status}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="hms-inv-list-actions">
                          {inv.status === 'UNPAID' && (
                            <button
                              onClick={() => setPayingInvoice(inv)}
                              className="hms-inv-list-actbtn is-pay"
                              title="Mark as Paid"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            className="hms-inv-list-actbtn is-neutral"
                            title="Print Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDetailInvoiceId(inv.id)}
                            className="hms-inv-list-actbtn is-neutral is-eye"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {payingInvoice && (
        <MarkAsPaidModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onPaid={() => { setPayingInvoice(null); load() }}
        />
      )}

      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onInvoiceUpdated={() => load()}
        />
      )}
    </div>
  );
}

export default InvoiceList;

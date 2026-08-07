import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'
import { invoiceApi, admissionApi, claimsApi } from '@/utils/api'
import ClaimChip from '@/components/billing/ClaimChip'
import { fmtId } from '@/utils/idFormat'
import { escapeHtml } from '@/utils/html'
import JsBarcode from 'jsbarcode'
import Pagination from '@/components/ui/Pagination'
import PageHeader from '@/components/ui/PageHeader'
import TableSkeleton from '@/components/ui/TableSkeleton'
import FinalizeIPDBillingModal from '@/components/modals/FinalizeIPDBillingModal'
import { InvoiceDetailModal } from '@/pages/billing/InvoiceList'
import Menu from '@/components/ui/Menu'
import {
  ReceiptText, Search, CheckCircle2, Clock, XCircle,
  Printer, TrendingUp, AlertCircle, Loader2,
  Receipt, Eye, Plus, MoreHorizontal, BedDouble, Pill, FlaskConical, Stethoscope, ScanLine, Wrench
} from 'lucide-react'

const PAGE_SIZE = 10

const STATUS_CFG_IPD = {
  SETTLED: { label: 'Settled', cls: 'is-settled', Icon: CheckCircle2 },
  NOT_SETTLED: { label: 'Not Settled', cls: 'is-unpaid', Icon: Clock },
}

const TYPE_META = {
  MEDICINE: { cls: 'is-medicine', icon: <Pill className="w-3 h-3" /> },
  LAB_TEST: { cls: 'is-lab', icon: <FlaskConical className="w-3 h-3" /> },
  CONSULTATION: { cls: 'is-consultation', icon: <Stethoscope className="w-3 h-3" /> },
  ROOM_CHARGE: { cls: 'is-room', icon: <BedDouble className="w-3 h-3" /> },
  RADIOLOGY: { cls: 'is-radiology', icon: <ScanLine className="w-3 h-3" /> },
  CUSTOM: { cls: 'is-custom', icon: <Wrench className="w-3 h-3" /> },
}

function fmt(n) {
  if (!n) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function ItemTypePips({ items }) {
  if (!items?.length) return <span className="text-11 text-gray-400">—</span>
  const unique = [...new Set(items.map(i => i.itemType))]
  return (
    <div className="hms-billing-pips">
      {unique.map(type => {
        const m = TYPE_META[type] ?? TYPE_META.CUSTOM
        return (
          <span key={type} className={`hms-billing-pip ${m.cls}`}>
            {m.icon}
          </span>
        )
      })}
      <span className="hms-billing-pips__count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
    </div>
  )
}

function StatCard({ label, value, sub, Icon, accent }) {
  return (
    <div className="zu-card is-stat">
      <div className={`zu-stat-card-icon is-${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="zu-stat-card-body">
        <p className="zu-stat-card-label">{label}</p>
        <p className="zu-stat-card-value">{value}</p>
        {sub && <p className="zu-stat-card-sub">{sub}</p>}
      </div>
    </div>
  )
}

function InvoiceActionMenu({ inv, activeAdmissions, activeAdmissionIds, setFinalizeAdmission, setDetailInvoiceId, printInvoice }) {
  const isActiveAdm = !!inv.admissionId && activeAdmissionIds.has(String(inv.admissionId))
  const isPending = isActiveAdm && (inv.status === 'UNPAID' || inv.status === 'PARTIAL' || inv.status === 'UNSETTLED')
  const isPaidAdmit = isActiveAdm && (inv.status === 'PAID' || inv.status === 'SETTLED')
  const admission = isActiveAdm ? activeAdmissions.find(a => String(a.id) === String(inv.admissionId)) : null

  const items = []

  if (isPending) {
    items.push({
      label: (inv.status === 'PARTIAL' || inv.status === 'UNSETTLED') ? 'Continue Bill' : 'View Bill',
      icon: <Receipt className="w-4 h-4" />,
      disabled: !admission,
      onClick: () => admission && setFinalizeAdmission(admission)
    })
  }

  if (isPaidAdmit) {
    items.push({
      label: 'Add Charges',
      icon: <Plus className="w-4 h-4" />,
      disabled: !admission,
      onClick: () => admission && setFinalizeAdmission(admission)
    })
  }

  if (!isPending) {
    items.push({
      label: 'View Details',
      icon: <Eye className="w-4 h-4" />,
      onClick: () => setDetailInvoiceId(inv.id)
    })
  }

  items.push({ divider: true })

  items.push({
    label: 'Print Invoice',
    icon: <Printer className="w-4 h-4" />,
    onClick: () => printInvoice(inv)
  })

  return (
    <div className="hms-appt-am" onClick={e => e.stopPropagation()}>
      <Menu
        items={items}
        triggerIcon={<MoreHorizontal className="w-4 h-4" />}
        triggerClassName="hms-billing-rowbtn"
        align="right"
      />
    </div>
  )
}

export default function IPDBilling() {
  const { user } = useAuth()
  const { notify } = useNotification()

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [activeAdmissions, setActiveAdmissions] = useState([])
  const [finalizeAdmission, setFinalizeAdmission] = useState(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const loadData = () => {
    if (!user?.hospitalId) return
    setLoading(true)

    Promise.all([
      invoiceApi.listIpdPaginated(
        user.hospitalId,
        page - 1,
        PAGE_SIZE,
        statusFilter,
        debouncedSearch
      ),
      admissionApi.list(user.hospitalId, false).catch(() => [])
    ])
      .then(([data, admData]) => {
        setInvoices(data.invoices || [])
        setTotalPages(data.totalPages || 1)
        setTotalElements(data.totalElements || 0)
        setActiveAdmissions(Array.isArray(admData) ? admData : [])
      })
      .catch(() => notify('Failed to load IPD invoices', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [user?.hospitalId, page, statusFilter, debouncedSearch])

  // Insurance/TPA claims, keyed by invoice (newest claim wins). Read-only
  // context for the billing desk; failures degrade to "no chip".
  const [claimByInvoice, setClaimByInvoice] = useState({})
  useEffect(() => {
    if (!user?.hospitalId) return
    let cancelled = false
    claimsApi.list(user.hospitalId)
      .then(data => {
        if (cancelled) return
        const map = {}
        for (const c of (data?.claims || [])) {
          if (!map[c.invoiceId]) map[c.invoiceId] = c   // list is newest-first
        }
        setClaimByInvoice(map)
      })
      .catch(() => { /* claims are optional context on this page */ })
    return () => { cancelled = true }
  }, [user?.hospitalId])

  const activeAdmissionIds = useMemo(
    () => new Set(activeAdmissions.map(a => String(a.id))),
    [activeAdmissions]
  )

  const printInvoice = (inv) => {
    const items = inv.items ?? []
    const total = Number(inv.total)
    const discount = Number(inv.discount || 0)
    const subtotal = total + discount
    const statusCls = { PAID: 'background:#d1fae5;color:#065f46', SETTLED: 'background:#d1fae5;color:#065f46', UNPAID: 'background:#fef3c7;color:#92400e', UNSETTLED: 'background:#fef3c7;color:#92400e', PARTIAL: 'background:#ffedd5;color:#9a3412', CANCELLED: 'background:#fee2e2;color:#991b1b' }
    // Built as raw SVG markup (not the React <Barcode>) since this view is
    // serialized into a standalone iframe document, outside the React tree.
    const barcodeValue = inv.invoiceNumber ?? ''
    let barcodeSvg = ''
    if (barcodeValue) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svgEl, barcodeValue, { format: 'CODE128', height: 40, width: 1.2, fontSize: 12, margin: 6, displayValue: true })
      barcodeSvg = svgEl.outerHTML
    }
    const itemRows = items.map(item => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151">${escapeHtml(item.itemType?.replace('_', ' '))}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151">${escapeHtml(item.description)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:center">×${item.quantity}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;text-align:right">₹${Number(item.unitPrice).toLocaleString('en-IN')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;color:#111;text-align:right">₹${Number(item.totalPrice).toLocaleString('en-IN')}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Invoice ${escapeHtml(fmtId(inv.invoiceNumber))}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Lexend', sans-serif;font-size:13px;color:#1a1a1a;padding:36px}table{width:100%;border-collapse:collapse}@media print{body{padding:24px}}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #10b981">
        <div>
          <div style="font-size:22px;font-weight:800;color:#10b981">ZenoHosp HMS</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(user?.hospitalName) || 'Clinic Management System'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700">${escapeHtml(fmtId(inv.invoiceNumber))}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</div>
          <div style="margin-top:8px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${statusCls[inv.status] ?? statusCls.UNPAID}">${escapeHtml(inv.status)}</span></div>
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px">Billed To</div>
        <div style="font-size:15px;font-weight:700">${escapeHtml(inv.patientName) || '—'}</div>
        ${inv.patientUhid ? `<div style="font-size:12px;color:#6b7280">UHID: ${escapeHtml(fmtId(inv.patientUhid))}</div>` : ''}
        ${inv.paymentMethod ? `<div style="font-size:12px;color:#6b7280;margin-top:4px">Payment: ${escapeHtml(inv.paymentMethod)}</div>` : ''}
        ${barcodeSvg ? `<div style="margin-top:10px">${barcodeSvg}</div>` : ''}
      </div>
      <table>
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Type</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Description</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Unit</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <div style="min-width:220px">
          ${discount > 0 ? `
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#4b5563"><span>Subtotal</span><span>₹${subtotal.toLocaleString('en-IN')}</span></div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#4b5563"><span>Discount</span><span style="color:#ef4444">−₹${discount.toLocaleString('en-IN')}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:8px 0 4px;font-size:15px;font-weight:800;color:#111;border-top:2px solid #1a1a1a;margin-top:4px"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
        </div>
      </div>
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
        Generated by ZenoHosp HMS · ${window.location.hostname} · Thank you for your payment
      </div>
    </body></html>`

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

  const handleFilterChange = (newFilter) => {
    setStatusFilter(newFilter)
    setPage(1)
  }

  const stats = {
    total: totalElements,
    settled: invoices.filter(i => i.status === 'PAID' || i.status === 'SETTLED').reduce((s, i) => s + Number(i.total), 0),
    unsettled: invoices.filter(i => i.status === 'UNPAID' || i.status === 'PARTIAL' || i.status === 'UNSETTLED').reduce((s, i) => s + Number(i.total), 0),
    todayCount: invoices.filter(i => new Date(i.createdAt).toDateString() === new Date().toDateString()).length,
  }

  return (
    <div className="zu-page">

      <PageHeader
        title="IPD Billing"
        subtitle={`${totalElements} active/past records`}
      />

      {/* Stats */}
      <div className="zu-page-content">
      <div className="zu-stat-card-grid">
        <StatCard label="Total IPD Cases" value={stats.total} sub="matching filters" Icon={ReceiptText} accent="blue" />
        <StatCard label="Total Settled" value={fmt(stats.settled)} sub="from loaded settled" Icon={TrendingUp} accent="emerald" />
        <StatCard label="Outstanding Due" value={fmt(stats.unsettled)} sub="from loaded unsettled" Icon={AlertCircle} accent="amber" />
        <StatCard label="Invoices Today" value={stats.todayCount} sub="loaded today" Icon={Clock} accent="rose" />
      </div>

      {/* Table Container */}
      <div className="hms-billing-tablecard">

        {/* Controls bar */}
        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <div className="zu-pill-group">
              {[
                { key: 'ALL', label: 'All' },
                { key: 'UNSETTLED', label: 'Not Settled' },
                { key: 'SETTLED', label: 'Settled' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleFilterChange(key)}
                  className={`zu-pill-group__btn ${statusFilter === key ? 'is-active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="zu-filter-bar__search">
            <Search className="zu-filter-bar__search-icon" />
            <input
              type="text"
              placeholder="Search invoice, patient…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="zu-filter-bar__search-input"
            />
          </div>
        </div>

        {/* Table */}
        <div className="hms-billing-tablescroll">
          <table className="hms-billing-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Method</th>
                <th className="is-center">Status</th>
                <th className="is-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="hms-billing-cell-state zu-table-loading-cell">
                    <TableSkeleton rows={8} columns={7} />
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hms-billing-cell-state">
                    <div className="hms-billing-cell-state__stack">
                      <div className="hms-billing-cell-state__icon-bg">
                        <ReceiptText className="w-8 h-8" />
                      </div>
                      <p className="hms-billing-cell-state__text">
                        {search ? 'No invoices match your search.' : 'No IPD invoices yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const isActiveAdmission = !!inv.admissionId && activeAdmissionIds.has(String(inv.admissionId))
                  const isIPDPending = isActiveAdmission && (inv.status === 'UNPAID' || inv.status === 'PARTIAL' || inv.status === 'UNSETTLED')
                  const isSettled = inv.status === 'PAID' || inv.status === 'SETTLED'
                  const ipdCfg = isSettled ? STATUS_CFG_IPD.SETTLED : STATUS_CFG_IPD.NOT_SETTLED
                  const StatusIcon = ipdCfg.Icon

                  return (
                    <tr key={inv.id}>
                      <td>
                        <p className="hms-billing-cell__primary">{fmtId(inv.invoiceNumber)}</p>
                        <p className="hms-billing-cell__secondary">
                          {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </p>
                      </td>
                      <td>
                        <p className="hms-billing-cell__strong">{inv.patientName ?? '—'}</p>
                        <p className="hms-billing-cell__secondary">{fmtId(inv.patientUhid) ?? ''}</p>
                      </td>
                      <td>
                        {isIPDPending && !inv.items?.length ? (
                          <span className="hms-billing-cell__pending">Pending charges</span>
                        ) : (
                          <ItemTypePips items={inv.items} />
                        )}
                      </td>
                      <td>
                        <p className="hms-billing-cell__primary">
                          {isIPDPending && Number(inv.total) > 0 ? '~' : ''}{fmt(inv.total)}
                        </p>
                        {isIPDPending && Number(inv.total) > 0 && (
                          <p className="hms-billing-cell__estimated">estimated</p>
                        )}
                        {(inv.status === 'PARTIAL' || inv.status === 'UNSETTLED') && Number(inv.paidAmount) > 0 && (
                          <p className="hms-billing-cell__paid">{fmt(inv.paidAmount)} paid</p>
                        )}
                        {Number(inv.discount) > 0 && (
                          <p className="hms-billing-cell__discount">−{fmt(inv.discount)} disc.</p>
                        )}
                      </td>
                      <td>
                        {inv.paymentMethod ? (
                          <span className="hms-billing-method">{inv.paymentMethod}</span>
                        ) : (
                          <span className="hms-billing-cell__muted">—</span>
                        )}
                        {claimByInvoice[inv.id] && (
                          <div><ClaimChip claim={claimByInvoice[inv.id]} /></div>
                        )}
                      </td>
                      <td>
                        <div className="hms-billing-status-center">
                          {isIPDPending ? (
                            <span className="hms-billing-status is-admitted">
                              <BedDouble className="w-3 h-3" /> Admitted
                            </span>
                          ) : (
                            <span className={`hms-billing-status ${ipdCfg.cls}`}>
                              <StatusIcon className="w-3 h-3" /> {ipdCfg.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hms-billing-actions-cell" onClick={e => e.stopPropagation()}>
                        <InvoiceActionMenu 
                          inv={inv} 
                          activeAdmissions={activeAdmissions} 
                          activeAdmissionIds={activeAdmissionIds} 
                          setFinalizeAdmission={setFinalizeAdmission} 
                          setDetailInvoiceId={setDetailInvoiceId} 
                          printInvoice={printInvoice} 
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalElements > 0 && (
          <div className="hms-billing-pagination">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalElements}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>



      {/* Modals */}
      {finalizeAdmission && (
        <FinalizeIPDBillingModal
          admission={finalizeAdmission}
          onClose={(dirty) => { setFinalizeAdmission(null); if (dirty) loadData() }}
          onFinalized={() => { setFinalizeAdmission(null); loadData() }}
        />
      )}

      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onInvoiceUpdated={loadData}
        />
      )}
      </div>
    </div>
  )
}

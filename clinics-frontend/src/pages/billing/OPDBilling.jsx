import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'
import { invoiceApi, claimsApi } from '@/utils/api'
import ClaimChip from '@/components/billing/ClaimChip'
import { fmtId } from '@/utils/idFormat'
import { escapeHtml } from '@/utils/html'
import JsBarcode from 'jsbarcode'
import Pagination from '@/components/ui/Pagination'
import TableSkeleton from '@/components/ui/TableSkeleton'
import PageHeader from '@/components/ui/PageHeader'
import CreateInvoiceModal from '@/components/modals/CreateInvoiceModal'
import { InvoiceDetailModal } from '@/pages/billing/InvoiceList'
import Menu from '@/components/ui/Menu'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import {
  ReceiptText, Search, CheckCircle2, Clock, XCircle,
  Printer, TrendingUp, AlertCircle, Loader2,
  Receipt, Eye, Plus, MoreHorizontal, Pill, FlaskConical, Stethoscope, BedDouble, ScanLine, Wrench,
  Info
} from 'lucide-react'

const PAGE_SIZE = 10

const STATUS_CFG = {
  PAID:      { label: 'Paid',      cls: 'is-paid',      Icon: CheckCircle2 },
  UNPAID:    { label: 'Unpaid',    cls: 'is-unpaid',    Icon: Clock        },
  PARTIAL:   { label: 'Partial',   cls: 'is-partial',   Icon: AlertCircle  },
  CANCELLED: { label: 'Cancelled', cls: 'is-cancelled', Icon: XCircle      },
}

const TYPE_META = {
  MEDICINE:     { cls: 'is-medicine',     icon: <Pill className="w-3 h-3" /> },
  LAB_TEST:     { cls: 'is-lab',          icon: <FlaskConical className="w-3 h-3" /> },
  CONSULTATION: { cls: 'is-consultation', icon: <Stethoscope className="w-3 h-3" /> },
  ROOM_CHARGE:  { cls: 'is-room',         icon: <BedDouble className="w-3 h-3" /> },
  RADIOLOGY:    { cls: 'is-radiology',    icon: <ScanLine className="w-3 h-3" /> },
  CUSTOM:       { cls: 'is-custom',       icon: <Wrench className="w-3 h-3" /> },
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

function GetInfoModal({ invoice, onClose }) {
  if (!invoice) return null;
  const createdAt = new Date(invoice.createdAt || invoice.created_at || new Date()).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
  
  const bookedBy = invoice.bookedBy || invoice.createdBy || "System";
  const docName = invoice.appointmentDoctorName ? `Dr. ${invoice.appointmentDoctorName}` : "Not Assigned";

  const schedDate = invoice.appointmentDate ? new Date(invoice.appointmentDate).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }) : "—";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Booking & Billing Information"
      size="md"
      footer={
        <div className="flex w-full justify-end">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 py-2">
        {/* Appointment Section */}
        <div>
          <h3 className="hms-section-head">Appointment Details</h3>
          <div className="hms-form-grid is-2col mt-3">
            <div>
              <p className="hms-kv__label">Patient Name</p>
              <p className="hms-kv__value">{invoice.patientName || "—"}</p>
            </div>
            <div>
              <p className="hms-kv__label">Booked On</p>
              <p className="hms-kv__value">{createdAt}</p>
            </div>
            <div>
              <p className="hms-kv__label">Booked By</p>
              <p className="hms-kv__value">{bookedBy}</p>
            </div>
            <div>
              <p className="hms-kv__label">Doctor Details</p>
              <p className="hms-kv__value">{docName}</p>
            </div>
            <div>
              <p className="hms-kv__label">Scheduled Time</p>
              <p className="hms-kv__value">{schedDate}</p>
            </div>
            <div>
              <p className="hms-kv__label">Visit Type & Token</p>
              <p className="hms-kv__value">
                {invoice.appointmentType || "—"} {invoice.appointmentTokenNumber ? `(Token: #${invoice.appointmentTokenNumber})` : ""}
              </p>
            </div>
            <div>
              <p className="hms-kv__label">Appt. Status</p>
              <p className="hms-kv__value">{invoice.appointmentStatus || "—"}</p>
            </div>
            <div className="is-span-2">
              <p className="hms-kv__label">Chief Complaint</p>
              <p className="hms-kv__value">{invoice.appointmentChiefComplaint || "—"}</p>
            </div>
            {invoice.appointmentStatus === 'CANCELLED' && (
              <div className="is-span-2">
                <p className="hms-kv__label text-danger">Cancelled Reason</p>
                <p className="hms-kv__value text-danger">{invoice.appointmentCancelledReason || "—"}</p>
              </div>
            )}
          </div>
        </div>

        {/* Billing Section */}
        <div>
          <h3 className="hms-section-head">Billing Details</h3>
          <div className="hms-form-grid is-2col mt-3">
            <div>
              <p className="hms-kv__label">Billing Status</p>
              <p className="hms-kv__value">{invoice.status || "—"}</p>
            </div>
            <div>
              <p className="hms-kv__label">Subtotal</p>
              <p className="hms-kv__value">₹{invoice.subtotal?.toFixed(2) || "0.00"}</p>
            </div>
            {Number(invoice.discount) > 0 && (
              <div>
                <p className="hms-kv__label">Discount</p>
                <p className="hms-kv__value text-success">-₹{invoice.discount?.toFixed(2)}</p>
              </div>
            )}
            {Number(invoice.tax) > 0 && (
              <div>
                <p className="hms-kv__label">Tax</p>
                <p className="hms-kv__value">₹{invoice.tax?.toFixed(2)}</p>
              </div>
            )}
            <div>
              <p className="hms-kv__label">Grand Total</p>
              <p className="hms-kv__value is-strong">₹{invoice.total?.toFixed(2) || "0.00"}</p>
            </div>
            {Number(invoice.paidAmount) > 0 && (
              <>
                <div>
                  <p className="hms-kv__label">Paid Amount</p>
                  <p className="hms-kv__value text-success">₹{invoice.paidAmount?.toFixed(2)}</p>
                </div>
                {invoice.paymentMethod && (
                  <div>
                    <p className="hms-kv__label">Payment Method</p>
                    <p className="hms-kv__value">{invoice.paymentMethod.replace(/_/g, ' ')}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Itemized Bill Section */}
        {invoice.items && invoice.items.length > 0 && (
          <div>
            <h3 className="hms-section-head">Itemized Bill</h3>
            <div className="hms-table-wrapper mt-3">
              <table className="hms-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">Unit Price</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, idx) => {
                    const waived = Number(item.waiverAmount || 0);
                    const effective = Number(item.totalPrice || 0) - waived;
                    return (
                      <tr key={item.id || idx}>
                        <td>{item.itemType?.replace('_', ' ')}</td>
                        <td>
                          <div className="font-semibold text-gray-900">{item.description}</div>
                          {item.waiverReason && <div className="text-11 text-gray-500">Waiver: {item.waiverReason}</div>}
                        </td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right">₹{Number(item.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="text-right font-medium text-gray-900">
                          {waived > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="line-through text-11 text-gray-400">₹{Number(item.totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span>₹{effective.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          ) : (
                            <span>₹{Number(item.totalPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payment History Section */}
        {invoice.payments && invoice.payments.length > 0 && (
          <div>
            <h3 className="hms-section-head">Payment History</h3>
            <div className="hms-table-wrapper mt-3">
              <table className="hms-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Collected By</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p, idx) => (
                    <tr key={p.id || idx}>
                      <td>{new Date(p.paidAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-12 font-medium bg-gray-100 text-gray-800">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="text-gray-600">{p.referenceNumber || p.notes || '—'}</td>
                      <td className="text-gray-900">{p.collectedByName || p.collectedBy || '—'}</td>
                      <td className="text-right font-medium text-success">₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InvoiceActionMenu({ inv, setDetailInvoiceId, printInvoice, onGetInfo }) {
  const items = []

  if (inv.status === 'UNPAID' || inv.status === 'PARTIAL') {
    items.push({
      label: 'Collect Payment',
      icon: <Receipt className="w-4 h-4" />,
      onClick: () => setDetailInvoiceId(inv.id)
    })
  }

  if (inv.status !== 'UNPAID' && inv.status !== 'PARTIAL') {
    items.push({
      label: 'View Details',
      icon: <Eye className="w-4 h-4" />,
      onClick: () => setDetailInvoiceId(inv.id)
    })
  }

  items.push({
    label: 'Get Info',
    icon: <Info className="w-4 h-4" />,
    onClick: () => onGetInfo(inv)
  })

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

export default function OPDBilling() {
  const { user } = useAuth()
  const { notify } = useNotification()

  const [invoices, setInvoices]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [search, setSearch]               = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter]   = useState('ALL')
  const [page, setPage]                   = useState(1)
  const [totalPages, setTotalPages]       = useState(1)
  const [totalElements, setTotalElements] = useState(0)

  const [showCreate, setShowCreate]       = useState(false)
  const [detailInvoiceId, setDetailInvoiceId] = useState(null)
  const [infoInvoice, setInfoInvoice]     = useState(null)

  // Insurance/TPA claims keyed by invoice (newest wins) — read-only context.
  const [claimByInvoice, setClaimByInvoice] = useState({})
  useEffect(() => {
    if (!user?.hospitalId) return
    let cancelled = false
    claimsApi.list(user.hospitalId)
      .then(data => {
        if (cancelled) return
        const map = {}
        for (const c of (data?.claims || [])) {
          if (!map[c.invoiceId]) map[c.invoiceId] = c
        }
        setClaimByInvoice(map)
      })
      .catch(() => { /* optional context */ })
    return () => { cancelled = true }
  }, [user?.hospitalId])

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

    invoiceApi.listOpdPaginated(
      user.hospitalId,
      page - 1,
      PAGE_SIZE,
      statusFilter,
      debouncedSearch
    )
      .then((data) => {
        setInvoices(data.invoices || [])
        setTotalPages(data.totalPages || 1)
        setTotalElements(data.totalElements || 0)
      })
      .catch(() => notify('Failed to load OPD invoices', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [user?.hospitalId, page, statusFilter, debouncedSearch])

  const printInvoice = (inv) => {
    const items = inv.items ?? []
    const total = Number(inv.total)
    const discount = Number(inv.discount || 0)
    const subtotal = total + discount
    const statusCls = { PAID: 'background:#d1fae5;color:#065f46', UNPAID: 'background:#fef3c7;color:#92400e', PARTIAL: 'background:#ffedd5;color:#9a3412', CANCELLED: 'background:#fee2e2;color:#991b1b' }
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
    collected: invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + Number(i.total), 0),
    outstanding: invoices.filter(i => i.status === 'UNPAID' || i.status === 'PARTIAL').reduce((s, i) => s + Number(i.total), 0),
    todayCount: invoices.filter(i => new Date(i.createdAt).toDateString() === new Date().toDateString()).length,
  }

  return (
    <div className="zu-page">

      <PageHeader
        title="OPD Billing"
        subtitle={`${totalElements} invoices`}
        // actions={
        //   <button onClick={() => setShowCreate(true)} className="zu-btn-primary">
        //     <ReceiptText className="w-4 h-4" /> New Invoice
        //   </button>
        // }
      />

      {/* Stats */}
      <div className="zu-page-content">
      <div className="zu-stat-card-grid">
        <StatCard label="Total OPD Invoices" value={stats.total}             sub="matching filters"       Icon={ReceiptText} accent="blue"    />
        <StatCard label="Revenue Collected"  value={fmt(stats.collected)}    sub="from loaded paid"       Icon={TrendingUp}  accent="emerald" />
        <StatCard label="Outstanding Due"    value={fmt(stats.outstanding)}  sub="from loaded unpaid"     Icon={AlertCircle} accent="amber"   />
        <StatCard label="Billed Today"       value={stats.todayCount}        sub="loaded today"           Icon={Clock}       accent="rose"    />
      </div>

      {/* Table Container */}
      <div className="hms-billing-tablecard">

        {/* Controls bar */}
        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <div className="zu-pill-group">
              {[
                { key: 'ALL', label: 'All' },
                { key: 'UNPAID', label: 'Unpaid' },
                { key: 'PAID', label: 'Paid' }
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
                        {search ? 'No invoices match your search.' : 'No OPD invoices yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const cfg = STATUS_CFG[inv.status] ?? STATUS_CFG.UNPAID
                  const StatusIcon = cfg.Icon
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
                        <ItemTypePips items={inv.items} />
                      </td>
                      <td>
                        <p className="hms-billing-cell__primary">{fmt(inv.total)}</p>
                        {inv.status === 'PARTIAL' && Number(inv.paidAmount) > 0 && (
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
                          <span className={`hms-billing-status ${cfg.cls}`}>
                            <StatusIcon className="w-3 h-3" /> {cfg.label}
                          </span>
                        </div>
                      </td>
                      <td className="hms-billing-actions-cell" onClick={e => e.stopPropagation()}>
                        <InvoiceActionMenu 
                          inv={inv} 
                          setDetailInvoiceId={setDetailInvoiceId} 
                          printInvoice={printInvoice}
                          onGetInfo={setInfoInvoice}
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
      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} onCreated={loadData} />}

      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onInvoiceUpdated={loadData}
        />
      )}

      {infoInvoice && (
        <GetInfoModal
          invoice={infoInvoice}
          onClose={() => setInfoInvoice(null)}
        />
      )}
      </div>
    </div>
  )
}

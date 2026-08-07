import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'
import { ambulanceApi } from '@/utils/api'
import { fmtId } from '@/utils/idFormat'
import { escapeHtml } from '@/utils/html'
import JsBarcode from 'jsbarcode'
import Pagination from '@/components/ui/Pagination'
import PageHeader from '@/components/ui/PageHeader'
import TableSkeleton from '@/components/ui/TableSkeleton'
import Menu from '@/components/ui/Menu'
import {
  Ambulance, Search, CheckCircle2, Clock, XCircle,
  Printer, TrendingUp, AlertCircle, Loader2,
  ReceiptText, MoreHorizontal, MapPin, Navigation,
  IndianRupee
} from 'lucide-react'

const PAGE_SIZE = 30

const BOOKING_STATUS_CFG = {
  PENDING:    { label: 'Pending',    cls: 'is-pending',    Icon: Clock         },
  DISPATCHED: { label: 'Dispatched', cls: 'is-dispatched', Icon: Navigation    },
  EN_ROUTE:   { label: 'En Route',   cls: 'is-enroute',    Icon: Ambulance     },
  COMPLETED:  { label: 'Completed',  cls: 'is-completed',  Icon: CheckCircle2  },
  CANCELLED:  { label: 'Cancelled',  cls: 'is-cancelled',  Icon: XCircle       },
}

const PAY_STATUS_CFG = {
  PAID:   { label: 'Paid',   cls: 'is-paid',   Icon: CheckCircle2 },
  UNPAID: { label: 'Unpaid', cls: 'is-unpaid', Icon: Clock        },
}

function fmt(n) {
  if (!n) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(dateStr, timeStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (timeStr ? 'T' + timeStr : ''))
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
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

function AmbulanceActionMenu({ booking, markPaid, printReceipt }) {
  const canMarkPaid = booking.status === 'COMPLETED' && booking.paymentStatus !== 'PAID'

  const items = []

  if (canMarkPaid) {
    items.push({
      label: 'Mark as Paid',
      icon: <IndianRupee className="w-4 h-4" />,
      onClick: () => markPaid(booking)
    })
  }

  items.push({
    label: 'Print Receipt',
    icon: <Printer className="w-4 h-4" />,
    onClick: () => printReceipt(booking)
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

export default function AmbulanceBilling() {
  const { user } = useAuth()
  const { notify } = useNotification()

  const [bookings, setBookings]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [payFilter, setPayFilter]     = useState('ALL')
  const [page, setPage]               = useState(1)
  const [markingId, setMarkingId]     = useState(null)

  const loadData = () => {
    if (!user?.hospitalId) return
    setLoading(true)
    ambulanceApi.getBookings(user.hospitalId)
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => notify('Failed to load ambulance bookings', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [user?.hospitalId])

  const filtered = useMemo(() => {
    let list = bookings.filter(b => !b.mergedToIpd)
    if (payFilter === 'PAID')   list = list.filter(b => b.paymentStatus === 'PAID')
    if (payFilter === 'UNPAID') list = list.filter(b => b.paymentStatus !== 'PAID')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b => {
        const patName = b.patient
          ? `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.toLowerCase()
          : ''
        const uhid = (b.patient?.uhid ?? '').toLowerCase()
        const vNum = (b.vehicleNumber ?? b.vehicle?.vehicleNumber ?? '').toLowerCase()
        const pickup = (b.pickupAddress ?? '').toLowerCase()
        const ref = `amb-${b.id}`
        return patName.includes(q) || uhid.includes(q) || vNum.includes(q) || pickup.includes(q) || ref.includes(q)
      })
    }
    return list
  }, [bookings, payFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return {
      total:       bookings.length,
      collected:   bookings.filter(b => b.paymentStatus === 'PAID').reduce((s, b) => s + Number(b.charge || 0), 0),
      outstanding: bookings.filter(b => b.paymentStatus !== 'PAID' && b.status === 'COMPLETED').reduce((s, b) => s + Number(b.charge || 0), 0),
      today:       bookings.filter(b => (b.bookingDate ?? '').slice(0, 10) === todayStr).length,
    }
  }, [bookings])

  const handlePayFilter = (f) => { setPayFilter(f); setPage(1) }



  const markPaid = async (booking) => {
    setMarkingId(booking.id)
    try {
      await ambulanceApi.updateStatus(booking.id, { paymentStatus: 'PAID' })
      notify('Booking marked as paid', 'success')
      loadData()
    } catch {
      notify('Failed to update payment status', 'error')
    } finally {
      setMarkingId(null)
    }
  }

  const printReceipt = (booking) => {
    const ref       = `AMB-${String(booking.id).padStart(6, '0')}`
    const typeName  = booking.ambulanceType?.name ?? ''
    const vehNum    = booking.vehicleNumber ?? booking.vehicle?.vehicleNumber ?? ''
    const driver    = booking.driverName ?? ''
    const charge    = Number(booking.charge || 0)
    const patientName = booking.patient
      ? `${booking.patient.firstName ?? ''} ${booking.patient.lastName ?? ''}`.trim()
      : null
    const uhid  = booking.patient?.uhid ?? ''
    const pickup = booking.pickupAddress ?? ''
    const dest  = booking.destinationAddress ?? ''
    const dateStr = fmtDate(booking.bookingDate, booking.bookingTime)
    const paidCls = booking.paymentStatus === 'PAID'
      ? 'background:#d1fae5;color:#065f46'
      : 'background:#fef3c7;color:#92400e'

    // Built as raw SVG markup (not the React <Barcode>) since this view is
    // serialized into a standalone iframe document, outside the React tree.
    const barcodeValue = ref
    let barcodeSvg = ''
    if (barcodeValue) {
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      JsBarcode(svgEl, barcodeValue, { format: 'CODE128', height: 40, width: 1.2, fontSize: 12, margin: 6, displayValue: true })
      barcodeSvg = svgEl.outerHTML
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
      <title>Ambulance Receipt ${escapeHtml(ref)}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Lexend', sans-serif;font-size:13px;color:#1a1a1a;padding:36px}@media print{body{padding:24px}}.row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6;font-size:13px}.label{color:#6b7280;font-weight:500}.val{font-weight:600;color:#111}</style>
    </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f97316">
        <div>
          <div style="font-size:22px;font-weight:800;color:#f97316">ZenoHosp HMS</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(user?.hospitalName) || 'Clinic Management System'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:16px;font-weight:700">${escapeHtml(ref)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">${escapeHtml(dateStr)}</div>
          <div style="margin-top:8px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;${paidCls}">${escapeHtml(booking.paymentStatus)}</span></div>
        </div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:6px">Patient</div>
        ${patientName
          ? `<div style="font-size:15px;font-weight:700">${escapeHtml(patientName)}</div>${uhid ? `<div style="font-size:12px;color:#6b7280">UHID: ${escapeHtml(fmtId(uhid))}</div>` : ''}`
          : `<div style="font-size:14px;font-weight:600;color:#d97706">Walk-in / Emergency</div>`}
        ${barcodeSvg ? `<div style="margin-top:10px">${barcodeSvg}</div>` : ''}
      </div>
      <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:20px">
        <div class="row"><span class="label">Ambulance Type</span><span class="val">${escapeHtml(typeName) || '—'}</span></div>
        <div class="row"><span class="label">Vehicle Number</span><span class="val">${escapeHtml(vehNum) || '—'}</span></div>
        ${driver ? `<div class="row"><span class="label">Driver</span><span class="val">${escapeHtml(driver)}</span></div>` : ''}
        ${pickup ? `<div class="row"><span class="label">Pickup</span><span class="val" style="max-width:200px;text-align:right">${escapeHtml(pickup)}</span></div>` : ''}
        ${dest ? `<div class="row"><span class="label">Destination</span><span class="val" style="max-width:200px;text-align:right">${escapeHtml(dest)}</span></div>` : ''}
        ${booking.notes ? `<div class="row"><span class="label">Notes</span><span class="val">${escapeHtml(booking.notes)}</span></div>` : ''}
      </div>
      <div style="display:flex;justify-content:flex-end">
        <div style="min-width:200px;border-top:2px solid #1a1a1a;padding-top:8px">
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#111"><span>Total Charge</span><span>₹${charge.toLocaleString('en-IN')}</span></div>
        </div>
      </div>
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
        Generated by ZenoHosp HMS · ${window.location.hostname}
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

  return (
    <div className="zu-page">

      <PageHeader
        title="Ambulance Billing"
        subtitle={`${bookings.length} bookings`}
      />

      {/* Stats */}
      <div className="zu-page-content">
      <div className="zu-stat-card-grid">
        <StatCard label="Total Bookings"  value={stats.total}              sub="all time"                Icon={Ambulance}   accent="blue"    />
        <StatCard label="Collected"       value={fmt(stats.collected)}     sub="from paid bookings"      Icon={TrendingUp}  accent="emerald" />
        <StatCard label="Outstanding"     value={fmt(stats.outstanding)}   sub="completed but unpaid"    Icon={AlertCircle} accent="amber"   />
        <StatCard label="Today"           value={stats.today}              sub="booked today"            Icon={Clock}       accent="rose"    />
      </div>

      {/* Table Container */}
      <div className="hms-billing-tablecard">

        {/* Controls */}
        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <div className="zu-pill-group">
              {[
                { key: 'ALL',    label: 'All'    },
                { key: 'UNPAID', label: 'Unpaid' },
                { key: 'PAID',   label: 'Paid'   },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handlePayFilter(key)}
                  className={`zu-pill-group__btn ${payFilter === key ? 'is-active' : ''}`}
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
              placeholder="Search patient, vehicle, address…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="zu-filter-bar__search-input"
            />
        </div>
        </div>

        {/* Table */}
        <div className="hms-billing-tablescroll">
          <table className="hms-billing-table">
            <thead>
              <tr>
                <th>Ref & Date</th>
                <th>Patient</th>
                <th>Vehicle</th>
                <th>Route</th>
                <th>Charge</th>
                <th className="is-center">Status</th>
                <th className="is-center">Payment</th>
                <th className="is-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="hms-billing-cell-state zu-table-loading-cell">
                    <TableSkeleton rows={8} columns={8} />
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hms-billing-cell-state">
                    <div className="hms-billing-cell-state__stack">
                      <div className="hms-billing-cell-state__icon-bg">
                        <Ambulance className="w-8 h-8" />
                      </div>
                      <p className="hms-billing-cell-state__text">
                        {search || payFilter !== 'ALL' ? 'No bookings match your filters.' : 'No ambulance bookings yet.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map(b => {
                  const bCfg  = BOOKING_STATUS_CFG[b.status]  ?? BOOKING_STATUS_CFG.PENDING
                  const pCfg  = PAY_STATUS_CFG[b.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID']
                  const BIcon = bCfg.Icon
                  const PIcon = pCfg.Icon
                  const typeName  = b.ambulanceType?.name ?? ''
                  const vehNum    = b.vehicleNumber ?? b.vehicle?.vehicleNumber ?? ''
                  const patName   = b.patient
                    ? `${b.patient.firstName ?? ''} ${b.patient.lastName ?? ''}`.trim()
                    : null

                  return (
                    <tr key={b.id}>

                      {/* Ref & Date */}
                      <td>
                        <p className="hms-billing-cell__primary is-mono">
                          AMB-{String(b.id).padStart(6, '0')}
                        </p>
                        <p className="hms-billing-cell__secondary">{fmtDate(b.bookingDate, b.bookingTime)}</p>
                      </td>

                      {/* Patient */}
                      <td>
                        {patName ? (
                          <>
                            <p className="hms-billing-cell__strong">{patName}</p>
                            {b.patient?.uhid && (
                              <p className="hms-billing-cell__secondary">{fmtId(b.patient.uhid)}</p>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="hms-billing-walkin">
                              <p className="hms-billing-walkin__label">Walk-in / Emergency</p>
                            </div>
                            {b.pickupAddress && (
                              <p className="hms-billing-cell__secondary truncate" title={b.pickupAddress}>
                                {b.pickupAddress}
                              </p>
                            )}
                          </>
                        )}
                      </td>

                      {/* Vehicle */}
                      <td>
                        {typeName && (
                          <p className="hms-billing-cell__strong">{typeName}</p>
                        )}
                        {vehNum && (
                          <p className="hms-billing-cell__secondary font-mono">{vehNum}</p>
                        )}
                        {!typeName && !vehNum && (
                          <span className="hms-billing-cell__muted">—</span>
                        )}
                      </td>

                      {/* Route */}
                      <td className="hms-billing-route__cell">
                        {b.pickupAddress && (
                          <div className="hms-billing-route__row">
                            <MapPin className="hms-billing-route__pin is-pickup w-3 h-3" />
                            <p className="hms-billing-route__text" title={b.pickupAddress}>{b.pickupAddress}</p>
                          </div>
                        )}
                        {b.destinationAddress && (
                          <div className="hms-billing-route__row">
                            <MapPin className="hms-billing-route__pin is-drop w-3 h-3" />
                            <p className="hms-billing-route__text" title={b.destinationAddress}>{b.destinationAddress}</p>
                          </div>
                        )}
                        {!b.pickupAddress && !b.destinationAddress && (
                          <span className="hms-billing-cell__muted">—</span>
                        )}
                      </td>

                      {/* Charge */}
                      <td>
                        <p className="hms-billing-cell__primary">
                          {b.charge != null ? fmt(b.charge) : <span className="hms-billing-cell__muted">—</span>}
                        </p>
                      </td>

                      {/* Booking Status */}
                      <td>
                        <div className="hms-billing-status-center">
                          <span className={`hms-billing-status ${bCfg.cls}`}>
                            <BIcon className="w-3 h-3" /> {bCfg.label}
                          </span>
                        </div>
                      </td>

                      {/* Payment Status */}
                      <td>
                        <div className="hms-billing-status-center">
                          <span className={`hms-billing-status ${pCfg.cls}`}>
                            <PIcon className="w-3 h-3" /> {pCfg.label}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="hms-billing-actions-cell" onClick={e => e.stopPropagation()}>
                        {markingId === b.id ? (
                          <div className="hms-billing-rowbtn">
                            <Loader2 className="w-4 h-4 zu-spinner" />
                          </div>
                        ) : (
                          <AmbulanceActionMenu 
                            booking={b} 
                            markPaid={markPaid} 
                            printReceipt={printReceipt} 
                          />
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="hms-billing-pagination">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>


      </div>
    </div>
  )
}

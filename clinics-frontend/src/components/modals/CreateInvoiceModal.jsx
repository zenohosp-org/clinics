import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'
import SearchableSelect from '@/components/ui/SearchableSelect'
import {
  patientApi, invoiceApi, bankApi, doctorsApi, hospitalServiceApi, gstRateApi
} from '@/utils/api'
import { generateInvoiceNumber } from '@/utils/validators'
import { fmtId } from '@/utils/idFormat'
import Barcode from '@/components/ui/Barcode'
import { X, Info, Search, Plus, Trash2, Printer, BedDouble, ScanLine, Stethoscope, FlaskConical, Pill, Wrench, Sparkles, CheckCircle2, Landmark, User } from "lucide-react";

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
function fmt(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TYPE_META = {
  MEDICINE:    { label: 'Medicine',     icon: <Pill className="w-3 h-3" /> },
  LAB_TEST:    { label: 'Lab Test',     icon: <FlaskConical className="w-3 h-3" /> },
  CONSULTATION:{ label: 'Consultation', icon: <Stethoscope className="w-3 h-3" /> },
  ROOM_CHARGE: { label: 'Room',         icon: <BedDouble className="w-3 h-3" /> },
  RADIOLOGY:   { label: 'Radiology',    icon: <ScanLine className="w-3 h-3" /> },
  CUSTOM:      { label: 'Custom',       icon: <Wrench className="w-3 h-3" /> },
}


export default function CreateInvoiceModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const { notify } = useNotification()

  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState(null)

  const [suggestions, setSuggestions] = useState(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [addedSuggestions, setAddedSuggestions] = useState(new Set())

  const [doctors, setDoctors] = useState([])
  const [referredById, setReferredById] = useState('')
  const [services, setServices] = useState([])
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceResults, setServiceResults] = useState([])

  const [items, setItems] = useState([])
  const [nextKey, setNextKey] = useState(0)
  const [discountPct, setDiscountPct] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [invoiceNo] = useState(generateInvoiceNumber)
  const [bankAccounts, setBankAccounts] = useState([])
  const [bankAccountId, setBankAccountId] = useState('')
  const [gstRates, setGstRates] = useState([])
  const [gstRatePercent, setGstRatePercent] = useState(18)

  useEffect(() => {
    if (!user?.hospitalId) return
    doctorsApi.list(user.hospitalId).then(docs => setDoctors(docs.filter(d => d.userIsActive))).catch(() => {})
    hospitalServiceApi.list(user.hospitalId).then(setServices).catch(() => {})
    bankApi.list(user.hospitalId).then(accounts => {
      setBankAccounts(accounts)
      // Pre-select default for initial Cash payment method
      const eligible = accountsForMethod(accounts, 'Cash')
      const def = eligible.find(a => a.isDefault) ?? eligible[0]
      if (def) setBankAccountId(def.id)
    }).catch(() => {})
    gstRateApi.list(user.hospitalId, true).then(rates => {
      setGstRates(rates || [])
      const def = (rates || []).find(r => r.isDefault)
      if (def) setGstRatePercent(Number(def.ratePercent))
    }).catch(() => {})
  }, [user?.hospitalId])

  useEffect(() => {
    if (!patientSearch.trim() || patientSearch.length < 2 || !user?.hospitalId) {
      setPatientResults([])
      return
    }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        setPatientResults((await patientApi.search(user.hospitalId, patientSearch)).slice(0, 6))
      } catch {
        setPatientResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [patientSearch, user?.hospitalId])

  useEffect(() => {
    if (!serviceSearch.trim()) { setServiceResults([]); return }
    const q = serviceSearch.toLowerCase()
    setServiceResults(services.filter(s => s.isActive && s.name.toLowerCase().includes(q)).slice(0, 6))
  }, [serviceSearch, services])

  const selectPatient = async (p) => {
    setPatient(p)
    setPatientResults([])
    setPatientSearch('')
    setAddedSuggestions(new Set())
    setSuggestions(null)
    setLoadingSuggestions(true)
    try {
      const data = await invoiceApi.getSmartSuggestions(p.id)
      setSuggestions(data)
    } catch {
      setSuggestions(null)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const addAllDetected = () => {
    if (!suggestions) return
    const toAdd = []
    const newAdded = new Set(addedSuggestions)
    let key = nextKey

    if (suggestions.roomCharge && !addedSuggestions.has(`room-${suggestions.roomCharge.roomNumber}`)) {
      const r = suggestions.roomCharge
      const k = `room-${r.roomNumber}`
      toAdd.push({ key: key++, itemType: 'ROOM_CHARGE', description: `Room ${r.roomNumber} (${r.roomType}) — ${r.daysStayed} day${r.daysStayed !== 1 ? 's' : ''}`, quantity: Number(r.daysStayed), unitPrice: r.pricePerDay, totalPrice: r.totalCharge })
      newAdded.add(k)
    }
    suggestions.appointments?.forEach(a => {
      const k = `appt-${a.appointmentId}`
      if (!addedSuggestions.has(k)) {
        toAdd.push({ key: key++, itemType: 'CONSULTATION', description: `Consultation — ${a.doctorName}${a.specialization ? ` (${a.specialization})` : ''}`, quantity: 1, unitPrice: a.consultationFee, totalPrice: a.consultationFee, appointmentId: a.appointmentId })
        newAdded.add(k)
      }
    })
    suggestions.radiologyOrders?.forEach(r => {
      const k = `radiology-${r.orderId}`
      if (!addedSuggestions.has(k)) {
        const match = services.find(s => s.name.toLowerCase() === r.serviceName?.toLowerCase())
        const price = match?.price ?? 0
        toAdd.push({ key: key++, itemType: 'RADIOLOGY', description: r.serviceName, quantity: 1, unitPrice: price, totalPrice: price, radiologyOrderId: r.orderId })
        newAdded.add(k)
      }
    })

    if (toAdd.length === 0) return
    setItems(prev => [...prev, ...toAdd])
    setNextKey(key)
    setAddedSuggestions(newAdded)
  }

  const addItem = (item, suggKey) => {
    const key = nextKey
    setNextKey(k => k + 1)
    setItems(prev => [...prev, { ...item, key }])
    if (suggKey) setAddedSuggestions(prev => new Set([...prev, suggKey]))
  }

  const removeItem = (key) => setItems(prev => prev.filter(i => i.key !== key))

  const updateItem = (key, updates) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item
      const merged = { ...item, ...updates }
      if (updates.quantity !== undefined || updates.unitPrice !== undefined)
        merged.totalPrice = (merged.quantity || 0) * (merged.unitPrice || 0)
      return merged
    }))
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.totalPrice || 0), 0), [items])
  const discountAmt = subtotal * (discountPct / 100)
  const medicineTotal = items.filter(i => i.itemType === 'MEDICINE').reduce((s, i) => s + (i.totalPrice || 0), 0)
  const gstOnMedicines = (medicineTotal - medicineTotal * (discountPct / 100)) * (gstRatePercent / 100)
  const grandTotal = subtotal - discountAmt + gstOnMedicines

  const hasSuggestions = suggestions && (
    suggestions.roomCharge || suggestions.radiologyOrders?.length > 0 || suggestions.appointments?.length > 0
  )

  const selectedAccount = bankAccounts.find(a => a.id === bankAccountId)

  const handleSubmit = async () => {
    if (!patient || !user?.hospitalId) { notify('Select a patient first', 'warning'); return }
    if (items.length === 0) { notify('Add at least one item', 'warning'); return }
    if (items.some(i => !i.description.trim())) { notify('Fill all item descriptions', 'error'); return }

    const zeroPriced = items.filter(i => !i.unitPrice || i.unitPrice <= 0)
    if (zeroPriced.length > 0) {
      const names = zeroPriced.map(i => i.description.trim() || TYPE_META[i.itemType]?.label || 'Item').join(', ')
      const proceed = window.confirm(
        `${zeroPriced.length} item${zeroPriced.length !== 1 ? 's' : ''} still show ₹0 unit price (${names}).\n\nThis is usually left unset by mistake. Generate the invoice anyway?`
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      await invoiceApi.create({
        invoiceNumber: invoiceNo,
        hospitalId: user.hospitalId,
        patientId: patient.id,
        subtotal,
        tax: gstOnMedicines,
        discount: discountAmt,
        total: grandTotal,
        paymentMethod,
        notes,
        status: 'UNPAID',
        bankAccountId: bankAccountId || undefined,
        referredById: referredById || undefined,
        items: items.map(i => ({
          itemType: i.itemType,
          serviceId: i.serviceId,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          radiologyOrderId: i.radiologyOrderId ?? undefined,
          appointmentId: i.appointmentId ?? undefined,
        })),
      })
      notify('Invoice created successfully', 'success')
      onCreated?.()
      onClose()
      window.print()
    } catch {
      notify('Failed to create invoice', 'error')
    } finally {
      setSaving(false)
    }
  }

  const sectionNum = (n) => (
    <span className="hms-inv-section-num">{n}</span>
  )

  return (
    <>
      <div className="zu-modal-overlay">
        <div className="hms-inv-modal">

          <div className="hms-inv-modal__head">
            <div>
              <h2 className="hms-inv-modal__title">Create New Invoice</h2>
              <p className="hms-inv-modal__sub">
                Invoice #{invoiceNo} · Smart billing with auto-detection
              </p>
            </div>
            <button onClick={onClose} className="zu-modal-close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="hms-inv-modal__body">

            <div className="hms-inv-info-bar">
              <Info className="hms-inv-info-bar__icon w-4 h-4" />
              <p className="m-0">
                Selecting a patient auto-detects active room charges, pending radiology orders, and recent consultations.
              </p>
            </div>

            {/* 1 — Select Patient */}
            <div className="hms-inv-card">
              <div className="hms-inv-section-head">
                <p className="hms-inv-section-label">
                  {sectionNum(1)} Select Patient
                </p>
              </div>
              {patient ? (
                <div className="hms-inv-patient-picked">
                  <div className="hms-inv-patient-picked__body">
                    <div className="hms-inv-patient-picked__icon">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="hms-inv-patient-picked__name">{patient.firstName} {patient.lastName}</p>
                      <p className="hms-inv-patient-picked__sub">{fmtId(patient.uhid)}{patient.phone ? ` · ${patient.phone}` : ''}</p>
                    </div>
                  </div>
                  <button onClick={() => { setPatient(null); setSuggestions(null) }} className="hms-inv-patient-picked__clear">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="hms-inv-search">
                  <Search className="hms-inv-search__icon w-3.5 h-3.5" />
                  <input className="hms-inv-input has-icon" placeholder="Search by name or UHID…"
                    value={patientSearch} onChange={e => setPatientSearch(e.target.value)} />
                  {searching && <Spinner className="hms-inv-search__spinner w-3.5 h-3.5 zu-spinner" />}
                  {patientResults.length > 0 && (
                    <div className="hms-inv-suggest">
                      {patientResults.map(p => (
                        <button key={p.id} type="button" onClick={() => selectPatient(p)}
                          className="hms-inv-suggest__item">
                          <p className="hms-inv-suggest__name">{p.firstName} {p.lastName}</p>
                          <p className="hms-inv-suggest__sub">{fmtId(p.uhid)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Smart Suggestions */}
            {patient && (loadingSuggestions || hasSuggestions) && (
              <div className="hms-inv-card">
                <div className="hms-inv-section-head">
                  <p className="hms-inv-section-label">
                    <Sparkles className="w-3.5 h-3.5 text-warning" /> Detected Pending Items
                    {loadingSuggestions && <Spinner className="w-3 h-3 zu-spinner text-gray-400" />}
                  </p>
                  {!loadingSuggestions && hasSuggestions && (
                    <button
                      onClick={addAllDetected}
                      className="hms-inv-add-all"
                    >
                      + Add All
                    </button>
                  )}
                </div>
                {!loadingSuggestions && suggestions && (
                  <div className="hms-inv-sug-list">
                    {suggestions.roomCharge && (() => {
                      const r = suggestions.roomCharge
                      const key = `room-${r.roomNumber}`
                      const added = addedSuggestions.has(key)
                      return (
                        <div className="hms-inv-sug-row is-room">
                          <div className="hms-inv-sug-row__body">
                            <div className="hms-inv-sug-row__icon is-room">
                              <BedDouble className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <p className="hms-inv-sug-row__name">Room {r.roomNumber} — {r.roomType.replace('_', ' ')}</p>
                              <p className="hms-inv-sug-row__sub">{fmt(r.pricePerDay)}/day × {r.daysStayed} day{r.daysStayed !== 1 ? 's' : ''} = <span className="hms-inv-sug-row__sub-strong">{fmt(r.totalCharge)}</span></p>
                            </div>
                          </div>
                          <button
                            onClick={() => !added && addItem({ itemType: 'ROOM_CHARGE', description: `Room ${r.roomNumber} (${r.roomType}) — ${r.daysStayed} day${r.daysStayed !== 1 ? 's' : ''}`, quantity: Number(r.daysStayed), unitPrice: r.pricePerDay, totalPrice: r.totalCharge }, key)}
                            className={`hms-inv-sug-add is-room${added ? ' is-added' : ''}`}>
                            {added ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      )
                    })()}
                    {suggestions.radiologyOrders?.map(r => {
                      const key = `radiology-${r.orderId}`
                      const added = addedSuggestions.has(key)
                      const catalogMatch = services.find(s => s.name.toLowerCase() === r.serviceName?.toLowerCase())
                      const price = catalogMatch?.price ?? 0
                      return (
                        <div key={key} className="hms-inv-sug-row is-radiology">
                          <div className="hms-inv-sug-row__body">
                            <div className="hms-inv-sug-row__icon is-radiology">
                              <ScanLine className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <p className="hms-inv-sug-row__name">{r.serviceName}</p>
                              <p className="hms-inv-sug-row__sub">
                                {r.status?.replace('_', ' ')}{r.scheduledDate ? ` · ${r.scheduledDate}` : ''}
                                {price > 0 ? ` · ${fmt(price)}` : ' · ₹0 — add service price in catalog'}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => !added && addItem({ itemType: 'RADIOLOGY', description: r.serviceName, quantity: 1, unitPrice: price, totalPrice: price, radiologyOrderId: r.orderId }, key)}
                            className={`hms-inv-sug-add is-radiology${added ? ' is-added' : ''}`}>
                            {added ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      )
                    })}
                    {suggestions.appointments?.map(a => {
                      const key = `appt-${a.appointmentId}`
                      const added = addedSuggestions.has(key)
                      return (
                        <div key={key} className="hms-inv-sug-row is-consultation">
                          <div className="hms-inv-sug-row__body">
                            <div className="hms-inv-sug-row__icon is-consultation">
                              <Stethoscope className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <p className="hms-inv-sug-row__name">{a.doctorName}{a.specialization ? ` — ${a.specialization}` : ''}</p>
                              <p className="hms-inv-sug-row__sub">Consultation · {a.apptDate} · <span className="hms-inv-sug-row__sub-strong">{fmt(a.consultationFee)}</span></p>
                            </div>
                          </div>
                          <button
                            onClick={() => !added && addItem({ itemType: 'CONSULTATION', description: `Consultation — ${a.doctorName}${a.specialization ? ` (${a.specialization})` : ''}`, quantity: 1, unitPrice: a.consultationFee, totalPrice: a.consultationFee, appointmentId: a.appointmentId }, key)}
                            className={`hms-inv-sug-add is-consultation${added ? ' is-added' : ''}`}>
                            {added ? '✓ Added' : '+ Add'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2 — Referred By */}
            <div className="hms-inv-card">
              <div className="hms-inv-section-head">
                <p className="hms-inv-section-label">
                  {sectionNum(2)} Referred By <span className="hms-inv-section-label__hint">(Optional)</span>
                </p>
              </div>
              <SearchableSelect
                className="hms-inv-input"
                value={referredById}
                onChange={val => setReferredById(val)}
                options={[
                  { value: '', label: 'Self / Walk-in (No Referral)' },
                  ...doctors.map(d => ({
                    value: d.id,
                    label: `Dr. ${d.firstName} ${d.lastName}${d.specialization ? ` — ${d.specialization}` : ''}`,
                  })),
                ]}
              />
            </div>

            {/* 3 — Add Tests & Services */}
            <div className="hms-inv-card">
              <div className="hms-inv-section-head">
                <p className="hms-inv-section-label">
                  {sectionNum(3)} Add Tests &amp; Services
                </p>
              </div>
              <div className="hms-form-grid is-2col">
                <div>
                  <label className="hms-inv-field-label">
                    <span className="hms-inv-field-label__icon"><FlaskConical className="w-3 h-3" /></span> Search Lab / Services
                  </label>
                  <div className="hms-inv-search">
                    <input className="hms-inv-input" placeholder="Search by test name…"
                      value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} />
                    {serviceResults.length > 0 && (
                      <div className="hms-inv-suggest">
                        {serviceResults.map(s => (
                          <button key={s.id} type="button" onClick={() => {
                            addItem({ itemType: 'LAB_TEST', serviceId: s.id, description: s.name, quantity: 1, unitPrice: s.price, totalPrice: s.price })
                            setServiceSearch('')
                            setServiceResults([])
                          }} className="hms-inv-suggest__item">
                            <p className="hms-inv-suggest__name">{s.name}</p>
                            <p className="hms-inv-suggest__sub">{fmt(s.price)}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="hms-inv-field-label">
                    <span className="hms-inv-field-label__icon"><Pill className="w-3 h-3 text-success" /></span> Add Medicine
                  </label>
                  <button onClick={() => addItem({ itemType: 'MEDICINE', description: '', quantity: 1, unitPrice: 0, totalPrice: 0 })}
                    className="hms-inv-add-medicine">
                    + Add medicine item manually
                  </button>
                </div>
              </div>
            </div>

            {/* 4 — Invoice Items */}
            <div className="hms-inv-card">
              <div className="hms-inv-section-head">
                <p className="hms-inv-section-label">
                  {sectionNum(4)} Invoice Items
                </p>
                <button onClick={() => addItem({ itemType: 'CUSTOM', description: '', quantity: 1, unitPrice: 0, totalPrice: 0 })}
                  className="hms-inv-add-custom-btn">
                  <Plus className="w-3 h-3" /> Add Custom Item
                </button>
              </div>

              {items.length === 0 ? (
                <div className="hms-inv-empty">
                  No items yet — detect from patient or add manually
                </div>
              ) : (
                <>
                  <div className="hms-inv-items-head">
                    <div>Type</div>
                    <div>Description</div>
                    <div className="hms-inv-items-head__qty">Qty</div>
                    <div className="hms-inv-items-head__unit">Unit ₹</div>
                    <div className="hms-inv-items-head__total">Total ₹</div>
                  </div>
                  <div>
                    {items.map(item => (
                      <div key={item.key} className="hms-inv-items-row">
                        <div>
                          <SearchableSelect
                            className="hms-inv-items-row__type-select"
                            value={item.itemType ?? 'CUSTOM'}
                            onChange={val => updateItem(item.key, { itemType: val })}
                            options={Object.keys(TYPE_META).map(k => ({ value: k, label: TYPE_META[k].label }))}
                          />
                        </div>
                        <div>
                          <input className="hms-inv-items-row__input"
                            placeholder="Description…" value={item.description} onChange={e => updateItem(item.key, { description: e.target.value })} />
                        </div>
                        <div>
                          <input type="number" min={1} className="hms-inv-items-row__input is-center"
                            value={item.quantity}
                            onChange={e => updateItem(item.key, { quantity: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
                            onBlur={e => { if (!e.target.value || Number(e.target.value) < 1) updateItem(item.key, { quantity: 1 }) }} />
                        </div>
                        <div>
                          <input type="number" min={0} className="hms-inv-items-row__input is-right"
                            value={item.unitPrice}
                            onChange={e => updateItem(item.key, { unitPrice: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
                            onBlur={e => { if (e.target.value === '') updateItem(item.key, { unitPrice: 0 }) }} />
                        </div>
                        <div className="hms-inv-items-row__total-wrap">
                          <span className="hms-inv-items-row__total-amt">{fmt(item.totalPrice || 0)}</span>
                          <button onClick={() => removeItem(item.key)} className="hms-inv-items-row__remove">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hms-inv-totals-wrap">
                    <div className="hms-inv-totals">
                      <div className="hms-inv-totals__row">
                        <span>Subtotal:</span><span className="font-semibold">{fmt(subtotal)}</span>
                      </div>
                      <div className="hms-inv-totals__row">
                        <span>Discount (%):</span>
                        <div className="hms-inv-totals__discount-row">
                          <input type="number" min={0} max={100} value={discountPct}
                            onChange={e => setDiscountPct(Math.min(100, parseFloat(e.target.value) || 0))}
                            className="hms-inv-totals__discount-input" />
                          <span className="hms-inv-totals__discount-amt">-{fmt(discountAmt)}</span>
                        </div>
                      </div>
                      {medicineTotal > 0 && (
                        <div className="hms-inv-totals__row">
                          <span className="hms-inv-totals__discount-row">
                            GST Medicines
                            <select
                              value={gstRatePercent}
                              onChange={e => setGstRatePercent(Number(e.target.value))}
                              className="hms-inv-totals__gst-select"
                            >
                              {(gstRates.length ? gstRates : [{ id: 'default', ratePercent: gstRatePercent }]).map(r => (
                                <option key={r.id} value={r.ratePercent}>{r.ratePercent}%</option>
                              ))}
                            </select>
                          </span>
                          <span className="font-semibold">{fmt(gstOnMedicines)}</span>
                        </div>
                      )}
                      <div className="hms-inv-totals__row is-grand">
                        <span>Grand Total:</span><span className="hms-inv-totals__grand-value">{fmt(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 5 — Payment Details */}
            <div className="hms-inv-card">
              <div className="hms-inv-section-head">
                <p className="hms-inv-section-label">
                  {sectionNum(5)} Payment Details
                </p>
              </div>
              <div className="hms-inv-pay-grid">
                <div>
                  <label className="hms-inv-field-label">Payment Method</label>
                  <SearchableSelect
                    className="hms-inv-input"
                    value={paymentMethod}
                    onChange={val => {
                      setPaymentMethod(val)
                      const eligible = accountsForMethod(bankAccounts, val)
                      const def = eligible.find(a => a.isDefault) ?? eligible[0]
                      setBankAccountId(def ? def.id : '')
                    }}
                    options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
                  />
                </div>
                <div>
                  <label className="hms-inv-field-label">Notes (optional)</label>
                  <input className="hms-inv-input" placeholder="Additional notes…" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>
              {(() => {
                const eligibleAccounts = accountsForMethod(bankAccounts, paymentMethod)
                const allowedTypes = PAYMENT_METHOD_TO_ACCOUNT_TYPES[paymentMethod] || []
                if (allowedTypes.length === 0) return null
                if (eligibleAccounts.length === 0) {
                  return (
                    <div className="hms-inv-pay-warn">
                      No {paymentMethod === 'Cash' ? 'CASH' : 'SAVINGS / CURRENT'} account found. Configure banks in the Finance app to track this payment.
                    </div>
                  )
                }
                return (
                  <div>
                    <label className="hms-inv-field-label">
                      <span className="hms-inv-field-label__icon"><Landmark className="w-3.5 h-3.5" /></span> Credit payment to
                      <span className="hms-inv-pay-method-hint">
                        ({paymentMethod === 'Cash' ? 'CASH only' : 'SAVINGS / CURRENT only'})
                      </span>
                    </label>
                    <div className="hms-inv-bank-grid">
                      {eligibleAccounts.map(a => {
                        const isSelected = bankAccountId === a.id
                        return (
                          <button key={a.id} type="button" onClick={() => setBankAccountId(a.id)}
                            className={`hms-inv-bank-card${isSelected ? ' is-on' : ''}`}>
                            <div className="hms-inv-bank-card__head">
                              <p className="hms-inv-bank-card__name">{a.accountName}</p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-gray-900 shrink-0" />}
                            </div>
                            <p className="hms-inv-bank-card__sub">{a.bankName ?? 'Bank'} · ···{a.accountNumber.slice(-4)}</p>
                            <p className="hms-inv-bank-card__bal">{fmt(a.currentBalance)}</p>
                          </button>
                        )
                      })}
                    </div>
                    {selectedAccount && (
                      <p className="hms-inv-bank-after">
                        After payment: <span className="hms-inv-bank-after__strong">{fmt(selectedAccount.currentBalance + grandTotal)}</span>
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>

          </div>

          <div className="hms-inv-modal__footer">
            <button onClick={handleSubmit} disabled={saving || !patient || items.length === 0}
              className="zu-btn-primary is-full">
              {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <Printer className="w-4 h-4" />}
              {saving ? 'Generating…' : 'Generate Invoice & Print'}
            </button>
          </div>
        </div>
      </div>

      {/* Print view — rendered outside modal so window.print() captures it */}
      <div className="hms-inv-print">
        <div className="hms-inv-print__head">
          <div>
            <h1 className="hms-inv-print__title">Tax Invoice</h1>
            <p className="hms-inv-print__hospital">{user?.hospitalName}</p>
          </div>
          <div>
            <p className="hms-inv-print__no">#{invoiceNo}</p>
            <p className="hms-inv-print__date">{new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
          </div>
        </div>
        <div className="hms-inv-print__billto">
          <p className="hms-inv-print__billto-label">Bill To</p>
          <p className="hms-inv-print__billto-name">{patient?.firstName} {patient?.lastName}</p>
          <p className="hms-inv-print__billto-uhid">{fmtId(patient?.uhid)}</p>
        </div>
        <div className="hms-inv-print__barcode">
          <Barcode
            value={invoiceNo}
            height={40}
          />
        </div>
        <table className="hms-inv-print__table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="is-center">Qty</th>
              <th className="is-right">Unit Price</th>
              <th className="is-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx}>
                <td>{i.description}</td>
                <td className="is-center">{i.quantity}</td>
                <td className="is-right">{fmt(i.unitPrice)}</td>
                <td className="is-right">{fmt(i.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hms-inv-print__totals">
          <p>Subtotal: {fmt(subtotal)}</p>
          {discountAmt > 0 && <p>Discount ({discountPct}%): -{fmt(discountAmt)}</p>}
          {gstOnMedicines > 0 && <p>GST on Medicines ({gstRatePercent}%): {fmt(gstOnMedicines)}</p>}
          <p className="hms-inv-print__grand">Grand Total: {fmt(grandTotal)}</p>
          <p className="hms-inv-print__paymethod">Payment: {paymentMethod}</p>
        </div>
      </div>
    </>
  )
}

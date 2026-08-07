import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  patientApi,
  invoiceApi,
  bankApi,
  doctorsApi,
  hospitalServiceApi,
  patientServicesApi,
  gstRateApi
} from "@/utils/api";
import { generateInvoiceNumber } from "@/utils/validators";
import { fmtId } from "@/utils/idFormat";
import Barcode from "@/components/ui/Barcode";
import { Info, Search, Plus, Trash2, Printer, X, BedDouble, ScanLine, Stethoscope, FlaskConical, Pill, Wrench, Sparkles, Receipt, ChevronRight, CheckCircle2, Clock, Ban, PanelRightClose, PanelRightOpen, Landmark, RefreshCw, User, AlertTriangle } from "lucide-react";

const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Insurance"];

// Cash → CASH-type drawer; UPI/Card/Bank Transfer → SAVINGS or CURRENT.
const PAYMENT_METHOD_TO_ACCOUNT_TYPES = {
  "Cash":          ["CASH"],
  "UPI":           ["SAVINGS", "CURRENT"],
  "Card":          ["SAVINGS", "CURRENT"],
  "Bank Transfer": ["SAVINGS", "CURRENT"],
  "Insurance":     [],
};

function accountsForMethod(accounts, method) {
  const allowed = PAYMENT_METHOD_TO_ACCOUNT_TYPES[method] || [];
  if (allowed.length === 0) return [];
  return (accounts || []).filter(a => allowed.includes((a.accountType || "").toUpperCase()));
}

function fmt(n) {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TYPE_META = {
  MEDICINE:     { label: "Medicine",     icon: <Pill className="w-3 h-3" /> },
  LAB_TEST:     { label: "Lab Test",     icon: <FlaskConical className="w-3 h-3" /> },
  CONSULTATION: { label: "Consultation", icon: <Stethoscope className="w-3 h-3" /> },
  ROOM_CHARGE:  { label: "Room",         icon: <BedDouble className="w-3 h-3" /> },
  RADIOLOGY:    { label: "Radiology",    icon: <ScanLine className="w-3 h-3" /> },
  CUSTOM:       { label: "Custom",       icon: <Wrench className="w-3 h-3" /> },
  REGISTRATION: { label: "Registration", icon: <User className="w-3 h-3" /> }
};

function TypeBadge({ type }) {
  if (!type) return null;
  const m = TYPE_META[type];
  if (!m) return null;
  return <span className={`hms-create-inv-type-chip is-${type}`}>{m.icon}</span>;
}

const STATUS_CFG = {
  PAID:      { label: "Paid",      icon: CheckCircle2, cls: "is-paid" },
  UNPAID:    { label: "Unpaid",    icon: Clock,        cls: "is-unpaid" },
  CANCELLED: { label: "Cancelled", icon: Ban,          cls: "is-cancelled" }
};

function CreateInvoice() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [params] = useSearchParams();
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addedSuggestions, setAddedSuggestions] = useState(/* @__PURE__ */ new Set());
  const [doctors, setDoctors] = useState([]);
  const [referredById, setReferredById] = useState("");
  const [services, setServices] = useState([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceResults, setServiceResults] = useState([]);
  const [items, setItems] = useState([]);
  const [nextKey, setNextKey] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [invoiceNo] = useState(generateInvoiceNumber());
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [paneOpen, setPaneOpen] = useState(true);
  const [allInvoices, setAllInvoices] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logStatus, setLogStatus] = useState("ALL");
  const [expandedInvoice, setExpandedInvoice] = useState(null);
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [gstRates, setGstRates] = useState([]);
  const [gstRatePercent, setGstRatePercent] = useState(18);

  const loadLogs = useCallback(async (forPatient) => {
    if (!user?.hospitalId) return;
    setLogsLoading(true);
    try {
      const target = forPatient !== void 0 ? forPatient : patient;
      const data = target ? await invoiceApi.getByPatient(target.id) : await invoiceApi.getByHospital(user.hospitalId);
      setAllInvoices(data.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()));
    } catch {
    } finally {
      setLogsLoading(false);
    }
  }, [user?.hospitalId, patient]);

  useEffect(() => {
    loadLogs();
  }, [user?.hospitalId]);

  useEffect(() => {
    if (!user?.hospitalId) return;
    doctorsApi.list(user.hospitalId).then(docs => setDoctors(docs.filter(d => d.userIsActive))).catch(() => {});
    hospitalServiceApi.list(user.hospitalId).then(setServices).catch(() => {});
    bankApi.list(user.hospitalId).then((accounts) => {
      setBankAccounts(accounts);
      // Pre-select default for the initial Cash payment method
      const eligible = accountsForMethod(accounts, "Cash");
      const def = eligible.find((a) => a.isDefault) ?? eligible[0];
      if (def) setBankAccountId(def.id);
    }).catch(() => {});
    gstRateApi.list(user.hospitalId, true).then((rates) => {
      setGstRates(rates || []);
      const def = (rates || []).find((r) => r.isDefault);
      if (def) setGstRatePercent(Number(def.ratePercent));
    }).catch(() => {});
  }, [user?.hospitalId]);

  useEffect(() => {
    const pId = params.get("patientId");
    if (pId && user?.hospitalId) {
      patientApi.get(Number(pId), user.hospitalId).then((p) => selectPatient(p)).catch(() => {});
    }
  }, [params, user?.hospitalId]);

  useEffect(() => {
    if (!patientSearch.trim() || patientSearch.length < 2 || !user?.hospitalId) {
      setPatientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        setPatientResults((await patientApi.search(user.hospitalId, patientSearch)).slice(0, 6));
      } catch {
        setPatientResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch, user?.hospitalId]);

  useEffect(() => {
    if (!serviceSearch.trim()) {
      setServiceResults([]);
      return;
    }
    const q = serviceSearch.toLowerCase();
    setServiceResults(services.filter((s) => s.isActive && s.name.toLowerCase().includes(q)).slice(0, 6));
  }, [serviceSearch, services]);

  const selectPatient = async (p) => {
    setPatient(p);
    setPatientResults([]);
    setPatientSearch("");
    setAddedSuggestions(/* @__PURE__ */ new Set());
    setSuggestions(null);
    loadLogs(p);
    setLoadingSuggestions(true);
    try {
      setSuggestions(await invoiceApi.getSmartSuggestions(p.id));
    } catch {
      setSuggestions(null);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const clearPatient = () => {
    setPatient(null);
    setSuggestions(null);
    loadLogs(null);
  };

  const addItem = (item, suggKey) => {
    const key = nextKey;
    setNextKey((k) => k + 1);
    setItems((prev) => [...prev, { ...item, key }]);
    if (suggKey) setAddedSuggestions((prev) => /* @__PURE__ */ new Set([...prev, suggKey]));
  };

  const removeItem = (key) => setItems((prev) => prev.filter((i) => i.key !== key));

  const updateItem = (key, updates) => {
    setItems((prev) => prev.map((item) => {
      if (item.key !== key) return item;
      const merged = { ...item, ...updates };
      if (updates.quantity !== void 0 || updates.unitPrice !== void 0)
        merged.totalPrice = (merged.quantity || 0) * (merged.unitPrice || 0);
      return merged;
    }));
  };

  const subtotal = useMemo(() => items.reduce((s, i) => s + (i.totalPrice || 0), 0), [items]);
  const discountAmt = subtotal * (discountPct / 100);
  const medicineTotal = items.filter((i) => i.itemType === "MEDICINE").reduce((s, i) => s + (i.totalPrice || 0), 0);
  const gstOnMedicines = (medicineTotal - medicineTotal * (discountPct / 100)) * (gstRatePercent / 100);
  const grandTotal = subtotal - discountAmt + gstOnMedicines;
  const hasSuggestions = suggestions && (suggestions.roomCharge || suggestions.radiologyOrders.length > 0 || suggestions.appointments.length > 0);

  const handleSubmit = async () => {
    if (!patient || !user?.hospitalId) {
      notify("Select a patient first", "warning");
      return;
    }
    if (items.length === 0) {
      notify("Add at least one item", "warning");
      return;
    }
    if (items.some((i) => !i.description.trim())) {
      notify("Fill all item descriptions", "error");
      return;
    }
    setSaving(true);
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
        status: "UNPAID",
        bankAccountId: bankAccountId || void 0,
        items: items.map((i) => ({ itemType: i.itemType, serviceId: i.serviceId, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice }))
      });
      notify("Invoice created", "success");
      loadLogs();
      window.print();
    } catch {
      notify("Failed to create invoice", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (invoiceId) => {
    setMarkingPaidId(invoiceId);
    try {
      await invoiceApi.markAsPaid(invoiceId, bankAccountId || void 0);
      notify("Invoice marked as paid — bank account credited", "success");
      loadLogs();
    } catch (e) {
      notify(e?.response?.data?.message || "Failed to mark as paid", "error");
    } finally {
      setMarkingPaidId(null);
    }
  };

  const filteredLogs = useMemo(() => {
    const q = logSearch.toLowerCase();
    return allInvoices.filter((inv) => {
      const matchStatus = logStatus === "ALL" || inv.status === logStatus;
      const matchSearch = !q || inv.invoiceNumber.toLowerCase().includes(q) || String(inv.patientId).includes(q) || (inv.paymentMethod ?? "").toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [allInvoices, logSearch, logStatus]);

  const selectedAccount = bankAccounts.find((a) => a.id === bankAccountId);

  return (
    <>
      <div className="hms-create-inv-shell no-print">
        {/* ── LEFT: Create Invoice ── */}
        <div className="hms-create-inv-main">

          <div className="hms-create-inv-headrow">
            <div>
              <h1 className="hms-create-inv-headrow__title">Create New Invoice</h1>
              <p className="hms-create-inv-headrow__sub">Smart billing with automatic pending order detection</p>
            </div>
            <button
              onClick={() => setPaneOpen((o) => !o)}
              className="hms-create-inv-toggle"
              title={paneOpen ? "Hide invoice logs" : "Show invoice logs"}
            >
              {paneOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>

          {/* Smart banner */}
          <div className="hms-create-inv-banner">
            <Info className="hms-create-inv-banner__icon w-4 h-4" />
            <div className="hms-create-inv-banner__body">
              <p className="hms-create-inv-banner__title">Smart Billing System</p>
              <p>Selecting a patient auto-detects active room charges, pending radiology orders, and recent consultations.</p>
            </div>
          </div>

          {/* 1. Select Patient */}
          <div className="hms-create-inv-card">
            <p className="hms-create-inv-section-label">
              <span className="hms-create-inv-section-num">1</span>
              Select Patient
            </p>
            {patient ? (
              <div className="hms-create-inv-picked">
                <div className="hms-create-inv-picked__body">
                  <div className="hms-create-inv-picked__icon">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="hms-create-inv-picked__name">{patient.firstName} {patient.lastName}</p>
                    <p className="hms-create-inv-picked__sub">{fmtId(patient.uhid)}{patient.phone ? ` · ${patient.phone}` : ""}</p>
                  </div>
                </div>
                <button onClick={clearPatient} className="hms-create-inv-picked__clear">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="hms-create-inv-search">
                <Search className="hms-create-inv-search__icon w-3.5 h-3.5" />
                <input
                  className="hms-create-inv-input has-icon"
                  placeholder="Search by name or UHID…"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                />
                {searching && <Spinner className="hms-create-inv-search__spinner w-3.5 h-3.5 zu-spinner" />}
                {patientResults.length > 0 && (
                  <div className="hms-create-inv-suggest">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectPatient(p)}
                        className="hms-create-inv-suggest__item"
                      >
                        <p className="hms-create-inv-suggest__name">{p.firstName} {p.lastName}</p>
                        <p className="hms-create-inv-suggest__sub">{fmtId(p.uhid)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Smart Suggestions */}
          {patient && (loadingSuggestions || hasSuggestions) && (
            <div className="hms-create-inv-card">
              <p className="hms-create-inv-section-label">
                <Sparkles className="w-3.5 h-3.5 text-warning" /> Detected Items
                {loadingSuggestions && <Spinner className="w-3 h-3 zu-spinner text-gray-400" />}
              </p>
              {!loadingSuggestions && suggestions && (
                <div className="hms-create-inv-sug-list">
                  {suggestions.roomCharge && (() => {
                    const r = suggestions.roomCharge;
                    const key = `room-${r.roomNumber}`;
                    const added = addedSuggestions.has(key);
                    return (
                      <div className="hms-create-inv-sug-row is-room">
                        <div className="hms-create-inv-sug-row__body">
                          <div className="hms-create-inv-sug-row__icon is-room">
                            <BedDouble className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="hms-create-inv-sug-row__name">Room {r.roomNumber} — {r.roomType.replace("_", " ")}</p>
                            <p className="hms-create-inv-sug-row__sub">{fmt(r.pricePerDay)}/day × {r.daysStayed} day{r.daysStayed !== 1 ? "s" : ""} = <span className="hms-create-inv-sug-row__sub-strong">{fmt(r.totalCharge)}</span></p>
                          </div>
                        </div>
                        <button
                          onClick={() => !added && addItem({ itemType: "ROOM_CHARGE", description: `Room ${r.roomNumber} (${r.roomType}) — ${r.daysStayed} day${r.daysStayed !== 1 ? "s" : ""}`, quantity: Number(r.daysStayed), unitPrice: r.pricePerDay, totalPrice: r.totalCharge }, key)}
                          className={`hms-create-inv-sug-add is-room ${added ? "is-added" : ""}`}
                        >
                          {added ? "✓ Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })()}
                  {suggestions.radiologyOrders.map((r) => {
                    const key = `radiology-${r.orderId}`;
                    const added = addedSuggestions.has(key);
                    return (
                      <div key={key} className="hms-create-inv-sug-row is-radiology">
                        <div className="hms-create-inv-sug-row__body">
                          <div className="hms-create-inv-sug-row__icon is-radiology">
                            <ScanLine className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="hms-create-inv-sug-row__name">{r.serviceName}</p>
                            <p className="hms-create-inv-sug-row__sub">{r.status.replace("_", " ")}{r.scheduledDate ? ` · ${r.scheduledDate}` : ""}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => !added && addItem({ itemType: "RADIOLOGY", description: r.serviceName, quantity: 1, unitPrice: 0, totalPrice: 0 }, key)}
                          className={`hms-create-inv-sug-add is-radiology ${added ? "is-added" : ""}`}
                        >
                          {added ? "✓ Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                  {suggestions.appointments.map((a) => {
                    const key = `appt-${a.appointmentId}`;
                    const added = addedSuggestions.has(key);
                    return (
                      <div key={key} className="hms-create-inv-sug-row is-consultation">
                        <div className="hms-create-inv-sug-row__body">
                          <div className="hms-create-inv-sug-row__icon is-consultation">
                            <Stethoscope className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="hms-create-inv-sug-row__name">{a.doctorName}{a.specialization ? ` — ${a.specialization}` : ""}</p>
                            <p className="hms-create-inv-sug-row__sub">Consultation · {a.apptDate} · <span className="hms-create-inv-sug-row__sub-strong">{fmt(a.consultationFee)}</span></p>
                          </div>
                        </div>
                        <button
                          onClick={() => !added && addItem({ itemType: "CONSULTATION", description: `Consultation — ${a.doctorName}${a.specialization ? ` (${a.specialization})` : ""}`, quantity: 1, unitPrice: a.consultationFee, totalPrice: a.consultationFee }, key)}
                          className={`hms-create-inv-sug-add is-consultation ${added ? "is-added" : ""}`}
                        >
                          {added ? "✓ Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. Referred By */}
          <div className="hms-create-inv-card">
            <p className="hms-create-inv-section-label">
              <span className="hms-create-inv-section-num">2</span>
              Referred By <span className="hms-create-inv-section-label__opt">(Optional)</span>
            </p>
            <SearchableSelect
              value={referredById}
              onChange={(v) => setReferredById(v)}
              options={doctors.map((d) => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}${d.specialization ? ` — ${d.specialization}` : ""}` }))}
              placeholder="Self / Walk-in (No Referral)"
            />
          </div>

          {/* 3. Add Tests & Services */}
          <div className="hms-create-inv-card">
            <p className="hms-create-inv-section-label">
              <span className="hms-create-inv-section-num">3</span>
              Add Tests &amp; Services
            </p>
            <div className="hms-create-inv-pay-grid">
              <div>
                <label className="hms-create-inv-field-label">
                  <FlaskConical className="w-3 h-3" /> Search Lab / Services
                </label>
                <div className="hms-create-inv-search">
                  <input
                    className="hms-create-inv-input"
                    placeholder="Search by test name…"
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                  />
                  {serviceResults.length > 0 && (
                    <div className="hms-create-inv-suggest">
                      {serviceResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            addItem({ itemType: "LAB_TEST", serviceId: s.id, description: s.name, quantity: 1, unitPrice: s.price, totalPrice: s.price });
                            setServiceSearch("");
                            setServiceResults([]);
                          }}
                          className="hms-create-inv-suggest__item"
                        >
                          <p className="hms-create-inv-suggest__name">{s.name}</p>
                          <p className="hms-create-inv-suggest__sub">{fmt(s.price)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="hms-create-inv-field-label">
                  <Pill className="w-3 h-3 text-emerald" /> Add Medicine
                </label>
                <button
                  onClick={() => addItem({ itemType: "MEDICINE", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 })}
                  className="hms-create-inv-add-medicine"
                >
                  + Add medicine item manually
                </button>
              </div>
            </div>
          </div>

          {/* 4. Invoice Items */}
          <div className="hms-create-inv-card">
            <div className="hms-create-inv-items-headrow">
              <p className="hms-create-inv-section-label is-flush">
                <span className="hms-create-inv-section-num">4</span>
                Invoice Items
              </p>
              <button
                onClick={() => addItem({ itemType: "CUSTOM", description: "", quantity: 1, unitPrice: 0, totalPrice: 0 })}
                className="hms-create-inv-add-custom"
              >
                <Plus className="w-3 h-3" /> Add Custom Item
              </button>
            </div>
            {items.length === 0 ? (
              <div className="hms-create-inv-empty-block">
                No items yet — detect from patient or add manually
              </div>
            ) : (
              <>
                <div className="hms-create-inv-items-head">
                  <div className="hms-create-inv-items-head__type">Type</div>
                  <div className="hms-create-inv-items-head__desc">Description</div>
                  <div className="hms-create-inv-items-head__qty">Qty</div>
                  <div className="hms-create-inv-items-head__unit">Unit ₹</div>
                  <div className="hms-create-inv-items-head__total">Total ₹</div>
                </div>
                <div className="hms-create-inv-items-list">
                  {items.map((item) => (
                    <div key={item.key} className="hms-create-inv-item-row">
                      <div className="hms-create-inv-item-row__type">
                        <SearchableSelect
                          value={item.itemType ?? "CUSTOM"}
                          onChange={(v) => updateItem(item.key, { itemType: v })}
                          options={Object.keys(TYPE_META).map((k) => ({ value: k, label: TYPE_META[k]?.label || k }))}
                        />
                      </div>
                      <div className="hms-create-inv-item-row__desc">
                        <input
                          className="hms-create-inv-item-input"
                          placeholder="Description…"
                          value={item.description}
                          onChange={(e) => updateItem(item.key, { description: e.target.value })}
                        />
                      </div>
                      <div className="hms-create-inv-item-row__qty">
                        <input
                          type="number"
                          min={1}
                          className="hms-create-inv-item-input is-center"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.key, { quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="hms-create-inv-item-row__unit">
                        <input
                          type="number"
                          min={0}
                          className="hms-create-inv-item-input is-right"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.key, { unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="hms-create-inv-item-row__total">
                        <span className="hms-create-inv-item-total">{fmt(item.totalPrice || 0)}</span>
                        <button onClick={() => removeItem(item.key)} className="hms-create-inv-item-remove">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="hms-create-inv-summary">
                  <div className="hms-create-inv-summary__inner">
                    <div className="hms-create-inv-summary__row">
                      <span>Subtotal:</span>
                      <span>{fmt(subtotal)}</span>
                    </div>
                    <div className="hms-create-inv-summary__row">
                      <span>Discount (%):</span>
                      <div className="hms-create-inv-summary__disc">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={discountPct}
                          onChange={(e) => setDiscountPct(Math.min(100, parseFloat(e.target.value) || 0))}
                          className="hms-create-inv-summary__disc-input"
                        />
                        <span className="hms-create-inv-summary__disc-amt">-{fmt(discountAmt)}</span>
                      </div>
                    </div>
                    {medicineTotal > 0 && (
                      <div className="hms-create-inv-summary__row">
                        <span className="hms-create-inv-summary__disc">
                          GST Medicines
                          <select
                            value={gstRatePercent}
                            onChange={(e) => setGstRatePercent(Number(e.target.value))}
                            className="hms-create-inv-summary__gst-select"
                          >
                            {(gstRates.length ? gstRates : [{ id: "default", ratePercent: gstRatePercent }]).map((r) => (
                              <option key={r.id} value={r.ratePercent}>{r.ratePercent}%</option>
                            ))}
                          </select>
                        </span>
                        <span>{fmt(gstOnMedicines)}</span>
                      </div>
                    )}
                    <div className="hms-create-inv-summary__grand">
                      <span>Grand Total:</span>
                      <span className="hms-create-inv-summary__grand-val">{fmt(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 5. Payment Details */}
          <div className="hms-create-inv-card">
            <p className="hms-create-inv-section-label">
              <span className="hms-create-inv-section-num">5</span>
              Payment Details
            </p>
            <div className="hms-create-inv-pay-grid">
              <div>
                <label className="hms-create-inv-field-label">Payment Method</label>
                <SearchableSelect
                  value={paymentMethod}
                  onChange={(v) => {
                    setPaymentMethod(v);
                    const eligible = accountsForMethod(bankAccounts, v);
                    const def = eligible.find(a => a.isDefault) ?? eligible[0];
                    setBankAccountId(def ? def.id : "");
                  }}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                />
              </div>
              <div>
                <label className="hms-create-inv-field-label">Notes (optional)</label>
                <input
                  className="hms-create-inv-input"
                  placeholder="Additional notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            {/* Bank account cards — filtered by payment method type */}
            {(() => {
              const eligibleAccounts = accountsForMethod(bankAccounts, paymentMethod);
              const allowedTypes = PAYMENT_METHOD_TO_ACCOUNT_TYPES[paymentMethod] || [];
              if (allowedTypes.length === 0) return null;
              if (eligibleAccounts.length === 0) {
                return (
                  <div className="hms-create-inv-pay-warn">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <p>No {paymentMethod === "Cash" ? "CASH" : "SAVINGS / CURRENT"} account found. Configure banks in the Finance app to track this payment.</p>
                  </div>
                );
              }
              return (
                <div>
                  <label className="hms-create-inv-pay-method-hint">
                    <Landmark className="w-3.5 h-3.5" /> Credit payment to
                    <span className="hms-create-inv-pay-method-hint__detail">({paymentMethod === "Cash" ? "CASH only" : "SAVINGS / CURRENT only"})</span>
                  </label>
                  <div className="hms-create-inv-bank-grid">
                    {eligibleAccounts.map((a) => {
                      const isSelected = bankAccountId === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setBankAccountId(a.id)}
                          className={`hms-create-inv-bank-card ${isSelected ? "is-on" : ""}`}
                        >
                          <div className="hms-create-inv-bank-card__head">
                            <p className="hms-create-inv-bank-card__name">{a.accountName}</p>
                            {isSelected && <CheckCircle2 className="hms-create-inv-bank-card__check w-3.5 h-3.5" />}
                          </div>
                          <p className="hms-create-inv-bank-card__sub">{a.bankName ?? "Bank"} · ···{a.accountNumber.slice(-4)}</p>
                          <p className="hms-create-inv-bank-card__bal">{fmt(a.currentBalance)}</p>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setBankAccountId("")}
                      className={`hms-create-inv-bank-card is-none ${bankAccountId === "" ? "is-on" : ""}`}
                    >
                      <p className="hms-create-inv-bank-card__name">No account</p>
                      <p className="hms-create-inv-bank-card__sub">Skip bank credit</p>
                    </button>
                  </div>
                  {selectedAccount && (
                    <p className="hms-create-inv-bank-after">
                      After payment: <span className="hms-create-inv-bank-after__strong">{fmt(selectedAccount.currentBalance + grandTotal)}</span>
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Generate button */}
          <button
            onClick={handleSubmit}
            disabled={saving || !patient || items.length === 0}
            className="hms-create-inv-gen-btn"
          >
            {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <Printer className="w-4 h-4" />}
            {saving ? "Generating…" : "Generate Invoice & Print"}
          </button>
          <div className="h-4" />
        </div>

        {/* ── RIGHT: Invoice Logs (collapsible) ── */}
        {paneOpen && (
          <div className="hms-create-inv-pane">

            {/* Pane header */}
            <div className="hms-create-inv-pane__head">
              <div className="hms-create-inv-pane__head-row">
                <div className="hms-create-inv-pane__head-id">
                  <Receipt className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="hms-create-inv-pane__title">{patient ? `${patient.firstName} ${patient.lastName}` : "All Invoices"}</p>
                    <p className="hms-create-inv-pane__sub">{patient ? "Patient invoice history" : "Hospital invoice log"} · {filteredLogs.length} shown</p>
                  </div>
                </div>
                <button onClick={() => loadLogs()} className="hms-create-inv-pane__refresh" title="Refresh">
                  <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? "zu-spinner" : ""}`} />
                </button>
              </div>

              {/* Search */}
              <div className="hms-create-inv-pane__search">
                <Search className="hms-create-inv-pane__search-icon w-3.5 h-3.5" />
                <input
                  className="hms-create-inv-pane__search-input"
                  placeholder="Search invoice #, patient…"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                />
                {logSearch && (
                  <button onClick={() => setLogSearch("")} className="hms-create-inv-pane__search-clear">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <div className="hms-create-inv-pane__filters">
                {["ALL", "UNPAID", "PAID", "CANCELLED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setLogStatus(s)}
                    className={`hms-create-inv-pane__filter ${logStatus === s ? "is-on" : ""}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Log list */}
            <div className="hms-create-inv-pane__body">
              {logsLoading ? (
                <CenterLoader />
              ) : filteredLogs.length === 0 ? (
                <div className="hms-create-inv-pane__empty">
                  <Receipt className="w-8 h-8 text-gray-300" />
                  <p className="hms-create-inv-pane__empty-text">{patient ? `No invoices for ${patient.firstName}` : "No invoices found"}</p>
                </div>
              ) : (
                <div className="hms-create-inv-pane__list">
                  {filteredLogs.map((inv) => {
                    const cfg = STATUS_CFG[inv.status] ?? STATUS_CFG.UNPAID;
                    const StatusIcon = cfg.icon;
                    const isExpanded = expandedInvoice === inv.id;
                    return (
                      <div key={inv.id}>
                        <button
                          onClick={() => setExpandedInvoice(isExpanded ? null : inv.id ?? null)}
                          className="hms-create-inv-log__row"
                        >
                          <div className="hms-create-inv-log__row-inner">
                            <div className="min-w-0">
                              <div className="hms-create-inv-log__head">
                                <p className="hms-create-inv-log__id">#{fmtId(inv.invoiceNumber)}</p>
                                <span className={`hms-create-inv-log__status ${cfg.cls}`}>
                                  <StatusIcon className="w-2.5 h-2.5" />{cfg.label}
                                </span>
                              </div>
                              <p className="hms-create-inv-log__date">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata', day: "2-digit", month: "short", year: "numeric" }) : "—"}{inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}</p>
                            </div>
                            <div className="hms-create-inv-log__right">
                              <span className="hms-create-inv-log__amt">{fmt(inv.total)}</span>
                              <ChevronRight className={`hms-create-inv-log__chevron w-3.5 h-3.5 ${isExpanded ? "is-open" : ""}`} />
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="hms-create-inv-log__expand">
                            <div className="hms-create-inv-log__expand-inner">
                              {(inv.items ?? []).map((item, idx) => (
                                <div key={idx} className="hms-create-inv-log__item-row">
                                  <div className="hms-create-inv-log__item-left">
                                    <TypeBadge type={item.itemType} />
                                    <p className="hms-create-inv-log__item-desc">{item.description}</p>
                                  </div>
                                  <span className="hms-create-inv-log__item-amt">×{item.quantity} · {fmt(item.totalPrice)}</span>
                                </div>
                              ))}
                              <div className="hms-create-inv-log__total-row">
                                <span className="hms-create-inv-log__total-label">Total</span>
                                <span className="hms-create-inv-log__total-val">{fmt(inv.total)}</span>
                              </div>
                              {inv.status === "UNPAID" && inv.id && (
                                <button
                                  onClick={() => handleMarkPaid(inv.id)}
                                  disabled={markingPaidId === inv.id}
                                  className="hms-create-inv-log__pay-btn"
                                >
                                  {markingPaidId === inv.id ? <Spinner className="w-3 h-3 zu-spinner" /> : <CheckCircle2 className="w-3 h-3" />}
                                  Mark as Paid{selectedAccount ? ` → ${selectedAccount.accountName}` : ""}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Print view */}
      <div className="hms-create-inv-print">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-22 font-bold">{user?.hospitalName}</h1>
            <p className="text-13 text-gray-500 mt-1">Tax Invoice</p>
          </div>
          <div className="text-right text-13">
            <p className="font-bold text-18">#{invoiceNo}</p>
            <p className="text-gray-500">{(/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata' })}</p>
          </div>
        </div>
        <div className="border-t pt-4 mb-6">
          <p className="text-11 text-gray-500 uppercase tracking-wide mb-1">Bill To</p>
          <p className="font-bold">{patient?.firstName} {patient?.lastName}</p>
          <p className="text-13 text-gray-500">{fmtId(patient?.uhid)}</p>
        </div>
        <div className="hms-create-inv-print__barcode">
          <Barcode
            value={invoiceNo}
            height={40}
          />
        </div>
        <table className="w-full text-13">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Description</th>
              <th className="text-center py-2">Qty</th>
              <th className="text-right py-2">Unit Price</th>
              <th className="text-right py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx} className="border-b">
                <td className="py-2">{i.description}</td>
                <td className="text-center py-2">{i.quantity}</td>
                <td className="text-right py-2">{fmt(i.unitPrice)}</td>
                <td className="text-right py-2">{fmt(i.totalPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-6 text-right text-13">
          <p>Subtotal: {fmt(subtotal)}</p>
          {discountAmt > 0 && <p>Discount ({discountPct}%): -{fmt(discountAmt)}</p>}
          {gstOnMedicines > 0 && <p>GST on Medicines ({gstRatePercent}%): {fmt(gstOnMedicines)}</p>}
          <p className="text-18 font-bold border-t pt-2 mt-2">Grand Total: {fmt(grandTotal)}</p>
          <p className="text-13 text-gray-500">Payment: {paymentMethod}</p>
        </div>
      </div>
    </>
  );
}

export {
  CreateInvoice as default
};

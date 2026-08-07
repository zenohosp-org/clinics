import { Spinner } from "@/components/ui/Loader";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import { ambulanceApi, patientApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import Pagination from "@/components/ui/Pagination";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PageHeader from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Menu from "@/components/ui/Menu";
import { Ambulance, Plus, X, Search, Calendar, Clock, MapPin, Car, CheckCircle2, AlertCircle, Clock3, XCircle, Truck, Activity, MoreHorizontal, Wrench, Trash2, Edit2, ChevronRight, UserPlus,  } from "lucide-react";

const PAGE_SIZE = 30;

const STATUS_CONFIG = {
  PENDING:    { label: "Pending",    cls: "is-pending",    icon: Clock3 },
  DISPATCHED: { label: "Dispatched", cls: "is-dispatched", icon: Truck },
  EN_ROUTE:   { label: "En Route",   cls: "is-enroute",    icon: Activity },
  COMPLETED:  { label: "Completed",  cls: "is-completed",  icon: CheckCircle2 },
  CANCELLED:  { label: "Cancelled",  cls: "is-cancelled",  icon: XCircle },
};

const VEHICLE_STATUS_CONFIG = {
  AVAILABLE:   { label: "Available",   cls: "is-available" },
  IN_USE:      { label: "In Use",      cls: "is-in-use" },
  MAINTENANCE: { label: "Maintenance", cls: "is-maintenance" },
};

const PAYMENT_OPTIONS = ["UNPAID", "PAID", "PARTIAL"];

const EMPTY_FORM = {
  patient: null,
  bookingDate: new Date().toISOString().split("T")[0],
  bookingTime: new Date().toTimeString().slice(0, 5),
  pickupAddress: "",
  destinationAddress: "",
  vehicleId: "",
  driverName: "",
  driverPhone: "",
  driverLicense: "",
  reachedToSameHospital: false,
  paymentStatus: "UNPAID",
  notes: "",
  emergencyFirstName: "",
  emergencyLastName: "",
  emergencyPhone: "",
};

// ── Shared sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`hms-amb-status-chip ${cfg.cls}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

function PatientSearch({ hospitalId, value, onChange }) {
  const [query, setQuery] = useState(value ? `${value.firstName} ${value.lastName}` : "");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (q) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const data = await patientApi.search(hospitalId, q);
      setResults(data || []);
      setOpen(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const select = (p) => { onChange(p); setQuery(`${p.firstName} ${p.lastName} (${fmtId(p.uhid)})`); setOpen(false); };
  const clear = () => { onChange(null); setQuery(""); setResults([]); };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="hms-amb-pat-search__icon w-4 h-4" />
        <input
          value={query}
          onChange={e => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by name, UHID, or phone…"
          className="input pl-9 pr-9"
        />
        {query && <button onClick={clear} className="hms-amb-search-clear"><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && (
        <div className="hms-amb-search-result">
          {loading ? (
            <div className="hms-amb-search-result__state">Searching…</div>
          ) : results.length === 0 ? (
            <div className="hms-amb-search-result__state">No patients found</div>
          ) : results.slice(0, 6).map(p => (
            <button key={p.id} onClick={() => select(p)} className="hms-amb-search-result__item">
              <p className="hms-amb-search-result__name">{p.firstName} {p.lastName}</p>
              <p className="hms-amb-search-result__sub">{fmtId(p.uhid)} · {p.phone}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Booking Modal ────────────────────────────────────────────────────────────

function BookingModal({ hospitalId, availableVehicles, hospitalInfo, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [destIsHospital, setDestIsHospital] = useState(false);

  const hospitalAddress = hospitalInfo
    ? [hospitalInfo.address, hospitalInfo.city, hospitalInfo.state].filter(Boolean).join(", ")
    : "";

  const handleDestCheckbox = (checked) => {
    setDestIsHospital(checked);
    if (checked) set("destinationAddress", hospitalAddress);
    else set("destinationAddress", "");
  };

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const selectedVehicle = availableVehicles.find(v => String(v.id) === String(form.vehicleId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.bookingDate || !form.bookingTime) return;
    if (showEmergency && !form.patient && !form.emergencyFirstName.trim()) {
      setError("Enter a patient name or search for an existing patient.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let patientId = form.patient?.id ?? null;
      if (!patientId && showEmergency && form.emergencyFirstName.trim()) {
        const created = await patientApi.create({
          hospitalId,
          firstName: form.emergencyFirstName.trim(),
          lastName: form.emergencyLastName.trim() || ".",
          phone: form.emergencyPhone.trim() || null,
          gender: "UNKNOWN",
        });
        patientId = created.id;
      }
      await ambulanceApi.createBooking(hospitalId, {
        patientId,
        bookingDate: form.bookingDate,
        bookingTime: form.bookingTime,
        pickupAddress: form.pickupAddress,
        destinationAddress: form.destinationAddress,
        vehicleId: form.vehicleId ? Number(form.vehicleId) : null,
        driverName: form.driverName,
        driverPhone: form.driverPhone,
        driverLicense: form.driverLicense || null,
        paymentStatus: form.paymentStatus,
        notes: form.notes,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to book ambulance");
    } finally { setSaving(false); }
  };

  return (
    <div className="hms-amb-modal-overlay">
      <div className="hms-amb-modal">
        <div className="hms-amb-modal__head">
          <div className="hms-amb-modal__head-left">
            <div className="hms-amb-modal__head-icon">
              <Ambulance className="w-4 h-4" />
            </div>
            <h2 className="hms-amb-modal__head-title">New Booking</h2>
          </div>
          <button onClick={onClose} className="hms-amb-modal__close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="bookingForm" onSubmit={handleSubmit} className="hms-amb-modal__form">
          {error && (
            <div className="hms-amb-modal__error">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* Patient & Schedule */}
          <div>
            <p className="hms-amb-modal__section-label">Patient & Schedule</p>
            <div className="hms-amb-modal__row-stack">
              <div>
                <label className="label">Patient (optional)</label>
                <PatientSearch
                  hospitalId={hospitalId}
                  value={form.patient}
                  onChange={p => { set("patient", p); if (p) setShowEmergency(false); }}
                />
                {!form.patient && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowEmergency(s => !s)}
                      className="hms-amb-emergency-toggle"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {showEmergency ? "Cancel new patient" : "New / Emergency Patient"}
                    </button>
                    {showEmergency && (
                      <div className="hms-amb-emergency-panel">
                        <p className="hms-amb-emergency-panel__hint">A new patient record will be created automatically.</p>
                        <div className="hms-form-grid is-2col">
                          <div>
                            <label className="label">First Name *</label>
                            <input
                              className="input"
                              value={form.emergencyFirstName}
                              onChange={e => set("emergencyFirstName", sanitizeName(e.target.value))}
                              placeholder="First name"
                            />
                          </div>
                          <div>
                            <label className="label">Last Name</label>
                            <input
                              className="input"
                              value={form.emergencyLastName}
                              onChange={e => set("emergencyLastName", sanitizeName(e.target.value))}
                              placeholder="Last name"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="label">Phone</label>
                          <input
                            type="tel"
                            className="input"
                            value={form.emergencyPhone}
                            onChange={e => set("emergencyPhone", sanitizePhone(e.target.value))}
                            placeholder="+91 XXXXX XXXXX"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="hms-form-grid is-2col">
                <div>
                  <label className="label">Date *</label>
                  <input type="date" required className="input" value={form.bookingDate} onChange={e => set("bookingDate", e.target.value)} />
                </div>
                <div>
                  <label className="label">Time *</label>
                  <input type="time" required className="input" value={form.bookingTime} onChange={e => set("bookingTime", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Locations */}
          <div>
            <p className="hms-amb-modal__section-label">Locations</p>
            <div className="hms-form-grid is-2col">
              <div>
                <label className="label">Pickup Address</label>
                <textarea rows={2} className="input" value={form.pickupAddress} onChange={e => set("pickupAddress", e.target.value)} placeholder="Enter pickup location…" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label">Destination Address</label>
                  {hospitalAddress && (
                    <label className="hms-amb-dest-toggle">
                      <input
                        type="checkbox"
                        checked={destIsHospital}
                        onChange={e => handleDestCheckbox(e.target.checked)}
                        className="hms-amb-dest-toggle__cb"
                      />
                      <span className="hms-amb-dest-toggle__lbl">This hospital</span>
                    </label>
                  )}
                </div>
                <textarea
                  rows={2}
                  className="input"
                  value={form.destinationAddress}
                  onChange={e => { set("destinationAddress", e.target.value); if (destIsHospital) setDestIsHospital(false); }}
                  placeholder="Enter destination…"
                  disabled={destIsHospital}
                />
              </div>
            </div>
          </div>

          {/* Vehicle & Driver */}
          <div>
            <p className="hms-amb-modal__section-label">Vehicle & Driver</p>
            <div className="hms-amb-modal__row-stack">
              <div>
                <label className="label">Vehicle</label>
                <SearchableSelect
                  value={form.vehicleId}
                  onChange={(v) => set("vehicleId", v)}
                  options={availableVehicles.map(v => ({
                    value: String(v.id),
                    label: `${v.vehicleNumber}${v.vehicleName ? ` · ${v.vehicleName}` : ""}${v.ambulanceType ? ` · ${v.ambulanceType.name}` : ""}`,
                  }))}
                  placeholder="— Select available vehicle —"
                />
                {selectedVehicle?.defaultCharge != null && (
                  <p className="text-11 text-gray-600 mt-1 font-medium">
                    Default charge: ₹{Number(selectedVehicle.defaultCharge).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="hms-form-grid is-2col">
                <div>
                  <label className="label">Driver Name</label>
                  <input className="input" value={form.driverName} onChange={e => set("driverName", sanitizeName(e.target.value))} placeholder="Driver's full name" />
                </div>
                <div>
                  <label className="label">Driver Phone</label>
                  <input type="tel" className="input" value={form.driverPhone} onChange={e => set("driverPhone", sanitizePhone(e.target.value))} placeholder="+91 XXXXX XXXXX" />
                </div>
                <div>
                  <label className="label">Driver License</label>
                  <input className="input" value={form.driverLicense} onChange={e => set("driverLicense", e.target.value)} placeholder="License number" />
                </div>
              </div>
            </div>
          </div>

          {/* Payment & Notes */}
          <div>
            <p className="hms-amb-modal__section-label">Payment & Notes</p>
            <div className="hms-form-grid is-2col">
              <div>
                <label className="label">Payment Status</label>
                <SearchableSelect
                  value={form.paymentStatus}
                  onChange={(v) => set("paymentStatus", v)}
                  options={PAYMENT_OPTIONS.map(p => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))}
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional instructions…" />
              </div>
            </div>
          </div>
        </form>

        <div className="hms-amb-modal__foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="bookingForm" className="btn-primary" disabled={saving}>
            <Ambulance className="w-4 h-4" />
            {saving ? "Booking…" : "Book Ambulance"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit Vehicle Modal ─────────────────────────────────────────────────

function VehicleModal({ hospitalId, types, vehicle, onClose, onSaved }) {
  const isEdit = !!vehicle;
  const [form, setForm] = useState({
    vehicleNumber: vehicle?.vehicleNumber || "",
    vehicleName: vehicle?.vehicleName || "",
    ambulanceTypeId: vehicle?.ambulanceType?.id ? String(vehicle.ambulanceType.id) : "",
    defaultCharge: vehicle?.defaultCharge != null ? String(vehicle.defaultCharge) : "",
    notes: vehicle?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicleNumber.trim()) return;
    setSaving(true);
    try {
      const payload = {
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        vehicleName: form.vehicleName.trim() || null,
        ambulanceTypeId: form.ambulanceTypeId ? Number(form.ambulanceTypeId) : null,
        defaultCharge: form.defaultCharge ? parseFloat(form.defaultCharge) : null,
        notes: form.notes.trim() || null,
      };
      if (isEdit) {
        await ambulanceApi.updateVehicle(vehicle.id, payload);
      } else {
        await ambulanceApi.createVehicle(hospitalId, payload);
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hms-amb-modal-overlay">
      <div className="hms-amb-modal is-md">
        <div className="hms-amb-modal__head">
          <h3 className="hms-amb-modal__head-title">{isEdit ? "Edit Vehicle" : "Add Vehicle"}</h3>
          <button onClick={onClose} className="hms-amb-modal__close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form id="vehicleForm" onSubmit={handleSubmit} className="hms-amb-modal__form">
          <div>
            <label className="label">Vehicle Number *</label>
            <input autoFocus required value={form.vehicleNumber} onChange={e => set("vehicleNumber", e.target.value.toUpperCase())} placeholder="TN 01 AB 1234" className="input" />
          </div>
          <div>
            <label className="label">Vehicle Name / Model</label>
            <input value={form.vehicleName} onChange={e => set("vehicleName", e.target.value)} placeholder="e.g. Toyota Hiace ALS" className="input" />
          </div>
          <div className="hms-form-grid is-2col">
            <div>
              <label className="label">Ambulance Type</label>
              <SearchableSelect
                value={form.ambulanceTypeId}
                onChange={(v) => set("ambulanceTypeId", v)}
                options={types.map(t => ({ value: String(t.id), label: t.name }))}
                placeholder="— Select —"
              />
            </div>
            <div>
              <label className="label">Default Charge (₹)</label>
              <input type="number" step="0.01" min="0" value={form.defaultCharge} onChange={e => set("defaultCharge", e.target.value)} placeholder="0.00" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any additional info…" className="input" />
          </div>
        </form>
        <div className="hms-amb-modal__foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="vehicleForm" className="btn-primary" disabled={saving || !form.vehicleNumber.trim()}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Vehicle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Type Modal ───────────────────────────────────────────────────────────

function AddTypeModal({ hospitalId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [charge, setCharge] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const t = await ambulanceApi.createType(hospitalId, { name: name.trim(), defaultCharge: charge ? parseFloat(charge) : null });
      onCreated(t);
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="hms-amb-modal-overlay">
      <div className="hms-amb-modal is-sm">
        <div className="hms-amb-modal__head">
          <h3 className="hms-amb-modal__head-title">Add Ambulance Type</h3>
          <button onClick={onClose} className="hms-amb-modal__close"><X className="w-4 h-4" /></button>
        </div>
        <form id="typeForm" onSubmit={handleSubmit} className="hms-amb-modal__form">
          <div>
            <label className="label">Type Name *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Basic Life Support" className="input" />
          </div>
          <div>
            <label className="label">Default Charge (₹)</label>
            <input type="number" value={charge} onChange={e => setCharge(e.target.value)} placeholder="0.00" className="input" />
          </div>
        </form>
        <div className="hms-amb-modal__foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="typeForm" className="btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Add Type"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vehicle Action Menu ──────────────────────────────────────────────────────

function VehicleActionMenu({ v, setEditVehicle, setInternalShowModal, handleStatusToggle, handleDelete }) {
  const items = [
    {
      label: "Edit Details",
      icon: <Edit2 className="w-4 h-4" />,
      onClick: () => { setEditVehicle(v); setInternalShowModal(true); }
    }
  ];

  if (v.status !== "IN_USE") {
    items.push({
      label: v.status === "MAINTENANCE" ? "Mark Available" : "Mark Maintenance",
      icon: <Wrench className="w-4 h-4" />,
      tone: "warning",
      onClick: () => handleStatusToggle(v)
    });
  }

  items.push({ divider: true });

  items.push({
    label: "Delete Vehicle",
    icon: <Trash2 className="w-4 h-4" />,
    tone: "danger",
    onClick: () => handleDelete(v)
  });

  return (
    <div className="hms-appt-am" onClick={e => e.stopPropagation()}>
      <Menu
        items={items}
        triggerIcon={<MoreHorizontal className="w-5 h-5" />}
        triggerClassName="hms-amb-row-act-btn"
        align="right"
      />
    </div>
  );
}

// ── Vehicles Tab ─────────────────────────────────────────────────────────────

function VehiclesTab({ hospitalId, types, onRefreshTypes, isAddTypeOpen, onCloseAddType, isAddVehicleOpen, onCloseAddVehicle }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [internalShowModal, setInternalShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const load = async () => {
    setLoading(true);
    try { setVehicles(await ambulanceApi.getVehicles(hospitalId)); }
    catch { setVehicles([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (hospitalId) load(); }, [hospitalId]);



  const handleStatusToggle = (v) => {
    const next = v.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE";
    setConfirmDialog({
      title: "Confirm Status Change",
      message: `Set ${v.vehicleNumber} to ${next}?`,
      actionLabel: "Confirm",
      actionVariant: "primary",
      onConfirm: async () => {
        await ambulanceApi.updateVehicleStatus(v.id, next);
        setConfirmDialog(null);
        load();
      }
    });
  };

  const handleDelete = (v) => {
    setConfirmDialog({
      title: "Delete Vehicle",
      message: `Delete vehicle ${v.vehicleNumber}? This cannot be undone.`,
      actionLabel: "Delete",
      actionVariant: "danger",
      onConfirm: async () => {
        await ambulanceApi.deleteVehicle(v.id);
        setConfirmDialog(null);
        load();
      }
    });
  };

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    return (
      v.vehicleNumber.toLowerCase().includes(q) ||
      (v.vehicleName || "").toLowerCase().includes(q) ||
      (v.ambulanceType?.name || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="hms-amb-section">
      <div className="hms-amb-section-head">
        <div className="hms-amb-section-head__left">
          <h2 className="hms-amb-section-head__title">Fleet</h2>
          <span className="hms-amb-section-head__count is-rose">
            {vehicles.length} vehicles
          </span>
        </div>
      </div>

      <div className="hms-amb-search-bar">
        <Search className="hms-amb-search-bar__icon w-4 h-4" />
        <input
          type="text"
          placeholder="Search by number, model, or type…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="hms-amb-search-bar__input"
        />
      </div>

      <div className="hms-amb-table-card">
        <div className="overflow-x-auto">
          <table className="hms-amb-table">
            <thead>
              <tr>
                {["Vehicle", "Type", "Default Charge", "Status", "Notes", ""].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="zu-table-loading-cell">
                    <TableSkeleton rows={6} columns={6} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="hms-amb-state">
                  <div className="hms-amb-state__stack">
                    <div className="hms-amb-state__icon-bg">
                      <Ambulance className="w-8 h-8" />
                    </div>
                    <p className="hms-amb-state__text">
                      {search ? "No vehicles match your search." : "No vehicles registered yet."}
                    </p>
                  </div>
                </td></tr>
              ) : filtered.map(v => {
                const vsCfg = VEHICLE_STATUS_CONFIG[v.status] || VEHICLE_STATUS_CONFIG.AVAILABLE;
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="hms-amb-veh-cell">
                        <div>
                          <p className="hms-amb-veh-num">{v.vehicleNumber}</p>
                          {v.vehicleName && <p className="hms-amb-veh-name">{v.vehicleName}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="hms-amb-row-cell__strong">{v.ambulanceType?.name || "—"}</td>
                    <td className="hms-amb-row-cell__strong">
                      {v.defaultCharge != null ? `₹${Number(v.defaultCharge).toLocaleString()}` : "—"}
                    </td>
                    <td>
                      <span className={`hms-amb-veh-status ${vsCfg.cls}`}>{vsCfg.label}</span>
                    </td>
                    <td className="hms-amb-row-cell__notes">{v.notes || "—"}</td>
                    <td className="hms-amb-row-act-cell">
                      <VehicleActionMenu 
                        v={v} 
                        setEditVehicle={setEditVehicle} 
                        setInternalShowModal={setInternalShowModal} 
                        handleStatusToggle={handleStatusToggle} 
                        handleDelete={handleDelete} 
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(isAddVehicleOpen) && (
        <VehicleModal hospitalId={hospitalId} types={types} vehicle={null} onClose={onCloseAddVehicle} onSaved={load} />
      )}
      {internalShowModal && (
        <VehicleModal
          hospitalId={hospitalId}
          types={types}
          vehicle={editVehicle}
          onClose={() => setInternalShowModal(false)}
          onSaved={() => { setInternalShowModal(false); load(); }}
        />
      )}

      <Modal isOpen={!!confirmDialog} onClose={() => setConfirmDialog(null)} title={confirmDialog?.title} size="sm">
        <div className="zu-modal-body">
          {confirmDialog?.message}
        </div>
        <div className="zu-modal-footer">
          <Button variant="ghost" onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button variant={confirmDialog?.actionVariant || "primary"} onClick={confirmDialog?.onConfirm}>
            {confirmDialog?.actionLabel}
          </Button>
        </div>
      </Modal>

      {isAddTypeOpen && (
        <AddTypeModal hospitalId={hospitalId} onClose={onCloseAddType} onCreated={() => { onRefreshTypes(); onCloseAddType?.(); }} />
      )}
    </div>
  );
}

// ── Bookings Tab ─────────────────────────────────────────────────────────────

function BookingsTab({ hospitalId, isNewBookingOpen, onCloseNewBooking }) {
  const { notify } = useNotification();
  const [bookings, setBookings] = useState([]);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [hospitalInfo, setHospitalInfo] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [b, av, hi] = await Promise.all([
        ambulanceApi.getBookings(hospitalId).catch(() => []),
        ambulanceApi.getAvailableVehicles(hospitalId).catch(() => []),
        ambulanceApi.getHospitalInfo(hospitalId).catch(() => null),
      ]);
      setBookings(b);
      setAvailableVehicles(av);
      setHospitalInfo(hi);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (hospitalId) load(); }, [hospitalId]);

  const handleStatusChange = async (id, status) => {
    await ambulanceApi.updateStatus(id, { status });
    notify(`Booking marked as ${STATUS_CONFIG[status]?.label || status}`, "success");
    load();
  };

  const handleDelete = (id) => {
    setConfirmCancel(id);
  };

  const filtered = bookings.filter(b => {
    const q = search.toLowerCase();
    const patientName = b.patient ? `${b.patient.firstName} ${b.patient.lastName}`.toLowerCase() : "walk-in";
    return (
      patientName.includes(q) ||
      (b.vehicle?.vehicleNumber || "").toLowerCase().includes(q) ||
      (b.driverName || "").toLowerCase().includes(q) ||
      (b.pickupAddress || "").toLowerCase().includes(q) ||
      (b.destinationAddress || "").toLowerCase().includes(q)
    );
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const NEXT_STATUS = { PENDING: "DISPATCHED", DISPATCHED: "EN_ROUTE", EN_ROUTE: "COMPLETED" };
  const NEXT_LABEL = { PENDING: "Dispatch", DISPATCHED: "En Route", EN_ROUTE: "Complete" };
  const NEXT_COLOR = {
    PENDING: "is-blue",
    DISPATCHED: "is-slate",
    EN_ROUTE: "is-emerald",
  };

  return (
    <div className="hms-amb-section">
      {/* Header */}
      <div className="hms-amb-section-head">
        <div className="hms-amb-section-head__left">
          <h2 className="hms-amb-section-head__title">Bookings</h2>
          <span className="hms-amb-section-head__count is-blue">
            {bookings.length} total
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="hms-amb-search-bar">
        <Search className="hms-amb-search-bar__icon w-4 h-4" />
        <input
          type="text"
          placeholder="Search patient, vehicle, driver…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="hms-amb-search-bar__input"
        />
      </div>

      {/* Table */}
      <div className="hms-amb-table-card flex-1">
        <div className="overflow-x-auto flex-1">
          <table className="hms-amb-table">
            <thead>
              <tr>
                {["Booking", "Route", "Vehicle", "Driver", "Status", "Actions"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="zu-table-loading-cell">
                    <TableSkeleton rows={6} columns={6} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="hms-amb-state">
                  <div className="hms-amb-state__stack">
                    <div className="hms-amb-state__icon-bg">
                      <Ambulance className="w-8 h-8" />
                    </div>
                    <p className="hms-amb-state__text">
                      {search ? "No bookings match your search." : "No ambulance bookings yet."}
                    </p>
                    {!search && (
                      <button className="btn-primary text-12 mt-1" onClick={() => setShowModal(true)}>
                        <Plus className="w-3.5 h-3.5" /> Create First Booking
                      </button>
                    )}
                  </div>
                </td></tr>
              ) : paginated.map(b => {
                const initials = b.patient
                  ? `${b.patient.firstName?.[0] ?? ""}${b.patient.lastName?.[0] ?? ""}`.toUpperCase()
                  : null;
                return (
                  <tr key={b.id}>
                    {/* Booking col — patient + date/time */}
                    <td>
                      <div className="hms-amb-booking-cell">
                        {initials && (
                          <div className="hms-amb-initials is-patient">
                            {initials}
                          </div>
                        )}
                        <div>
                          <p className="hms-amb-booking-name">
                            {b.patient ? `${b.patient.firstName} ${b.patient.lastName}` : "Walk-in"}
                          </p>
                          <p className="hms-amb-booking-when">
                            <Calendar className="w-3 h-3" />
                            {b.bookingDate}&nbsp;·&nbsp;<Clock className="w-3 h-3" />{b.bookingTime?.slice(0, 5)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Route */}
                    <td className="hms-amb-route-cell">
                      {b.pickupAddress || b.destinationAddress ? (
                        <div>
                          <p className="hms-amb-route-line">
                            <MapPin className="w-3 h-3" />{b.pickupAddress || "—"}
                          </p>
                          {b.destinationAddress && (
                            <p className="hms-amb-route-line">
                              <ChevronRight className="w-3 h-3" />{b.destinationAddress}
                            </p>
                          )}
                        </div>
                      ) : <span className="hms-amb-row-cell__muted">—</span>}
                    </td>

                    {/* Vehicle */}
                    <td>
                      {b.vehicle ? (
                        <div>
                          <p className="hms-amb-row-cell__strong">
                            {b.vehicle.vehicleNumber}
                          </p>
                          {b.vehicle.ambulanceType && (
                            <p className="hms-amb-row-cell__sub">{b.vehicle.ambulanceType.name}</p>
                          )}
                        </div>
                      ) : <span className="hms-amb-row-cell__muted">—</span>}
                    </td>

                    {/* Driver */}
                    <td>
                      {b.driverName ? (
                        <div>
                          <p className="hms-amb-row-cell__strong">{b.driverName}</p>
                          {b.driverPhone && <p className="hms-amb-row-cell__sub">{b.driverPhone}</p>}
                          {b.driverLicense && <p className="hms-amb-row-cell__muted">Lic: {b.driverLicense}</p>}
                        </div>
                      ) : <span className="hms-amb-row-cell__muted">—</span>}
                    </td>

                    {/* Status */}
                    <td>
                      <div className="hms-amb-status-stack">
                        <StatusBadge status={b.status} />
                        {b.mergedToIpd && (
                          <span className="hms-amb-ipd-chip">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Billed to IPD
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td>
                      <div className="hms-amb-actions" onClick={e => e.stopPropagation()}>
                        {NEXT_STATUS[b.status] && (
                          <button
                            onClick={() => handleStatusChange(b.id, NEXT_STATUS[b.status])}
                            className={`hms-amb-next-btn ${NEXT_COLOR[b.status]}`}
                          >
                            {NEXT_LABEL[b.status]}
                          </button>
                        )}
                        {!["COMPLETED", "CANCELLED"].includes(b.status) && (
                          <button
                            onClick={() => handleDelete(b.id)}
                            className="hms-amb-cancel-btn"
                            title="Cancel booking"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="hms-amb-pagination">
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(filtered.length / PAGE_SIZE)}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {isNewBookingOpen && (
        <BookingModal
          hospitalId={hospitalId}
          availableVehicles={availableVehicles}
          hospitalInfo={hospitalInfo}
          onClose={onCloseNewBooking}
          onSaved={() => { load(); notify("Ambulance booked successfully", "success"); }}
        />
      )}

      <Modal isOpen={!!confirmCancel} onClose={() => setConfirmCancel(null)} title="Cancel Booking" size="sm">
        <div className="zu-modal-body">
          Cancel this booking? This cannot be undone.
        </div>
        <div className="zu-modal-footer">
          <Button variant="ghost" onClick={() => setConfirmCancel(null)}>Keep</Button>
          <Button variant="danger" onClick={async () => {
            await ambulanceApi.deleteBooking(confirmCancel);
            notify("Booking cancelled", "success");
            setConfirmCancel(null);
            load();
          }}>Cancel Booking</Button>
        </div>
      </Modal>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AmbulanceBook() {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;
  const isAdmin = user?.role === "hospital_admin" || user?.role === "super_admin";

  const [tab, setTab] = useState("bookings");
  const [types, setTypes] = useState([]);

  const [isAddTypeOpen, setIsAddTypeOpen] = useState(false);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);

  const loadTypes = async () => {
    if (!hospitalId) return;
    try { setTypes(await ambulanceApi.getTypes(hospitalId)); } catch { setTypes([]); }
  };

  useEffect(() => { loadTypes(); }, [hospitalId]);

  const TABS = [
    { key: "bookings", label: "Bookings" },
    ...(isAdmin ? [{ key: "vehicles", label: "Fleet" }] : []),
  ];

  const headerActions = tab === "vehicles" && isAdmin ? (
    <div className="flex gap-2">
      <button onClick={() => setIsAddTypeOpen(true)} className="zu-btn-secondary text-13">+ Add Type</button>
      <button onClick={() => setIsAddVehicleOpen(true)} className="zu-btn-primary text-13">+ Add Vehicle</button>
    </div>
  ) : (
    <button onClick={() => setIsNewBookingOpen(true)} className="zu-btn-primary text-13">
      <Plus className="w-4 h-4 mr-2" /> New Booking
    </button>
  );

  return (
    <div className="zu-page">
      <PageHeader 
        title="Ambulance"
        subtitle="Manage fleet and dispatch bookings"
        actions={headerActions}
      />

      <div className="zu-page-content">
      {/* Tabs */}
      {TABS.length > 1 && (
        <div className="hms-amb-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`hms-amb-tab ${tab === t.key ? "is-on" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "vehicles" && isAdmin && (
        <VehiclesTab 
          hospitalId={hospitalId} 
          types={types} 
          onRefreshTypes={loadTypes} 
          isAddTypeOpen={isAddTypeOpen}
          onCloseAddType={() => setIsAddTypeOpen(false)}
          isAddVehicleOpen={isAddVehicleOpen}
          onCloseAddVehicle={() => setIsAddVehicleOpen(false)}
        />
      )}
      {tab === "bookings" && (
        <BookingsTab 
          hospitalId={hospitalId} 
          isNewBookingOpen={isNewBookingOpen}
          onCloseNewBooking={() => setIsNewBookingOpen(false)}
        />
      )}
      </div>
    </div>
  );
}

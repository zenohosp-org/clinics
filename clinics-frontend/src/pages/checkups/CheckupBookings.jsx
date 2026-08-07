import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { checkupApi, patientApi, doctorsApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import SearchableSelect from "@/components/ui/SearchableSelect";
import PageHeader from "@/components/ui/PageHeader";
import TableSkeleton from "@/components/ui/TableSkeleton";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import {
  ClipboardList, Plus, Search, X, Calendar, Clock, User,
  AlertCircle, CheckCircle2, Loader2, ChevronRight,
  Clock3, Activity, UserCheck, Banknote, UserPlus, Check,
} from "lucide-react";

const STATUS_CONFIG = {
  SCHEDULED:   { label: "Scheduled",   cls: "is-scheduled" },
  CHECKED_IN:  { label: "Checked In",  cls: "is-checked-in" },
  IN_PROGRESS: { label: "In Progress", cls: "is-in-progress" },
  COMPLETED:   { label: "Completed",   cls: "is-completed" },
  CANCELLED:   { label: "Cancelled",   cls: "is-cancelled" },
  NO_SHOW:     { label: "No Show",     cls: "is-no-show" },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.SCHEDULED;
  return (
    <span className={`hms-checkup-status-badge ${cfg.cls}`}>
      <span className="hms-checkup-status-badge__dot" />
      {cfg.label}
    </span>
  );
}

// PENDING (created, no bill yet) → BILLED (auto-bill on COMPLETED → invoice exists)
// → PAID (invoice fully collected). PARTIAL covers staff-entered split payments
// at booking time. Unknown strings fall back to a neutral chip.
const PAYMENT_BADGE_CLS = {
  PAID:    "is-paid",
  BILLED:  "is-billed",
  PARTIAL: "is-partial",
  PENDING: "is-pending",
};

function PaymentBadge({ status }) {
  const cls = PAYMENT_BADGE_CLS[status] || PAYMENT_BADGE_CLS.PENDING;
  return (
    <span className={`hms-checkup-pay-badge ${cls}`}>
      {status || "—"}
    </span>
  );
}

function BookingModal({ hospitalId, onClose, onBooked }) {
  const [packages, setPackages] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState([]);
  const [patientOpen, setPatientOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const patientRef = useRef(null);

  const [form, setForm] = useState({
    patient: null, packageId: "", doctorId: "",
    scheduledDate: new Date().toISOString().split("T")[0],
    scheduledTime: "09:00", paymentStatus: "PENDING",
    amountPaid: "", notes: "",
  });

  useEffect(() => {
    Promise.all([
      checkupApi.getPackages(hospitalId, true),
      doctorsApi.list(hospitalId),
    ]).then(([pkgs, docs]) => { setPackages(pkgs); setDoctors(docs.filter(d => d.userIsActive)); });
  }, [hospitalId]);

  useEffect(() => {
    const handler = e => { if (patientRef.current && !patientRef.current.contains(e.target)) setPatientOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchPatient = async (q) => {
    setPatientQuery(q);
    if (!q.trim()) { setPatientResults([]); return; }
    const data = await patientApi.search(hospitalId, q).catch(() => []);
    setPatientResults(data); setPatientOpen(true);
  };

  const selectPatient = p => { setForm(f => ({ ...f, patient: p })); setPatientQuery(`${p.firstName} ${p.lastName} (${fmtId(p.uhid)})`); setPatientOpen(false); };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedPkg = packages.find(p => p.id === form.packageId);

  const canProceed = form.patient && form.packageId && form.scheduledDate;

  const handleBook = async () => {
    const amountPaid = form.amountPaid ? parseFloat(form.amountPaid) : 0;
    if (form.paymentStatus === "PAID" && amountPaid <= 0) {
      setError("Enter the amount paid before marking this booking as Paid.");
      return;
    }
    setSaving(true); setError(null);
    try {
      await checkupApi.createBooking(hospitalId, {
        patientId: form.patient.id,
        packageId: form.packageId,
        doctorId: form.doctorId || null,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime || null,
        paymentStatus: form.paymentStatus,
        amountPaid,
        notes: form.notes,
      });
      onBooked(); onClose();
    } catch { setError("Failed to create booking. Please try again."); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size={selectedPkg ? "xl" : "md"}
      title={
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Book Health Checkup</h2>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!canProceed} loading={saving} onClick={handleBook}>
             <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Booking
          </Button>
        </div>
      }
    >
      <div className={`hms-checkup-modal__split ${selectedPkg ? 'has-package' : ''}`}>
        {/* Left Form Pane */}
        <div className="hms-checkup-modal__left">
          {error && (
            <div className="hms-checkup-modal__alert">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div ref={patientRef} className="relative">
            <label className="hms-checkup-modal__label"><User className="inline w-3 h-3 mr-1" />Patient *</label>
            <div className="relative">
              <Search className="hms-checkup-modal__search-icon w-4 h-4" />
              <input value={patientQuery} onChange={e => searchPatient(e.target.value)} onFocus={() => patientResults.length && setPatientOpen(true)} placeholder="Search by name, UHID or phone…" className="hms-checkup-modal__input has-icon" />
            </div>
            {patientOpen && patientResults.length > 0 && (
              <div className="hms-checkup-modal__suggest">
                {patientResults.slice(0, 5).map(p => (
                  <button key={p.id} onClick={() => selectPatient(p)} className="hms-checkup-modal__suggest-row">
                    <p className="hms-checkup-modal__suggest-name">{p.firstName} {p.lastName}</p>
                    <p className="hms-checkup-modal__suggest-sub">{fmtId(p.uhid)} · {p.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="hms-checkup-modal__label">Package *</label>
            <SearchableSelect
              options={packages.map(p => ({ value: p.id, label: `${p.name} — ₹${Number(p.price).toLocaleString("en-IN")}` }))}
              value={form.packageId}
              onChange={v => set("packageId", v)}
              placeholder="— Select a package —"
            />
          </div>

          <div className="hms-form-grid is-2col">
            <div>
              <label className="hms-checkup-modal__label"><Calendar className="inline w-3 h-3 mr-1" />Date *</label>
              <input type="date" value={form.scheduledDate} onChange={e => set("scheduledDate", e.target.value)} className="hms-checkup-modal__input" />
            </div>
            <div>
              <label className="hms-checkup-modal__label"><Clock className="inline w-3 h-3 mr-1" />Time</label>
              <input type="time" value={form.scheduledTime} onChange={e => set("scheduledTime", e.target.value)} className="hms-checkup-modal__input" />
            </div>
          </div>

          <hr className="border-gray-100" />

          <div>
            <label className="hms-checkup-modal__label"><UserCheck className="inline w-3 h-3 mr-1" />Assigned Doctor</label>
            <SearchableSelect
              value={form.doctorId}
              onChange={value => set("doctorId", value)}
              options={[{ value: "", label: "— Assign later —" }, ...doctors.map(d => ({ value: d.id, label: `${d.firstName} ${d.lastName} · ${d.specialization}` }))]}
            />
          </div>

          <div className="hms-form-grid is-2col">
            <div>
              <label className="hms-checkup-modal__label"><Banknote className="inline w-3 h-3 mr-1" />Payment Status</label>
              <SearchableSelect
                value={form.paymentStatus}
                onChange={value => set("paymentStatus", value)}
                clearable={false}
                searchable={false}
                options={[
                  { value: "PENDING", label: "Pending" },
                  { value: "PAID", label: "Paid" },
                ]}
              />
            </div>
            <div>
              <label className="hms-checkup-modal__label">Amount Paid (₹)</label>
              <input type="number" step="0.01" value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} placeholder={selectedPkg ? String(selectedPkg.price) : "0.00"} className="hms-checkup-modal__input" />
            </div>
          </div>

          <div>
            <label className="hms-checkup-modal__label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any special instructions or notes…" className="hms-checkup-modal__input" />
          </div>
        </div>

        {/* Right Details Pane (Only if package is selected) */}
        {selectedPkg && (
          <div className="hms-checkup-modal__right">
            <div className="hms-checkup-modal__right-box">
              <h3 className="hms-checkup-modal__right-title">{selectedPkg.name}</h3>
              <p className="hms-checkup-modal__right-price">₹{Number(selectedPkg.price).toLocaleString("en-IN")}</p>
              
              <div className="hms-checkup-modal__right-divider">
                <p className="hms-checkup-modal__right-subtitle">{selectedPkg.tests?.length || 0} tests included:</p>
                <ul className="hms-checkup-modal__right-list">
                  {selectedPkg.tests?.map((t, i) => (
                    <li key={i}>{t.testName}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function doctorName(d) {
  if (!d) return null;
  const first = d.user?.firstName ?? d.firstName ?? "";
  const last = d.user?.lastName ?? d.lastName ?? "";
  return `Dr. ${first} ${last}`.trim();
}

function AssignDoctorCell({ booking, doctors, onAssigned }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const assign = async (doctorId) => {
    setSaving(true);
    try {
      await checkupApi.assignDoctor(booking.id, doctorId || null);
      onAssigned();
    } finally { setSaving(false); setOpen(false); }
  };

  const name = doctorName(booking.assignedDoctor);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="hms-checkup-assign"
      >
        {saving ? <Loader2 className="w-3 h-3 zu-spinner" /> : <UserPlus className="w-3 h-3 shrink-0" />}
        <span>{name ?? "Assign doctor"}</span>
      </button>
      {open && (
        <div className="hms-checkup-assign-pop">
          <button onClick={() => assign(null)} className="hms-checkup-assign-pop__row is-clear">
            — Unassign doctor
          </button>
          {doctors.map(d => {
            const dn = doctorName(d);
            const isCurrent = booking.assignedDoctor?.id === d.id;
            return (
              <button key={d.id} onClick={() => assign(d.id)} className="hms-checkup-assign-pop__row">
                <div>
                  <p className="hms-checkup-assign-pop__name">{dn}</p>
                  <p className="hms-checkup-assign-pop__spec">{d.specialization}</p>
                </div>
                {isCurrent && <Check className="hms-checkup-assign-pop__check w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CheckupBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hospitalId = user?.hospitalId;

  const [bookings, setBookings] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [stats, setStats] = useState({ today: 0, scheduled: 0, inProgress: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { if (hospitalId) load(); }, [hospitalId]);

  const load = async () => {
    setLoading(true);
    const [b, s, docs] = await Promise.all([
      checkupApi.getBookings(hospitalId).catch(() => []),
      checkupApi.getStats(hospitalId).catch(() => ({ today: 0, scheduled: 0, inProgress: 0, completed: 0 })),
      doctorsApi.list(hospitalId).catch(() => []),
    ]);
    setBookings(b); setStats(s); setDoctors(docs.filter(d => d.userIsActive)); setLoading(false);
  };

  const filtered = bookings.filter(b => {
    if (filterStatus !== "ALL" && b.status !== filterStatus) return false;
    if (filterDate && b.scheduledDate !== filterDate) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = `${b.patient?.firstName} ${b.patient?.lastName}`.toLowerCase();
      return name.includes(q) || b.patient?.uhid?.toLowerCase().includes(q) || b.bookingNumber?.toLowerCase().includes(q) || b.healthPackage?.name?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="zu-page">
      <PageHeader
        title="Checkup Bookings"
        subtitle="Schedule and track health checkup appointments"
        actions={
          <button onClick={() => setShowModal(true)} className="zu-btn-primary">
            <Plus className="w-4 h-4" /> New Booking
          </button>
        }
      />

      {/* Stats */}
      <div className="zu-page-content">
      <div className="zu-stat-card-grid">
        {[
          { label: "Today's Checkups", value: stats.today, icon: Calendar, accent: "blue" },
          { label: "Scheduled", value: stats.scheduled, icon: Clock3, accent: "amber" },
          { label: "In Progress", value: stats.inProgress, icon: Activity, accent: "slate" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, accent: "emerald" },
        ].map(s => (
          <div key={s.label} className="zu-card is-stat">
            <div className={`zu-stat-card-icon is-${s.accent}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="zu-stat-card-body">
              <p className="zu-stat-card-label">{s.label}</p>
              <p className="zu-stat-card-value">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="zu-filter-bar">
        <div style={{ minWidth: 200 }}>
          <SearchableSelect
            value={filterStatus}
            onChange={setFilterStatus}
            clearable={false}
            options={[
              { value: "ALL", label: `All (${bookings.length})` },
              ...Object.entries(STATUS_CONFIG).map(([k, v]) => {
                const count = bookings.filter(b => b.status === k).length;
                return { value: k, label: count > 0 ? `${v.label} (${count})` : v.label };
              })
            ]}
          />
        </div>
        <div className="zu-filter-bar__search">
          <Search className="zu-filter-bar__search-icon" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, UHID, booking number…" className="zu-filter-bar__search-input" />
        </div>
        <div className="zu-filter-bar__controls">
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="zu-filter-date" />
        </div>
      </div>

      {/* Bookings table */}
      <div className="hms-checkup-tablecard">
        <div className="overflow-x-auto">
          <table className="hms-checkup-table">
            <thead>
              <tr>
                {["Booking #", "Patient", "Package", "Scheduled", "Doctor", "Payment", "Status", ""].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="zu-table-loading-cell">
                    <TableSkeleton rows={8} columns={8} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="hms-checkup-cell-state">
                    <ClipboardList className="hms-checkup-cell-state__icon" />
                    <p className="hms-checkup-cell-state__text">No bookings found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(b => (
                  <tr key={b.id}>
                    <td>
                      <p className="hms-checkup-cell__primary">{fmtId(b.bookingNumber)}</p>
                    </td>
                    <td>
                      <p className="hms-checkup-cell__primary">{b.patient?.firstName} {b.patient?.lastName}</p>
                      <p className="hms-checkup-cell__secondary">{fmtId(b.patient?.uhid)}</p>
                    </td>
                    <td className="hms-checkup-table__pkg">
                      <p className="hms-checkup-table__pkg-name">{b.healthPackage?.name}</p>
                      <p className="hms-checkup-table__pkg-price">₹{Number(b.healthPackage?.price || 0).toLocaleString("en-IN")}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      <p className="hms-checkup-cell__primary">{b.scheduledDate}</p>
                      <p className="hms-checkup-cell__secondary">{b.scheduledTime || "—"}</p>
                    </td>
                    <td>
                      <AssignDoctorCell booking={b} doctors={doctors} onAssigned={load} />
                    </td>
                    <td>
                      <PaymentBadge status={b.paymentStatus} />
                    </td>
                    <td><StatusBadge status={b.status} /></td>
                    <td>
                      <button onClick={() => navigate(`/checkups/bookings/${b.id}`)} className="hms-checkup-table__open">
                        Open <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
      </div>

      {showModal && <BookingModal hospitalId={hospitalId} onClose={() => setShowModal(false)} onBooked={load} />}
      </div>
    </div>
  );
}

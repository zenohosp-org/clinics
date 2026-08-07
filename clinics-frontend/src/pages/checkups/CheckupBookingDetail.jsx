import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { checkupApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Barcode from "@/components/ui/Barcode";
import { ArrowLeft, Printer, AlertCircle, ClipboardList, User, Package, Calendar, Clock, Stethoscope, Banknote, CheckCircle2, Circle, Save, FileText, Activity, XCircle, AlertTriangle, Receipt, ExternalLink,  } from "lucide-react";

// Payment status badge — keeps the UI in sync with the lifecycle the backend
// drives (PENDING → BILLED after auto-bill on COMPLETED → PAID after the
// invoice is fully collected). Unknown strings fall through to a neutral chip.
const PAYMENT_CONFIG = {
  PENDING: { label: "Pending", cls: "is-pending" },
  BILLED:  { label: "Billed",  cls: "is-billed" },
  PARTIAL: { label: "Partial", cls: "is-partial" },
  PAID:    { label: "Paid",    cls: "is-paid" },
};

const STATUS_CONFIG = {
  SCHEDULED:   { label: "Scheduled",   cls: "is-scheduled" },
  CHECKED_IN:  { label: "Checked In",  cls: "is-checked-in" },
  IN_PROGRESS: { label: "In Progress", cls: "is-in-progress" },
  COMPLETED:   { label: "Completed",   cls: "is-completed" },
  CANCELLED:   { label: "Cancelled",   cls: "is-cancelled" },
  NO_SHOW:     { label: "No Show",     cls: "is-no-show" },
};

const RESULT_STATUS_OPTIONS = ["PENDING", "NORMAL", "ABNORMAL", "CRITICAL", "NOT_APPLICABLE"];
const RESULT_STATUS_CONFIG = {
  PENDING:        { label: "Pending" },
  NORMAL:         { label: "Normal" },
  ABNORMAL:       { label: "Abnormal" },
  CRITICAL:       { label: "Critical" },
  NOT_APPLICABLE: { label: "N/A" },
};

const FLOW = {
  SCHEDULED:   { next: "CHECKED_IN",  label: "Check In",     icon: CheckCircle2, cls: "is-amber" },
  CHECKED_IN:  { next: "IN_PROGRESS", label: "Start Tests",  icon: Activity,     cls: "is-slate" },
  IN_PROGRESS: { next: "COMPLETED",   label: "Mark Complete", icon: CheckCircle2, cls: "is-emerald" },
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

function InfoRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="hms-checkup-detail-info">
      <div className="hms-checkup-detail-info__icon">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="hms-checkup-detail-info__label">{label}</p>
        <p className="hms-checkup-detail-info__value">{value}</p>
      </div>
    </div>
  );
}

function ResultRow({ result, onSave, disabled }) {
  const [value, setValue] = useState(result.resultValue || "");
  const [status, setStatus] = useState(result.resultStatus || "PENDING");
  const [notes, setNotes] = useState(result.resultNotes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    value !== (result.resultValue || "") ||
    status !== (result.resultStatus || "PENDING") ||
    notes !== (result.resultNotes || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(result.id, { resultValue: value, resultStatus: status, resultNotes: notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>
        <div className="hms-checkup-results__row-name">
          {result.resultStatus === "NORMAL" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
          ) : result.resultStatus === "CRITICAL" ? (
            <AlertTriangle className="w-3.5 h-3.5 text-rose shrink-0" />
          ) : result.resultStatus === "ABNORMAL" ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber shrink-0" />
          ) : (
            <Circle className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          )}
          <div>
            <p className="hms-checkup-results__name">{result.testName}</p>
            {result.testCategory && (
              <p className="hms-checkup-results__cat">{result.testCategory}</p>
            )}
          </div>
        </div>
      </td>
      <td>
        <p className="hms-checkup-results__range">{result.normalRange || "—"}</p>
      </td>
      <td>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Enter result…"
          disabled={disabled}
          className="hms-checkup-results__input"
        />
      </td>
      <td>
        <SearchableSelect
          value={status}
          onChange={value => setStatus(value)}
          options={RESULT_STATUS_OPTIONS.map(s => ({ value: s, label: RESULT_STATUS_CONFIG[s].label }))}
          disabled={disabled}
          clearable={false}
          searchable={false}
        />
      </td>
      <td>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes…"
          disabled={disabled}
          className="hms-checkup-results__input"
        />
      </td>
      <td>
        {!disabled && (
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`hms-checkup-results__save ${saved ? 'is-saved' : isDirty ? 'is-dirty' : ''}`}
          >
            {saving ? <Spinner className="w-3 h-3 zu-spinner" /> : saved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {saved ? "Saved" : "Save"}
          </button>
        )}
      </td>
    </tr>
  );
}

function DoctorNotesPanel({ booking, onSaved, readonly }) {
  const [doctorNotes, setDoctorNotes] = useState(booking.doctorNotes || "");
  const [recommendation, setRecommendation] = useState(booking.recommendation || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty =
    doctorNotes !== (booking.doctorNotes || "") ||
    recommendation !== (booking.recommendation || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      await checkupApi.saveDoctorNotes(booking.id, { doctorNotes, recommendation });
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hms-checkup-notes">
      <div className="hms-checkup-notes__head">
        <Stethoscope className="w-4 h-4 text-emerald" />
        <h3 className="hms-checkup-notes__title">Doctor's Assessment</h3>
      </div>

      <div>
        <label className="hms-checkup-notes__label">Clinical Observations &amp; Findings</label>
        {readonly ? (
          <p className="hms-checkup-notes__readonly">{doctorNotes || <span className="hms-checkup-notes__readonly-empty">—</span>}</p>
        ) : (
          <textarea rows={4} value={doctorNotes} onChange={e => setDoctorNotes(e.target.value)} placeholder="Enter clinical observations, findings, and summary…" className="hms-checkup-notes__textarea" />
        )}
      </div>

      <div>
        <label className="hms-checkup-notes__label">Recommendations &amp; Follow-up</label>
        {readonly ? (
          <p className="hms-checkup-notes__readonly">{recommendation || <span className="hms-checkup-notes__readonly-empty">—</span>}</p>
        ) : (
          <textarea rows={3} value={recommendation} onChange={e => setRecommendation(e.target.value)} placeholder="Enter recommendations, lifestyle advice, or follow-up instructions…" className="hms-checkup-notes__textarea" />
        )}
      </div>

      {!readonly && (
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={`hms-checkup-notes__save ${saved ? 'is-saved' : isDirty ? 'is-dirty' : ''}`}
        >
          {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved" : "Save Assessment"}
        </button>
      )}
    </div>
  );
}

export default function CheckupBookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = () =>
    checkupApi.getBooking(id).then(setBooking).catch(() => setBooking(null)).finally(() => setLoading(false));

  useEffect(() => { if (id) load(); }, [id]);

  const isAdmin = user?.role === "hospital_admin" || user?.role === "super_admin";
  const isDoctor = user?.role === "doctor";
  const canEdit = booking && booking.status !== "COMPLETED" && booking.status !== "CANCELLED" && booking.status !== "NO_SHOW";
  const canEditNotes = isDoctor || isAdmin;

  const handleAdvance = async () => {
    const flow = FLOW[booking.status];
    if (!flow) return;
    // Completing the booking will trigger the backend auto-bill — be explicit
    // about it so staff can sanity-check the amount before money is committed.
    if (flow.next === "COMPLETED" && !booking.invoiceId) {
      const price = Number(booking.healthPackage?.price || 0);
      const inrPrice = price.toLocaleString("en-IN");
      const ok = window.confirm(
        `Mark this booking complete?\n\nAn invoice for ₹${inrPrice} (${booking.healthPackage?.name}) will be created automatically — added to the patient's IPD bill if they're admitted, otherwise as a standalone bill.`
      );
      if (!ok) return;
    }
    setAdvancing(true);
    try {
      await checkupApi.updateStatus(booking.id, flow.next);
      await load();
    } finally {
      setAdvancing(false); }
  };

  const handleCancel = async () => {
    if (!window.confirm("Cancel this booking? This cannot be undone.")) return;
    setCancelling(true);
    try {
      await checkupApi.updateStatus(booking.id, "CANCELLED");
      await load();
    } finally {
      setCancelling(false);
    }
  };

  const handleSaveResult = async (resultId, payload) => {
    const updated = await checkupApi.updateResult(booking.id, resultId, payload);
    setBooking(updated);
  };

  if (loading) return (
    <div className="hms-loader-center">
      <Spinner className="w-5 h-5 zu-spinner" /> Loading…
    </div>
  );

  if (!booking) return (
    <div className="hms-checkup-detail-notfound">
      <AlertCircle className="w-10 h-10 text-gray-300" />
      <p className="hms-checkup-detail-notfound__text">Booking not found.</p>
      <button onClick={() => navigate("/checkups/bookings")} className="hms-checkup-detail-back">
        ← Back to Bookings
      </button>
    </div>
  );

  const flow = FLOW[booking.status];
  const FlowIcon = flow?.icon;
  const completedCount = booking.results?.filter(r => r.resultStatus !== "PENDING").length || 0;
  const totalCount = booking.results?.length || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="zu-page">
      {/* Toolbar */}
      <div className="hms-checkup-detail-toolbar no-print">
        <button
          onClick={() => navigate("/checkups/bookings")}
          className="hms-checkup-detail-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Bookings
        </button>

        <div className="hms-checkup-detail-toolbar__actions">
          {canEdit && booking.status !== "CANCELLED" && booking.status !== "NO_SHOW" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="hms-checkup-detail-cancel"
            >
              {cancelling ? <Spinner className="w-4 h-4 zu-spinner" /> : <XCircle className="w-4 h-4" />}
              Cancel Booking
            </button>
          )}

          {flow && (
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className={`hms-checkup-detail-advance ${flow.cls}`}
            >
              {advancing ? <Spinner className="w-4 h-4 zu-spinner" /> : FlowIcon && <FlowIcon className="w-4 h-4" />}
              {flow.label}
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="hms-checkup-detail-print"
          >
            <Printer className="w-4 h-4" /> Print Report
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hms-checkup-print-header">
        <h1 className="text-18 font-bold text-gray-900">{user?.hospitalName}</h1>
        <p className="text-13 text-gray-500">Health Checkup Report · {fmtId(booking.bookingNumber)}</p>
        <Barcode
          value={booking.bookingNumber}
          height={40}
          className="hms-checkup-print-header__barcode"
        />
      </div>

      {/* Header card */}
      <div className="hms-checkup-detail-card">
        <div className="hms-checkup-detail-card__head">
          <div className="hms-checkup-detail-card__head-left">
            <div className="hms-checkup-detail-card__icon">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="hms-checkup-detail-card__title-row">
                <h1 className="hms-checkup-detail-card__title">{fmtId(booking.bookingNumber)}</h1>
                <StatusBadge status={booking.status} />
              </div>
              <p className="hms-checkup-detail-card__pkg">{booking.healthPackage?.name}</p>
              <p className="hms-checkup-detail-card__by">
                Booked by {booking.createdBy} · {booking.scheduledDate}{booking.scheduledTime ? ` at ${booking.scheduledTime}` : ""}
              </p>
            </div>
          </div>

          {/* Progress ring for results */}
          {totalCount > 0 && (
            <div className="hms-checkup-detail-progress">
              <p className="hms-checkup-detail-progress__label">Results Progress</p>
              <div className="hms-checkup-detail-progress__bar-wrap">
                <div className="hms-checkup-detail-progress__track">
                  <div
                    className="hms-checkup-detail-progress__fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="hms-checkup-detail-progress__val">{completedCount}/{totalCount}</span>
              </div>
            </div>
          )}
        </div>

        {/* Info grid */}
        <div className="hms-checkup-detail-grid">
          <InfoRow icon={User} label="Patient" value={`${booking.patient?.firstName} ${booking.patient?.lastName}`} />
          <InfoRow icon={FileText} label="UHID" value={fmtId(booking.patient?.uhid)} />
          <InfoRow icon={Package} label="Package" value={booking.healthPackage?.name} />
          <InfoRow icon={Banknote} label="Package Price" value={`₹${Number(booking.healthPackage?.price || 0).toLocaleString("en-IN")}`} />
          <InfoRow icon={Calendar} label="Scheduled" value={booking.scheduledDate} />
          <InfoRow icon={Clock} label="Time" value={booking.scheduledTime || "—"} />
          <InfoRow icon={Stethoscope} label="Doctor" value={booking.assignedDoctor ? `Dr. ${booking.assignedDoctor.user?.firstName ?? booking.assignedDoctor.firstName ?? ""} ${booking.assignedDoctor.user?.lastName ?? booking.assignedDoctor.lastName ?? ""}`.trim() : "—"} />
          <div className="hms-checkup-detail-pay">
            <Banknote className="hms-checkup-detail-pay__icon w-4 h-4" />
            <div className="hms-checkup-detail-pay__body">
              <p className="hms-checkup-detail-pay__label">Payment</p>
              <div className="hms-checkup-detail-pay__row">
                {(() => {
                  const cfg = PAYMENT_CONFIG[booking.paymentStatus] || { label: booking.paymentStatus || "—", cls: "is-neutral" };
                  return (
                    <span className={`hms-checkup-detail-pay__badge ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  );
                })()}
                <span className="hms-checkup-detail-pay__amt">
                  ₹{Number(booking.amountPaid || 0).toLocaleString("en-IN")} paid
                </span>
                {booking.paymentStatus === "PARTIAL" && (
                  <span className="hms-checkup-detail-pay__balance">
                    ₹{Number((booking.healthPackage?.price || 0) - (booking.amountPaid || 0)).toLocaleString("en-IN")} due
                  </span>
                )}
              </div>
              {booking.invoiceId && (
                <button
                  onClick={() => navigate(`/billing?invoiceId=${booking.invoiceId}`)}
                  className="hms-checkup-detail-pay__invoice no-print"
                >
                  <Receipt className="w-3 h-3" /> View invoice
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {booking.notes && (
          <div className="hms-checkup-detail-card__notes">
            <p className="hms-checkup-detail-card__notes-label">Notes</p>
            <p className="hms-checkup-detail-card__notes-text">{booking.notes}</p>
          </div>
        )}
      </div>

      {/* Test Results */}
      {totalCount > 0 && (
        <div className="hms-checkup-results">
          <div className="hms-checkup-results__head">
            <Activity className="w-4 h-4 text-emerald" />
            <h2 className="hms-checkup-results__title">Test Results</h2>
            <span className="hms-checkup-results__count">
              {completedCount} of {totalCount} entered
            </span>
          </div>
          {!canEdit && (
            <div className="hms-checkup-results__lock no-print">
              <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
              <p>
                Results are read-only — booking is {STATUS_CONFIG[booking.status]?.label || booking.status}.
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="hms-checkup-results__table">
              <thead>
                <tr>
                  {["Test Name", "Normal Range", "Result Value", "Status", "Notes", ""].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(booking.results || [])
                  .slice()
                  .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                  .map(result => (
                    <ResultRow
                      key={result.id}
                      result={result}
                      onSave={handleSaveResult}
                      disabled={!canEdit}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Doctor Notes */}
      {canEditNotes ? (
        <DoctorNotesPanel booking={booking} onSaved={load} readonly={!canEdit} />
      ) : (booking.doctorNotes || booking.recommendation) ? (
        <DoctorNotesPanel booking={booking} onSaved={load} readonly />
      ) : null}

      {/* Print footer */}
      <div className="hms-checkup-print-footer">
        <p>This report was generated by {user?.hospitalName} · {new Date().toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata', day: "2-digit", month: "long", year: "numeric" })}</p>
        <p>Booking: {fmtId(booking.bookingNumber)} · Patient: {booking.patient?.firstName} {booking.patient?.lastName} ({fmtId(booking.patient?.uhid)})</p>
      </div>
    </div>
  );
}

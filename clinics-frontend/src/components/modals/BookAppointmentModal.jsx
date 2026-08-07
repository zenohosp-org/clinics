import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Calendar, Clock, FileText, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import { patientApi, doctorsApi, appointmentsApi, checkupApi, invoiceApi, bankApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import SearchableSelect from "@/components/ui/SearchableSelect";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function MiniCalendar({ value, onChange }) {
  const today = new Date();
  const selected = value ? new Date(value + "T00:00:00") : null;
  const [view, setView] = useState({ year: selected?.getFullYear() ?? today.getFullYear(), month: selected?.getMonth() ?? today.getMonth() });
  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const prevMonth = () => setView(v => { const m = v.month === 0 ? 11 : v.month - 1; const y = v.month === 0 ? v.year - 1 : v.year; return { year: y, month: m }; });
  const nextMonth = () => setView(v => { const m = v.month === 11 ? 0 : v.month + 1; const y = v.month === 11 ? v.year + 1 : v.year; return { year: y, month: m }; });
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const pick = (day) => {
    const ds = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (ds < todayStr) return;
    onChange(ds);
  };
  return (
    <div className="hms-mini-cal">
      <div className="hms-mini-cal__head">
        <span className="hms-mini-cal__title">{MONTHS[view.month]} {view.year}</span>
        <div className="hms-mini-cal__nav">
          <button type="button" onClick={prevMonth} className="hms-mini-cal__nav-btn"><ChevronLeft className="w-4 h-4" /></button>
          <button type="button" onClick={nextMonth} className="hms-mini-cal__nav-btn"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="hms-mini-cal__dow">{DAYS.map(d => <div key={d} className="hms-mini-cal__dow-cell">{d}</div>)}</div>
      <div className="hms-mini-cal__grid">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const ds = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = ds < todayStr;
          const isSelected = ds === value;
          const isToday = ds === todayStr;
          const cls = isSelected ? " is-selected" : isToday ? " is-today" : "";
          return (
            <button type="button" key={ds} onClick={() => pick(day)} disabled={isPast}
              className={`hms-mini-cal__day${cls}`}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "OPD", label: "Fresh Walk-in", desc: "First-time or walk-in patient" },
  { value: "FOLLOWUP", label: "Follow-up", desc: "Returning patient" },
  { value: "EMERGENCY", label: "Emergency", desc: "Urgent — minimal data" },
  { value: "HEALTH_CHECKUP", label: "Health Checkup", desc: "Link a checkup package" },
];

function SectionLabel({ step, label, icon }) {
  return (
    <div className="hms-book-section-label">
      <div className="hms-book-section-num">
        <span>{step}</span>
      </div>
      <div className="hms-book-section-title">
        {icon && <span className="hms-book-section-title__icon">{icon}</span>}
        <span>{label}</span>
      </div>
    </div>
  );
}

export default function BookAppointmentModal({ isOpen, onClose, onSuccess, selectedDate, prefilledPatient, editAppointment }) {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [pastDoctors, setPastDoctors] = useState([]);
  const [showAllDoctors, setShowAllDoctors] = useState(false);
  const [doctorAppointments, setDoctorAppointments] = useState([]);

  const [patientId, setPatientId] = useState(prefilledPatient ? String(prefilledPatient.id) : "");
  const [doctorId, setDoctorId] = useState("");
  const [apptDate, setApptDate] = useState(selectedDate ? selectedDate.toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);
  const [apptTime, setApptTime] = useState("");
  const [type, setType] = useState("OPD");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [packages, setPackages] = useState([]);
  const [packageId, setPackageId] = useState("");
  const [patientSearch, setPatientSearch] = useState(prefilledPatient ? `${prefilledPatient.firstName} ${prefilledPatient.lastName}` : "");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [patientOpen, setPatientOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);

  // Refund & Edit Billing States
  const [invoice, setInvoice] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [refundMode, setRefundMode] = useState("Cash");
  const [refundBankAccountId, setRefundBankAccountId] = useState("");
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  useEffect(() => {
    if (isOpen && prefilledPatient && !editAppointment) {
      setPatientId(String(prefilledPatient.id));
      setPatientSearch(`${prefilledPatient.firstName} ${prefilledPatient.lastName}`);
    }
  }, [isOpen, prefilledPatient, editAppointment]);

  useEffect(() => {
    if (isOpen && editAppointment) {
      setPatientId(String(editAppointment.patientId));
      setDoctorId(editAppointment.doctorId || "");
      setApptDate(editAppointment.apptDate || "");
      setApptTime(editAppointment.apptTime || "");
      setType(editAppointment.type || "OPD");
      setChiefComplaint(editAppointment.chiefComplaint || "");
      setPackageId(editAppointment.packageId || "");
      setPatientSearch("");

      setLoadingInvoice(true);
      invoiceApi.getByAppointment(editAppointment.id)
        .then(inv => {
          setInvoice(inv);
          if (inv && inv.paidAmount > 0) {
            bankApi.list(user.hospitalId)
              .then(banks => setBankAccounts(banks))
              .catch(console.error);
          }
        })
        .catch(err => {
          console.error("Failed to fetch appointment invoice", err);
        })
        .finally(() => setLoadingInvoice(false));
    } else if (isOpen) {
      setInvoice(null);
      setBankAccounts([]);
      setRefundMode("Cash");
      setRefundBankAccountId("");
    }
  }, [isOpen, editAppointment, user?.hospitalId]);

  const patientRef = useRef(null);
  const doctorRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [isAutoConfirm, setIsAutoConfirm] = useState(false);

  const isEmergency = type === "EMERGENCY";
  const isFollowUp = type === "FOLLOWUP";
  const isHealthCheckup = type === "HEALTH_CHECKUP";

  const selectedPatient = patients.find(p => String(p.id) === patientId);
  const selectedDoctor = doctors.find(d => d.id === doctorId);
  const selectedPkg = packages.find(p => p.id === packageId);

  const displayPatientName = selectedPatient
    ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
    : editAppointment
      ? editAppointment.patientName || `${editAppointment.patientFirstName || ""} ${editAppointment.patientLastName || ""}`.trim()
      : "";

  const displayPatientUhid = selectedPatient
    ? selectedPatient.uhid
    : editAppointment
      ? editAppointment.patientUhid
      : "";

  const displayPatientAvatar = selectedPatient
    ? selectedPatient.firstName?.[0]
    : editAppointment
      ? (editAppointment.patientFirstName || editAppointment.patientName)?.[0]
      : "";

  const hasRefund = (() => {
    if (editAppointment?.noShowPaymentAction) return false;
    if (!editAppointment || !invoice || (invoice.paidAmount || 0) <= 0) return false;
    const oldDoc = doctors.find(d => d.id === editAppointment.doctorId);
    const isOldFollowUp = editAppointment.type === "FOLLOWUP";
    const fOld = oldDoc ? (isOldFollowUp && oldDoc.followUpFee != null ? oldDoc.followUpFee : oldDoc.consultationFee) : 0;

    const isNewFollowUp = type === "FOLLOWUP";
    const fNew = selectedDoctor ? (isNewFollowUp && selectedDoctor.followUpFee != null ? selectedDoctor.followUpFee : selectedDoctor.consultationFee) : 0;

    const diff = fNew - fOld;
    const newTotal = (invoice.total || 0) + diff;
    const refundAmt = (invoice.paidAmount || 0) - newTotal;
    return refundAmt > 0;
  })();

  const refundAmount = (() => {
    if (editAppointment?.noShowPaymentAction) return 0;
    if (!editAppointment || !invoice) return 0;
    const oldDoc = doctors.find(d => d.id === editAppointment.doctorId);
    const isOldFollowUp = editAppointment.type === "FOLLOWUP";
    const fOld = oldDoc ? (isOldFollowUp && oldDoc.followUpFee != null ? oldDoc.followUpFee : oldDoc.consultationFee) : 0;

    const isNewFollowUp = type === "FOLLOWUP";
    const fNew = selectedDoctor ? (isNewFollowUp && selectedDoctor.followUpFee != null ? selectedDoctor.followUpFee : selectedDoctor.consultationFee) : 0;

    const diff = fNew - fOld;
    const newTotal = (invoice.total || 0) + diff;
    const refundAmt = (invoice.paidAmount || 0) - newTotal;
    return refundAmt > 0 ? refundAmt : 0;
  })();

  const filteredPatients = patients.filter(p => {
    const q = patientSearch.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName?.toLowerCase().includes(q) || p.uhid?.toLowerCase().includes(q);
  });

  const doctorPool = isFollowUp && pastDoctors.length > 0 && !showAllDoctors ? pastDoctors : doctors;
  const filteredDoctors = doctorPool.filter(d => {
    if (!doctorSearch) return true;
    const q = doctorSearch.toLowerCase();
    return d.firstName?.toLowerCase().includes(q) || d.lastName?.toLowerCase().includes(q) || d.specialization?.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!isOpen || !user?.hospitalId) return;
    // Checkup packages now live in the labs service. Catch its failure
    // independently so a labs outage doesn't take the whole appointment-
    // booking modal offline — the doctor just sees an empty package list.
    Promise.all([
      patientApi.list(user.hospitalId),
      doctorsApi.list(user.hospitalId),
      checkupApi.getPackages(user.hospitalId, true).catch(() => []),
    ]).then(([p, d, pk]) => {
      setPatients(p); setDoctors(d.filter(x => x.userIsActive)); setPackages(pk);
      if (user.role === "doctor" && !editAppointment) {
        const doc = d.find(x => x.userId === user.userId);
        if (doc) setDoctorId(doc.id);
      }
    }).catch(() => notify("Failed to load data", "error"));
  }, [isOpen, user]);

  useEffect(() => {
    if (!isFollowUp || !patientId || !user?.hospitalId || doctors.length === 0) { setPastDoctors([]); setShowAllDoctors(false); return; }
    appointmentsApi.getPastDoctors(Number(patientId), user.hospitalId)
      .then(dtos => {
        const pastIds = new Set(dtos.map(d => d.doctorId));
        setPastDoctors(doctors.filter(d => pastIds.has(d.id)));
      })
      .catch(() => setPastDoctors([]));
  }, [isFollowUp, patientId, user?.hospitalId, doctors]);

  useEffect(() => { setPastDoctors([]); setShowAllDoctors(false); setDoctorSearch(""); setDoctorOpen(false); }, [type]);

  useEffect(() => {
    const handler = (e) => {
      if (patientRef.current && !patientRef.current.contains(e.target)) setPatientOpen(false);
      if (doctorRef.current && !doctorRef.current.contains(e.target)) setDoctorOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!isOpen || !doctorId || !apptDate) { setDoctorAppointments([]); return; }
    appointmentsApi.getByDoctor(doctorId, apptDate)
      .then(appts => setDoctorAppointments(appts.filter(a => ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(a.status))))
      .catch(console.error);
  }, [doctorId, apptDate, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.hospitalId) return;
    const errs = {};
    if (isEmergency) {
      if (!emergencyName.trim()) errs.patient = "Patient name is required";
    } else {
      if (!patientId) errs.patient = "Please select a patient";
      if (!doctorId) errs.doctor = "Please select a doctor";
      if (!apptTime) errs.time = "Please select a time slot";
    }
    if (editAppointment && hasRefund) {
      if (!refundMode) {
        errs.refund = "Refund mode is required";
      }
      if (refundMode !== "Cash" && !refundBankAccountId) {
        errs.refund = "Please select a bank account for non-cash refund";
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsLoading(true);
    try {
      const payload = {
        hospitalId: user.hospitalId,
        apptDate,
        type,
        chiefComplaint,
        ...(packageId ? { packageId } : {}),
        ...(isEmergency
          ? { emergencyPatientName: emergencyName.trim(), emergencyPhone: emergencyPhone.trim() || undefined, doctorId: doctorId || undefined, apptTime: apptTime || undefined }
          : { patientId: Number(patientId), doctorId, apptTime }),
        ...(editAppointment?.noShowPaymentAction
          ? {
              noShowPaymentAction: editAppointment.noShowPaymentAction,
              refundMode: editAppointment.refundMode,
              refundBankAccountId: editAppointment.refundBankAccountId
            }
          : (editAppointment && hasRefund
            ? { refundMode, refundBankAccountId: refundMode === "Cash" ? null : refundBankAccountId }
            : {}))
      };

      let appointment;
      if (editAppointment) {
        appointment = await appointmentsApi.update(editAppointment.id, payload);
        notify("Appointment updated successfully!", "success");
      } else {
        appointment = await appointmentsApi.create(payload);
        if (isAutoConfirm) {
          try {
            appointment = await appointmentsApi.updateStatus(appointment.id, 'CONFIRMED');
          } catch (err) {
            console.error("Failed to auto-confirm:", err);
          }
        }
        const tokenMsg = appointment.tokenNumber ? ` (Token: ${appointment.tokenNumber})` : "";
        notify(isEmergency ? `Emergency appointment created!${tokenMsg}` : `Appointment scheduled successfully!${tokenMsg}`, "success");
      }

      onSuccess(appointment);
      resetForm();
    } catch (err) {
      notify(err.response?.data?.message || "Failed to save appointment", "error");
    } finally { setIsLoading(false); }
  };

  const resetForm = () => {
    setPatientId(""); setPatientSearch(""); setDoctorSearch("");
    if (user?.role !== "doctor") setDoctorId("");
    setApptTime(""); setType("OPD"); setPackageId(""); setChiefComplaint("");
    setEmergencyName(""); setEmergencyPhone(""); setIsAutoConfirm(false);
    setPastDoctors([]); setShowAllDoctors(false);
    setInvoice(null);
    setBankAccounts([]);
    setRefundMode("Cash");
    setRefundBankAccountId("");
    setErrors({});
  };

  const generateTimeSlots = () => {
    const slotDuration = selectedDoctor?.slotDurationMin || 30;
    const toMin = t => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
    const slots = [];
    let totalMin = 9 * 60;

    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const todayStr = localNow.toISOString().split("T")[0];
    const isToday = apptDate === todayStr;
    const currentMin = now.getHours() * 60 + now.getMinutes();

    while (totalMin < 18 * 60) {
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const displayTime = `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
      const slotStart = totalMin;
      const slotEnd = totalMin + slotDuration;

      const isPast = isToday && slotStart <= currentMin;

      const isBooked = doctorAppointments.some(a => {
        if (!a.apptTime) return false;
        const aStart = toMin(a.apptTime);
        const aEnd = a.apptEndTime ? toMin(a.apptEndTime) : aStart + slotDuration;
        return slotStart < aEnd && slotEnd > aStart;
      });
      slots.push({ timeStr, displayTime, isBooked, isPast });
      totalMin += slotDuration;
    }
    return slots;
  };

  const formatDisplayDate = (d) => {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  if (!isOpen) return null;
  const timeSlots = generateTimeSlots();

  return (
    <div className="zu-modal-overlay">
      <div className="zu-modal is-xl">

        {/* Header */}
        <div className="zu-modal-header">
          <div className="zu-modal-header-row">
            <div>
              <h2 className="hms-cmodal__title flex items-center gap-2">
                {isEmergency && <AlertTriangle className="w-5 h-5 text-rose" />}
                {isEmergency
                  ? "Emergency Appointment"
                  : editAppointment
                    ? "Reschedule Appointment"
                    : "Add Appointment"
                }
              </h2>
              <p className="hms-cmodal__subtitle">
                {isEmergency
                  ? "Quick entry — complete details can be updated after."
                  : editAppointment
                    ? "Update details or reschedule the slot for this patient."
                    : "Schedule a new appointment for a patient."
                }
              </p>
            </div>
            <button onClick={() => { resetForm(); onClose(); }} className="zu-modal-close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="zu-modal-body">
          <form id="book-form" onSubmit={handleSubmit} className="hms-form-stack">

            {/* ── Step 1: Patient ── */}
            <div className="hms-book-section">
              <SectionLabel step="1" label="Patient" />
              {isEmergency ? (
                <div className="hms-form-rows">
                  <div>
                    <input
                      type="text" value={emergencyName}
                      onChange={e => { setEmergencyName(sanitizeName(e.target.value)); setErrors(er => ({ ...er, patient: "" })); }}
                      placeholder="Patient full name *"
                      className={`hms-book-emergency-input${errors.patient ? " is-error" : ""}`}
                    />
                    {errors.patient && <p className="hms-field-error">{errors.patient}</p>}
                  </div>
                  <input
                    type="tel" value={emergencyPhone} onChange={e => setEmergencyPhone(sanitizePhone(e.target.value))}
                    placeholder="Mobile number (optional)"
                    className="hms-book-emergency-input"
                  />
                </div>
              ) : (
                <div>
                  {!prefilledPatient && !editAppointment && (
                    <div className={`zu-search ${errors.patient ? "border-rose-500" : ""}`} ref={patientRef}>
                      <Search className="zu-search-icon" size={16} />
                      <input type="text" value={patientSearch}
                        onChange={e => { setPatientSearch(e.target.value); setPatientOpen(true); }}
                        onFocus={() => setPatientOpen(true)}
                        placeholder="Search by name or UHID…"
                        className="hms-input w-full"
                      />
                      {patientOpen && filteredPatients.length > 0 && (
                        <div className="hms-book-suggest">
                          {(patientSearch ? filteredPatients : filteredPatients.slice(0, 5)).map(p => (
                            <button key={p.id} type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setPatientId(String(p.id)); setPatientSearch(""); setPatientOpen(false); setErrors(e => ({ ...e, patient: "" })); }}
                              className="hms-book-suggest__item">
                              <div className="hms-book-suggest__avatar">{p.firstName[0]}</div>
                              <div className="hms-book-suggest__body">
                                <p className="hms-book-suggest__name">{p.firstName} {p.lastName}</p>
                                <p className="hms-book-suggest__sub">{fmtId(p.uhid)}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedPatient || editAppointment) ? (
                    <div className="hms-book-picked">
                      <div className="hms-book-picked__avatar">{displayPatientAvatar}</div>
                      <div className="hms-book-picked__body">
                        <p className="hms-book-picked__name">{displayPatientName}</p>
                        <p className="hms-book-picked__sub">{fmtId(displayPatientUhid)}</p>
                      </div>
                      {!prefilledPatient && !editAppointment && (
                        <button type="button" onClick={() => { setPatientId(""); setPastDoctors([]); }} className="hms-book-picked__clear"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ) : (
                    errors.patient && <p className="hms-field-error">{errors.patient}</p>
                  )}

                  {!prefilledPatient && !editAppointment && (
                    <button type="button"
                      onClick={() => { onClose(); navigate("/patients", { state: { openRegistration: true } }); }}
                      className="hms-book-register-btn">
                      <UserPlus className="w-3.5 h-3.5" /> Register new patient
                    </button>
                  )}
                </div>
              )}
            </div>

            <hr className="hms-book-divider" />

            {/* ── Step 2: Appointment Type ── */}
            <div className="hms-book-section">
              <SectionLabel step="2" label="Appointment Type" />
              <div className="hms-book-type-grid">
                {TYPE_OPTIONS.map(opt => {
                  const on = type === opt.value;
                  const isEmer = opt.value === "EMERGENCY";
                  const cls = `hms-book-type-card${on ? " is-on" : ""}${on && isEmer ? " is-emergency" : ""}`;
                  return (
                    <button key={opt.value} type="button" onClick={() => setType(opt.value)} className={cls}>
                      <p className="hms-book-type-card__title">
                        {on && <CheckCircle className="w-3.5 h-3.5" />}{opt.label}
                      </p>
                      <p className="hms-book-type-card__sub">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Health Checkup package picker */}
              {isHealthCheckup && packages.length > 0 && (
                <div className="hms-form-group">
                  <label className="hms-label">
                    Package <span className="text-rose">*</span>
                  </label>
                  <SearchableSelect
                    value={packageId}
                    onChange={(v) => setPackageId(v)}
                    options={packages.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Select a checkup package"
                    className="hms-input"
                  />
                  {selectedPkg && (
                    <div className="hms-book-pkg-info">
                      <p className="hms-book-pkg-info__title">{selectedPkg.tests?.length || 0} tests included</p>
                      <p className="hms-book-pkg-info__sub">{selectedPkg.tests?.map(t => t.testName).join(", ")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <hr className="hms-book-divider" />

            {/* ── Step 3: Doctor ── */}
            <div className="hms-book-section">
              <div className="hms-book-section__head">
                <SectionLabel step="3" label={isEmergency ? "Assign Doctor (optional)" : "Doctor"} />
                {isFollowUp && pastDoctors.length > 0 && (
                  <button type="button" onClick={() => setShowAllDoctors(s => !s)} className="hms-book-section-link">
                    {showAllDoctors ? "Show past doctors" : "Show all doctors"}
                  </button>
                )}
              </div>

              {isFollowUp && patientId && pastDoctors.length > 0 && !showAllDoctors && (
                <p className="hms-book-hint">
                  {pastDoctors.length} doctor{pastDoctors.length > 1 ? "s have" : " has"} previously seen this patient.
                </p>
              )}

              <div className={`zu-search ${errors.doctor ? "border-rose-500" : ""}`} ref={doctorRef}>
                <Search className="zu-search-icon" size={16} />
                <input type="text" value={doctorSearch}
                  onChange={e => { setDoctorSearch(e.target.value); setDoctorOpen(true); }}
                  onFocus={() => { if (!selectedDoctor && user?.role !== "doctor") setDoctorOpen(true); }}
                  disabled={user?.role === "doctor"}
                  placeholder="Search by name or specialization…"
                  className="hms-input w-full"
                />
                {doctorOpen && filteredDoctors.length > 0 && (
                  <div className="hms-book-suggest">
                    {(doctorSearch ? filteredDoctors : filteredDoctors.slice(0, 5)).map(d => (
                      <button key={d.id} type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setDoctorId(d.id); setDoctorSearch(""); setDoctorOpen(false); setApptTime(""); setErrors(p => ({ ...p, doctor: "" })); }}
                        className="hms-book-suggest__item">
                        <div className="hms-book-suggest__avatar">{d.firstName[0]}</div>
                        <div className="hms-book-suggest__body">
                          <p className="hms-book-suggest__name">Dr. {d.firstName} {d.lastName}</p>
                          <p className="hms-book-suggest__sub">{d.specialization}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.doctor && <p className="hms-field-error">{errors.doctor}</p>}

              {selectedDoctor && (
                <div className="hms-book-picked is-neutral">
                  <div className="hms-book-picked__avatar">{selectedDoctor.firstName[0]}</div>
                  <div className="hms-book-picked__body">
                    <p className="hms-book-picked__name">Dr. {selectedDoctor.firstName} {selectedDoctor.lastName}</p>
                    <p className="hms-book-picked__sub">{selectedDoctor.specialization}</p>
                  </div>
                  {(() => {
                    const fee = isFollowUp && selectedDoctor.followUpFee != null ? selectedDoctor.followUpFee : selectedDoctor.consultationFee;
                    return fee != null ? (
                      <div className="hms-book-fee">
                        <p className="hms-book-fee__label">{isFollowUp ? "Follow-up" : "Consult"}</p>
                        <p className="hms-book-fee__value">₹{fee}</p>
                      </div>
                    ) : null;
                  })()}
                  <button type="button" onClick={() => { setDoctorId(""); setApptTime(""); }} className="hms-book-picked__clear">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <hr className="hms-book-divider" />

            {/* ── Step 4: Date & Time ── */}
            <div className="hms-book-section">
              <SectionLabel step="4" label="Date & Time" icon={<Calendar className="w-4 h-4" />} />

              <div className="hms-book-date-grid">
                {/* Calendar */}
                <div className="hms-book-cal">
                  {apptDate && (
                    <div className="hms-book-cal__selected">
                      <p className="hms-book-cal__selected-text">{formatDisplayDate(apptDate)}</p>
                    </div>
                  )}
                  <MiniCalendar value={apptDate} onChange={v => { setApptDate(v); setApptTime(""); }} />
                </div>

                {/* Time slots */}
                <div className="hms-book-time-col">
                  <p className="hms-book-time-col__label">
                    Time {isEmergency && <span className="hms-book-time-col__label-hint">(optional)</span>}
                  </p>

                  {isEmergency ? (
                    <div className="hms-book-time-stack">
                      <input type="time" value={apptTime ? apptTime.substring(0, 5) : ""}
                        onChange={e => setApptTime(e.target.value ? e.target.value + ":00" : "")}
                        className="hms-input"
                      />
                      <button type="button" onClick={() => { const n = new Date(); setApptTime(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}:00`); }}
                        className="hms-book-emergency-now">
                        Set to Now
                      </button>
                    </div>
                  ) : !doctorId ? (
                    <div className="hms-book-time-empty">
                      <p className="m-0">Select a doctor first to see available time slots.</p>
                    </div>
                  ) : (
                    <div className="hms-book-time-list">
                      <div className="hms-book-time-list__inner">
                        {timeSlots.map(slot => {
                          const on = apptTime === slot.timeStr;
                          return (
                            <button key={slot.timeStr} type="button" disabled={slot.isBooked || slot.isPast}
                              onClick={() => { setApptTime(slot.timeStr); setErrors(e => ({ ...e, time: "" })); }}
                              className={`hms-book-slot${on ? " is-on" : ""}`}>
                              <Clock className="hms-book-slot__icon w-3.5 h-3.5" />
                              <span>{slot.displayTime}</span>
                              {slot.isBooked && <span className="hms-book-slot__booked">Booked</span>}
                              {slot.isPast && !slot.isBooked && <span className="hms-book-slot__booked" style={{ opacity: 0.6 }}>Passed</span>}
                              {on && <CheckCircle className="hms-book-slot__ok w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                      {errors.time && <p className="hms-book-time-list__err">{errors.time}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <hr className="hms-book-divider" />

            {/* ── Step 5: Reason for Visit ── */}
            <div className="hms-book-section">
              <SectionLabel step="5" label="Reason for Visit" icon={<FileText className="w-4 h-4" />} />
              <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} rows={3}
                className="hms-book-textarea"
                placeholder={isEmergency ? "Brief description of emergency (optional)" : "Enter the reason for the appointment (optional)"} />
            </div>

            {editAppointment && loadingInvoice && (
              <>
                <hr className="hms-book-divider" />
                <div className="hms-book-section p-4 border border-gray-200 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Loading billing invoice details...</p>
                </div>
              </>
            )}

            {editAppointment && !loadingInvoice && hasRefund && (
              <>
                <hr className="hms-book-divider" />
                <div className="hms-book-section p-4 border border-amber-200 bg-amber-50 rounded text-left">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-900">Refund Required</h4>
                      <p className="text-xs text-amber-700">
                        Changing doctor/fee results in patient overpayment. A refund of <strong>₹{refundAmount.toFixed(2)}</strong> will be processed.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div className="hms-form-group">
                      <label className="hms-label text-xs font-medium text-gray-600 block mb-1">Refund Mode</label>
                      <select
                        value={refundMode}
                        onChange={(e) => {
                          setRefundMode(e.target.value);
                          setRefundBankAccountId("");
                          setErrors(prev => ({ ...prev, refund: "" }));
                        }}
                        className="hms-input w-full bg-white border border-gray-300 rounded p-2 text-sm"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>

                    {refundMode !== "Cash" && (
                      <div className="hms-form-group">
                        <label className="hms-label text-xs font-medium text-gray-600 block mb-1">Refund Bank Account</label>
                        <select
                          value={refundBankAccountId}
                          onChange={(e) => {
                            setRefundBankAccountId(e.target.value);
                            setErrors(prev => ({ ...prev, refund: "" }));
                          }}
                          className="hms-input w-full bg-white border border-gray-300 rounded p-2 text-sm"
                        >
                          <option value="">Select bank account...</option>
                          {bankAccounts
                            .filter(a => ["SAVINGS", "CURRENT"].includes((a.accountType || "").toUpperCase()))
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.accountName} ({a.bankName} - ···{a.accountNumber.slice(-4)})
                              </option>
                            ))
                          }
                        </select>
                      </div>
                    )}
                  </div>
                  {errors.refund && <p className="hms-field-error mt-2" style={{ color: '#ef4444' }}>{errors.refund}</p>}
                </div>
              </>
            )}

          </form>
        </div>

        {/* Footer */}
        <div className="zu-modal-footer zu-modal-footer--between">
          {!editAppointment ? (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={isAutoConfirm} onChange={e => setIsAutoConfirm(e.target.checked)} className="hms-checkbox" />
              <span className="font-medium">Patient reached Hospital</span>
            </label>
          ) : <div />}
          <div className="flex gap-2">
            <button type="button" onClick={() => { resetForm(); onClose(); }} className="zu-btn-cancel">Cancel</button>
            <button type="submit" form="book-form" disabled={isLoading}
              className={isEmergency ? "hms-book-emergency-btn" : "zu-btn-primary"}>
              {isLoading ? "Saving…" : editAppointment ? "Save Changes" : isEmergency ? "Create Emergency Appointment" : "Schedule Appointment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

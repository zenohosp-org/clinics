import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, MoreHorizontal, CheckCircle2, XCircle, AlertCircle, AlertTriangle, LogIn, Loader2, PlayCircle, BedDouble, HeartPulse, Search, RefreshCw, Stethoscope, Activity, FlaskConical, Printer, Undo } from "lucide-react";
import ConsultationModal from "@/components/modals/ConsultationModal";
import VitalsModal from "@/components/modals/VitalsModal";
import ExternalResultsModal from "@/components/modals/ExternalResultsModal";
import TableSkeleton from "@/components/ui/TableSkeleton";

// Re-open the consultation modal from these states. COMPLETED is gone —
// once the doctor clicks Mark Complete in the consultation view the
// record is finalised and the row should be a print-only artifact, not
// a place to re-edit. BILLED is gone for the same reason.
const CONSULT_OPEN_ELIGIBLE = new Set(["CHECKED_IN", "IN_PROGRESS"]);
// After Mark Complete, the row exposes a print action so reception can
// hand the patient their consultation + Rx + lab summary.
const PRINT_ELIGIBLE = new Set(["COMPLETED", "BILLED"]);
// Vitals are recorded by the nurse before the doctor takes over, so the
// action surfaces from CONFIRMED onward. Allow editing through IN_PROGRESS
// (re-takes happen) but drop it for COMPLETED — once the consult is done
// vitals are part of the historical record, not editable from the queue.
const VITALS_ELIGIBLE = new Set(["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"]);
// Outside-clinic lab reports the patient walked in with. Front-desk /
// nursing flow, captured at the same window as vitals so the doctor's
// consultation page lands with everything pre-filled.
const EXTERNAL_RESULTS_ELIGIBLE = new Set(["CHECKED_IN", "IN_PROGRESS"]);
import SearchableSelect from "@/components/ui/SearchableSelect";
import PageHeader from "@/components/ui/PageHeader";
import BookAppointmentModal from "@/components/modals/BookAppointmentModal";
import AdmitPatientModal from "@/pages/admin/AdmitPatientModal";
import Pagination from "@/components/ui/Pagination";
import { useAuth } from "@/context/AuthContext";
import { appointmentsApi, doctorsApi, consultationDraftsApi, vitalsApi, bankApi, invoiceApi } from "@/utils/api";
import { format, addDays, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth, addMonths, isSameDay, isSameMonth, parseISO, isToday } from "date-fns";
import { useNotification } from "@/context/NotificationContext";
const APPT_PAGE_SIZE = 30;
const TYPE_LABEL = {
  OPD: "Fresh Walk-in",
  FOLLOWUP: "Follow-up",
  EMERGENCY: "Emergency",
  TELECONSULT: "Teleconsult",
  HEALTH_CHECKUP: "Health Checkup",
};
const STATUS_MOD = {
  SCHEDULED: "is-scheduled",
  CONFIRMED: "is-confirmed",
  IN_PROGRESS: "is-in-progress",
  CHECKED_IN: "is-checked-in",
  COMPLETED: "is-completed",
  CANCELLED: "is-cancelled",
  NO_SHOW: "is-no-show",
  EXPIRED: "is-expired",
};

const getDisplayStatus = (appt) => {
  if (appt.status === "SCHEDULED") {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1e3);
    const todayStr = localNow.toISOString().split("T")[0];
    const timeStr = localNow.toISOString().split("T")[1].substring(0, 5);
    
    if (appt.apptDate < todayStr || (appt.apptDate === todayStr && appt.apptTime < timeStr)) {
      return "EXPIRED";
    }
  }
  return appt.status;
};
const APPT_TONE_MODS = ["is-blue", "is-emerald", "is-amber", "is-slate", "is-rose"];
const STATUS_TRANSITIONS = {
  SCHEDULED: [
    { status: "CONFIRMED", label: "Confirm", icon: "confirm" },
    { status: "CHECKED_IN", label: "Check In", icon: "checkin" },
    { status: "COMPLETED", label: "Mark Completed", icon: "complete" },
    { status: "CANCELLED", label: "Cancel", icon: "cancel" },
    { status: "NO_SHOW", label: "No Show", icon: "noshow" }
  ],
  CONFIRMED: [
    { status: "CHECKED_IN", label: "Check In", icon: "checkin" },
    { status: "COMPLETED", label: "Mark Completed", icon: "complete" },
    { status: "CANCELLED", label: "Cancel", icon: "cancel" },
    { status: "NO_SHOW", label: "No Show", icon: "noshow" }
  ],
  CHECKED_IN: [
    { status: "CONFIRMED", label: "Undo Check In", icon: "undo" },
    { status: "IN_PROGRESS", label: "Start Consultation", icon: "progress" },
    { status: "COMPLETED", label: "Mark Completed", icon: "complete" }
  ],
  IN_PROGRESS: [
    { status: "COMPLETED", label: "Mark Completed", icon: "complete" }
  ],
  COMPLETED: [],
  CANCELLED: [
    { status: "SCHEDULED", label: "Reschedule", icon: "reschedule" }
  ],
  NO_SHOW: [
    { status: "SCHEDULED", label: "Reschedule", icon: "reschedule" }
  ]
};

function ActionMenu({ appt, onUpdate, onEdit, onAdmit, onViewPatientDetails, onOpenConsultation, onRecordVitals, onAddExternalResults, onPrintConsultation, hasDraft, hasVitals }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  
  // Refund States
  const [invoice, setInvoice] = useState(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [refundMode, setRefundMode] = useState("Cash");
  const [refundBankAccountId, setRefundBankAccountId] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);

  // No-Show Reschedule States
  const [showNoShowChoice, setShowNoShowChoice] = useState(false);
  const [noShowAction, setNoShowAction] = useState("FORFEIT");

  const ref = useRef(null);
  const popRef = useRef(null);
  const actions = STATUS_TRANSITIONS[appt.status] ?? [];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target) && (!popRef.current || !popRef.current.contains(e.target))) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handler);
      if (popRef.current) {
        const rect = popRef.current.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 20) {
          popRef.current.classList.add("is-upward");
        } else {
          popRef.current.classList.remove("is-upward");
        }
      }
    }
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const handleAction = async (status) => {
    if (status === "CANCELLED") {
      setShowCancelReason(true);
      setLoadingInvoice(true);
      try {
        const inv = await invoiceApi.getByAppointment(appt.id);
        setInvoice(inv);
        if (inv && inv.paidAmount > 0) {
          const banks = await bankApi.list(appt.hospitalId);
          setBankAccounts(banks);
        }
      } catch (err) {
        console.error("Failed to load refund details:", err);
      } finally {
        setLoadingInvoice(false);
      }
      return;
    }
    if (status === "SCHEDULED") {
      if (appt.status === "NO_SHOW") {
        setLoadingInvoice(true);
        try {
          const inv = await invoiceApi.getByAppointment(appt.id);
          setInvoice(inv);
          if (inv && inv.paidAmount > 0) {
            const banks = await bankApi.list(appt.hospitalId);
            setBankAccounts(banks);
            setShowNoShowChoice(true);
            return;
          }
        } catch (err) {
          console.error("Failed to load refund details:", err);
        } finally {
          setLoadingInvoice(false);
        }
      }
      setOpen(false);
      onEdit();
      return;
    }
    setLoading(true);
    await onUpdate(String(appt.id), status);
    setLoading(false);
    setOpen(false);
  };

  const submitNoShowReschedule = () => {
    if (noShowAction === "REFUND" && refundMode !== "Cash" && !refundBankAccountId) {
      alert("Please select a bank account for the non-cash refund.");
      return;
    }
    const extra = {
      noShowPaymentAction: noShowAction,
      refundMode: noShowAction === "REFUND" ? refundMode : undefined,
      refundBankAccountId: (noShowAction === "REFUND" && refundMode !== "Cash") ? refundBankAccountId : undefined
    };
    setShowNoShowChoice(false);
    setOpen(false);
    onEdit(extra);
  };

  const submitCancel = async () => {
    if (!cancelReason || !cancelReason.trim()) {
      alert("Cancellation reason is required.");
      return;
    }
    if (invoice && invoice.paidAmount > 0 && refundMode !== "Cash" && !refundBankAccountId) {
      alert("Please select a bank account for the non-cash refund.");
      return;
    }
    setLoading(true);
    await onUpdate(
      String(appt.id),
      "CANCELLED",
      cancelReason,
      refundMode,
      refundMode === "Cash" ? null : refundBankAccountId
    );
    setLoading(false);
    setOpen(false);
    setShowCancelReason(false);
    setCancelReason("");
    setInvoice(null);
  };

  const iconFor = (icon) => {
    if (icon === "complete") return <CheckCircle2 className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "cancel") return <XCircle className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "checkin") return <LogIn className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "progress") return <PlayCircle className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "noshow") return <AlertCircle className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "reschedule") return <CalendarIcon className="w-4 h-4 hms-appt-am__item-icon" />;
    if (icon === "undo") return <Undo className="w-4 h-4 hms-appt-am__item-icon" />;
    return <CheckCircle2 className="w-4 h-4 hms-appt-am__item-icon" />;
  };

  return (
    <div className="hms-appt-am" ref={ref} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} className="hms-appt-am__btn">
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="hms-appt-am__pop" ref={popRef}>
          <div className="hms-appt-am__head">
            <p className="hms-appt-am__title">Actions</p>
          </div>
          {!showCancelReason && !showNoShowChoice ? (
            <div className="hms-appt-am__list">
              {actions.map((action) => (
                <button
                  key={action.status}
                  onClick={() => handleAction(action.status)}
                  className="hms-appt-am__item is-neutral"
                >
                  {iconFor(action.icon)}{action.label}
                </button>
              ))}
              {(appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && (
                <button
                  onClick={() => { setOpen(false); onEdit(); }}
                  className="hms-appt-am__item is-neutral"
                >
                  <CalendarIcon className="w-4 h-4 hms-appt-am__item-icon" />Edit Appointment
                </button>
              )}
              {(actions.length > 0 || appt.status === "SCHEDULED" || appt.status === "CONFIRMED") && <div className="hms-appt-am__divider" />}
              <button
                onClick={() => { setOpen(false); onViewPatientDetails(); }}
                className="hms-appt-am__item is-neutral"
              >
                <HeartPulse className="w-4 h-4 hms-appt-am__item-icon" />Patient Details
              </button>
              {VITALS_ELIGIBLE.has(appt.status) && (
                <button
                  onClick={() => { setOpen(false); onRecordVitals(); }}
                  className="hms-appt-am__item is-rose"
                >
                  <span className="hms-appt-am__item-leading">
                    <Activity className="w-4 h-4 hms-appt-am__item-icon" />{hasVitals ? "Edit Vitals" : "Record Vitals"}
                  </span>
                  {hasVitals && <span className="hms-appt-am__badge is-done">DONE</span>}
                </button>
              )}
              {EXTERNAL_RESULTS_ELIGIBLE.has(appt.status) && (
                <button
                  onClick={() => { setOpen(false); onAddExternalResults(); }}
                  className="hms-appt-am__item is-violet"
                >
                  <FlaskConical className="w-4 h-4 hms-appt-am__item-icon" />Add Lab Reports
                </button>
              )}
              {CONSULT_OPEN_ELIGIBLE.has(appt.status) && (
                <button
                  onClick={() => { setOpen(false); onOpenConsultation(); }}
                  className="hms-appt-am__item is-blue"
                >
                  <span className="hms-appt-am__item-leading">
                    <Stethoscope className="w-4 h-4 hms-appt-am__item-icon" />{hasDraft ? "Resume Consultation" : "Open Consultation"}
                  </span>
                  {hasDraft && <span className="hms-appt-am__badge is-draft">DRAFT</span>}
                </button>
              )}
              {PRINT_ELIGIBLE.has(appt.status) && (
                <button
                  onClick={() => { setOpen(false); onPrintConsultation(); }}
                  className="hms-appt-am__item is-slate"
                >
                  <Printer className="w-4 h-4 hms-appt-am__item-icon" />Print Consultation
                </button>
              )}
              {(appt.status === "COMPLETED" || appt.status === "IN_PROGRESS") && (
                <button
                  onClick={() => { setOpen(false); onAdmit(); }}
                  className="hms-appt-am__item is-violet"
                >
                  <BedDouble className="w-4 h-4 hms-appt-am__item-icon" />Admit Patient
                </button>
              )}
            </div>
          ) : showCancelReason ? (
            <div className="hms-appt-am__cancel">
              <p className="hms-appt-am__cancel-label">Cancellation Reason <span className="hms-appt-am__cancel-label-hint" style={{ color: '#ef4444' }}>(required)</span></p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                placeholder="Enter reason..."
                className="hms-appt-am__cancel-textarea"
                autoFocus
              />

              {loadingInvoice ? (
                <p className="text-11 text-gray-500 mt-2">Loading billing details...</p>
              ) : invoice && invoice.paidAmount > 0 ? (
                <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-11 font-semibold text-amber-900">Refund Required</p>
                      <p className="text-11 text-amber-700">
                        This appointment is paid. A refund of <strong>₹{invoice.paidAmount}</strong> will be processed.
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="text-10 font-medium text-gray-600 block">Refund Mode</label>
                      <select
                        value={refundMode}
                        onChange={(e) => {
                          setRefundMode(e.target.value);
                          setRefundBankAccountId("");
                        }}
                        className="w-full text-11 p-1 border border-gray-300 rounded bg-white mt-1"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>

                    {refundMode !== "Cash" && (
                      <div>
                        <label className="text-10 font-medium text-gray-600 block">Refund Bank Account</label>
                        <select
                          value={refundBankAccountId}
                          onChange={(e) => setRefundBankAccountId(e.target.value)}
                          className="w-full text-11 p-1 border border-gray-300 rounded bg-white mt-1"
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
                </div>
              ) : null}

              <div className="hms-appt-am__cancel-actions mt-3">
                <button
                  onClick={() => {
                    setShowCancelReason(false);
                    setCancelReason("");
                    setInvoice(null);
                  }}
                  className="zu-btn-secondary is-sm flex-1"
                >Back</button>
                <button
                  onClick={submitCancel}
                  className="zu-btn-danger is-sm flex-1"
                >Confirm Cancel</button>
              </div>
            </div>
          ) : (
            <div className="hms-appt-am__cancel text-left">
              <p className="text-11 font-semibold text-gray-700">Rescheduling No-Show</p>
              <p className="text-11 text-gray-600 mt-1">
                This appointment has an existing payment of <strong>₹{invoice?.paidAmount}</strong>. How would you like to handle it?
              </p>
              
              <div className="mt-3 space-y-2 text-left">
                <label className="flex items-center gap-2 text-11 text-gray-700 cursor-pointer select-none">
                  <input
                    id="no-show-forfeit-radio"
                    type="radio"
                    name="noShowAction"
                    value="FORFEIT"
                    checked={noShowAction === "FORFEIT"}
                    onChange={() => setNoShowAction("FORFEIT")}
                    className="hms-radio"
                  />
                  <span>Retain payment as forfeited fee</span>
                </label>
                <label className="flex items-center gap-2 text-11 text-gray-700 cursor-pointer select-none">
                  <input
                    id="no-show-refund-radio"
                    type="radio"
                    name="noShowAction"
                    value="REFUND"
                    checked={noShowAction === "REFUND"}
                    onChange={() => setNoShowAction("REFUND")}
                    className="hms-radio"
                  />
                  <span>Refund payment to patient</span>
                </label>
              </div>

              {noShowAction === "REFUND" && (
                <div className="mt-3 p-3 border border-amber-200 bg-amber-50 rounded text-left">
                  <div className="space-y-2">
                    <div>
                      <label className="text-10 font-medium text-gray-600 block">Refund Mode</label>
                      <select
                        id="no-show-refund-mode-select"
                        value={refundMode}
                        onChange={(e) => {
                          setRefundMode(e.target.value);
                          setRefundBankAccountId("");
                        }}
                        className="w-full text-11 p-1 border border-gray-300 rounded bg-white mt-1"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>

                    {refundMode !== "Cash" && (
                      <div>
                        <label className="text-10 font-medium text-gray-600 block">Refund Bank Account</label>
                        <select
                          id="no-show-refund-bank-select"
                          value={refundBankAccountId}
                          onChange={(e) => setRefundBankAccountId(e.target.value)}
                          className="w-full text-11 p-1 border border-gray-300 rounded bg-white mt-1"
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
                </div>
              )}

              <div className="hms-appt-am__cancel-actions mt-3">
                <button
                  id="no-show-back-btn"
                  onClick={() => {
                    setShowNoShowChoice(false);
                    setInvoice(null);
                  }}
                  className="zu-btn-secondary is-sm flex-1"
                >Back</button>
                <button
                  id="no-show-continue-btn"
                  onClick={submitNoShowReschedule}
                  className="zu-btn-primary is-sm flex-1"
                >Continue</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function AppointmentsDashboard() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState("list");
  const [calendarView, setCalendarView] = useState("month");
  const [listFilter, setListFilter] = useState("upcoming");
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [editAppointment, setEditAppointment] = useState(null);
  const [admitPrefill, setAdmitPrefill] = useState(null);
  // Holds the full appointment row whose check-in just triggered the
  // consultation modal. Cleared on save / cancel.
  const [consultationAppointment, setConsultationAppointment] = useState(null);
  // Same shape — drives the VitalsModal. Separate state so a nurse can
  // open vitals on one row while another row's consult is open.
  const [vitalsAppointment, setVitalsAppointment] = useState(null);
  // Front-desk capture of outside-clinic lab reports — same trigger
  // window as vitals so reception/nursing can do both at check-in.
  const [externalResultsAppointment, setExternalResultsAppointment] = useState(null);
  // Set<appointmentId> with an in-flight consultation draft on the server.
  // Drives the "DRAFT" badge + "Resume Consultation" label in the row menu.
  const [draftAppointmentIds, setDraftAppointmentIds] = useState(() => new Set());
  // Set<appointmentId> for rows that already have vitals recorded — drives
  // the "DONE" badge so reception sees at a glance who's been triaged.
  const [vitalsAppointmentIds, setVitalsAppointmentIds] = useState(() => new Set());
  const [apptPage, setApptPage] = useState(1);
  const [currentDate, setCurrentDate] = useState(/* @__PURE__ */ new Date());
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setApptPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const refreshDraftSet = async () => {
    if (!user?.hospitalId) return;
    try {
      const drafts = await consultationDraftsApi.listForHospital(user.hospitalId);
      setDraftAppointmentIds(new Set((drafts || []).map(d => d.appointmentId)));
    } catch {
      // Non-fatal — the modal still works without the badge.
    }
  };

  const refreshVitalsSet = async () => {
    if (!user?.hospitalId) return;
    try {
      const rows = await vitalsApi.listForHospital(user.hospitalId);
      setVitalsAppointmentIds(new Set((rows || []).map(v => v.appointmentId)));
    } catch {
      // Non-fatal — the action still works without the badge.
    }
  };

  const loadData = async () => {
    if (!user?.hospitalId) return;
    refreshDraftSet();
    refreshVitalsSet();
    setIsLoading(true);
    try {
      if (viewMode === "list") {
        const params = {
          page: apptPage - 1,
          size: APPT_PAGE_SIZE,
          dateFilter: listFilter.toUpperCase(),
          search: debouncedSearch,
        };
        if (selectedDoctorId !== "all") {
          params.doctorId = selectedDoctorId;
        }
        const [res, docs] = await Promise.all([
          appointmentsApi.listPaginated(user.hospitalId, params),
          doctors.length === 0 ? doctorsApi.list(user.hospitalId) : Promise.resolve(doctors)
        ]);
        setAppointments(res.content || []);
        setTotalItems(res.totalElements || 0);
        setTotalPages(res.totalPages || 0);
        if (doctors.length === 0) {
          setDoctors(docs.filter(d => d.userIsActive));
        }
      } else {
        const [appts, docs] = await Promise.all([
          appointmentsApi.getByHospital(user.hospitalId),
          doctors.length === 0 ? doctorsApi.list(user.hospitalId) : Promise.resolve(doctors)
        ]);
        setAppointments(appts);
        if (doctors.length === 0) {
          setDoctors(docs.filter(d => d.userIsActive));
        }
      }
    } catch (err) {
      console.error(err);
      notify("Failed to load appointments", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.hospitalId, viewMode, apptPage, listFilter, selectedDoctorId, debouncedSearch]);

  useEffect(() => {
    if (location.state?.filterMine && user?.role === "doctor" && doctors.length > 0) {
      const doc = doctors.find((d) => d.userId === user.userId);
      if (doc) {
        setSelectedDoctorId(doc.id);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [doctors, user, location]);

  const handleStatusUpdate = async (id, status, cancelledReason, refundMode, refundBankAccountId) => {
    const snapshot = appointments.find((a) => String(a.id) === id);
    setAppointments((prev) => prev.map((a) => String(a.id) === id ? { ...a, status } : a));

    // Open the consultation modal optimistically — the moment the doctor
    // clicks Start Consultation. We don't wait on the network so a slow
    // update can't silently swallow the auto-open. If the backend rejects
    // the transition we close it again in the catch below.
    //
    // Only IN_PROGRESS now: CHECKED_IN is the nurse's window for recording
    // vitals; popping the doctor's consult page during triage would block
    // the nurse from finishing.
    const shouldOpenConsult = status === "IN_PROGRESS" && !!snapshot;
    if (shouldOpenConsult) {
      setConsultationAppointment({ ...snapshot, status });
    }

    try {
      const updated = await appointmentsApi.updateStatus(id, status, cancelledReason, refundMode, refundBankAccountId);
      notify(`Appointment marked as ${status.replace(/_/g, " ").toLowerCase()}`, "success");
      // Swap in the server's authoritative DTO so any derived fields are fresh.
      if (shouldOpenConsult && updated) {
        setConsultationAppointment((cur) => cur ? { ...updated } : cur);
      }
      loadData();
    } catch (err) {
      if (snapshot) setAppointments((prev) => prev.map((a) => String(a.id) === id ? snapshot : a));
      if (shouldOpenConsult) setConsultationAppointment(null);
      notify(err?.response?.data?.message || "Failed to update status", "error");
    }
  };

  const [isRefreshingTokens, setIsRefreshingTokens] = useState(false);
  const handleRefreshTokens = async () => {
    if (!user?.hospitalId) return;
    const ok = window.confirm(
      "Refresh today's tokens?\n\nThis will renumber all of today's confirmed-and-later appointments starting from 1, in booking-time order. SCHEDULED, CANCELLED and NO_SHOW rows lose their token."
    );
    if (!ok) return;
    setIsRefreshingTokens(true);
    try {
      const res = await appointmentsApi.refreshTokens(user.hospitalId);
      notify(`Renumbered ${res?.assigned ?? 0} appointment${res?.assigned === 1 ? "" : "s"} from 1`, "success");
      loadData();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to refresh tokens", "error");
    } finally {
      setIsRefreshingTokens(false);
    }
  };
  useEffect(() => {
    setApptPage(1);
  }, [listFilter, selectedDoctorId]);

  const filteredAppointments = useMemo(() => {
    let appts = appointments;
    if (viewMode === "calendar") {
      if (selectedDoctorId !== "all") {
        appts = appts.filter((a) => a.doctorId === selectedDoctorId);
      }
    }
    return appts;
  }, [appointments, selectedDoctorId, viewMode]);
  const nextPeriod = () => {
    if (calendarView === "day") setCurrentDate(addDays(currentDate, 1));
    if (calendarView === "week") setCurrentDate(addWeeks(currentDate, 1));
    if (calendarView === "month") setCurrentDate(addMonths(currentDate, 1));
  };
  const prevPeriod = () => {
    if (calendarView === "day") setCurrentDate(addDays(currentDate, -1));
    if (calendarView === "week") setCurrentDate(addWeeks(currentDate, -1));
    if (calendarView === "month") setCurrentDate(addMonths(currentDate, -1));
  };
  const goToday = () => setCurrentDate(/* @__PURE__ */ new Date());
  const renderHeaderTitle = () => {
    if (calendarView === "day") return format(currentDate, "MMMM d, yyyy");
    if (calendarView === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      if (isSameMonth(start, end)) return `${format(start, "MMMM d")} - ${format(end, "d, yyyy")}`;
      return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
    }
    if (calendarView === "month") return format(currentDate, "MMMM yyyy");
  };
  const getColorForDoctor = (doctorId) => {
    const index = doctors.findIndex((d) => d.id === doctorId);
    return APPT_TONE_MODS[(index >= 0 ? index : 0) % APPT_TONE_MODS.length];
  };
  const renderListView = () => (
    <div className="hms-appt-list">
      <div className="hms-appt-list__head">

        <div className="hms-appt-list__filters">
          <div className="zu-search hms-appt-list__search">
            <Search className="zu-search-icon" size={16} />
            <input
              type="text"
              placeholder="Search patient, UHID, doctor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="hms-input w-full"
            />
          </div>
          <div className="hms-appt-list__doctor-wrap">
            <SearchableSelect
              value={selectedDoctorId}
              onChange={(value) => setSelectedDoctorId(value)}
              options={[{ value: "all", label: "All Doctors" }, ...doctors.map((d) => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))]}
              className="hms-appt-list__doctor-select w-full"
              clearable={false}
            />
          </div>
        </div>
      </div>
      <div className="hms-appt-list__body">
        <div className="hms-appt-list__table-wrap">
          <table className="hms-appt-table">
            <thead>
              <tr>
                <th className="is-token">Token</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Date &amp; Time</th>
                <th>Status</th>
                <th>Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="zu-table-loading-cell">
                    <TableSkeleton rows={8} columns={7} />
                  </td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="hms-appt-empty-cell">
                      <CalendarIcon className="hms-appt-empty-cell__icon" />
                      No appointments found for the selected filters.
                    </div>
                  </td>
                </tr>
              ) : filteredAppointments.map((appt) => (
                <tr key={appt.id}>
                  <td>
                    {appt.tokenNumber != null
                      ? <span className="hms-appt-token-chip">#{appt.tokenNumber}</span>
                      : <span className="hms-appt-token-empty">—</span>}
                  </td>
                  <td>
                    <div className="hms-appt-pat">
                      <div>
                        <p className="hms-appt-pat__name">{appt.patientName}</p>
                        {appt.checkupBookingId && (
                          <button onClick={() => navigate(`/checkups/bookings/${appt.checkupBookingId}`)} className="hms-appt-pat__checkup-link">
                            <HeartPulse className="w-3 h-3" />{appt.checkupBookingNumber}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    Dr. {appt.doctorName}
                  </td>
                  <td>
                    <p className="hms-appt-table__date">{format(parseISO(appt.apptDate), "yyyy-MM-dd")}</p>
                    <p className="hms-appt-table__time">{appt.apptTime ? `${appt.apptTime.substring(0, 5)} ${parseISO(`1970-01-01T${appt.apptTime}`).getHours() >= 12 ? "PM" : "AM"}` : "—"}</p>
                  </td>
                  <td>
                    {(() => {
                      const dispStatus = getDisplayStatus(appt);
                      return <span className={`hms-appt-status ${STATUS_MOD[dispStatus] || ""}`}>{dispStatus.replace(/_/g, " ")}</span>;
                    })()}
                  </td>
                  <td>{TYPE_LABEL[appt.type] ?? appt.type}</td>
                  <td>
                    <div className="hms-appt-row-actions">
                      <ActionMenu
                        appt={appt}
                        onUpdate={handleStatusUpdate}
                        onEdit={(extra) => { setEditAppointment(extra ? { ...appt, ...extra } : appt); setIsBookingModalOpen(true); }}
                        onAdmit={() => setAdmitPrefill({ patient: { id: appt.patientId, firstName: appt.patientFirstName || appt.patientName?.split(" ")[0], lastName: appt.patientLastName || appt.patientName?.split(" ").slice(1).join(" "), uhid: appt.patientUhid }, doctorId: appt.doctorId, chiefComplaint: appt.chiefComplaint, source: "OPD_REFERRAL", appointmentId: appt.id })}
                        onViewPatientDetails={() => navigate(`/patients/${appt.patientId}`)}
                        onOpenConsultation={() => setConsultationAppointment(appt)}
                        onRecordVitals={() => setVitalsAppointment(appt)}
                        onAddExternalResults={() => setExternalResultsAppointment(appt)}
                        onPrintConsultation={() => window.open(`/print/appointment/${appt.id}`, "_blank", "noopener,noreferrer")}
                        hasDraft={draftAppointmentIds.has(String(appt.id))}
                        hasVitals={vitalsAppointmentIds.has(String(appt.id))}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hms-appt-list__paging">
          <Pagination
            currentPage={apptPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={APPT_PAGE_SIZE}
            onPageChange={setApptPage}
          />
        </div>
      </div>
    </div>
  );
  const renderWeekView = () => {
    const startDate = startOfWeek(currentDate);
    const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    return (
      <div className="hms-appt-cal is-week-bg">
        <div className="hms-appt-cal__row">
          {days.map((day) => (
            <div key={day.toISOString()} className="hms-appt-cal__day-head">
              <p className="hms-appt-cal__dow-label">{format(day, "EEE")}</p>
              <p className="hms-appt-cal__dom">{format(day, "d")}</p>
            </div>
          ))}
        </div>
        <div className="hms-appt-cal__week">
          {days.map((day) => {
            const dayAppts = filteredAppointments.filter((a) => isSameDay(parseISO(a.apptDate), day)).sort((a, b) => a.apptTime.localeCompare(b.apptTime));
            return (
              <div key={day.toISOString()} className={`hms-appt-cal__col ${isToday(day) ? "is-today" : ""}`}>
                {dayAppts.length === 0 ? (
                  <div className="hms-appt-cal__col-empty">
                    <p>No appointments</p>
                  </div>
                ) : (
                  <div className="hms-appt-cal__col-list">
                    {dayAppts.map((appt) => {
                      const tone = getColorForDoctor(appt.doctorId);
                      return (
                        <div key={appt.id} className={`hms-appt-cal-card ${tone}`}>
                          <div className="hms-appt-cal-card__head">
                            <p className="hms-appt-cal-card__name">{appt.patientName}</p>
                            <span className="hms-appt-cal-card__time">{appt.apptTime.substring(0, 5)}</span>
                          </div>
                          <p className="hms-appt-cal-card__type">{TYPE_LABEL[appt.type] ?? appt.type}</p>
                          <p className="hms-appt-cal-card__doctor">Dr. {appt.doctorName}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const rows = [];
    let days = [];
    let day = startDate;
    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dayAppts = filteredAppointments.filter((a) => isSameDay(parseISO(a.apptDate), cloneDay)).sort((a, b) => a.apptTime.localeCompare(b.apptTime));
        const cellMods = [];
        if (!isSameMonth(day, monthStart)) cellMods.push("is-other-month");
        if (isToday(day)) cellMods.push("is-today");
        days.push(
          <div
            key={day.toISOString()}
            className={`hms-appt-mon-cell ${cellMods.join(" ")}`}
          >
            <div className="hms-appt-mon-cell__head">
              {isToday(day)
                ? <span className="hms-appt-mon-cell__today-chip">{format(day, "d")}</span>
                : <span className={`hms-appt-mon-cell__day ${!isSameMonth(day, monthStart) ? "is-other" : ""}`}>{format(day, "d")}</span>}
            </div>
            <div className="hms-appt-mon-cell__list">
              {dayAppts.slice(0, 3).map((appt) => {
                const tone = getColorForDoctor(appt.doctorId);
                return (
                  <div key={appt.id} className={`hms-appt-mon-pill ${tone}`}>
                    <span className="hms-appt-mon-pill__time">{appt.apptTime.substring(0, 5)}</span>
                    <span className="hms-appt-mon-pill__name">{appt.patientName}</span>
                  </div>
                );
              })}
              {dayAppts.length > 3 && (
                <div className="hms-appt-mon-more">
                  + {dayAppts.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="hms-appt-cal__row" key={day.toISOString()}>{days}</div>);
      days = [];
    }
    return (
      <div className="hms-appt-cal">
        <div className="hms-appt-mon-dows">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="hms-appt-mon-dow">{d}</div>
          ))}
        </div>
        <div className="hms-appt-mon-body">{rows}</div>
      </div>
    );
  };
  return (
    <div className="zu-page">
      <PageHeader
        title={viewMode === "calendar" ? "Appointment Calendar" : "Appointments"}
        subtitle={viewMode === "calendar" ? "View and manage appointments in calendar view." : "Manage your clinic's appointments and schedules."}
        actions={
          <div className="hms-appt-page__actions">
            <button
              onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
              className="zu-btn-secondary"
            >
              <CalendarIcon className="w-4 h-4" />{viewMode === "list" ? "Calendar View" : "List View"}
            </button>
            <button
              onClick={() => navigate("/consultation-view")}
              className="zu-btn-secondary"
              title="Walk through today's queue patient-by-patient"
            >
              <Stethoscope className="w-4 h-4" />Consultation View
            </button>
            <button
              onClick={() => setIsBookingModalOpen(true)}
              className="zu-btn-primary"
            >
              <Plus className="w-4 h-4" />
              New Appointment
            </button>
          </div>
        }
      />
      <div className="zu-page-content">
      {viewMode === "list" && (
          <div className="zu-filter-bar">
            <div className="zu-filter-bar__controls">
              <div className="zu-pill-group">
              {["upcoming", "today", "all", "completed", "cancelled"].map((f) => (
                <button
                  key={f}
                  onClick={() => setListFilter(f)}
                  className={`zu-pill-group__btn ${listFilter === f ? "is-active" : ""}`}
                >
                  {f === "all" ? "All" : f}
                </button>
              ))}
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                onClick={handleRefreshTokens}
                disabled={isRefreshingTokens}
                title="Renumber today's tokens starting from 1, in booking order"
                className="hms-appt-refresh-tokens"
              >
                {isRefreshingTokens ? <Loader2 className="w-4 h-4 zu-spinner" /> : <RefreshCw className="w-4 h-4" />}
                <span>Reset Token #</span>
              </button>
            </div>
          </div>
        )}
      {/* Content Area */}
      <div className="hms-appt-body">
        {viewMode === "calendar" && (
          <div className="hms-appt-cal-bar">
            <div className="hms-appt-cal-bar__views">
              {["day", "week", "month"].map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={`hms-appt-cal-view-btn ${calendarView === v ? "is-active" : ""}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="hms-appt-cal-bar__right">
              <SearchableSelect
                value={selectedDoctorId}
                onChange={(value) => setSelectedDoctorId(value)}
                options={[{ value: "all", label: "All Doctors" }, ...doctors.map((d) => ({ value: d.id, label: `Dr. ${d.firstName} ${d.lastName}` }))]}
                className="hms-appt-list__doctor-select"
                clearable={false}
              />
              <div className="hms-appt-cal-bar__nav">
                <button onClick={goToday} className="zu-btn-secondary">Today</button>
                <div className="hms-appt-cal-bar__pager">
                  <button onClick={prevPeriod} className="hms-appt-cal-pager-btn"><ChevronLeft className="w-5 h-5" /></button>
                  <button onClick={nextPeriod} className="hms-appt-cal-pager-btn"><ChevronRight className="w-5 h-5" /></button>
                </div>
              </div>
              <h2 className="hms-appt-cal-bar__title">{renderHeaderTitle()}</h2>
            </div>
          </div>
        )}
        {isLoading && viewMode !== "list" ? (
          <div className="hms-appt-loading">
            <div className="hms-appt-loading__inner">
              <div className="hms-appt-loading__spinner" />
              <p className="hms-appt-loading__label">Loading appointments...</p>
            </div>
          </div>
        ) : viewMode === "list" ? renderListView()
        : calendarView === "month" ? renderMonthView()
        : calendarView === "week" ? renderWeekView()
        : (
          <div className="hms-appt-day">
            <div className="hms-appt-day__head">
              <h3 className="hms-appt-day__title">{format(currentDate, "EEEE, MMMM do, yyyy")}</h3>
            </div>
            <div className="hms-appt-day__body">
              {filteredAppointments.filter((a) => isSameDay(parseISO(a.apptDate), currentDate)).length === 0
                ? <div className="hms-appt-day__empty">No appointments for today.</div>
                : filteredAppointments.filter((a) => isSameDay(parseISO(a.apptDate), currentDate)).sort((a, b) => a.apptTime.localeCompare(b.apptTime)).map((appt) => {
                  const tone = getColorForDoctor(appt.doctorId);
                  return (
                    <div key={appt.id} className={`hms-appt-day-row ${tone}`}>
                      <div className="hms-appt-day-row__time">
                        <p className="hms-appt-day-row__time-h">{appt.apptTime.substring(0, 5)}</p>
                        <p className="hms-appt-day-row__time-ampm">{parseISO(`1970-01-01T${appt.apptTime}`).getHours() >= 12 ? "PM" : "AM"}</p>
                      </div>
                      <div className="hms-appt-day-row__sep" />
                      <div className="hms-appt-day-row__body">
                        <p className="hms-appt-day-row__name">{appt.patientName}</p>
                        <p className="hms-appt-day-row__meta">{TYPE_LABEL[appt.type] ?? appt.type} &middot; Dr. {appt.doctorName}</p>
                      </div>
                      <div className="hms-appt-day-row__actions">
                      {(() => {
                        const dispStatus = getDisplayStatus(appt);
                        return <div className={`hms-appt-day-row__status ${STATUS_MOD[dispStatus] || ""}`}>{dispStatus.replace("_", " ")}</div>;
                      })()}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
      <BookAppointmentModal
        isOpen={isBookingModalOpen}
        onClose={() => {
          setIsBookingModalOpen(false);
          setEditAppointment(null);
        }}
        editAppointment={editAppointment}
        onSuccess={() => {
          setIsBookingModalOpen(false);
          setEditAppointment(null);
          loadData();
        }}
      />
      {admitPrefill && <AdmitPatientModal prefill={admitPrefill} onClose={() => setAdmitPrefill(null)} onAdmitted={() => { setAdmitPrefill(null); }} />}
      {consultationAppointment && (
        <ConsultationModal
          appointment={consultationAppointment}
          onClose={() => {
            setConsultationAppointment(null);
            // Re-fetch so a freshly-autosaved draft surfaces as a badge
            // immediately when the doctor closes mid-edit.
            refreshDraftSet();
          }}
          onSaved={() => {
            setConsultationAppointment(null);
            loadData();
          }}
        />
      )}
      {vitalsAppointment && (
        <VitalsModal
          appointment={vitalsAppointment}
          onClose={() => setVitalsAppointment(null)}
          onSaved={() => {
            setVitalsAppointment(null);
            refreshVitalsSet();
          }}
        />
      )}
      {externalResultsAppointment && (
        <ExternalResultsModal
          appointment={externalResultsAppointment}
          onClose={() => setExternalResultsAppointment(null)}
          onSaved={() => setExternalResultsAppointment(null)}
        />
      )}
      </div>
    </div>
  );
}
export {
  AppointmentsDashboard as default
};

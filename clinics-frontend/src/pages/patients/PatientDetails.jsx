import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { patientApi, recordApi, appointmentsApi, radiologyApi, invoiceApi } from "@/utils/api";
import { useNotification } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import { calcAge, formatDate, formatDateTime } from "@/utils/validators";
import { fmtId } from "@/utils/idFormat";
import PatientModal from "@/components/modals/PatientModal";
import BookAppointmentModal from "@/components/modals/BookAppointmentModal";
import { ArrowLeft, User, FileText, Phone, Mail, MapPin, Droplets, Calendar, Clock, Edit2, ClipboardList, ChevronRight, Activity, AlertCircle, Stethoscope, MoreHorizontal, Bed, CalendarClock, ScanLine } from "lucide-react";

const TYPE_META = {
  PROGRESS_NOTE: { label: "Progress Note", dotMod: "is-progress-note", chipMod: "is-progress-note" },
  CONSULTATION: { label: "Consultation", dotMod: "is-consultation", chipMod: "is-consultation" },
  PRESCRIPTION: { label: "Prescription", dotMod: "is-prescription", chipMod: "is-prescription" },
  LAB_RESULT:   { label: "Lab Result", dotMod: "is-lab", chipMod: "is-lab" },
  SURGERY:      { label: "Surgery", dotMod: "is-surgery", chipMod: "is-surgery" },
  DIAGNOSIS:    { label: "Diagnosis", dotMod: "is-diagnosis", chipMod: "is-diagnosis" },
  OTHER:        { label: "Other", dotMod: "is-other", chipMod: "is-other" }
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

function SideInfoRow({ icon: Icon, label, value }) {
  return (
    <div className="hms-side-info">
      <div className="hms-side-info__icon">
        <Icon size={14} />
      </div>
      <div>
        <p className="hms-side-info__label">{label}</p>
        <p className="hms-side-info__value">{value || "—"}</p>
      </div>
    </div>
  );
}
function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="hms-side-section__head">
      <Icon size={14} className="text-gray-500" />
      <h3 className="hms-side-section__title">{title}</h3>
    </div>
  );
}
function RecordCard({ record }) {
  const meta = TYPE_META[record.historyType] ?? TYPE_META.OTHER;
  const isPrescription = record.historyType === "PRESCRIPTION";
  const items = Array.isArray(record.prescriptionItems) ? record.prescriptionItems : [];
  // A PRESCRIPTION row written before structured items existed has the whole
  // prescription in `description` and zero items. Pharmacy can't dispense from
  // these automatically — we flag them visually so staff know to treat the
  // description as text, not structured data.
  const isLegacyPrescription = isPrescription && items.length === 0;
  return (
    <div className="hms-pat-rec-card">
      <div className="hms-pat-rec-card__rail">
        <div className={`hms-pat-rec-card__dot ${meta.dotMod}`} />
        <div className="hms-pat-rec-card__line" />
      </div>
      <div className="hms-pat-rec-card__body">
        <div className="hms-pat-rec-card__inner">
          <div className="hms-pat-rec-card__head">
            <div className="hms-pat-rec-card__chips">
              <span className={`hms-pat-rec-type ${meta.chipMod}`}>{meta.label}</span>
              {record.mrn && <span className="hms-pat-rec-mrn">{fmtId(record.mrn)}</span>}
              {isLegacyPrescription && record.description && (
                <span className="hms-pat-rec-legacy" title="Written before structured prescriptions — pharmacy reads the text only, no auto-dispense">
                  Legacy text
                </span>
              )}
            </div>
            <span className="hms-pat-rec-card__time"><Clock className="w-3 h-3" />{formatDateTime(record.createdAt)}</span>
          </div>

          {/* Structured prescription drugs */}
          {isPrescription && items.length > 0 && (
            <div className="hms-pat-rec-rx-table">
              <table>
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Dose</th>
                    <th>Freq</th>
                    <th>Dur.</th>
                    <th className="is-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="hms-pat-rec-drug-name">{d.drugName}</div>
                        {(d.drugStrength || d.drugForm) && (
                          <div className="hms-pat-rec-drug-meta">
                            {[d.drugStrength, d.drugForm].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td>{d.dose || "—"}</td>
                      <td>{d.frequency || "—"}</td>
                      <td>{d.durationDays != null ? `${d.durationDays}d` : "—"}</td>
                      <td className="is-right tabular-nums font-semibold">{d.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {record.description && (
            <p className="hms-pat-rec-card__desc">
              {isPrescription && items.length > 0 && (
                <span className="hms-pat-rec-card__notes-label">Doctor's notes</span>
              )}
              {record.description}
            </p>
          )}
          <div className="hms-pat-rec-card__foot">
            <div className="hms-pat-rec-card__author">
              <Stethoscope className="w-3 h-3" />
              <span>{record.createdBy.firstName} {record.createdBy.lastName} · {record.createdBy.role}</span>
            </div>
            {record.nextVisitDate && (
              <div className="hms-pat-rec-card__next">
                <Calendar className="w-3 h-3" />
                <span>{formatDate(record.nextVisitDate)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function PatientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();
  const [patient, setPatient] = useState(null);
  const [records, setRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [allocatedRoom, setAllocatedRoom] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [radiologyOrders, setRadiologyOrders] = useState([]);
  const [radiologyLoading, setRadiologyLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const loadPatient = () => {
    if (!id || !user?.hospitalId) return;
    patientApi.get(Number(id), user.hospitalId).then(setPatient).catch(() => notify("Failed to load patient", "error")).finally(() => setLoading(false));
    api.get(`/rooms?hospitalId=${user.hospitalId}`).then(({ data }) => {
      const room = data.find((r) => r.currentPatient?.id === Number(id));
      setAllocatedRoom(room || null);
    }).catch(console.error);
  };
  const loadRecords = () => {
    if (!id || !user?.hospitalId) return;
    setRecordsLoading(true);
    recordApi.list(Number(id), user.hospitalId).then(setRecords).catch(console.error).finally(() => setRecordsLoading(false));
  };
  const loadAppointments = () => {
    if (!id) return;
    setAppointmentsLoading(true);
    appointmentsApi.getByPatient(Number(id)).then(setAppointments).catch(console.error).finally(() => setAppointmentsLoading(false));
  };
  const loadRadiology = () => {
    if (!id) return;
    setRadiologyLoading(true);
    radiologyApi.getByPatient(Number(id)).then(setRadiologyOrders).catch(console.error).finally(() => setRadiologyLoading(false));
  };
  const loadInvoices = () => {
    if (!id) return;
    setInvoicesLoading(true);
    invoiceApi.getByPatient(Number(id)).then(setInvoices).catch(console.error).finally(() => setInvoicesLoading(false));
  };
  useEffect(() => {
    loadPatient();
  }, [id, user?.hospitalId]);
  useEffect(() => {
    loadRecords();
  }, [id, user?.hospitalId]);
  useEffect(() => {
    loadAppointments();
  }, [id]);
  useEffect(() => {
    loadRadiology();
  }, [id]);
  useEffect(() => {
    loadInvoices();
  }, [id]);
  const handleUpdate = async (data) => {
    await patientApi.update(Number(id), { ...data, hospitalId: user.hospitalId });
    notify("Patient updated", "success");
    setEditing(false);
    loadPatient();
  };
  const nextVisit = useMemo(() => {
    const now = /* @__PURE__ */ new Date();
    const offset = now.getTimezoneOffset();
    const localNow = new Date(now.getTime() - offset * 60 * 1e3);
    const todayStr = localNow.toISOString().split("T")[0];
    const timeStr = localNow.toISOString().split("T")[1].substring(0, 5);
    const future = appointments.filter((a) => {
      if (!["SCHEDULED", "CONFIRMED"].includes(a.status)) return false;
      if (a.apptDate < todayStr) return false;
      if (a.apptDate === todayStr && a.apptTime < timeStr) return false;
      return true;
    }).sort((a, b) => {
      const dateCompare = a.apptDate.localeCompare(b.apptDate);
      if (dateCompare !== 0) return dateCompare;
      return a.apptTime.localeCompare(b.apptTime);
    });
    return future[0] ?? null;
  }, [appointments]);
  const prescriptions = records.filter((r) => r.historyType === "PRESCRIPTION");
  const labResults = records.filter((r) => r.historyType === "LAB_RESULT");
  const groupedRecords = useMemo(() => {
    const ipdMap = new Map();
    const general = [];
    records.forEach(r => {
      if (r.admissionNumber) {
        if (!ipdMap.has(r.admissionNumber)) ipdMap.set(r.admissionNumber, []);
        ipdMap.get(r.admissionNumber).push(r);
      } else {
        general.push(r);
      }
    });
    return { ipdGroups: [...ipdMap.entries()], general };
  }, [records]);
  const blood = patient?.bloodGroup ?? null;
  if (loading) return (
    <CenterLoader />
  );
  if (!patient) return (
    <div className="hms-pat-detail__notfound">
      <AlertCircle className="w-5 h-5 text-gray-300" />
      <p className="text-13 text-gray-500">Patient not found.</p>
      <button className="zu-btn-secondary is-sm" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );
  const age = patient.dob ? calcAge(patient.dob) : null;
  return (
    <div className="hms-detail-page">
      {/* ━━━━━━━━━━━━━━━  LEFT PANE — Patient Profile  ━━━━━━━━━━━━━━━ */}
      <aside className="hms-detail-page__aside">
        {/* Back & Actions */}
        <div className="hms-detail-aside__topbar">
          <button
            onClick={() => navigate(-1)}
            className="hms-detail-aside__back"
          >
            <ArrowLeft size={14} /> Back to Patients
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="zu-btn-icon"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="hms-pat-detail__menu">
                <div className="hms-pat-detail__menu-label">Actions</div>
                <button
                  onClick={() => {
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="hms-pat-detail__menu-item"
                >
                  <Edit2 className="w-4 h-4 hms-pat-detail__menu-item-icon" />
                  Edit Patient
                </button>
              </div>
            )}
            {menuOpen && <div className="hms-pat-kebab-menu__scrim" onClick={() => setMenuOpen(false)} />}
          </div>
        </div>
        {/* Avatar + Name block */}
        <div className="hms-detail-aside__hero">
          <span className="hms-avatar is-2xl is-info hms-detail-aside__hero-avatar">
            {patient.firstName[0]}{patient.lastName?.[0] ?? ""}
          </span>
          <h2 className="hms-detail-aside__name">{patient.firstName} {patient.lastName}</h2>
          <p className="hms-detail-aside__subtitle">{age !== null ? `${age} years` : "—"} · {patient.gender}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="hms-pat-detail__hero-chip is-active">Active</span>
            {blood && (
              <span className="hms-pat-detail__hero-chip is-blood">
                <Droplets className="inline w-3 h-3" />{blood}
              </span>
            )}
          </div>
          <p className="hms-detail-aside__reg mt-2">{fmtId(patient.uhid)}</p>
        </div>
        {/* Sections */}
        <div className="hms-detail-aside__sections">
          {/* Personal Information */}
          <div>
            <SectionHeader icon={User} title="Personal Information" />
            <div className="hms-side-section__list">
              <SideInfoRow icon={Calendar} label="Date of Birth" value={patient.dob ? formatDate(patient.dob) : null} />
              <SideInfoRow icon={Phone} label="Phone" value={patient.phone} />
              <SideInfoRow icon={Mail} label="Email" value={patient.email} />
              <SideInfoRow icon={MapPin} label="Address" value={patient.address} />
            </div>
          </div>
          {/* Room Allocation */}
          {allocatedRoom && (
            <div>
              <SectionHeader icon={Bed} title="Allocation" />
              <div className="hms-pat-room-card">
                <p className="hms-pat-room-card__label">Current Room</p>
                <div className="hms-pat-room-card__row">
                  <p className="hms-pat-room-card__num">{allocatedRoom.roomNumber}</p>
                  <span className="hms-pat-room-card__type-chip">{allocatedRoom.roomType}</span>
                </div>
                {allocatedRoom.approxDischargeTime && (
                  <p className="hms-pat-room-card__disch">
                    <CalendarClock className="w-3 h-3" />
                    Est. Discharge: {new Date(allocatedRoom.approxDischargeTime).toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata', month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Medical Information */}
          <div>
            <SectionHeader icon={Activity} title="Medical Information" />
            <div className="hms-side-section__list">
              <SideInfoRow icon={Droplets} label="Blood Type" value={patient.bloodGroup} />
              <SideInfoRow icon={FileText} label="Total Records" value={recordsLoading ? "…" : String(records.length)} />
              <SideInfoRow icon={Calendar} label="Registered" value={formatDate(patient.createdAt)} />
            </div>
          </div>
        </div>
      </aside>

      {/* ━━━━━━━━━━━━━━━  RIGHT PANE — Details  ━━━━━━━━━━━━━━━ */}
      <div className="hms-detail-page__main">
        {/* Tab bar */}
        <div className="hms-pat-detail__tabs">
          {["overview", "appointments", "records", "radiology", "billing"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`hms-pat-detail__tab ${tab === t ? "is-active" : ""}`}
            >
              {t === "records" ? `Records ${!recordsLoading ? `(${records.length})` : ""}`
                : t === "appointments" ? `Appointments ${!appointmentsLoading ? `(${appointments.length})` : ""}`
                : t === "radiology" ? `Radiology ${!radiologyLoading ? `(${radiologyOrders.length})` : ""}`
                : t === "billing" ? `Billing ${!invoicesLoading ? `(${invoices.length})` : ""}`
                : "Overview"}
            </button>
          ))}
        </div>
        {/* Tab content */}
        <div className="hms-pat-detail__content">
          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="hms-pat-detail__wrap">
              {/* Summary cards row */}
              <div className="hms-pat-summary-grid">
                {/* Next Appointment */}
                <div className="hms-pat-summary-card">
                  <div className="hms-pat-summary-card__head">
                    <Calendar className="w-3 h-3" /> Next Appointment
                  </div>
                  {nextVisit ? (
                    <>
                      <p className="hms-pat-summary-card__value">{formatDate(nextVisit.apptDate)}, {nextVisit.apptTime.substring(0, 5)}</p>
                      <p className="hms-pat-summary-card__sub">{nextVisit.type.replace("_", " ")}</p>
                      <p className="hms-pat-summary-card__mute">
                        Dr. {nextVisit.doctorName}
                      </p>
                    </>
                  ) : (
                    <p className="hms-pat-summary-card__mute">No upcoming visit</p>
                  )}
                </div>
                {/* Active Prescriptions */}
                <div className="hms-pat-summary-card">
                  <div className="hms-pat-summary-card__head">
                    <FileText className="w-3 h-3" /> Prescriptions
                  </div>
                  <p className="hms-pat-summary-card__value">{recordsLoading ? "…" : prescriptions.length} Records</p>
                  {prescriptions.length > 0 && (
                    <>
                      <p className="hms-pat-summary-card__sub">
                        Last: {formatDate(prescriptions[0].createdAt)}
                      </p>
                      <button
                        onClick={() => setTab("records")}
                        className="hms-pat-summary-card__link"
                      >
                        View all <ChevronRight className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {prescriptions.length === 0 && <p className="hms-pat-summary-card__mute">None recorded</p>}
                </div>
                {/* Recent Lab Result */}
                <div className="hms-pat-summary-card">
                  <div className="hms-pat-summary-card__head">
                    <Activity className="w-3 h-3" /> Recent Lab Result
                  </div>
                  {labResults[0] ? (
                    <>
                      <p className="hms-pat-summary-card__value">{labResults[0].historyType.replace("_", " ")}</p>
                      <p className="hms-pat-summary-card__sub">{formatDate(labResults[0].createdAt)}</p>
                      <button
                        onClick={() => setTab("records")}
                        className="hms-pat-summary-card__link"
                      >
                        View results <ChevronRight className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <p className="hms-pat-summary-card__mute">No lab results</p>
                  )}
                </div>
              </div>
              {/* Recent Records */}
              <div className="hms-pat-section-card">
                <div className="hms-pat-section-card__head">
                  <h3>Recent Records</h3>
                  <button
                    onClick={() => setTab("records")}
                    className="hms-pat-section-card__link"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                {recordsLoading ? (
                  <CenterLoader />
                ) : records.length === 0 ? (
                  <div className="hms-pat-section-card__empty">
                    <ClipboardList className="hms-pat-section-card__empty-icon" />
                    <p className="hms-pat-section-card__empty-text">No records yet</p>
                  </div>
                ) : (
                  <div className="hms-pat-section-card__body">
                    {records.slice(0, 4).map((r) => {
                      const meta = TYPE_META[r.historyType] ?? TYPE_META.OTHER;
                      return (
                        <div key={r.id} className="hms-pat-rec-card">
                          <div className="hms-pat-rec-card__rail">
                            <div className={`hms-pat-rec-card__dot ${meta.dotMod}`} />
                            <div className="hms-pat-rec-card__line" />
                          </div>
                          <div className="hms-pat-rec-card__body">
                            <div className="hms-pat-rec-card__inner">
                              <div className="hms-pat-rec-card__head">
                                <span className={`hms-pat-rec-type ${meta.chipMod}`}>{meta.label}</span>
                                <p className="hms-pat-rec-card__time"><Clock className="w-3 h-3" />{formatDateTime(r.createdAt)}</p>
                              </div>
                              {r.description && <p className="hms-pat-rec-card__desc truncate">{r.description}</p>}
                              <div className="hms-pat-rec-card__author">
                                <Stethoscope className="w-3 h-3" />
                                <span>{r.createdBy.firstName} {r.createdBy.lastName}</span>
                              </div>
                              {r.nextVisitDate && (
                                <div className="hms-pat-rec-card__next">
                                  <Calendar className="w-3 h-3" />
                                  Next visit: {formatDate(r.nextVisitDate)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* ── RECORDS TAB ── */}
          {tab === "records" && (
            <div className="hms-pat-detail__wrap is-md">
              {/* Header + Add button */}
              <div className="hms-pat-tab-head">
                <div>
                  <h3 className="hms-pat-tab-head__title">Medical Records</h3>
                  <p className="hms-pat-tab-head__sub">{records.length} record{records.length !== 1 ? "s" : ""} for {patient.firstName}</p>
                </div>
              </div>
              {/* Records listing only — record creation lives in the Consultation
                 View / consultation modal flow now; this page is read-only. */}
              {/* Timeline */}
              {recordsLoading ? (
                <CenterLoader />
              ) : records.length === 0 ? (
                <div className="hms-pat-tab-empty">
                  <ClipboardList className="hms-pat-tab-empty__icon" />
                  <p className="hms-pat-tab-empty__title">No records yet</p>
                  <p className="hms-pat-tab-empty__sub">Add the first medical record above.</p>
                </div>
              ) : (
                <div className="hms-pat-rec-groups">
                  {groupedRecords.ipdGroups.map(([admNum, recs]) => (
                    <div key={admNum} className="hms-pat-rec-group">
                      <div className="hms-pat-rec-group__head">
                        <span className="hms-pat-rec-group__ipd-tag">{admNum}</span>
                        <div className="hms-pat-rec-group__rule" />
                        <span className="hms-pat-rec-group__count">{recs.length} record{recs.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div>{recs.map(r => <RecordCard key={r.id} record={r} />)}</div>
                    </div>
                  ))}
                  {groupedRecords.general.length > 0 && (
                    <div>
                      {groupedRecords.ipdGroups.length > 0 && (
                        <div className="hms-pat-rec-group__head">
                          <span className="hms-pat-rec-group__general-tag">General</span>
                          <div className="hms-pat-rec-group__rule" />
                        </div>
                      )}
                      <div>{groupedRecords.general.map(r => <RecordCard key={r.id} record={r} />)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* ── APPOINTMENTS TAB ── */}
          {tab === "appointments" && (
            <div className="hms-pat-detail__wrap is-md">
              <div className="hms-pat-tab-head">
                <div>
                  <h3 className="hms-pat-tab-head__title">Appointments</h3>
                  <p className="hms-pat-tab-head__sub">{appointments.length} appointment{appointments.length !== 1 ? "s" : ""} for {patient.firstName}</p>
                </div>
                <button
                  onClick={() => setBookModalOpen(true)}
                  className="hms-pat-bill-new-btn"
                >
                  + Book Appointment
                </button>
              </div>
              {appointmentsLoading ? (
                <CenterLoader />
              ) : appointments.length === 0 ? (
                <div className="hms-pat-tab-empty">
                  <Calendar className="hms-pat-tab-empty__icon" />
                  <p className="hms-pat-tab-empty__title">No appointments yet</p>
                  <button onClick={() => setBookModalOpen(true)} className="hms-pat-bill-empty__link">
                    Book first appointment
                  </button>
                </div>
              ) : (
                <div className="hms-pat-appt-grid">
                  {appointments.map((appt) => {
                    const dispStatus = getDisplayStatus(appt);
                    const stripeMod = ["COMPLETED"].includes(dispStatus) ? "is-success"
                      : ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(dispStatus) ? "is-danger"
                      : ["IN_PROGRESS"].includes(dispStatus) ? "is-warning"
                      : "is-primary";
                    const statusMod = ["COMPLETED"].includes(dispStatus) ? "is-success"
                      : ["CANCELLED", "NO_SHOW", "EXPIRED"].includes(dispStatus) ? "is-danger"
                      : ["IN_PROGRESS"].includes(dispStatus) ? "is-warning"
                      : "is-primary";
                    return (
                      <div key={appt.id} className="hms-pat-appt-card">
                        {/* Status indicator line */}
                        <div className={`hms-pat-appt-card__stripe ${stripeMod}`} />
                        <div className="hms-pat-appt-card__head">
                          <div>
                            <p className="hms-pat-appt-card__date">{formatDate(appt.apptDate)}</p>
                            <p className="hms-pat-appt-card__time">
                              <Clock className="w-3 h-3" />{appt.apptTime.substring(0, 5)} - {appt.apptEndTime ? appt.apptEndTime.substring(0, 5) : "Unknown"}
                            </p>
                          </div>
                          <span className={`hms-pat-appt-status ${statusMod}`}>{dispStatus.replace(/_/g, " ")}</span>
                        </div>
                        <div className="hms-pat-appt-card__body">
                          <div className="hms-pat-appt-doctor">
                            <div className="hms-pat-appt-doctor__avatar">
                              <Stethoscope className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="hms-pat-appt-doctor__name">
                                Dr. {appt.doctorName}
                              </p>
                              {appt.doctorSpecialization && <p className="hms-pat-appt-doctor__spec">{appt.doctorSpecialization}</p>}
                            </div>
                          </div>
                          <div className="hms-pat-appt-kv">
                            <div>
                              <p className="hms-pat-appt-kv__label">Type</p>
                              <p className="hms-pat-appt-kv__value">{appt.type}</p>
                            </div>
                            {appt.tokenNumber && (
                              <div>
                                <p className="hms-pat-appt-kv__label">Token No</p>
                                <p className="hms-pat-appt-kv__value">
                                  #{appt.tokenNumber}
                                </p>
                              </div>
                            )}
                          </div>
                          {appt.chiefComplaint && (
                            <div className="hms-pat-appt-reason">
                              <p className="hms-pat-appt-reason__label">
                                <FileText className="w-3 h-3" /> Reason for visit
                              </p>
                              <p className="hms-pat-appt-reason__quote">
                                "{appt.chiefComplaint}"
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* ── RADIOLOGY TAB ── */}
          {tab === "radiology" && (
            <div className="hms-pat-detail__wrap is-md">
              <div className="hms-pat-tab-head">
                <div>
                  <h3 className="hms-pat-tab-head__title">Radiology History</h3>
                  <p className="hms-pat-tab-head__sub">
                    All imaging investigations for {patient.firstName}
                  </p>
                </div>
              </div>
              {radiologyLoading ? (
                <CenterLoader />
              ) : radiologyOrders.length === 0 ? (
                <div className="hms-pat-tab-empty">
                  <ScanLine className="hms-pat-tab-empty__icon" />
                  <p className="hms-pat-tab-empty__title">No radiology orders</p>
                  <p className="hms-pat-tab-empty__sub">Orders created from the Radiology Queue will appear here.</p>
                </div>
              ) : (
                <div className="hms-pat-rad-list">
                  {radiologyOrders.map((order) => {
                    const statusMod = order.status === "REPORT_GENERATED" ? "is-ready"
                      : order.status === "AWAITING_REPORT" ? "is-awaiting"
                      : "is-pending";
                    const statusLabel = order.status === "REPORT_GENERATED" ? "Report Ready"
                      : order.status === "AWAITING_REPORT" ? "Awaiting Report"
                      : "Pending Scan";
                    return (
                      <div key={order.id} className="hms-pat-rad-row">
                        <div className="hms-pat-rad-row__body">
                          <div className="hms-pat-rad-row__icon">
                            <ScanLine className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="hms-pat-rad-row__name">{order.serviceName}</p>
                            <div className="hms-pat-rad-row__meta">
                              {order.referredByName && <p>by {order.referredByName}</p>}
                              <p className="hms-pat-rad-row__sep">·</p>
                              <p>{new Date(order.createdAt).toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata', day: "2-digit", month: "short", year: "numeric" })}</p>
                            </div>
                          </div>
                        </div>
                        <div className="hms-pat-rad-row__actions">
                          <span className={`hms-pat-rad-status ${statusMod}`}>{statusLabel}</span>
                          {order.status === "REPORT_GENERATED" && order.id && (
                            <button
                              onClick={() => navigate(`/radiology/reports/${order.id}`)}
                              className="hms-pat-rad-view-btn"
                            >
                              View Report
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* ── Billing tab ── */}
          {tab === "billing" && (
            <div className="hms-pat-detail__wrap is-md">
              <div className="hms-pat-tab-head">
                <p className="hms-pat-tab-head__title">Invoice History</p>
                <button
                  onClick={() => navigate(`/billing/opd?patientId=${id}`)}
                  className="hms-pat-bill-new-btn"
                >
                  + New Invoice
                </button>
              </div>
              {invoicesLoading ? (
                <CenterLoader />
              ) : invoices.length === 0 ? (
                <div className="hms-pat-bill-empty">
                  <p className="hms-pat-bill-empty__text">No invoices yet</p>
                  <button onClick={() => navigate(`/billing/opd?patientId=${id}`)} className="hms-pat-bill-empty__link">
                    Create first invoice
                  </button>
                </div>
              ) : (
                <div className="hms-pat-bill-list">
                  {invoices.map((inv) => {
                    const statusMod = (inv.status === "PAID" || inv.status === "SETTLED") ? "is-paid"
                      : inv.status === "CANCELLED" ? "is-cancelled"
                      : "is-pending";
                    return (
                      <div key={inv.id} className="hms-pat-bill-row">
                        <div>
                          <p className="hms-pat-bill-row__no">#{fmtId(inv.invoiceNumber)}</p>
                          <p className="hms-pat-bill-row__meta">
                            {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString("en-IN", { timeZone: 'Asia/Kolkata' }) : ""}
                            {inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}
                            {" · "}
                            {inv.items?.length ?? 0} item{(inv.items?.length ?? 0) !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="hms-pat-bill-row__actions">
                          <span className={`hms-pat-bill-status ${statusMod}`}>{inv.status}</span>
                          <span className="hms-pat-bill-amt">₹{inv.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Edit modal */}
      {editing && (
        <PatientModal
          patient={patient}
          onClose={() => setEditing(false)}
          onSave={handleUpdate}
        />
      )}
      <BookAppointmentModal
        isOpen={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        onSuccess={() => {
          setBookModalOpen(false);
          loadAppointments();
          loadPatient();
        }}
        prefilledPatient={patient}
      />
    </div>
  );
}
export {
  PatientDetails as default
};

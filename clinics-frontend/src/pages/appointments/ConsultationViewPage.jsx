import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import {
  appointmentsApi, doctorsApi, recordApi, investigationsApi, externalResultsApi, zemaRulesApi,
  LABS_FRONTEND_URL,
} from "@/utils/api";
import { useInvestigationCatalog } from "@/hooks/useInvestigationCatalog";
import RequestInvestigationForm from "@/components/investigations/RequestInvestigationForm";
import InternalInvestigationsSection from "@/components/investigations/InternalInvestigationsSection";
import { useConsultationDraft } from "@/hooks/useConsultationDraft";
import { fmtId } from "@/utils/idFormat";
import { PrescriptionDrugRow } from "@/components/prescription/PrescriptionDrugRow";
import PastRecordDetailModal from "@/components/modals/PastRecordDetailModal";
import VitalsModal from "@/components/modals/VitalsModal";
import { calculateZemaVitals } from "@/utils/zemaCalculationEngine";
import zemaAiLogo from "@/assets/Zema-AI.svg";
import { Stethoscope, Pill, FlaskConical, ChevronLeft, ChevronRight, LogOut, CalendarClock, CheckCircle2, Save, AlertCircle, ClipboardList, FileText, ListChecks, Plus, IdCard, Droplet, HeartPulse, Scale, Wind, Activity, FileBarChart, Clock, User as UserIcon, PlayCircle, Ruler, ChevronUp, ChevronDown, Utensils } from "lucide-react";

/**
 * Full-page, queue-walked consultation workspace. Replaces the modal
 * flow for doctors who want to plow through their entire day in one
 * focused surface: today's appointments are pre-loaded as an ordered
 * queue, the left rail shows patient + vitals + history at a glance,
 * the centre tabs cover Consultation / Prescription / Lab Test, and
 * the bottom bar has Previous / Next / Save & Next / Exit so a doctor
 * can finish a patient and advance with one click.
 *
 * Form state lives in useConsultationDraft — same hook the modal uses —
 * so draft autosave, vitals fetch, and the final save handler are
 * identical across both surfaces. Switching patients via Next/Previous
 * resets state cleanly per appointment.id; nothing leaks between
 * patients.
 */
export default function ConsultationViewPage() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("consult");

  const [pastRecords, setPastRecords] = useState([]);
  const [labOrders, setLabOrders] = useState([]);
  const [externalResults, setExternalResults] = useState([]);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [loadingLabs, setLoadingLabs] = useState(false);
  // Orderable investigation catalogue (labs lab_services for gated tenants,
  // legacy hospital_services otherwise) — shared hook, threaded down to the
  // shared RequestInvestigationForm.
  const investigationCatalog = useInvestigationCatalog(user?.hospitalId);
  const [openedPastRecord, setOpenedPastRecord] = useState(null);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [zemaRules, setZemaRules] = useState([]);
  const [zemaAnalysisState, setZemaAnalysisState] = useState("idle"); // "idle" | "loading" | "completed"

  useEffect(() => {
    if (user?.hospitalId) {
      zemaRulesApi.list(user.hospitalId)
        .then(setZemaRules)
        .catch((err) => console.error("Failed to load Zema rules", err));
    }
  }, [user?.hospitalId]);

  // ── Queue load ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!user?.hospitalId) return;
    (async () => {
      setLoadingQueue(true);
      try {
        let doctorId = null;
        let doctorLookupFailed = false;
        if (user.role === "doctor") {
          try {
            const d = await doctorsApi.getByUserId(user.userId);
            doctorId = d?.id || null;
          } catch {
            try {
              const docs = await doctorsApi.list(user.hospitalId);
              const me = (docs || []).find(x => x.userId === user.userId);
              doctorId = me?.id || null;
            } catch { /* fall through */ }
          }
          if (!doctorId) doctorLookupFailed = true;
        }
        if (doctorLookupFailed) {
          if (!cancelled) {
            notify("Could not resolve your doctor profile — contact admin", "error");
            setQueue([]);
            setLoadingQueue(false);
          }
          return;
        }

        const params = { page: 0, size: 200, dateFilter: "TODAY", search: "" };
        if (doctorId) params.doctorId = doctorId;
        const res = await appointmentsApi.listPaginated(user.hospitalId, params);
        const items = res?.content || [];

        const SKIP = new Set(["COMPLETED", "BILLED", "CANCELLED", "NO_SHOW"]);
        const actionable = items
          .filter(a => !SKIP.has(a.status))
          .sort((a, b) => {
            const ta = a.tokenNumber ?? Number.MAX_SAFE_INTEGER;
            const tb = b.tokenNumber ?? Number.MAX_SAFE_INTEGER;
            if (ta !== tb) return ta - tb;
            return (a.apptTime || "").localeCompare(b.apptTime || "");
          });

        if (cancelled) return;
        setQueue(actionable);

        const deepLinkId = searchParams.get("appointmentId");
        let startIdx = 0;
        if (deepLinkId) {
          const found = actionable.findIndex(a => String(a.id) === String(deepLinkId));
          if (found >= 0) startIdx = found;
        }
        setIndex(startIdx);
      } catch {
        if (!cancelled) {
          notify("Could not load today's queue", "error");
          setQueue([]);
        }
      } finally {
        if (!cancelled) setLoadingQueue(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.hospitalId, user?.role, user?.userId]);

  const current = queue[index] || null;

  useEffect(() => {
    if (!current?.id) return;
    const sp = new URLSearchParams(searchParams);
    sp.set("appointmentId", String(current.id));
    setSearchParams(sp, { replace: true });
    // Close any past-record modal left over from the previous patient
    // so the doctor never sees an unrelated chart's row hanging around.
    setOpenedPastRecord(null);
    setZemaAnalysisState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!current?.patientId || !user?.hospitalId) {
      setPastRecords([]);
      return () => { cancelled = true; };
    }
    setLoadingPast(true);
    recordApi.list(current.patientId, user.hospitalId)
      .then(rows => { if (!cancelled) setPastRecords(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setPastRecords([]); })
      .finally(() => { if (!cancelled) setLoadingPast(false); });
    return () => { cancelled = true; };
  }, [current?.patientId, user?.hospitalId]);

  // Unified lab + radiology read (kind-tagged) from the labs service.
  // Wrapped in a useCallback so the "Request Investigation" submit handler
  // can re-run it via onCreated, surfacing the new order immediately in
  // the Internal Labs / Internal Radiology sections below.
  const refetchLabOrders = useCallback(() => {
    if (!current?.patientId) { setLabOrders([]); return; }
    setLoadingLabs(true);
    investigationsApi.byPatient(current.patientId)
      .then(rows => setLabOrders(Array.isArray(rows) ? rows : []))
      .catch(() => setLabOrders([]))
      .finally(() => setLoadingLabs(false));
  }, [current?.patientId]);

  useEffect(() => { refetchLabOrders(); }, [refetchLabOrders]);

  // Outside-clinic results captured at triage by front-desk / nursing
  // staff, plus anything the doctor has typed in during the consultation.
  // Scoped to this appointment so prior-visit reports don't clutter the
  // tab — the Patient Details rollup is the place for full history.
  useEffect(() => {
    let cancelled = false;
    if (!current?.id || !user?.hospitalId) {
      setExternalResults([]);
      return () => { cancelled = true; };
    }
    setLoadingExternal(true);
    externalResultsApi.listForAppointment(current.id, user.hospitalId)
      .then(rows => {
        if (cancelled) return;
        setExternalResults(Array.isArray(rows) ? rows : []);
      })
      .catch(() => { if (!cancelled) setExternalResults([]); })
      .finally(() => { if (!cancelled) setLoadingExternal(false); });
    return () => { cancelled = true; };
  }, [current?.id, user?.hospitalId]);

  const onSaved = useCallback(() => {
    setQueue(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (index >= next.length && next.length > 0) {
        setIndex(next.length - 1);
      }
      return next;
    });
  }, [index]);

  const draft = useConsultationDraft({
    appointment: current,
    hospitalId: user?.hospitalId,
    notify,
    onSaved,
  });

  const goPrev = useCallback(() => {
    setTab("consult");
    setIndex(i => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setTab("consult");
    setIndex(i => Math.min(queue.length - 1, i + 1));
  }, [queue.length]);

  // Transition the current patient to IN_PROGRESS in-place. Optimistic
  // update lets the hero card flip status immediately; on backend
  // rejection we restore the previous status and surface the message.
  const handleStartConsultation = useCallback(async () => {
    if (!current?.id) return;
    const prevStatus = current.status;
    const id = current.id;
    setQueue(prev => prev.map((a, i) => i === index ? { ...a, status: "IN_PROGRESS" } : a));
    try {
      await appointmentsApi.updateStatus(id, "IN_PROGRESS");
      notify("Consultation started", "success");
    } catch (err) {
      setQueue(prev => prev.map((a) => a.id === id ? { ...a, status: prevStatus } : a));
      notify(err?.response?.data?.message || "Failed to start consultation", "error");
    }
  }, [current?.id, current?.status, index, notify]);

  // Mark Complete = save the consultation record + finalise the
  // appointment in one click. onSaved (from the hook) removes the
  // patient from the queue; here we additionally fire the status
  // transition so the dashboard reflects COMPLETED and the print
  // action becomes visible. The status update is best-effort —
  // the consultation record is the source of truth, so a network
  // hiccup on the status PUT only delays the dashboard refresh,
  // never the saved record itself.
  const handleMarkComplete = useCallback(async () => {
    if (!current?.id) return;
    const apptId = current.id;
    const created = await draft.saveConsultation();
    if (!created) return;
    setTab("consult");
    try {
      await appointmentsApi.updateStatus(apptId, "COMPLETED");
    } catch (err) {
      notify(
        err?.response?.data?.message
        || "Consultation saved, but the appointment status didn't update — dashboard will refresh on next load",
        "warning",
      );
    }
  }, [draft, current?.id, notify]);

  const handleExit = useCallback(() => navigate("/appointments"), [navigate]);

  // ── Render gates ─────────────────────────────────────────────────────
  if (loadingQueue) {
    return (
      <CenterLoader text="Loading today's queue…" />
    );
  }
  if (queue.length === 0) {
    return (
      <div className="hms-cv-empty">
        <div className="hms-cv-empty__icon">
          <CalendarClock className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <h2 className="hms-cv-empty__title">No active appointments today</h2>
          <p className="hms-cv-empty__desc">
            {user?.role === "doctor"
              ? "There are no checked-in or in-progress patients in your queue right now."
              : "There are no checked-in or in-progress patients in the hospital queue right now."}
          </p>
        </div>
        <button onClick={handleExit} className="zu-btn-secondary mt-2">
          <LogOut className="w-4 h-4" /> Back to Appointments
        </button>
      </div>
    );
  }

  const getAgeYears = (dob) => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let ageVal = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) ageVal -= 1;
    return ageVal;
  };

  const ageYears = getAgeYears(current?.patientDob);
  const zemaResult = calculateZemaVitals({
    age: ageYears,
    sex: current?.patientGender,
    sbp: draft.vitals?.bpSystolic,
    dbp: draft.vitals?.bpDiastolic,
    weight: draft.vitals?.weightKg,
    height: draft.vitals?.heightCm,
    temperature: draft.vitals?.temperature,
    bloodGlucose: draft.vitals?.bloodGlucose,
    spo2: draft.vitals?.spo2,
    pulse: draft.vitals?.heartRate,
  }, zemaRules);

  return (
    <div className="hms-cv">
      <LeftPanel
        appointment={current}
        vitals={draft.vitals}
        vitalsStatus={draft.vitalsStatus}
        pastRecords={pastRecords}
        loadingPast={loadingPast}
        onStartConsultation={handleStartConsultation}
        onOpenPastRecord={setOpenedPastRecord}
        onEditVitals={() => setShowVitalsModal(true)}
        zemaRules={zemaRules}
      />

      <section className="hms-cv-main">
        <TopActionBar
          autosaveStatus={draft.autosaveStatus}
          hydrating={draft.hydrating}
          saving={draft.saving}
          onMarkComplete={handleMarkComplete}
        />
        <TabBar tab={tab} setTab={setTab} drugCount={draft.drugCount} labCount={labOrders.length + externalResults.length} />

        <div className="hms-cv-tab-body">
          {tab === "consult" && (
            <ConsultTab
              draft={draft}
              zemaResult={zemaResult}
              zemaAnalysisState={zemaAnalysisState}
              setZemaAnalysisState={setZemaAnalysisState}
            />
          )}
          {tab === "rx" && <RxTab draft={draft} />}
          {tab === "lab" && (
            <LabTab
              orders={labOrders.filter(o => {
                if (!o.createdAt || !current?.apptDate) return false;
                const d = new Date(o.createdAt);
                const orderYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return orderYmd === current.apptDate;
              })}
              loading={loadingLabs}
              externalResults={externalResults}
              loadingExternal={loadingExternal}
              hospitalId={user?.hospitalId}
              patientId={current?.patientId}
              catalog={investigationCatalog}
              onCreated={refetchLabOrders}
            />
          )}
        </div>

        <BottomBar
          index={index}
          total={queue.length}
          saving={draft.saving}
          onPrev={goPrev}
          onNext={goNext}
          onExit={handleExit}
        />
      </section>

      {openedPastRecord && (
        <PastRecordDetailModal
          record={openedPastRecord}
          onClose={() => setOpenedPastRecord(null)}
        />
      )}

      {showVitalsModal && (
        <VitalsModal
          appointment={current}
          onClose={() => setShowVitalsModal(false)}
          onSaved={(savedVitals) => {
            draft.setVitals(savedVitals);
            setShowVitalsModal(false);
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// LEFT RAIL — patient identity, vitals, past records
// ────────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────
function LeftPanel({ appointment, vitals, vitalsStatus, pastRecords, loadingPast, onStartConsultation, onOpenPastRecord, onEditVitals, zemaRules }) {
  const fullName = appointment?.patientName || "—";
  const uhid = fmtId(appointment?.patientUhid) || appointment?.patientUhid || "—";
  const age = computeAge(appointment?.patientDob);
  const sex = appointment?.patientGender || "—";
  const placeholder = vitalsStatus === "loading" ? "…" : "—";
  const bp = vitals && (vitals.bpSystolic != null || vitals.bpDiastolic != null)
    ? `${vitals.bpSystolic ?? "—"}/${vitals.bpDiastolic ?? "—"}`
    : placeholder;
  const spo2 = vitals?.spo2 != null ? `${vitals.spo2}` : placeholder;
  const hr = vitals?.heartRate != null ? `${vitals.heartRate}` : placeholder;
  const wt = vitals?.weightKg != null ? `${Number(vitals.weightKg).toFixed(1)}` : placeholder;
  const ht = vitals?.heightCm != null ? `${vitals.heightCm}` : placeholder;
  const bg = vitals?.bloodGlucose != null ? `${vitals.bloodGlucose}` : placeholder;

  // Compute Zema AI metrics
  const getAgeYears = (dob) => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let ageVal = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) ageVal -= 1;
    return ageVal;
  };

  const ageYears = getAgeYears(appointment?.patientDob);
  const zemaResult = calculateZemaVitals({
    age: ageYears,
    sex: appointment?.patientGender,
    sbp: vitals?.bpSystolic,
    dbp: vitals?.bpDiastolic,
    weight: vitals?.weightKg,
    height: vitals?.heightCm,
    temperature: vitals?.temperature,
    bloodGlucose: vitals?.bloodGlucose,
    spo2: vitals?.spo2,
    pulse: vitals?.heartRate,
  }, zemaRules);

  return (
    <aside className="hms-cv-aside">
      <div className="hms-cv-aside__inner">

        {/* Patient profile card */}
        <PatientHeroCard
          name={fullName}
          token={appointment?.tokenNumber}
          status={appointment?.status}
          time={appointment?.apptTime}
          onStartConsultation={onStartConsultation}
        />

        {/* Patient details */}
        <SidebarSection title="Patient Details">
          <div>
            <SidebarRow icon={<UserIcon className="w-4 h-4" />} label="Name" value={fullName} />
            <SidebarRow icon={<IdCard className="w-4 h-4" />} label="UHID" value={uhid} mono />
            <SidebarRow icon={<Clock className="w-4 h-4" />} label="Age" value={age || "—"} />
            <SidebarRow icon={<UserIcon className="w-4 h-4" />} label="Sex" value={sex} />
          </div>
        </SidebarSection>

        {/* Medical information — blood group + a 2x2 grid of vital cards */}
        <SidebarSection
          title="Medical Information"
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <VitalsStateHint status={vitalsStatus} vitals={vitals}
                                          recordedByName={vitals?.recordedByName}
                                          recordedAt={vitals?.updatedAt || vitals?.recordedAt} />
              <button
                type="button"
                onClick={onEditVitals}
                className="zu-btn-secondary is-sm"
                style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
                title="Record or edit vitals"
              >
                {vitals ? "Edit" : "Record"}
              </button>
            </div>
          }
        >
          <div className="hms-cv-blood">
            <div className="hms-cv-blood__left">
              <div className="hms-cv-blood__icon">
                <Droplet className="w-4 h-4" />
              </div>
              <span className="hms-cv-blood__label">
                Blood Group
              </span>
            </div>
            <span className="hms-cv-blood__value">
              {appointment?.patientBloodGroup || "—"}
            </span>
          </div>

          <div className="hms-cv-vital-grid">
            <VitalTile
              icon={<HeartPulse className="w-4 h-4" />}
              label="BP"
              value={bp}
              unit="mmHg"
              tone="rose"
            />
            <VitalTile
              icon={<Wind className="w-4 h-4" />}
              label="SpO₂"
              value={spo2}
              unit="%"
              tone="blue"
            />
            <VitalTile
              icon={<HeartPulse className="w-4 h-4" />}
              label="Pulse"
              value={hr}
              unit="bpm"
              tone="emerald"
            />
            <VitalTile
              icon={<Scale className="w-4 h-4" />}
              label="Weight"
              value={wt}
              unit="kg"
              tone="amber"
            />
            <VitalTile
              icon={<Ruler className="w-4 h-4" />}
              label="Height"
              value={ht}
              unit="cm"
              tone="blue"
            />
            <VitalTile
              icon={<Activity className="w-4 h-4" />}
              label="Glucose"
              value={bg}
              unit="mg/dL"
              tone="rose"
            />
          </div>
        </SidebarSection>


        {/* Previous records */}
        <SidebarSection title="Previous Records">
          {loadingPast ? (
            <CenterLoader text="Loading…" />
          ) : pastRecords.length === 0 ? (
            <p className="hms-cv-past-empty">No prior records for this patient.</p>
          ) : (
            <div className="hms-cv-past-list">
              {pastRecords.slice(0, 5).map(rec => (
                <PastRecordCard key={rec.id} record={rec} onOpen={() => onOpenPastRecord?.(rec)} />
              ))}
              {pastRecords.length > 5 && (
                <p className="hms-cv-past-more">
                  {pastRecords.length - 5} older · view full chart on Patients page
                </p>
              )}
            </div>
          )}
        </SidebarSection>
      </div>
    </aside>
  );
}

const STATUS_TONE_MOD = {
  SCHEDULED:   "is-scheduled",
  CONFIRMED:   "is-confirmed",
  CHECKED_IN:  "is-checked-in",
  IN_PROGRESS: "is-in-progress",
  DEFAULT:     "is-default",
};

function PatientHeroCard({ name, token, status, time, onStartConsultation }) {
  const statusMod = STATUS_TONE_MOD[status] || STATUS_TONE_MOD.DEFAULT;
  const canStart = status === "CHECKED_IN";
  return (
    <div className="hms-cv-hero">
      <div>
        <p className="hms-cv-hero__name">{name}</p>
        <div className="hms-cv-hero__meta">
          {token != null && (
            <span className="hms-cv-hero__token">
              #{token}
            </span>
          )}
          {time && (
            <span className="hms-cv-hero__time">
              {time.substring(0, 5)}
            </span>
          )}
          {status && (
            <span className={`hms-cv-hero__status ${statusMod}`}>
              {status.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      {/* Status action — surfaced only when the next clinical step is
          obvious (CHECKED_IN → IN_PROGRESS). Once consultation has
          started, the Save & Next bar at the bottom takes over. */}
      {canStart && (
        <button
          type="button"
          onClick={onStartConsultation}
          className="hms-cv-hero__start"
        >
          <PlayCircle className="w-4 h-4" />
          Start Consultation
        </button>
      )}
      {status === "IN_PROGRESS" && (
        <div className="hms-cv-hero__in-progress">
          <Activity className="w-4 h-4" />
          Consultation in progress
        </div>
      )}
    </div>
  );
}

function SidebarSection({ title, trailing, children }) {
  return (
    <div className="hms-cv-sec">
      <div className="hms-cv-sec__head">
        <h3 className="hms-cv-sec__title">
          {title}
        </h3>
        {trailing}
      </div>
      {children}
    </div>
  );
}

function SidebarRow({ icon, label, value, mono }) {
  return (
    <div className="hms-cv-row">
      <span className="hms-cv-row__label">
        <span className="hms-cv-row__label-icon">{icon}</span>
        {label}
      </span>
      <span className={`hms-cv-row__value ${mono ? "is-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function VitalTile({ icon, label, value, unit, tone }) {
  return (
    <div className={`hms-cv-vital-tile is-${tone}`}>
      <div className="hms-cv-vital-tile__head">
        <span className="hms-cv-vital-tile__icon">{icon}</span>
        <span className="hms-cv-vital-tile__label">
          {label}
        </span>
      </div>
      <div className="hms-cv-vital-tile__value-row">
        <span className="hms-cv-vital-tile__value">{value}</span>
        <span className="hms-cv-vital-tile__unit">{unit}</span>
      </div>
    </div>
  );
}

function VitalsStateHint({ status, vitals, recordedByName, recordedAt }) {
  if (status === "loaded" && vitals && (
        vitals.bpSystolic != null || vitals.spo2 != null ||
        vitals.heartRate != null  || vitals.weightKg != null)) {
    return (
      <span className="hms-cv-vital-state is-ok" title={[recordedByName, recordedAt && new Date(recordedAt).toLocaleString()].filter(Boolean).join(" · ")}>
        <Activity className="w-3 h-3" /> Recorded
      </span>
    );
  }
  if (status === "loading") {
    return (
      <span className="hms-cv-vital-state is-loading">
        <Spinner className="w-3 h-3 zu-spinner" /> Loading
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="hms-cv-vital-state is-error">
        <AlertCircle className="w-3 h-3" /> Failed
      </span>
    );
  }
  return (
    <span className="hms-cv-vital-state is-neutral">
      <Activity className="w-3 h-3" /> Not recorded
    </span>
  );
}

function PastRecordCard({ record, onOpen }) {
  const typeLabel = record.historyType || "RECORD";
  const date = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "";
  // The consultation modal stores "Chief complaint: …" as the first
  // line of description; surfacing it in the card preview means the
  // doctor sees the most relevant scrap before clicking through.
  const firstLine = (record.description || "").split("\n")[0] || "";
  const ccMatch = /^Chief complaint:\s*(.+)$/i.exec(firstLine);
  const summary = ccMatch ? ccMatch[1] : (firstLine || "—");
  const drugCount = Array.isArray(record.prescriptionItems) ? record.prescriptionItems.length : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hms-cv-past-card"
    >
      <div className="hms-cv-past-card__head">
        <div className="hms-cv-past-card__chips">
          <span className="hms-cv-past-card__type">
            {typeLabel}
          </span>
          {drugCount > 0 && (
            <span className="hms-cv-past-card__rx-count">
              {drugCount} Rx
            </span>
          )}
        </div>
        <span className="hms-cv-past-card__date">{date}</span>
      </div>
      <p className="hms-cv-past-card__summary" title={summary}>
        {summary}
      </p>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────
// TABS
// ────────────────────────────────────────────────────────────────────────
function TabBar({ tab, setTab, drugCount, labCount }) {
  return (
    <div className="hms-cv-tabs">
      <div className="hms-cv-tabs__row">
        <TabButton active={tab === "consult"} onClick={() => setTab("consult")}
                   icon={<Stethoscope className="w-4 h-4" />} label="Consultation" />
        <TabButton active={tab === "rx"} onClick={() => setTab("rx")}
                   icon={<Pill className="w-4 h-4" />} label="Prescription" count={drugCount} />
        <TabButton active={tab === "lab"} onClick={() => setTab("lab")}
                   icon={<FlaskConical className="w-4 h-4" />} label="Lab Tests" count={labCount} />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hms-cv-tab-btn ${active ? "is-active" : ""}`}
    >
      {icon}{label}
      {count > 0 && (
        <span className="hms-cv-tab-count">
          {count}
        </span>
      )}
    </button>
  );
}

function ConsultTab({ draft, zemaResult, zemaAnalysisState, setZemaAnalysisState }) {
  const [isZemaCollapsed, setIsZemaCollapsed] = useState(false);
  const vitals = draft.vitals;
  const hasVitals = vitals && (
    vitals.bpSystolic != null ||
    vitals.bpDiastolic != null ||
    vitals.spo2 != null ||
    vitals.heartRate != null ||
    vitals.weightKg != null ||
    vitals.heightCm != null
  );

  const startAnalysis = () => {
    setZemaAnalysisState("loading");
    setTimeout(() => {
      setZemaAnalysisState("completed");
    }, 1500);
  };

  return (
    <div className="hms-cv-pane">
      {/* Zema AI Section inside Consultation pane */}
      {hasVitals && (
        <div style={{ marginBottom: "20px" }}>
          {zemaAnalysisState === "idle" && (
            <button
              type="button"
              onClick={startAnalysis}
              className="zema-btn-primary"
            >
              Analyze with Zema AI
            </button>
          )}

          {zemaAnalysisState === "loading" && (
            <div className="zema-loader-card">
              <div className="zema-loader-card__logo-container">
                <img 
                  src={zemaAiLogo} 
                  className="zema-loader-card__logo" 
                  alt="Analyzing" 
                />
                <div className="zema-loader-card__glow" />
              </div>
              <span className="zema-loader-card__text">
                Analyzing with Zema AI...
              </span>
            </div>
          )}

          {zemaAnalysisState === "completed" && (
            <div className="zema-gradient-card">
              <div className="zema-gradient-card__header">
                <div className="zema-gradient-card__logo-block">
                  <div className="zema-gradient-card__logo-glow">
                    <img src={zemaAiLogo} className="zema-gradient-card__logo" alt="" />
                  </div>
                  <h3 className="zema-gradient-card__title">Zema AI</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsZemaCollapsed(!isZemaCollapsed)}
                  className="zema-gradient-card__toggle"
                  title={isZemaCollapsed ? "Expand" : "Collapse"}
                >
                  {isZemaCollapsed ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </button>
              </div>

              {!isZemaCollapsed && (
                <>
                  {zemaResult.bpError && (
                    <div className="zema-alert-banner is-error">
                      <AlertCircle className="w-3.5 h-3.5 zema-alert-banner__icon" />
                      <span>{zemaResult.bpError}</span>
                    </div>
                  )}

                  {/* Row 1 Metrics: BMI, BSA, MAP, PP */}
                  <div className="zema-metrics-row-1">
                    <div className="zema-metric-subcard">
                      <div className="zema-metric-subcard__label">BMI</div>
                      <div className="zema-metric-subcard__value">
                        {zemaResult.metrics.bmi.display}
                        {zemaResult.metrics.bmi.raw !== null && <span className="zema-metric-subcard__unit">kg/m²</span>}
                      </div>
                      {zemaResult.metrics.bmi.category && (
                        <div className={`zema-category-badge is-${zemaResult.metrics.bmi.severity || 'normal'}`}>
                          {zemaResult.metrics.bmi.category}
                        </div>
                      )}
                    </div>

                    <div className="zema-metric-subcard">
                      <div className="zema-metric-subcard__label">BSA</div>
                      <div className="zema-metric-subcard__value">
                        {zemaResult.metrics.bsa.display}
                        {zemaResult.metrics.bsa.raw !== null && <span className="zema-metric-subcard__unit">m²</span>}
                      </div>
                    </div>

                    <div className="zema-metric-subcard">
                      <div className="zema-metric-subcard__label">MAP</div>
                      <div className="zema-metric-subcard__value">
                        {zemaResult.metrics.map.display}
                        {zemaResult.metrics.map.raw !== null && <span className="zema-metric-subcard__unit">mmHg</span>}
                      </div>
                      {zemaResult.metrics.map.category && (
                        <div className={`zema-category-badge is-${zemaResult.metrics.map.severity || 'normal'}`}>
                          {zemaResult.metrics.map.category}
                        </div>
                      )}
                    </div>

                    <div className="zema-metric-subcard">
                      <div className="zema-metric-subcard__label">PP</div>
                      <div className="zema-metric-subcard__value">
                        {zemaResult.metrics.pulsePressure.display}
                        {zemaResult.metrics.pulsePressure.raw !== null && <span className="zema-metric-subcard__unit">mmHg</span>}
                      </div>
                      {zemaResult.metrics.pulsePressure.category && (
                        <div className={`zema-category-badge is-${zemaResult.metrics.pulsePressure.severity || 'normal'}`}>
                          {zemaResult.metrics.pulsePressure.category}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2 Metrics: Shock Index, Ideal Body Weight, BMR */}
                  <div className="zema-metrics-row-2">
                    <div className="zema-metrics-row-2__col">
                      <div className="zema-metrics-row-2__label">Shock Index</div>
                      <div className="zema-metrics-row-2__value">
                        {zemaResult.metrics.shockIndex.display}
                      </div>
                      {zemaResult.metrics.shockIndex.category && (
                        <div className={`zema-category-badge is-${zemaResult.metrics.shockIndex.severity || 'normal'}`}>
                          {zemaResult.metrics.shockIndex.category}
                        </div>
                      )}
                    </div>

                    <div className="zema-metrics-row-2__col">
                      <div className="zema-metrics-row-2__label">Ideal Body Weight</div>
                      <div className="zema-metrics-row-2__value">
                        {zemaResult.metrics.ibw.display}
                        {zemaResult.metrics.ibw.raw !== null && <span className="zema-metrics-row-2__unit">kg</span>}
                      </div>
                    </div>

                    <div className="zema-metrics-row-2__col">
                      <div className="zema-metrics-row-2__label">BMR</div>
                      <div className="zema-metrics-row-2__value">
                        {zemaResult.metrics.bmr.display}
                        {zemaResult.metrics.bmr.raw !== null && <span className="zema-metrics-row-2__unit">kcal/day</span>}
                      </div>
                    </div>
                  </div>

                  {/* Clinical Decision Support narrative */}
                  {zemaResult.interpretationParagraph && (
                    <div className="zema-decision-support">
                      <h4 className="zema-decision-support__title">Clinical Decision Support</h4>
                      <p className="zema-decision-support__text">{zemaResult.interpretationParagraph}</p>
                    </div>
                  )}

                  {/* Dietary Recommendations narrative */}
                  {zemaResult.dietRecommendations?.length > 0 && (
                    <div className="zema-dietary-support" style={{ marginTop: 16, padding: 16, backgroundColor: "rgba(16, 185, 129, 0.05)", borderRadius: 12, border: "1px solid rgba(16, 185, 129, 0.15)" }}>
                      <h4 className="zema-decision-support__title" style={{ display: "flex", alignItems: "center", gap: 6, color: "#065f46", marginBottom: 8, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        <Utensils className="w-4 h-4" /> Preferred Diet Intakes
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: 20, color: "#064e3b", fontSize: "0.9rem", lineHeight: 1.6 }}>
                        {zemaResult.dietRecommendations.map((rec, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {zemaResult.isPediatric && (
                    <div className="zema-alert-banner is-pediatric">
                      <AlertCircle className="w-4 h-4 zema-alert-banner__icon" />
                      <span>{zemaResult.pediatricNote}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <Section icon={<ClipboardList className="w-4 h-4" />} title="Chief complaint" hint="What brought the patient in today">
        <textarea
          rows={2}
          value={draft.chiefComplaint}
          onChange={e => draft.setChiefComplaint(e.target.value)}
          placeholder="e.g. Fever for 3 days, dry cough since yesterday"
          className="focus-textarea"
        />
      </Section>

      <Section icon={<FileText className="w-4 h-4" />} title="Doctor's notes" hint="Examination findings, diagnosis, plan">
        <textarea
          rows={9}
          value={draft.notes}
          onChange={e => draft.setNotes(e.target.value)}
          placeholder="Subjective, objective, assessment, plan…"
          className="focus-textarea"
        />
      </Section>

      <Section icon={<ListChecks className="w-4 h-4" />} title="Instructions for patient" hint="Diet, rest, when to come back">
        <textarea
          rows={5}
          value={draft.instructions}
          onChange={e => draft.setInstructions(e.target.value)}
          placeholder="e.g. Plenty of fluids. Return immediately if breathing worsens."
          className="focus-textarea"
        />
      </Section>

      <Section icon={<CalendarClock className="w-4 h-4" />} title="Next visit" hint="Optional follow-up reminder">
        <input
          type="datetime-local"
          value={draft.nextVisitDate}
          onChange={e => draft.setNextVisitDate(e.target.value)}
          className="focus-input max-w-md"
        />
      </Section>
    </div>
  );
}

function RxTab({ draft }) {
  return (
    <div className="hms-cv-pane">
      <div className="hms-cv-rx-head">
        <div>
          <h3 className="hms-cv-rx-head__title">
            <Pill className="w-4 h-4 hms-cv-rx-head__title-icon" />
            Prescription
            {draft.drugCount > 0 && (
              <span className="hms-cv-rx-head__count">
                {draft.drugCount} drug{draft.drugCount === 1 ? "" : "s"}
              </span>
            )}
          </h3>
          <p className="hms-cv-rx-head__hint">
            Leave empty for a notes-only consultation
          </p>
        </div>
      </div>

      <div className="hms-rx-table">
        <div className="hms-rx-table-head">
          <div className="hms-rx-table-head__cell" />
          <div className="hms-rx-table-head__cell">Drug</div>
          <div className="hms-rx-table-head__cell">Dose</div>
          <div className="hms-rx-table-head__cell">Freq</div>
          <div className="hms-rx-table-head__cell">Days</div>
          <div className="hms-rx-table-head__cell">Qty *</div>
          <div className="hms-rx-table-head__cell">Route</div>
          <div className="hms-rx-table-head__cell" />
        </div>
        {draft.items.map((item, idx) => (
          <PrescriptionDrugRow
            key={item.key}
            index={idx}
            item={item}
            onChange={(field, value) => draft.setItemField(item.key, field, value)}
            onRemove={() => draft.removeItem(item.key)}
            isLastRemovable={draft.items.length > 1}
          />
        ))}
        <div className="hms-rx-add-row">
          <button type="button" onClick={draft.addItem} className="hms-rx-add-btn is-ghost">
            <Plus className="w-3.5 h-3.5" /> Add drug
          </button>
        </div>
      </div>
    </div>
  );
}

function LabTab({
  orders, loading, externalResults, loadingExternal,
  hospitalId, patientId, catalog, onCreated,
}) {
  const [showRequest, setShowRequest] = useState(false);
  const hasInternal = !loading && orders && orders.length > 0;
  const hasExternal = !loadingExternal && externalResults && externalResults.length > 0;

  // Request affordance shown above whatever else renders below — including
  // the empty state, so a doctor consulting a patient with no investigations
  // yet can still raise the first one. Disabled until patient context lands.
  const RequestToolbar = (
    <div className="hms-cv-lab-toolbar">
      <button
        type="button"
        className="hms-btn-primary is-sm"
        onClick={() => setShowRequest((v) => !v)}
        disabled={!patientId}
      >
        <Plus className="w-3.5 h-3.5" />
        {showRequest ? "Close request" : "Request investigation"}
      </button>
      {showRequest && (
        <RequestInvestigationForm
          hospitalId={hospitalId}
          patientId={patientId}
          /* No admissionId — consultation context is OPD; labs auto-creates
             a standalone walk-in invoice on report generation. */
          catalog={catalog}
          defaultKind="ALL"
          onCreated={(saved) => {
            setShowRequest(false);
            onCreated?.(saved);
          }}
          onCancel={() => setShowRequest(false)}
        />
      )}
    </div>
  );

  if (loading && loadingExternal) {
    return (
      <div className="hms-cv-pane">
        {RequestToolbar}
        <CenterLoader text="Loading lab results…" />
      </div>
    );
  }

  if (!hasInternal && !hasExternal && !loading && !loadingExternal) {
    return (
      <div className="hms-cv-pane">
        {RequestToolbar}
        <div className="hms-cv-lab-empty">
          <div className="hms-cv-lab-empty__icon">
            <FlaskConical className="w-5 h-5" />
          </div>
          <p className="hms-cv-lab-empty__title">No lab results yet</p>
          <p className="hms-cv-lab-empty__desc">
            Outside-clinic reports go in at check-in from the appointments dashboard.
            Internal investigations raised here show up below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="hms-cv-pane">
      {RequestToolbar}

      {/* External Results — top because outside-clinic reports usually
          drive immediate clinical decisions and the doctor is reading
          left-to-right from this column first. */}
      <ExternalResultsSection rows={externalResults} loading={loadingExternal} />

      {hasExternal && hasInternal && (
        <div className="hms-cv-lab-divider" />
      )}

      {/* Internal investigations — kind-tagged from the labs service.
          Split into Labs + Radiology subsections so the doctor sees them
          grouped, but they share one fetch (investigationsApi.byPatient). */}
      {(hasInternal || loading) && (() => {
        const labRows = (orders || []).filter(o => o.kind === "LAB");
        const radRows = (orders || []).filter(o => o.kind === "RADIOLOGY" || !o.kind);
        return (
          <>
            {(labRows.length > 0 || loading) && (
              <InternalInvestigationsSection
                rows={labRows}
                loading={loading}
                title="Internal Labs"
                kind="LAB"
              />
            )}
            {labRows.length > 0 && radRows.length > 0 && (
              <div className="hms-cv-lab-divider" />
            )}
            {(radRows.length > 0 || loading) && (
              <InternalInvestigationsSection
                rows={radRows}
                loading={loading}
                title="Internal Radiology"
                kind="RADIOLOGY"
              />
            )}
          </>
        );
      })()}
    </div>
  );
}

function ExternalResultsSection({ rows, loading }) {
  if (loading) {
    return (
      <div>
        <SectionHeading
          icon={<FlaskConical className="w-4 h-4" />}
          title="External Results"
          hint="Captured from outside labs / clinics"
        />
        <CenterLoader text="Loading external results…" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <div>
        <SectionHeading
          icon={<FlaskConical className="w-4 h-4" />}
          title="External Results"
          hint="Captured from outside labs / clinics"
        />
        <p className="hms-cv-empty-row">
          Nothing recorded yet for this patient.
        </p>
      </div>
    );
  }
  return (
    <div>
      <SectionHeading
        icon={<FlaskConical className="w-4 h-4" />}
        title="External Results"
        count={rows.length}
        hint="Captured from outside labs / clinics"
        tone="violet"
      />
      <div className="hms-cv-ext-grid">
        {rows.map(r => <ExternalResultCard key={r.id} result={r} />)}
      </div>
    </div>
  );
}

function ExternalResultCard({ result }) {
  const categoryMod =
    result.category === "LAB"        ? "is-lab" :
    result.category === "RADIOLOGY"  ? "is-radiology" :
    result.category === "PATHOLOGY"  ? "is-pathology" :
    "is-other";
  const testDate = result.testDate
    ? new Date(result.testDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  return (
    <div className="hms-cv-ext-card">
      <div className="hms-cv-ext-card__head">
        <div className="hms-cv-ext-card__chips">
          <span className={`hms-cv-ext-cat ${categoryMod}`}>
            {result.category}
          </span>
          {result.isAbnormal && (
            <span className="hms-cv-ext-abnormal">
              ⚠ Abnormal
            </span>
          )}
        </div>
        <span className="hms-cv-ext-card__date">{testDate}</span>
      </div>
      <h4 className="hms-cv-ext-card__test">{result.testName}</h4>
      <p className="hms-cv-ext-card__src">
        {result.sourceName}
        {result.sourceDoctorName && <span className="hms-cv-ext-card__src-sep"> · {result.sourceDoctorName}</span>}
      </p>
      {(result.resultValue || result.resultUnit) && (
        <div className="hms-cv-ext-card__values">
          <span className="hms-cv-ext-card__value">{result.resultValue || "—"}</span>
          {result.resultUnit && <span className="hms-cv-ext-card__unit">{result.resultUnit}</span>}
          {result.referenceRange && (
            <span className="hms-cv-ext-card__ref">
              ref: {result.referenceRange}
            </span>
          )}
        </div>
      )}
      {result.notes && (
        <p className="hms-cv-ext-card__notes">
          {result.notes}
        </p>
      )}
    </div>
  );
}

function SectionHeading({ icon, title, count, hint, tone }) {
  const toneMod = tone === "violet" ? "is-violet" : tone === "blue" ? "is-blue" : "";
  return (
    <div className="hms-cv-sheading">
      <div className="hms-cv-sheading__left">
        <span className={`hms-cv-sheading__icon ${toneMod}`}>{icon}</span>
        <h3 className="hms-cv-sheading__title">
          {title}
        </h3>
        {count > 0 && (
          <span className={`hms-cv-sheading__count ${toneMod}`}>
            {count}
          </span>
        )}
      </div>
      {hint && (
        <span className="hms-cv-sheading__hint">
          {hint}
        </span>
      )}
    </div>
  );
}


// ────────────────────────────────────────────────────────────────────────
// TOP ACTION BAR — Mark Complete (left) + autosave status (right)
// ────────────────────────────────────────────────────────────────────────
// Sits directly under FocusLayout's header so the primary action is
// always at the top-left thumb-zone, and the autosave reassurance is
// always at the top-right where the eye expects status to live.
function TopActionBar({ autosaveStatus, hydrating, saving, onMarkComplete }) {
  return (
    <div className="hms-cv-top">
      <button
        type="button"
        onClick={onMarkComplete}
        disabled={saving}
        className="hms-cv-complete-btn"
      >
        {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
        Mark Complete
      </button>
      <AutosaveIndicator status={autosaveStatus} hydrating={hydrating} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// BOTTOM BAR — queue navigation only. Finalisation moved to TopActionBar.
// ────────────────────────────────────────────────────────────────────────
function BottomBar({ index, total, saving, onPrev, onNext, onExit }) {
  const isFirst = index <= 0;
  const isLast = index >= total - 1;
  return (
    <div className="hms-cv-bottom">
      <button
        type="button"
        onClick={onPrev}
        disabled={isFirst || saving}
        className="hms-cv-nav-btn"
      >
        <ChevronLeft className="w-4 h-4" /> Previous
      </button>

      <span className="hms-cv-pager">
        {index + 1} <span className="hms-cv-pager__sep">/ {total}</span>
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={isLast || saving}
        className="hms-cv-nav-btn"
      >
        Next <ChevronRight className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={onExit}
        disabled={saving}
        className="hms-cv-exit-btn"
      >
        <LogOut className="w-4 h-4" /> Exit
      </button>
    </div>
  );
}

function AutosaveIndicator({ status, hydrating }) {
  if (hydrating) {
    return (
      <span className="hms-cv-autosave is-hydrating">
        <Spinner className="w-3 h-3 zu-spinner" /> Loading draft…
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="hms-cv-autosave is-saving">
        <Spinner className="w-3 h-3 zu-spinner" /> Saving draft…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="hms-cv-autosave is-saved">
        <Save className="w-3 h-3" /> Draft saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="hms-cv-autosave is-error">
        <AlertCircle className="w-3 h-3" /> Autosave failed
      </span>
    );
  }
  return <span className="hms-cv-autosave is-idle">Draft autosaves as you type</span>;
}

// ────────────────────────────────────────────────────────────────────────
// SHARED
// ────────────────────────────────────────────────────────────────────────
function Section({ icon, title, hint, children }) {
  return (
    <div className="hms-cv-section">
      <div className="hms-cv-section__head">
        <h3 className="hms-cv-section__title">
          <span className="hms-cv-section__title-icon">{icon}</span>
          {title}
        </h3>
        {hint && (
          <span className="hms-cv-section__hint">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function computeAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 150 ? `${age} yr` : null;
}

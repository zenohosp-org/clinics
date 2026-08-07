import { useState, useEffect, useCallback } from "react";
import { Spinner } from "@/components/ui/Loader";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { fmtId } from "@/utils/idFormat";
import {
  Stethoscope, Pill, Plus, CheckCircle2, ClipboardList, CalendarClock, FileText, ListChecks,
  Save, AlertCircle, User as UserIcon, IdCard, Activity, HeartPulse, Wind, Scale, Droplet,
  Ruler, ChevronUp, ChevronDown, FlaskConical,
} from "lucide-react";
import { PrescriptionDrugRow } from "@/components/prescription/PrescriptionDrugRow";
import { useConsultationDraft } from "@/hooks/useConsultationDraft";
import VitalsModal from "@/components/modals/VitalsModal";
import Modal from "@/components/ui/Modal";
import {
  zemaRulesApi, investigationsApi,
} from "@/utils/api";
import { useInvestigationCatalog } from "@/hooks/useInvestigationCatalog";
import RequestInvestigationForm from "@/components/investigations/RequestInvestigationForm";
import InternalInvestigationsSection from "@/components/investigations/InternalInvestigationsSection";
import { calculateZemaVitals } from "@/utils/zemaCalculationEngine";
import zemaAiLogo from "@/assets/Zema-AI.svg";

/**
 * Single-flow consultation page launched after an OPD appointment hits
 * IN_PROGRESS (or via "Open Consultation" on a CHECKED_IN+ row). Form
 * state, vitals fetch, draft hydration, autosave, and the save handler
 * all live in useConsultationDraft so this modal and the queue-walked
 * ConsultationViewPage share one implementation.
 */
export default function ConsultationModal({ appointment, onClose, onSaved }) {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [zemaRules, setZemaRules] = useState([]);
  const [zemaAnalysisState, setZemaAnalysisState] = useState("idle"); // "idle" | "loading" | "completed"
  const [isZemaCollapsed, setIsZemaCollapsed] = useState(false);

  // Investigation surface — same shape as ConsultationViewPage but lives
  // inside the modal so a doctor resuming a draft consultation (any day,
  // not just today's queue) can also see + request investigations without
  // closing the modal. Catalog fetched once per hospital; labs fetched
  // per patient and re-run on successful create via refetchLabOrders.
  const [labOrders, setLabOrders] = useState([]);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const investigationCatalog = useInvestigationCatalog(user?.hospitalId);
  const [showRequest, setShowRequest] = useState(false);

  useEffect(() => {
    if (user?.hospitalId) {
      zemaRulesApi.list(user.hospitalId)
        .then(setZemaRules)
        .catch((err) => console.error("Failed to load Zema rules", err));
    }
  }, [user?.hospitalId]);

  const patientId = appointment?.patientId;

  // Unified lab + radiology read for the patient on this appointment.
  // Wrapped in a useCallback so the RequestInvestigationForm's onCreated
  // can re-run it and surface the new order immediately below.
  const refetchLabOrders = useCallback(() => {
    if (!patientId) { setLabOrders([]); return; }
    setLoadingLabs(true);
    investigationsApi.byPatient(patientId)
      .then(rows => setLabOrders(Array.isArray(rows) ? rows : []))
      .catch(() => setLabOrders([]))
      .finally(() => setLoadingLabs(false));
  }, [patientId]);

  useEffect(() => { refetchLabOrders(); }, [refetchLabOrders]);


  useEffect(() => {
    setZemaAnalysisState("idle");
  }, [appointment?.id]);

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

  const {
    chiefComplaint, setChiefComplaint,
    notes, setNotes,
    instructions, setInstructions,
    nextVisitDate, setNextVisitDate,
    items, setItemField, addItem, removeItem,
    drugCount, vitals, setVitals, vitalsStatus, hydrating, autosaveStatus, saving,
    saveConsultation,
  } = useConsultationDraft({
    appointment,
    hospitalId: user?.hospitalId,
    notify,
    onSaved,
  });

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

  const apptDate = appointment?.apptDate || "";
  const apptTime = appointment?.apptTime ? appointment.apptTime.substring(0, 5) : "";
  const dateTimeText = [apptDate, apptTime].filter(Boolean).join(" · ");
  const patientFullName =
    appointment?.patientName ||
    [appointment?.patientFirstName, appointment?.patientLastName].filter(Boolean).join(" ");
  const uhidDisplay = fmtId(appointment?.patientUhid) || appointment?.patientUhid || "—";

  const isDirty =
    chiefComplaint.trim() !== "" ||
    notes.trim() !== "" ||
    instructions.trim() !== "" ||
    nextVisitDate !== "" ||
    items.some(i => i.drugName.trim() !== "");

  const handleCancel = () => {
    if (!isDirty) { onClose(); return; }
    setShowDiscardConfirm(true);
  };

  return (
    <>
      <div className="zu-modal-overlay">
        <div className="zu-modal is-full">

          {/* ── Header: title + token badge only ─────────────────────── */}
          <div className="zu-modal-header">
            <div className="hms-cmodal__title-block">
              <div className="hms-icon-tile is-info">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="hms-cmodal__title">Consultation</h2>
                <p className="hms-cmodal__subtitle">
                  Auto-opened on check-in · saves to the patient record
                </p>
              </div>
            </div>
            {appointment?.tokenNumber != null && (
              <span className="hms-badge is-neutral is-soft">
                Token #{appointment.tokenNumber}
              </span>
            )}
          </div>

          {/* ── Meta strip ───────────────────────────────────────────── */}
          <div className="hms-cmodal__meta is-4col">
            <PreField icon={<UserIcon className="w-3.5 h-3.5" />} label="Patient" value={patientFullName || "—"} />
            <PreField icon={<IdCard className="w-3.5 h-3.5" />} label="UHID" value={uhidDisplay} mono />
            <PreField icon={<Stethoscope className="w-3.5 h-3.5" />} label="Doctor" value={appointment?.doctorName || "—"} />
            <PreField icon={<CalendarClock className="w-3.5 h-3.5" />} label="Date & time" value={dateTimeText || "—"} />
          </div>

          {/* ── Vitals strip ─────────────────────────────────────────── */}
          <VitalsStrip vitals={vitals} vitalsStatus={vitalsStatus} bloodGroup={appointment?.patientBloodGroup} onEditVitals={() => setShowVitalsModal(true)} />

          {/* ── Body: clinical (left, wider) + prescription (right) ─────── */}
          <div className="zu-modal-body is-flush">
            <div className="hms-consult-body">

              <div className="hms-consult-body__main">
                {/* Zema AI Section inside Consultation Modal */}
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

                <Section icon={<ClipboardList className="w-3.5 h-3.5" />} title="Chief complaint" hint="What brought the patient in today">
                  <textarea
                    rows={2}
                    value={chiefComplaint}
                    onChange={e => setChiefComplaint(e.target.value)}
                    placeholder="e.g. Fever for 3 days, dry cough since yesterday"
                    className="hms-clinical-textarea"
                  />
                </Section>

                <Section icon={<FileText className="w-3.5 h-3.5" />} title="Doctor's notes" hint="Examination findings, diagnosis, plan">
                  <textarea
                    rows={7}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Subjective, objective, assessment, plan…"
                    className="hms-clinical-textarea"
                  />
                </Section>

                <Section icon={<ListChecks className="w-3.5 h-3.5" />} title="Instructions for patient" hint="Diet, rest, when to come back">
                  <textarea
                    rows={4}
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="e.g. Plenty of fluids. Return immediately if breathing worsens."
                    className="hms-clinical-textarea"
                  />
                </Section>

                <Section icon={<CalendarClock className="w-3.5 h-3.5" />} title="Next visit" hint="Optional follow-up reminder">
                  <input
                    type="datetime-local"
                    value={nextVisitDate}
                    onChange={e => setNextVisitDate(e.target.value)}
                    className="hms-clinical-input"
                  />
                </Section>
              </div>

              <div className="hms-consult-body__aside">
                <div className="hms-rx-head">
                  <div>
                    <h3 className="hms-rx-head__title">
                      <span className="hms-rx-head__icon"><Pill className="w-3.5 h-3.5" /></span>
                      Prescription
                      {drugCount > 0 && (
                        <span className="hms-rx-head__count">
                          {drugCount} drug{drugCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </h3>
                    <p className="hms-rx-head__hint">
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
                  {items.map((item, idx) => (
                    <PrescriptionDrugRow
                      key={item.key}
                      index={idx}
                      item={item}
                      onChange={(field, value) => setItemField(item.key, field, value)}
                      onRemove={() => removeItem(item.key)}
                      isLastRemovable={items.length > 1}
                    />
                  ))}
                  <div className="hms-rx-add-row">
                    <button type="button" onClick={addItem} className="hms-rx-add-btn is-ghost">
                      <Plus className="w-3.5 h-3.5" /> Add drug
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Investigations (labs + radiology) ────────────────────────
              Same shape as the Consultation View's Lab tab — Request button
              expands the shared form, the list below shows existing orders
              for this patient. Visible regardless of whether the modal was
              opened today (check-in) or any other day (resume draft). */}
            <div className="hms-consult-investigations">
              <Section
                icon={<FlaskConical className="w-3.5 h-3.5" />}
                title="Investigations"
                hint="Pathology + radiology orders for this patient"
              >
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
                      hospitalId={user?.hospitalId}
                      patientId={patientId}
                      /* No admissionId — consultation context is OPD; labs
                         auto-creates a standalone walk-in invoice on report
                         generation. */
                      catalog={investigationCatalog}
                      defaultKind="ALL"
                      onCreated={() => {
                        setShowRequest(false);
                        refetchLabOrders();
                      }}
                      onCancel={() => setShowRequest(false)}
                    />
                  )}
                </div>

                {(() => {
                  const currentLabOrders = (labOrders || []).filter(o => {
                    if (!o.createdAt || !appointment?.apptDate) return false;
                    const d = new Date(o.createdAt);
                    const orderYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    return orderYmd === appointment.apptDate;
                  });
                  const labRows = currentLabOrders.filter(o => o.kind === "LAB");
                  const radRows = currentLabOrders.filter(o => o.kind === "RADIOLOGY" || !o.kind);
                  const showLabs = loadingLabs || labRows.length > 0;
                  const showRad = loadingLabs || radRows.length > 0;
                  if (!loadingLabs && labRows.length === 0 && radRows.length === 0) {
                    return (
                      <p className="hms-consult-investigations__empty">
                        No investigations raised for this patient yet.
                      </p>
                    );
                  }
                  return (
                    <>
                      {showLabs && (
                        <InternalInvestigationsSection
                          rows={labRows}
                          loading={loadingLabs}
                          title="Internal Labs"
                          kind="LAB"
                        />
                      )}
                      {showLabs && showRad && labRows.length > 0 && radRows.length > 0 && (
                        <div className="hms-cv-lab-divider" />
                      )}
                      {showRad && (
                        <InternalInvestigationsSection
                          rows={radRows}
                          loading={loadingLabs}
                          title="Internal Radiology"
                          kind="RADIOLOGY"
                        />
                      )}
                    </>
                  );
                })()}
              </Section>
            </div>
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="hms-consult-footer">
            <AutosaveIndicator status={autosaveStatus} hydrating={hydrating} />
            <div className="hms-consult-footer__actions">
              <button type="button" onClick={handleCancel} disabled={saving} className="zu-btn-cancel">
                Cancel
              </button>
              <button type="button" onClick={saveConsultation} disabled={saving} className="zu-btn-primary">
                {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Consultation
              </button>
            </div>
          </div>
        </div>
      </div>
      {showVitalsModal && (
        <VitalsModal
          appointment={appointment}
          onClose={() => setShowVitalsModal(false)}
          onSaved={(savedVitals) => {
            setVitals(savedVitals);
            setShowVitalsModal(false);
          }}
        />
      )}
      <Modal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title="Discard consultation?"
        size="sm"
        showClose={false}
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="zu-btn-cancel"
              onClick={() => setShowDiscardConfirm(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="zu-btn-danger"
              onClick={onClose}
            >
              Discard and close
            </button>
          </div>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: "var(--hms-gray-600)", lineHeight: 1.6 }}>
          You have unsaved notes and/or prescription entries. Closing now will lose all of this work.
        </p>
      </Modal>
    </>
  );
}

function VitalsStrip({ vitals, vitalsStatus, bloodGroup, onEditVitals }) {
  // While the API is in flight render an unobtrusive "…" so the strip
  // doesn't flash "—" before populating. Once vitalsStatus settles to
  // "loaded", a missing field is a deliberate "—".
  const placeholder = vitalsStatus === "loading" ? "…" : "—";
  const bp = vitals && (vitals.bpSystolic != null || vitals.bpDiastolic != null)
    ? `${vitals.bpSystolic ?? "—"}/${vitals.bpDiastolic ?? "—"}`
    : null;
  const spo2 = vitals?.spo2 != null ? `${vitals.spo2}%` : null;
  const hr = vitals?.heartRate != null ? `${vitals.heartRate} bpm` : null;
  const wt = vitals?.weightKg != null ? `${Number(vitals.weightKg).toFixed(1)} kg` : null;
  const ht = vitals?.heightCm != null ? `${vitals.heightCm} cm` : null;
  const bg = vitals?.bloodGlucose != null ? `${vitals.bloodGlucose} mg/dL` : null;
  const recordedAt = vitals?.updatedAt || vitals?.recordedAt;

  let trailing;
  if (vitalsStatus === "loading") trailing = "Loading vitals…";
  else if (vitalsStatus === "error") trailing = "Failed to load vitals";
  else if (vitals) trailing = `Recorded by ${vitals.recordedByName || "—"}${recordedAt ? " · " + new Date(recordedAt).toLocaleString() : ""}`;
  else trailing = "Vitals not recorded yet";

  return (
    <div className="hms-vitals-strip">
      <div className="hms-vitals-strip__label">
        <Activity className="w-3 h-3" /> Vitals
      </div>
      <VitalChip icon={<Droplet className="w-3 h-3" />} iconTone="rose" label="Blood" value={bloodGroup || "—"} />
      <VitalChip icon={<HeartPulse className="w-3 h-3" />} iconTone="rose" label="BP" value={bp || placeholder} unit={bp ? "mmHg" : null} />
      <VitalChip icon={<Wind className="w-3 h-3" />} iconTone="blue" label="SpO₂" value={spo2 || placeholder} />
      <VitalChip icon={<HeartPulse className="w-3 h-3" />} iconTone="emerald" label="Pulse" value={hr || placeholder} />
      <VitalChip icon={<Scale className="w-3 h-3" />} iconTone="amber" label="Weight" value={wt || placeholder} />
      <VitalChip icon={<Ruler className="w-3 h-3" />} iconTone="blue" label="Height" value={ht || placeholder} />
      <VitalChip icon={<Activity className="w-3 h-3" />} iconTone="rose" label="Glucose" value={bg || placeholder} />
      <div className="hms-vitals-strip__trailing" style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
        <span>{trailing}</span>
        <button
          type="button"
          onClick={onEditVitals}
          className="zu-btn-secondary is-sm"
          style={{ padding: "2px 8px", fontSize: "11px", height: "24px" }}
        >
          {vitals ? "Edit Vitals" : "Record Vitals"}
        </button>
      </div>
    </div>
  );
}

function VitalChip({ icon, iconTone, label, value, unit }) {
  return (
    <div className="hms-vital-chip">
      <span className={`hms-vital-chip__icon is-${iconTone}`}>{icon}</span>
      <span className="hms-vital-chip__label">
        {label}
      </span>
      <span className="hms-vital-chip__value">
        {value}
        {unit && <span className="hms-vital-chip__unit">{unit}</span>}
      </span>
    </div>
  );
}

function PreField({ icon, label, value, mono }) {
  return (
    <div className="hms-meta-field">
      <div className="hms-meta-field__label">
        {icon}
        {label}
      </div>
      <p className={`hms-meta-field__value${mono ? " is-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ icon, title, hint, children }) {
  return (
    <div className="hms-clinical-section">
      <div className="hms-clinical-section__head">
        <h3 className="hms-clinical-section__title">
          <span className="hms-clinical-section__title-icon">{icon}</span>
          {title}
        </h3>
        {hint && (
          <span className="hms-clinical-section__hint">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function AutosaveIndicator({ status, hydrating }) {
  if (hydrating) {
    return (
      <span className="hms-autosave is-hydrating">
        <Spinner className="w-3 h-3 zu-spinner" /> Loading draft…
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="hms-autosave is-saving">
        <Spinner className="w-3 h-3 zu-spinner" /> Saving draft…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="hms-autosave is-saved">
        <Save className="w-3 h-3" /> Draft saved — safe to close and resume later
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="hms-autosave is-error">
        <AlertCircle className="w-3 h-3" /> Autosave failed — your changes are only in this tab
      </span>
    );
  }
  return <span className="hms-autosave">Draft autosaves as you type</span>;
}

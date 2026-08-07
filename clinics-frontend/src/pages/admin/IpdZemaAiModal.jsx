import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { ipdVitalsApi, zemaRulesApi, patientApi } from "@/utils/api";
import { calculateZemaVitals } from "@/utils/zemaCalculationEngine";
import { fmtDateTime } from "@/utils/date";
import IpdVitalsTrendChart from "./IpdVitalsTrendChart";
import zemaAiLogo from "@/assets/Zema-AI.svg";
import { X, AlertCircle, ChevronUp, ChevronDown, Activity, Clock, Utensils } from "lucide-react";

// Minimum time the "Analyzing…" state stays visible, so the Zema AI
// branding moment reads consistently even when the API responses are fast.
const MIN_ANALYSIS_MS = 1100;

function getAgeYears(dob) {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
    return age;
}

/**
 * Consolidated "Analyze with Zema AI" modal for an IPD admission.
 * Combines a rule-based interpretation of the latest vitals reading
 * with the multi-metric vitals trend chart, in one place.
 */
export default function IpdZemaAiModal({ admission, onClose }) {
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [readings, setReadings] = useState([]);
    const [zemaRules, setZemaRules] = useState([]);
    const [patient, setPatient] = useState(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        let cancelled = false;
        const startedAt = Date.now();

        async function load() {
            try {
                const [vitals, rules, patientData] = await Promise.all([
                    ipdVitalsApi.list(admission.id).catch(() => []),
                    user?.hospitalId ? zemaRulesApi.list(user.hospitalId).catch(() => []) : Promise.resolve([]),
                    admission.patientId && user?.hospitalId
                        ? patientApi.get(admission.patientId, user.hospitalId).catch(() => null)
                        : Promise.resolve(null),
                ]);
                if (cancelled) return;
                setReadings(vitals ?? []);
                setZemaRules(rules ?? []);
                setPatient(patientData);
            } finally {
                const remaining = Math.max(0, MIN_ANALYSIS_MS - (Date.now() - startedAt));
                setTimeout(() => {
                    if (!cancelled) setLoading(false);
                }, remaining);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [admission.id, admission.patientId, user?.hospitalId]);

    const latest = useMemo(() => {
        const sorted = [...readings]
            .filter((r) => r.recordedAt)
            .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
        return sorted[0] ?? null;
    }, [readings]);

    const zemaResult = useMemo(() => {
        if (!latest) return null;
        return calculateZemaVitals({
            age: getAgeYears(patient?.dob),
            sex: patient?.gender,
            sbp: latest.bpSystolic,
            dbp: latest.bpDiastolic,
            weight: latest.weightKg,
            height: undefined,
            temperature: latest.temperature,
            bloodGlucose: latest.bloodGlucose,
            spo2: latest.spo2,
            pulse: latest.heartRate,
        }, zemaRules);
    }, [latest, patient, zemaRules]);

    return (
        <div
            className="zu-modal-overlay"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
            <div className="zu-modal is-lg hms-zema-modal">
                <div className="zu-modal-header">
                    <div className="hms-zema-modal__title">
                        <div className="zema-gradient-card__logo-glow">
                            <img src={zemaAiLogo} className="zema-gradient-card__logo" alt="" />
                        </div>
                        <div>
                            <h3>Zema AI</h3>
                            <p className="hms-zema-modal__subtitle">
                                {admission.patientName} · Vitals analysis
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="zu-modal-close" aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <div className="zu-modal-body">
                    {loading ? (
                        <div className="zema-loader-card">
                            <div className="zema-loader-card__logo-container">
                                <img src={zemaAiLogo} className="zema-loader-card__logo" alt="Analyzing" />
                                <div className="zema-loader-card__glow" />
                            </div>
                            <span className="zema-loader-card__text">Analyzing with Zema AI...</span>
                        </div>
                    ) : !latest ? (
                        <div className="hms-ipd-center-empty">
                            <div className="hms-ipd-center-empty__icon">
                                <Activity size={32} />
                            </div>
                            <p className="hms-ipd-center-empty__text">No vitals recorded yet</p>
                            <p className="hms-ipd-center-empty__sub">
                                Record vitals in the Vitals tab to enable Zema AI analysis
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="zema-gradient-card hms-zema-modal__analysis-card">
                                <div className="zema-gradient-card__header">
                                    <div className="zema-gradient-card__logo-block">
                                        <div className="zema-gradient-card__logo-glow">
                                            <img src={zemaAiLogo} className="zema-gradient-card__logo" alt="" />
                                        </div>
                                        <h3 className="zema-gradient-card__title">Latest Vitals Analysis</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsCollapsed((v) => !v)}
                                        className="zema-gradient-card__toggle"
                                        title={isCollapsed ? "Expand" : "Collapse"}
                                    >
                                        {isCollapsed ? (
                                            <ChevronDown className="w-5 h-5" />
                                        ) : (
                                            <ChevronUp className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>

                                {!isCollapsed && (
                                    <>
                                        <p className="hms-zema-modal__reading-time">
                                            <Clock size={11} /> Based on reading recorded {fmtDateTime(latest.recordedAt)}
                                        </p>

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

                            <IpdVitalsTrendChart readings={readings} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

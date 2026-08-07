import { useState, useEffect, useCallback } from "react";
import { useNotification } from "@/context/NotificationContext";
import { ipdVitalsApi } from "@/utils/api";
import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { FormGroup } from "@/components/ui";
import {
    Activity, HeartPulse, Wind, Thermometer, Droplets, Gauge,
    FlaskConical, Scale, Clock, User as UserIcon, CheckCircle2,
    AlertCircle, NotebookPen,
} from "lucide-react";
import { fmtDateTime } from "@/utils/date";

// ── Field metadata — label, unit, icon ───────────────────────────────────────

const VITAL_META = {
    bpSystolic:      { label: "BP Systolic",      unit: "mmHg",       icon: HeartPulse },
    bpDiastolic:     { label: "BP Diastolic",      unit: "mmHg",       icon: HeartPulse },
    heartRate:       { label: "Heart Rate",        unit: "bpm",        icon: HeartPulse },
    respiratoryRate: { label: "Resp. Rate",        unit: "br/min",     icon: Wind       },
    temperature:     { label: "Temperature",       unit: "°F",         icon: Thermometer },
    spo2:            { label: "SpO₂",              unit: "%",          icon: Wind       },
    painScore:       { label: "Pain Score",        unit: "/10",        icon: Gauge      },
    bloodGlucose:    { label: "Blood Glucose",     unit: "mg/dL",      icon: Droplets   },
    weightKg:        { label: "Weight",            unit: "kg",         icon: Scale      },
};

const VITAL_FIELDS = Object.keys(VITAL_META);

// ── Empty state helpers ───────────────────────────────────────────────────────

function emptyForm() {
    return {
        recordedAt:      "",
        bpSystolic:      "",
        bpDiastolic:     "",
        heartRate:       "",
        respiratoryRate: "",
        temperature:     "",
        spo2:            "",
        painScore:       "",
        bloodGlucose:    "",
        weightKg:        "",
        notes:           "",
    };
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Vitals tab for an IPD admission.
 *
 * When isDischarged is true:
 *   - The entry form is hidden entirely. A notice explains why.
 *   - The full reading history is still shown so staff can review the
 *     patient's vital trend during the admission even after discharge.
 *
 * When isDischarged is false:
 *   - The entry form is shown at the top.
 *   - Submitted readings are prepended optimistically, then the list
 *     is refreshed from the server to confirm.
 */
export default function IpdVitalsTab({ admissionId, isDischarged }) {
    const { notify } = useNotification();

    const [readings, setReadings] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [form, setForm]         = useState(emptyForm);
    const [saving, setSaving]     = useState(false);

    const fetchReadings = useCallback(async () => {
        try {
            const data = await ipdVitalsApi.list(admissionId);
            setReadings(data ?? []);
        } catch {
            // Non-fatal — list is empty on error; user can retry by switching tabs
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => {
        fetchReadings();
    }, [fetchReadings]);

    // ── Form helpers ──────────────────────────────────────────────────────────

    const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Client-side: require at least one vital (mirrors server validation)
        const hasVital = VITAL_FIELDS.some((k) => form[k] !== "" && form[k] !== null);
        if (!hasVital) {
            notify("Enter at least one vital measurement before saving", "warning");
            return;
        }

        const payload = {
            admissionId,
            recordedAt: form.recordedAt || undefined,
            bpSystolic:      num(form.bpSystolic),
            bpDiastolic:     num(form.bpDiastolic),
            heartRate:       num(form.heartRate),
            respiratoryRate: num(form.respiratoryRate),
            temperature:     dec(form.temperature),
            spo2:            num(form.spo2),
            painScore:       num(form.painScore),
            bloodGlucose:    num(form.bloodGlucose),
            weightKg:        dec(form.weightKg),
            notes:           form.notes.trim() || undefined,
        };

        setSaving(true);
        try {
            const saved = await ipdVitalsApi.create(payload);
            setReadings((prev) => [saved, ...prev]);
            setForm(emptyForm);
            notify("Vitals recorded", "success");
            // Refresh from server to confirm
            fetchReadings();
        } catch (err) {
            // Surface the server's field-level error message if available
            const msg = err?.response?.data?.message ?? "Failed to save vitals";
            notify(msg, "error");
        } finally {
            setSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="hms-ipd-tab-body hms-ipd-vitals-tab">

            {/* ── Entry form (hidden when patient is discharged) ── */}
            {isDischarged ? (
                <div className="hms-ipd-vitals-discharged-notice">
                    <AlertCircle size={14} />
                    <span>Patient discharged — vitals history is read-only</span>
                </div>
            ) : (
                <div className="hms-ipd-vitals-form-section">
                    <div className="hms-ipd-log-head__row" style={{ marginBottom: 14 }}>
                        <p className="hms-ipd-log-head__label">Record vitals</p>
                    </div>

                    <form onSubmit={handleSubmit} className="hms-form-stack">
                        <div className="hms-form-grid is-3col">
                            {/* Recorded-at datetime */}
                            <FormGroup label={<span>Observation time <span className="text-danger">*</span></span>}>
                                <input
                                    type="datetime-local"
                                    className="hms-vitals-input"
                                    style={{ width: "100%" }}
                                    value={form.recordedAt}
                                    onChange={set("recordedAt")}
                                    required
                                />
                            </FormGroup>

                            {/* BP — paired input */}
                            <FormGroup label="Blood Pressure (mmHg)">
                                <div className="hms-vitals-row">
                                    <input
                                        type="number" min="40" max="300" step="1" inputMode="numeric"
                                        placeholder="Sys"
                                        className="hms-vitals-input"
                                        style={{ minWidth: 0, flex: 1 }}
                                        value={form.bpSystolic}
                                        onChange={set("bpSystolic")}
                                    />
                                    <span className="hms-vitals-row__sep">/</span>
                                    <input
                                        type="number" min="20" max="200" step="1" inputMode="numeric"
                                        placeholder="Dia"
                                        className="hms-vitals-input"
                                        style={{ minWidth: 0, flex: 1 }}
                                        value={form.bpDiastolic}
                                        onChange={set("bpDiastolic")}
                                    />
                                </div>
                            </FormGroup>

                            <FormGroup label="Heart Rate">
                                <div className="hms-vitals-row">
                                    <input type="number" min="20" max="300" step="1" inputMode="numeric"
                                        placeholder="72" className="hms-vitals-input"
                                        value={form.heartRate} onChange={set("heartRate")} />
                                    <span className="hms-vitals-row__unit">bpm</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="Resp. Rate">
                                <div className="hms-vitals-row">
                                    <input type="number" min="5" max="60" step="1" inputMode="numeric"
                                        placeholder="16" className="hms-vitals-input"
                                        value={form.respiratoryRate} onChange={set("respiratoryRate")} />
                                    <span className="hms-vitals-row__unit">br/min</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="SpO₂">
                                <div className="hms-vitals-row">
                                    <input type="number" min="0" max="100" step="1" inputMode="numeric"
                                        placeholder="98" className="hms-vitals-input"
                                        value={form.spo2} onChange={set("spo2")} />
                                    <span className="hms-vitals-row__unit">%</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="Temperature">
                                <div className="hms-vitals-row">
                                    <input type="number" min="90" max="110" step="0.1" inputMode="decimal"
                                        placeholder="98.6" className="hms-vitals-input"
                                        value={form.temperature} onChange={set("temperature")} />
                                    <span className="hms-vitals-row__unit">°F</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="Pain Score (0–10)">
                                <div className="hms-vitals-row">
                                    <input type="number" min="0" max="10" step="1" inputMode="numeric"
                                        placeholder="0" className="hms-vitals-input"
                                        value={form.painScore} onChange={set("painScore")} />
                                    <span className="hms-vitals-row__unit">/10</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="Blood Glucose">
                                <div className="hms-vitals-row">
                                    <input type="number" min="20" max="1000" step="1" inputMode="numeric"
                                        placeholder="90" className="hms-vitals-input"
                                        value={form.bloodGlucose} onChange={set("bloodGlucose")} />
                                    <span className="hms-vitals-row__unit">mg/dL</span>
                                </div>
                            </FormGroup>

                            <FormGroup label="Weight">
                                <div className="hms-vitals-row">
                                    <input type="number" min="1" max="999" step="0.1" inputMode="decimal"
                                        placeholder="65.0" className="hms-vitals-input"
                                        value={form.weightKg} onChange={set("weightKg")} />
                                    <span className="hms-vitals-row__unit">kg</span>
                                </div>
                            </FormGroup>
                        </div>

                        {/* Notes */}
                        <FormGroup label="Notes">
                            <textarea
                                rows={2}
                                placeholder="Any observations or context for this reading…"
                                className="hms-vitals-notes-input"
                                value={form.notes}
                                onChange={set("notes")}
                            />
                        </FormGroup>

                        <div>
                            <button type="submit" className="zu-btn-primary" disabled={saving}
                                style={{ width: "auto" }}>
                                {saving
                                    ? <Spinner className="w-4 h-4 zu-spinner" />
                                    : <CheckCircle2 className="w-4 h-4" />}
                                Save vitals
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── Reading history ── */}
            <div className="hms-ipd-vitals-history">
                <p className="hms-ipd-log-head__label" style={{ marginBottom: 12 }}>
                    Reading history
                </p>

                {loading ? (
                    <CenterLoader text="Loading vitals…" />
                ) : readings.length === 0 ? (
                    <div className="hms-ipd-center-empty">
                        <div className="hms-ipd-center-empty__icon">
                            <Activity size={32} />
                        </div>
                        <p className="hms-ipd-center-empty__text">No vitals recorded yet</p>
                        {!isDischarged && (
                            <p className="hms-ipd-center-empty__sub">
                                Use the form above to log the first reading
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="hms-vitals-reading-list">
                        {readings.map((r) => (
                            <ReadingCard key={r.id} reading={r} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Reading card ──────────────────────────────────────────────────────────────

function ReadingCard({ reading }) {
    // Collect only non-null vital values for display
    const fields = VITAL_FIELDS
        .map((key) => ({ key, meta: VITAL_META[key], value: reading[key] }))
        .filter(({ value }) => value !== null && value !== undefined);

    return (
        <div className="hms-vitals-reading-card">
            <div className="hms-vitals-reading-card__header">
                <div className="hms-vitals-reading-card__time">
                    <Clock size={12} />
                    <span>{fmtDateTime(reading.recordedAt)}</span>
                </div>
                {reading.recordedByName && (
                    <div className="hms-vitals-reading-card__by">
                        <UserIcon size={11} />
                        <span>{reading.recordedByName}</span>
                    </div>
                )}
            </div>

            <div className="hms-vitals-reading-card__grid">
                {fields.map(({ key, meta, value }) => {
                    const Icon = meta.icon;
                    return (
                        <div key={key} className="hms-vitals-reading-card__field">
                            <div className="hms-vitals-reading-card__field-label">
                                <Icon size={11} />
                                <span>{meta.label}</span>
                            </div>
                            <div className="hms-vitals-reading-card__field-value">
                                {value}
                                <span className="hms-vitals-reading-card__field-unit">
                                    {meta.unit}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {reading.notes && (
                <div className="hms-vitals-reading-card__notes">
                    <NotebookPen size={11} />
                    <span>{reading.notes}</span>
                </div>
            )}
        </div>
    );
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function num(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
}

function dec(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}

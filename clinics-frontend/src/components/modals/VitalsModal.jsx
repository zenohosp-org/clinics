import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { vitalsApi, zemaRulesApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { calculateZemaVitals } from "@/utils/zemaCalculationEngine";
import zemaAiLogo from "@/assets/Zema-AI.svg";
import { Activity, HeartPulse, Wind, Scale, Droplet, CheckCircle2, User as UserIcon, IdCard, CalendarClock, Stethoscope, Clock, Ruler, AlertCircle, Thermometer } from "lucide-react";

/**
 * Nurse-facing form to record per-visit vitals (BP, SpO2, HR, weight) on
 * a CHECKED_IN appointment, before the doctor takes over. Backed by the
 * /api/vitals/appointment/{id} upsert endpoint — one row per appointment,
 * re-takes UPDATE in place.
 *
 * Blood group is read-through from the patient record and shown for
 * reference; it isn't editable here because it lives on patient
 * registration and never changes per visit.
 *
 * Props:
 *   appointment — AppointmentDto from the dashboard. Must include id,
 *                 patientId, patientName, patientUhid, patientBloodGroup.
 *   onClose     — close handler.
 *   onSaved     — called with the VitalsDto after a successful upsert so
 *                 the dashboard can refresh its "has-vitals" badge.
 */
export default function VitalsModal({ appointment, onClose, onSaved }) {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [spo2, setSpo2] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [bloodGlucose, setBloodGlucose] = useState("");
  const [temperature, setTemperature] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);
  const [zemaRules, setZemaRules] = useState([]);

  useEffect(() => {
    if (user?.hospitalId) {
      zemaRulesApi.list(user.hospitalId)
        .then(setZemaRules)
        .catch((err) => console.error("Failed to load Zema rules", err));
    }
  }, [user?.hospitalId]);

  // Hydrate from any prior reading on this appointment so re-takes start
  // with the last values rather than a blank form.
  useEffect(() => {
    let cancelled = false;
    if (!appointment?.id) { setLoading(false); return; }
    vitalsApi.get(appointment.id)
      .then((v) => {
        if (cancelled || !v) return;
        setExisting(v);
        if (v.bpSystolic != null)  setBpSystolic(String(v.bpSystolic));
        if (v.bpDiastolic != null) setBpDiastolic(String(v.bpDiastolic));
        if (v.spo2 != null)        setSpo2(String(v.spo2));
        if (v.heartRate != null)   setHeartRate(String(v.heartRate));
        if (v.weightKg != null)    setWeightKg(String(v.weightKg));
        if (v.heightCm != null)    setHeightCm(String(v.heightCm));
        if (v.bloodGlucose != null) setBloodGlucose(String(v.bloodGlucose));
        if (v.temperature != null) setTemperature(String(v.temperature));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointment?.id]);

  const handleSave = async () => {
    if (!appointment?.id) {
      notify("Missing appointment — cannot save vitals", "error");
      return;
    }
    // Soft validation — server clamps too, but catching here gives the
    // nurse an immediate, intent-aware error instead of a generic 400.
    const sys = bpSystolic === "" ? null : Number(bpSystolic);
    const dia = bpDiastolic === "" ? null : Number(bpDiastolic);
    const sp = spo2 === "" ? null : Number(spo2);
    const hr = heartRate === "" ? null : Number(heartRate);
    const wt = weightKg === "" ? null : Number(weightKg);
    const ht = heightCm === "" ? null : Number(heightCm);
    const bg = bloodGlucose === "" ? null : Number(bloodGlucose);
    const temp = temperature === "" ? null : Number(temperature);

    if (sys != null && (sys < 40 || sys > 300)) {
      notify("Systolic BP must be between 40 and 300 mmHg", "warning"); return;
    }
    if (dia != null && (dia < 20 || dia > 200)) {
      notify("Diastolic BP must be between 20 and 200 mmHg", "warning"); return;
    }
    if (sp != null && (sp < 0 || sp > 100)) {
      notify("SpO₂ must be between 0 and 100%", "warning"); return;
    }
    if (hr != null && (hr < 20 || hr > 300)) {
      notify("Heart rate must be between 20 and 300 bpm", "warning"); return;
    }
    if (wt != null && (wt <= 0 || wt > 999)) {
      notify("Weight must be between 0 and 999 kg", "warning"); return;
    }
    if (ht != null && (ht < 10 || ht > 300)) {
      notify("Height must be between 10 and 300 cm", "warning"); return;
    }
    if (bg != null && (bg < 20 || bg > 1000)) {
      notify("Blood glucose must be between 20 and 1000 mg/dL", "warning"); return;
    }
    if (temp != null && (temp < 90 || temp > 110)) {
      notify("Temperature must be between 90 and 110 °F", "warning"); return;
    }
    if (sys == null && dia == null && sp == null && hr == null && wt == null && ht == null && bg == null && temp == null) {
      notify("Enter at least one vital sign before saving", "warning"); return;
    }

    setSaving(true);
    try {
      const saved = await vitalsApi.upsert(appointment.id, {
        bpSystolic: sys, bpDiastolic: dia, spo2: sp, heartRate: hr, weightKg: wt, heightCm: ht, bloodGlucose: bg, temperature: temp,
      });
      notify(existing ? "Vitals updated" : "Vitals recorded", "success");
      onSaved?.(saved);
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to save vitals", "error");
    } finally {
      setSaving(false);
    }
  };

  const patientFullName =
    appointment?.patientName ||
    [appointment?.patientFirstName, appointment?.patientLastName].filter(Boolean).join(" ");
  const uhidDisplay = fmtId(appointment?.patientUhid) || appointment?.patientUhid || "—";
  const bloodGroup = appointment?.patientBloodGroup || "—";
  const ageDisplay = computeAge(appointment?.patientDob) || "—";
  const sexDisplay = appointment?.patientGender || "—";

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
    sbp: bpSystolic,
    dbp: bpDiastolic,
    weight: weightKg,
    height: heightCm,
    temperature: temperature,
    spo2: spo2,
    pulse: heartRate,
  }, zemaRules);

  return (
    <div className="zu-modal-overlay">
      <div className="zu-modal is-lg">

        {/* Header */}
        <div className="zu-modal-header">
          <div className="zu-modal-header-row">
            <div className="hms-cmodal__title-block">
              <div className="hms-icon-tile is-rose">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="hms-cmodal__title">Record Vitals</h2>
                <p className="hms-cmodal__subtitle">
                  Triage before the doctor starts the consultation
                </p>
              </div>
            </div>
            {existing && (
              <span className="hms-vitals-recheck">
                RE-CHECK
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="zu-modal-body">
          {loading ? (
            <CenterLoader text="Loading vitals…" />
          ) : (
            <div className="hms-form-stack">

              {/* Patient info card */}
              <div className="hms-vitals-patient-card">
                <PreField icon={<UserIcon className="w-3.5 h-3.5" />} label="Patient" value={patientFullName || "—"} />
                <PreField icon={<IdCard className="w-3.5 h-3.5" />} label="UHID" value={uhidDisplay} mono />
                <PreField icon={<Clock className="w-3.5 h-3.5" />} label="Age" value={ageDisplay} />
                <PreField icon={<UserIcon className="w-3.5 h-3.5" />} label="Sex" value={sexDisplay} />
                <PreField icon={<Droplet className="w-3.5 h-3.5" />} label="Blood group" value={bloodGroup} />
              </div>

              {/* BP — split into two paired inputs */}
              <VitalField
                icon={<HeartPulse className="w-3.5 h-3.5" />}
                label="Blood Pressure"
                hint="Systolic / Diastolic, mmHg"
              >
                <div className="hms-vitals-row">
                  <input
                    type="number" min="40" max="300" step="1" inputMode="numeric"
                    value={bpSystolic}
                    onChange={e => setBpSystolic(e.target.value)}
                    placeholder="120"
                    className="hms-vitals-input"
                  />
                  <span className="hms-vitals-row__sep">/</span>
                  <input
                    type="number" min="20" max="200" step="1" inputMode="numeric"
                    value={bpDiastolic}
                    onChange={e => setBpDiastolic(e.target.value)}
                    placeholder="80"
                    className="hms-vitals-input"
                  />
                  <span className="hms-vitals-row__unit">mmHg</span>
                </div>
              </VitalField>

              <div className="hms-vitals-grid">
                <VitalField
                  icon={<Wind className="w-3.5 h-3.5" />}
                  label="SpO₂"
                  hint="Oxygen saturation"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="0" max="100" step="1" inputMode="numeric"
                      value={spo2}
                      onChange={e => setSpo2(e.target.value)}
                      placeholder="98"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">%</span>
                  </div>
                </VitalField>

                <VitalField
                  icon={<HeartPulse className="w-3.5 h-3.5" />}
                  label="Heart Rate"
                  hint="Pulse, bpm"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="20" max="300" step="1" inputMode="numeric"
                      value={heartRate}
                      onChange={e => setHeartRate(e.target.value)}
                      placeholder="72"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">bpm</span>
                  </div>
                </VitalField>

                <VitalField
                  icon={<Thermometer className="w-3.5 h-3.5" />}
                  label="Temperature"
                  hint="Body temp, °F"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="90" max="110" step="0.1" inputMode="decimal"
                      value={temperature}
                      onChange={e => setTemperature(e.target.value)}
                      placeholder="98.6"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">°F</span>
                  </div>
                </VitalField>

                <VitalField
                  icon={<Scale className="w-3.5 h-3.5" />}
                  label="Weight"
                  hint="Body weight"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="0" max="999" step="0.1" inputMode="decimal"
                      value={weightKg}
                      onChange={e => setWeightKg(e.target.value)}
                      placeholder="68.5"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">kg</span>
                  </div>
                </VitalField>

                <VitalField
                  icon={<Ruler className="w-3.5 h-3.5" />}
                  label="Height"
                  hint="Body height"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="10" max="300" step="1" inputMode="numeric"
                      value={heightCm}
                      onChange={e => setHeightCm(e.target.value)}
                      placeholder="170"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">cm</span>
                  </div>
                </VitalField>

                <VitalField
                  icon={<Activity className="w-3.5 h-3.5" />}
                  label="Blood Glucose"
                  hint="Random/Fasting, mg/dL"
                >
                  <div className="hms-vitals-row">
                    <input
                      type="number" min="20" max="1000" step="1" inputMode="numeric"
                      value={bloodGlucose}
                      onChange={e => setBloodGlucose(e.target.value)}
                      placeholder="100"
                      className="hms-vitals-input"
                    />
                    <span className="hms-vitals-row__unit">mg/dL</span>
                  </div>
                </VitalField>
              </div>


              {existing && (
                <div className="hms-vitals-prev">
                  <Stethoscope className="w-3 h-3" />
                  Previously recorded by{" "}
                  <span className="hms-vitals-prev__strong">
                    {existing.recordedByName || "—"}
                  </span>
                  {existing.updatedAt && (
                    <>
                      ·{" "}
                      <span className="font-mono">
                        {new Date(existing.updatedAt).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="zu-modal-footer">
          <button type="button" onClick={onClose} disabled={saving} className="zu-btn-cancel">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading} className="zu-btn-primary">
            {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
            {existing ? "Update Vitals" : "Save Vitals"}
          </button>
        </div>
      </div>
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

function VitalField({ icon, label, hint, children }) {
  return (
    <div className="hms-vitals-field">
      <div className="hms-vitals-field__head">
        <h3 className="hms-vitals-field__title">
          <span className="hms-vitals-field__title-icon">{icon}</span>
          {label}
        </h3>
        {hint && (
          <span className="hms-vitals-field__hint">
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


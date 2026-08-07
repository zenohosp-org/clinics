import { CenterLoader } from "@/components/ui/Loader";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { admissionApi, recordApi, patientApi } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { fmtId } from "@/utils/idFormat";
import Barcode from "@/components/ui/Barcode";

/**
 * Three-page printable discharge summary for an IPD admission, opened in
 * a new tab right after discharge (or reprinted later from IPDDetailPane).
 * Mirrors PrintConsultation's structure — each page is a fresh sheet via
 * the .print-page CSS utility:
 *
 *   Page 1 — Summary          patient/stay header, diagnoses, treatment
 *                             summary, follow-up plan, doctor sign-off
 *   Page 2 — Medications      every drug prescribed during the stay
 *   Page 3 — Clinical course  consultations, lab results, surgery notes,
 *                             and other recorded events, dated
 *
 * Auto-fires window.print() once data has settled. Failures are
 * non-blocking — a missing patient/record fetch never wipes the page
 * that already loaded.
 */
export default function PrintDischargeSummary() {
  const { admissionId } = useParams();
  const { user } = useAuth();

  const [admission, setAdmission] = useState(null);
  const [records, setRecords] = useState([]);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!admissionId || !user?.hospitalId) return;

    (async () => {
      setLoading(true);
      const adm = await admissionApi.get(admissionId).catch(() => null);
      if (cancelled) return;
      setAdmission(adm);

      if (adm?.patientId) {
        const [recs, pat] = await Promise.all([
          recordApi.list(adm.patientId, user.hospitalId, admissionId).catch(() => []),
          patientApi.get(adm.patientId, user.hospitalId).catch(() => null),
        ]);
        if (cancelled) return;
        setRecords(Array.isArray(recs) ? recs : []);
        setPatient(pat);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [admissionId, user?.hospitalId]);

  // Trigger the system print dialog once content is on-screen. The tiny
  // delay lets the browser finish layout so the barcode / tables aren't
  // half-rendered when print fires.
  useEffect(() => {
    if (loading) return;
    if (!admission) return;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* user cancelled */ }
    }, 400);
    return () => clearTimeout(t);
  }, [loading, admission]);

  if (loading) {
    return <CenterLoader text="Loading discharge summary…" />;
  }
  if (!admission) {
    return (
      <div className="hms-print-error">
        Could not load this admission.
      </div>
    );
  }

  const rxItems = records
    .filter((r) => r.historyType === "PRESCRIPTION")
    .flatMap((r) => (Array.isArray(r.prescriptionItems) ? r.prescriptionItems : []));

  const courseRecords = records.filter((r) => r.historyType !== "PRESCRIPTION");
  const courseByType = groupBy(courseRecords, (r) => r.historyType || "OTHERS");

  return (
    <div className="hms-print">
      {/* PAGE 1 — Summary */}
      <article className="print-page">
        <Letterhead hospital={user?.hospitalName} />
        <SheetTitle title="Discharge Summary" subtitle="Page 1 of 3" />
        <StayHeader admission={admission} patient={patient} />

        <PrintSection title="Diagnosis">
          <p><strong>On admission:</strong> {admission.primaryDiagnosis || dash}</p>
          <p style={{ marginTop: 4 }}><strong>On discharge:</strong> {admission.dischargeDiagnosis || admission.primaryDiagnosis || dash}</p>
        </PrintSection>

        {admission.chiefComplaint && (
          <PrintSection title="Chief Complaint">
            <p>{admission.chiefComplaint}</p>
          </PrintSection>
        )}

        <PrintSection title="Treatment Summary / Notes">
          <p className="is-pre">{admission.dischargeNote || dash}</p>
        </PrintSection>

        {admission.followUpDate && (
          <PrintSection title="Follow-up Plan">
            <p>
              {new Date(admission.followUpDate).toLocaleDateString("en-IN", {
                day: "2-digit", month: "long", year: "numeric",
              })}
              {admission.admittingDoctorName && ` · with Dr. ${admission.admittingDoctorName}`}
            </p>
          </PrintSection>
        )}

        <div className="hms-print-discharge-barcode">
          <Barcode value={admission.admissionNumber} height={40} />
        </div>

        <SignatureFooter doctorName={admission.admittingDoctorName} role="Discharging Doctor" />
      </article>

      {/* PAGE 2 — Medications */}
      <article className="print-page">
        <Letterhead hospital={user?.hospitalName} />
        <SheetTitle title="Medications Administered" subtitle="Page 2 of 3" />
        <StayHeader admission={admission} patient={patient} compact />

        {rxItems.length === 0 ? (
          <p className="hms-print-rx-empty">No medications were prescribed during this stay.</p>
        ) : (
          <table className="hms-print-rx-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Drug</th>
                <th>Dose</th>
                <th>Frequency</th>
                <th>Days</th>
                <th className="is-right">Qty</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              {rxItems.map((d, i) => (
                <tr key={d.id} className="print-page-break-inside-avoid">
                  <td className="is-num">{i + 1}</td>
                  <td>
                    <div className="hms-print-rx-table__drug">{d.drugName || dash}</div>
                    {(d.drugStrength || d.drugForm) && (
                      <div className="hms-print-rx-table__strength">
                        {[d.drugStrength, d.drugForm].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {d.instructions && (
                      <div className="hms-print-rx-table__inst">{d.instructions}</div>
                    )}
                  </td>
                  <td>{d.dose || dash}</td>
                  <td>{d.frequency || dash}</td>
                  <td className="is-num">{d.durationDays != null ? `${d.durationDays}` : dash}</td>
                  <td className="is-right">{d.quantity ?? dash}</td>
                  <td>{d.route || dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SignatureFooter doctorName={admission.admittingDoctorName} role="Discharging Doctor" />
      </article>

      {/* PAGE 3 — Clinical course */}
      <article className="print-page">
        <Letterhead hospital={user?.hospitalName} />
        <SheetTitle title="Clinical Course" subtitle="Page 3 of 3" />
        <StayHeader admission={admission} patient={patient} compact />

        {courseRecords.length === 0 ? (
          <p className="hms-print-lab-empty">No additional clinical events were recorded during this stay.</p>
        ) : (
          <div className="hms-print-lab-groups">
            {Object.entries(courseByType).map(([type, rows]) => (
              <div key={type} className="print-page-break-inside-avoid">
                <h3 className="hms-print-lab-group__title">{historyTypeLabel(type)}</h3>
                <ul className="hms-print-lab-group__list">
                  {rows.map((r) => (
                    <li key={r.id} className="hms-print-lab-row">
                      <div className="hms-print-lab-row__head">
                        <span className="hms-print-lab-row__test">
                          {[r.createdBy?.firstName, r.createdBy?.lastName].filter(Boolean).join(" ") || historyTypeLabel(type)}
                        </span>
                        <span className="hms-print-lab-row__date">
                          {r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          }) : ""}
                        </span>
                      </div>
                      {r.description && <div className="hms-print-lab-row__notes is-pre">{r.description}</div>}
                      {r.instructions && <div className="hms-print-lab-row__notes is-pre">{r.instructions}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <PrintFooter />
      </article>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

const dash = "—";

const HISTORY_TYPE_LABELS = {
  PROGRESS_NOTE: "Progress Notes",
  CONSULTATION: "Consultations",
  LAB_RESULT: "Lab Results",
  SURGERY: "Surgery / Procedures",
  DIAGNOSIS: "Diagnoses",
  OTHERS: "Other Events",
};

function historyTypeLabel(type) {
  return HISTORY_TYPE_LABELS[type] || "Other Events";
}

function groupBy(arr, keyFn) {
  return (arr || []).reduce((acc, item) => {
    const k = keyFn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 150 ? `${age} yr` : null;
}

function lengthOfStay(admissionDate, dischargeDate) {
  if (!admissionDate || !dischargeDate) return null;
  const a = new Date(admissionDate);
  const d = new Date(dischargeDate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(d.getTime())) return null;
  const days = Math.max(1, Math.round((d - a) / 86400000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function fmtDateTime(value) {
  if (!value) return dash;
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  });
}

function Letterhead({ hospital }) {
  return (
    <header className="hms-print-letterhead">
      <div className="hms-print-letterhead__row">
        <div>
          <h1 className="hms-print-letterhead__hosp">{hospital || "Hospital Name"}</h1>
        </div>
        <p className="hms-print-letterhead__printed">
          Printed {new Date().toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </p>
      </div>
    </header>
  );
}

function SheetTitle({ title, subtitle }) {
  return (
    <div className="hms-print-sheet-title">
      <h2 className="hms-print-sheet-title__title">{title}</h2>
      <span className="hms-print-sheet-title__sub">{subtitle}</span>
    </div>
  );
}

function StayHeader({ admission, patient, compact }) {
  const uhid = fmtId(admission.patientUhid) || admission.patientUhid || dash;
  return (
    <section className={`hms-print-pheader ${compact ? "is-compact" : ""}`}>
      <div className="hms-print-pheader__grid">
        <Field label="Patient" value={admission.patientName || dash} />
        <Field label="UHID" value={uhid} mono />
        <Field label="Age / Sex" value={[ageFrom(patient?.dob), patient?.gender].filter(Boolean).join(" / ") || dash} />
        <Field label="Admitting Doctor" value={admission.admittingDoctorName ? `Dr. ${admission.admittingDoctorName}` : dash} />
        <Field label="Admitted" value={fmtDateTime(admission.admissionDate)} />
        <Field label="Discharged" value={fmtDateTime(admission.actualDischargeDate || admission.dischargedAt)} />
        <Field label="Length of Stay" value={lengthOfStay(admission.admissionDate, admission.actualDischargeDate || admission.dischargedAt) || dash} />
        <Field label="Admission No." value={fmtId(admission.admissionNumber) || dash} mono />
      </div>
    </section>
  );
}

function Field({ label, value, mono }) {
  return (
    <div className="hms-print-field">
      <div className="hms-print-field__label">{label}</div>
      <div className={`hms-print-field__value ${mono ? "is-mono" : ""}`}>{value}</div>
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <section className="hms-print-section print-page-break-inside-avoid">
      <h3 className="hms-print-section__title">{title}</h3>
      <div className="hms-print-section__body">{children}</div>
    </section>
  );
}

function SignatureFooter({ doctorName, role }) {
  return (
    <footer className="hms-print-signature">
      <div>
        <div className="hms-print-signature__line" />
        <p className="hms-print-signature__name">{doctorName ? `Dr. ${doctorName}` : "Doctor"}</p>
        <p className="hms-print-signature__role">{role || "Signature"}</p>
      </div>
    </footer>
  );
}

function PrintFooter() {
  return (
    <footer className="hms-print-footer">
      This discharge summary is a hospital-side record of the admission. Carry it to all follow-up visits.
    </footer>
  );
}

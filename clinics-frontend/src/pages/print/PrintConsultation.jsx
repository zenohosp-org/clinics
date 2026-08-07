import { CenterLoader } from "@/components/ui/Loader";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  appointmentsApi, recordApi, radiologyApi, externalResultsApi,
} from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { fmtId } from "@/utils/idFormat";

/**
 * Three-page printable summary of a single appointment, opened in a
 * new tab by the dashboard's "Print Consultation" action. Each page
 * starts on a fresh sheet via the .print-page CSS utility:
 *
 *   Page 1 — Consultation     chief complaint, doctor's notes,
 *                             instructions, follow-up
 *   Page 2 — Prescription     drug table; sections suppressed when
 *                             no items
 *   Page 3 — Lab Results      external entries the hospital captured
 *                             plus internal radiology orders the
 *                             hospital raised; suppressed when none
 *
 * The page auto-fires window.print() once data has settled. The user
 * closes the tab after printing — no in-app "back" affordance because
 * this is a print sheet, not navigation.
 *
 * Failures are non-blocking: each fetch returns null/[] silently on
 * error so a missing radiology endpoint never wipes the consult page.
 */
export default function PrintConsultation() {
  const { appointmentId } = useParams();
  const { user } = useAuth();

  const [appointment, setAppointment] = useState(null);
  const [record, setRecord] = useState(null);
  const [radiology, setRadiology] = useState([]);
  const [externalResults, setExternalResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!appointmentId || !user?.hospitalId) return;

    (async () => {
      setLoading(true);
      const [appt, recs] = await Promise.all([
        appointmentsApi.getById(appointmentId).catch(() => null),
        recordApi.getByAppointment(appointmentId, user.hospitalId).catch(() => []),
        // Radiology fetch needs the patient id; we do it after we have
        // the appointment in a follow-up, but the Promise.all already
        // resolves what it can in parallel.
        Promise.resolve([]),
        Promise.resolve([]),
      ]);
      if (cancelled) return;
      setAppointment(appt);
      // Records list is newest-first; the print sheet shows the most
      // recent one as canonical (typically the one created by Mark
      // Complete; older entries are amendments).
      setRecord(Array.isArray(recs) && recs.length > 0 ? recs[0] : null);

      // Radiology stays patient-scoped (internal feature, ordered per
      // patient). External results are appointment-scoped so the print
      // sheet reflects only what was captured during this visit.
      const patientId = appt?.patientId;
      if (patientId) {
        const [r, e] = await Promise.all([
          radiologyApi.getByPatient(patientId).catch(() => []),
          externalResultsApi.listForAppointment(appointmentId, user.hospitalId).catch(() => []),
        ]);
        if (cancelled) return;
        setRadiology(Array.isArray(r) ? r : []);
        setExternalResults(Array.isArray(e) ? e : []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [appointmentId, user?.hospitalId]);

  // Trigger the system print dialog once content is on-screen. The
  // tiny delay lets the browser finish layout so QR codes / tables
  // aren't half-rendered when print fires.
  useEffect(() => {
    if (loading) return;
    if (!appointment) return;
    const t = setTimeout(() => {
      try { window.print(); } catch { /* user cancelled */ }
    }, 400);
    return () => clearTimeout(t);
  }, [loading, appointment]);

  if (loading) {
    return (
      <CenterLoader text="Loading print preview…" />
    );
  }
  if (!appointment) {
    return (
      <div className="hms-print-error">
        Could not load this appointment.
      </div>
    );
  }

  const { chiefComplaint, notes } = splitDescription(record?.description);
  const rxItems = Array.isArray(record?.prescriptionItems) ? record.prescriptionItems : [];
  const externalsByCategory = groupBy(externalResults, (e) => e.category || "OTHER");

  const hasConsultation = Boolean(chiefComplaint || notes || record?.instructions || record?.nextVisitDate);
  const hasPrescription = rxItems.length > 0;
  const hasInvestigations = externalResults.length > 0 || radiology.length > 0;

  // Print consultation if it has data, or if there's absolutely nothing else to print (fallback)
  const printConsultation = hasConsultation || (!hasPrescription && !hasInvestigations);
  
  let totalPages = 0;
  let consultationPage = 0;
  let prescriptionPage = 0;
  let investigationsPage = 0;
  
  if (printConsultation) consultationPage = ++totalPages;
  if (hasPrescription) prescriptionPage = ++totalPages;
  if (hasInvestigations) investigationsPage = ++totalPages;

  return (
    <div className="hms-print">
      {printConsultation && (
        <article className="print-page">
          <Letterhead hospital={user?.hospitalName} branchName={null} />
          <SheetTitle title="Consultation Summary" subtitle={`Page ${consultationPage} of ${totalPages}`} />
          <PatientHeader appointment={appointment} record={record} />

          <PrintSection title="Chief Complaint">
            <p>{chiefComplaint || dash}</p>
          </PrintSection>

          <PrintSection title="Doctor's Notes">
            <p className="is-pre">{notes || dash}</p>
          </PrintSection>

          {record?.instructions && (
            <PrintSection title="Instructions for Patient">
              <p className="is-pre">{record.instructions}</p>
            </PrintSection>
          )}

          {record?.nextVisitDate && (
            <PrintSection title="Follow-up Visit">
              <p>
                {new Date(record.nextVisitDate).toLocaleString("en-IN", {
                  day: "2-digit", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </PrintSection>
          )}

          <SignatureFooter doctorName={appointment.doctorName} />
        </article>
      )}

      {hasPrescription && (
        <article className="print-page">
          <Letterhead hospital={user?.hospitalName} branchName={null} />
          <SheetTitle title="Prescription" subtitle={`Page ${prescriptionPage} of ${totalPages}`} />
          <PatientHeader appointment={appointment} record={record} compact />

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

          <SignatureFooter doctorName={appointment.doctorName} />
        </article>
      )}

      {hasInvestigations && (
        <article className="print-page">
          <Letterhead hospital={user?.hospitalName} branchName={null} />
          <SheetTitle title="Lab Reports" subtitle={`Page ${investigationsPage} of ${totalPages}`} />
          <PatientHeader appointment={appointment} record={record} compact />

          <div className="hms-print-lab-groups">
            {Object.entries(externalsByCategory).map(([cat, rows]) => (
              <div key={cat} className="print-page-break-inside-avoid">
                <h3 className="hms-print-lab-group__title">
                  {cat} · External
                </h3>
                <ul className="hms-print-lab-group__list">
                  {rows.map((r) => (
                    <li key={r.id} className="hms-print-lab-row">
                      <div className="hms-print-lab-row__head">
                        <span className="hms-print-lab-row__test">{r.testName}</span>
                        <span className="hms-print-lab-row__date">
                          {r.testDate || ""}
                        </span>
                      </div>
                      <div className="hms-print-lab-row__src">
                        {r.sourceName}
                        {r.sourceDoctorName && <span> · {r.sourceDoctorName}</span>}
                      </div>
                      {(r.resultValue || r.resultUnit) && (
                        <div className="hms-print-lab-row__result">
                          <span className="hms-print-lab-row__value">{r.resultValue || dash}</span>
                          {r.resultUnit && <span className="hms-print-lab-row__unit">{r.resultUnit}</span>}
                          {r.referenceRange && (
                            <span className="hms-print-lab-row__ref">
                              ref: {r.referenceRange}
                            </span>
                          )}
                          {r.isAbnormal && (
                            <span className="hms-print-lab-row__abn">⚠ Abnormal</span>
                          )}
                        </div>
                      )}
                      {r.notes && <div className="hms-print-lab-row__notes">{r.notes}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {radiology.length > 0 && (
              <div className="print-page-break-inside-avoid">
                <h3 className="hms-print-lab-group__title">
                  Internal Radiology
                </h3>
                <table className="hms-print-rad-table">
                  <thead>
                    <tr>
                      <th>Investigation</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radiology.map((o) => (
                      <tr key={o.id}>
                        <td>
                          {o.serviceName || o.investigationName || dash}
                          {o.modality && <span className="hms-print-rad-table__mod">({o.modality})</span>}
                        </td>
                        <td className="is-sm">{(o.status || dash).toString().replace(/_/g, " ")}</td>
                        <td className="is-sm">
                          {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-IN") : dash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <PrintFooter />
        </article>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

const dash = "—";

function splitDescription(description) {
  if (!description) return { chiefComplaint: "", notes: "" };
  const text = description.replace(/\r\n/g, "\n");
  const ccMatch = /^Chief complaint:\s*([^\n]+)\n\n?/i.exec(text);
  if (ccMatch) {
    return {
      chiefComplaint: ccMatch[1].trim(),
      notes: text.slice(ccMatch[0].length).trim(),
    };
  }
  return { chiefComplaint: "", notes: text.trim() };
}

function groupBy(arr, keyFn) {
  return (arr || []).reduce((acc, item) => {
    const k = keyFn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

function Letterhead({ hospital, branchName }) {
  return (
    <header className="hms-print-letterhead">
      <div className="hms-print-letterhead__row">
        <div>
          <h1 className="hms-print-letterhead__hosp">{hospital || "Hospital Name"}</h1>
          {branchName && <p className="hms-print-letterhead__branch">{branchName}</p>}
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

function PatientHeader({ appointment, record, compact }) {
  const uhid = fmtId(appointment.patientUhid) || appointment.patientUhid || dash;
  const time = appointment.apptTime ? appointment.apptTime.substring(0, 5) : "";
  const date = appointment.apptDate;
  return (
    <section className={`hms-print-pheader ${compact ? "is-compact" : ""}`}>
      <div className="hms-print-pheader__grid">
        <Field label="Patient" value={appointment.patientName || dash} />
        <Field label="UHID" value={uhid} mono />
        <Field label="Age / Sex" value={[ageFrom(appointment.patientDob), appointment.patientGender].filter(Boolean).join(" / ") || dash} />
        <Field label="Doctor" value={appointment.doctorName ? `Dr. ${appointment.doctorName}` : dash} />
        <Field label="Visit" value={[date, time].filter(Boolean).join(" · ") || dash} />
        <Field label="MRN" value={fmtId(record?.mrn) || record?.mrn || dash} mono />
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
      <h3 className="hms-print-section__title">
        {title}
      </h3>
      <div className="hms-print-section__body">{children}</div>
    </section>
  );
}

function SignatureFooter({ doctorName }) {
  return (
    <footer className="hms-print-signature">
      <div>
        <div className="hms-print-signature__line" />
        <p className="hms-print-signature__name">{doctorName ? `Dr. ${doctorName}` : "Doctor"}</p>
        <p className="hms-print-signature__role">Signature</p>
      </div>
    </footer>
  );
}

function PrintFooter() {
  return (
    <footer className="hms-print-footer">
      Lab reports printed here are a hospital-side record. Original lab/clinic reports remain authoritative.
    </footer>
  );
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

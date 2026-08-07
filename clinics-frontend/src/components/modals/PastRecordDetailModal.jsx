import { useEffect } from "react";
import { fmtId } from "@/utils/idFormat";
import {
  Stethoscope, Pill, ClipboardList, FileText, ListChecks, CalendarClock,
  IdCard, Clock, X, User as UserIcon, Beaker, Scissors, FlaskConical,
  Tag, BedDouble, NotebookPen, MessageCircle, Activity, Brain, ClipboardCheck,
} from "lucide-react";

/**
 * Read-only detail view for a single PatientRecord — opened from the
 * "Previous Records" rail in the Consultation View when the doctor
 * clicks one of the past-visit cards. The pastRecords list already
 * carries every field we display (description, instructions,
 * prescriptionItems, createdBy, nextVisitDate, mrn, etc.), so this
 * modal is purely a renderer — no fetch, instant open.
 *
 * Sections are conditional:
 *   • Chief complaint    — only if description begins with the
 *                          "Chief complaint:" prefix the consultation
 *                          modal writes.
 *   • Doctor's notes     — remainder of description after the chief
 *                          complaint line; renders only if non-empty.
 *   • Instructions       — only if instructions text is present.
 *   • Prescription table — only if at least one prescriptionItem row.
 *   • Next visit         — only if a follow-up was scheduled.
 *
 * No edit / delete affordances. Past records are immutable; a
 * correction is a new record, never an in-place mutation. That
 * posture matches the rest of the records feature.
 */
export default function PastRecordDetailModal({ record, onClose }) {
  // ESC-to-close keeps the modal feeling native; the back-button
  // muscle memory is exit, not navigate. Cleanup runs on unmount.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!record) return null;

  const { chiefComplaint, notes } = splitDescription(record.description);
  const items = Array.isArray(record.prescriptionItems) ? record.prescriptionItems : [];
  const hasSoap = !!(record.soapSubjective || record.soapObjective || record.soapAssessment || record.soapPlan);
  const meta = TYPE_META[record.historyType] || TYPE_META.OTHER;
  const Icon = meta.icon;
  const creator = record.createdBy
    ? [record.createdBy.firstName, record.createdBy.lastName].filter(Boolean).join(" ").trim()
    : null;
  const creatorRole = record.createdBy?.role;
  const createdAt = record.createdAt ? new Date(record.createdAt) : null;
  const nextVisit = record.nextVisitDate ? new Date(record.nextVisitDate) : null;

  return (
    <div
      className="zu-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="zu-modal is-xl">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="zu-modal-header">
          <div className="hms-cmodal__title-block">
            <div className={`hms-icon-tile ${meta.iconCls}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="hms-cmodal__title">
                  {meta.label}
                </h2>
                {items.length > 0 && record.historyType !== "PRESCRIPTION" && (
                  <span className="hms-badge is-success is-soft">
                    + {items.length} Rx
                  </span>
                )}
              </div>
              <p className="hms-cmodal__subtitle">
                Past record — read-only
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="zu-modal-close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta strip — type, date, MRN, visit linkage */}
        <div className="hms-cmodal__meta is-4col">
          <MetaField icon={<Clock className="w-3.5 h-3.5" />} label="Date" value={createdAt ? createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
          <MetaField icon={<IdCard className="w-3.5 h-3.5" />} label="MRN" value={fmtId(record.mrn) || record.mrn || "—"} mono />
          <MetaField icon={<Tag className="w-3.5 h-3.5" />} label="Type" value={meta.label} />
          <MetaField
            icon={record.admissionId ? <BedDouble className="w-3.5 h-3.5" /> : <Stethoscope className="w-3.5 h-3.5" />}
            label={record.admissionId ? "Admission" : "Visit"}
            value={record.admissionNumber || (record.admissionId ? "IPD" : "OPD")}
            mono={!!record.admissionNumber}
          />
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="zu-modal-body">
          <div className="hms-form-stack">

            {record.historyType === "PROGRESS_NOTE" && hasSoap && (
              <>
                {record.soapSubjective && (
                  <Section icon={<MessageCircle className="w-3.5 h-3.5" />} title="Subjective" tone="blue">
                    <p className="hms-past-prose">{record.soapSubjective}</p>
                  </Section>
                )}
                {record.soapObjective && (
                  <Section icon={<Activity className="w-3.5 h-3.5" />} title="Objective">
                    <p className="hms-past-prose">{record.soapObjective}</p>
                  </Section>
                )}
                {record.soapAssessment && (
                  <Section icon={<Brain className="w-3.5 h-3.5" />} title="Assessment" tone="amber">
                    <p className="hms-past-prose">{record.soapAssessment}</p>
                  </Section>
                )}
                {record.soapPlan && (
                  <Section icon={<ClipboardCheck className="w-3.5 h-3.5" />} title="Plan" tone="emerald">
                    <p className="hms-past-prose">{record.soapPlan}</p>
                  </Section>
                )}
              </>
            )}

            {chiefComplaint && (
              <Section icon={<ClipboardList className="w-3.5 h-3.5" />} title="Chief complaint" tone="blue">
                <p className="hms-past-prose is-strong">
                  {chiefComplaint}
                </p>
              </Section>
            )}

            {notes && (
              <Section icon={<FileText className="w-3.5 h-3.5" />} title="Doctor's notes">
                <p className="hms-past-prose">
                  {notes}
                </p>
              </Section>
            )}

            {record.instructions && (
              <Section icon={<ListChecks className="w-3.5 h-3.5" />} title="Instructions for patient" tone="amber">
                <p className="hms-past-prose">
                  {record.instructions}
                </p>
              </Section>
            )}

            {items.length > 0 && (
              <Section
                icon={<Pill className="w-3.5 h-3.5" />}
                title={`Prescription · ${items.length} drug${items.length === 1 ? "" : "s"}`}
                tone="emerald"
              >
                <div className="hms-past-rx-table">
                  <div className="hms-past-rx-head">
                    <div>Drug</div>
                    <div>Dose</div>
                    <div>Frequency</div>
                    <div className="hms-past-rx-head__days">Days</div>
                    <div className="hms-past-rx-head__qty-right">Qty</div>
                    <div>Route</div>
                  </div>
                  <div>
                    {items.map((d) => (
                      <PrescriptionRow key={d.id} drug={d} />
                    ))}
                  </div>
                </div>
              </Section>
            )}

            {nextVisit && (
              <Section icon={<CalendarClock className="w-3.5 h-3.5" />} title="Follow-up scheduled">
                <p className="hms-past-prose is-strong">
                  {nextVisit.toLocaleString("en-IN", {
                    day: "2-digit", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </Section>
            )}

            {/* Empty state for records that somehow carry no body content */}
            {!chiefComplaint && !notes && !record.instructions && items.length === 0 && !nextVisit && !hasSoap && (
              <div className="hms-past-empty">
                <p className="m-0">
                  This record has no clinical content to display.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="zu-modal-footer is-split">
          <div className="hms-past-footer-meta">
            {record.attendingDoctorName ? (
              <>
                <span className="hms-past-footer-meta__strong">Dr. {record.attendingDoctorName}</span>
                {creator && creator !== record.attendingDoctorName && (
                  <span className="hms-past-footer-meta__role"> · Entered by {creator}</span>
                )}
              </>
            ) : creator ? (
              <>
                Recorded by <span className="hms-past-footer-meta__strong">{creator}</span>
                {creatorRole && <span className="hms-past-footer-meta__role"> · {creatorRole}</span>}
              </>
            ) : (
              <span>Recorded</span>
            )}
          </div>
          <button type="button" onClick={onClose} className="zu-btn-cancel">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────

/**
 * The consultation modal writes "Chief complaint: …" as the first line
 * of description, then a blank line, then the doctor's narrative. We
 * split on that prefix so the modal can render each in its own section.
 * Old records without the prefix fall through with chief complaint
 * empty and the whole description as notes — non-destructive.
 */
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

const TYPE_META = {
  PROGRESS_NOTE: {
    label:   "Progress Note",
    icon:    NotebookPen,
    iconCls: "is-info",
  },
  CONSULTATION: {
    label:   "Consultation",
    icon:    Stethoscope,
    iconCls: "is-info",
  },
  PRESCRIPTION: {
    label:   "Prescription",
    icon:    Pill,
    iconCls: "is-success",
  },
  LAB_RESULT: {
    label:   "Lab Result",
    icon:    Beaker,
    iconCls: "is-warning",
  },
  SURGERY: {
    label:   "Surgery",
    icon:    Scissors,
    iconCls: "is-rose",
  },
  DIAGNOSIS: {
    label:   "Diagnosis",
    icon:    FlaskConical,
    iconCls: "is-violet",
  },
  OTHER: {
    label:   "Record",
    icon:    FileText,
    iconCls: "",
  },
  OTHERS: {
    label:   "Record",
    icon:    FileText,
    iconCls: "",
  },
};

function MetaField({ icon, label, value, mono }) {
  return (
    <div className="hms-meta-field">
      <div className="hms-meta-field__label">
        {label}
      </div>
      <p className={`hms-meta-field__value${mono ? " is-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ icon, title, tone, children }) {
  const toneCls =
    tone === "blue"    ? "is-blue" :
    tone === "emerald" ? "is-emerald" :
    tone === "amber"   ? "is-amber" :
    "";
  return (
    <section className="hms-past-section">
      <h3 className={`hms-past-section__title ${toneCls}`.trim()}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function PrescriptionRow({ drug }) {
  const strengthLine = [drug.drugStrength, drug.drugForm].filter(Boolean).join(" · ");
  return (
    <div className="hms-past-rx-row">
      <div className="hms-past-rx-row__drug">
        <p className="hms-past-rx-row__name">
          {drug.drugName || "—"}
        </p>
        {strengthLine && (
          <p className="hms-past-rx-row__strength">
            {strengthLine}
            {drug.drugGeneric && <span> · {drug.drugGeneric}</span>}
          </p>
        )}
        {drug.instructions && (
          <p className="hms-past-rx-row__instr">
            {drug.instructions}
          </p>
        )}
      </div>
      <div className="hms-past-rx-row__cell">{drug.dose || "—"}</div>
      <div className="hms-past-rx-row__cell">{drug.frequency || "—"}</div>
      <div className="hms-past-rx-row__cell is-muted is-tabular hms-past-rx-row__days">
        {drug.durationDays != null ? `${drug.durationDays}d` : "—"}
      </div>
      <div className="hms-past-rx-row__cell is-strong is-tabular hms-past-rx-row__qty-right">
        {drug.quantity ?? "—"}
      </div>
      <div className="hms-past-rx-row__cell is-muted">{drug.route || "—"}</div>
    </div>
  );
}

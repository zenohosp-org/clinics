import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { externalResultsApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { FlaskConical, Plus, CheckCircle2, X, AlertTriangle, Trash2, Beaker, ScanLine, Microscope, FileText, Calendar, User as UserIcon, IdCard, CalendarClock,  } from "lucide-react";

/**
 * Front-desk / nursing-staff modal for capturing external lab,
 * radiology, and pathology reports the patient brings in from outside
 * clinics. Mirrors the VitalsModal pattern in placement (action menu
 * on CHECKED_IN / IN_PROGRESS rows) and intent (triage before the
 * doctor takes over) so the doctor's consultation page lands with
 * everything pre-filled.
 *
 * UX optimised for speed:
 *   - Quick-pick buttons for the 12 most common Indian OPD tests
 *     auto-fill category + test name in one click.
 *   - Multi-entry: one staging list, "Add to list" → next entry,
 *     "Save All" persists the batch sequentially. Patients walking
 *     in with a stack of 3-5 reports get captured in under 90 sec.
 *   - Pre-filled today's date + the appointment's hospital_id /
 *     patient_id so the form never re-asks what we already know.
 *
 * No file upload here — Phase 2 deliberately keeps it text-only;
 * scan-and-attach lands with the storage PR. The endpoint already
 * accepts a nullable attachment_id so this UX upgrades cleanly.
 */

// Top-of-modal quick picks. Tuned to the most common outside-clinic
// tests in Indian OPD: blood work, basic imaging, urine. Anything not
// here is "+ Custom" (free text). Keeping this list short on purpose
// — speed-of-use beats completeness.
const QUICK_PICKS = [
  { test: "CBC",              category: "LAB",        icon: Beaker },
  { test: "LFT",              category: "LAB",        icon: Beaker },
  { test: "KFT",              category: "LAB",        icon: Beaker },
  { test: "Lipid Profile",    category: "LAB",        icon: Beaker },
  { test: "Blood Sugar",      category: "LAB",        icon: Beaker },
  { test: "HbA1c",            category: "LAB",        icon: Beaker },
  { test: "TSH",              category: "LAB",        icon: Beaker },
  { test: "Urine Routine",    category: "LAB",        icon: Beaker },
  { test: "X-Ray Chest",      category: "RADIOLOGY",  icon: ScanLine },
  { test: "USG Abdomen",      category: "RADIOLOGY",  icon: ScanLine },
  { test: "ECG",              category: "RADIOLOGY",  icon: ScanLine },
  { test: "Biopsy",           category: "PATHOLOGY",  icon: Microscope },
];

const CATEGORIES = [
  { value: "LAB",        label: "Lab"        },
  { value: "RADIOLOGY",  label: "Radiology"  },
  { value: "PATHOLOGY",  label: "Pathology"  },
  { value: "OTHER",      label: "Other"      },
];

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function blankForm() {
  return {
    category: "LAB",
    testName: "",
    sourceName: "",
    testDate: todayIso(),
    notes: "",
    isAbnormal: false,
  };
}

export default function ExternalResultsModal({ appointment, onClose, onSaved }) {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [form, setForm] = useState(blankForm());
  const [staged, setStaged] = useState([]);          // entries waiting to be saved
  const [saving, setSaving] = useState(false);

  // Move focus into Test name after a quick-pick. Small thing but it
  // saves the operator's hand from leaving the keyboard for the next
  // entry.
  const testNameRef = useRef(null);
  useEffect(() => { if (form.testName) testNameRef.current?.focus(); }, [form.testName]);

  const patientFullName =
    appointment?.patientName ||
    [appointment?.patientFirstName, appointment?.patientLastName].filter(Boolean).join(" ");
  const uhidDisplay = fmtId(appointment?.patientUhid) || appointment?.patientUhid || "—";
  const apptTime = appointment?.apptTime ? appointment.apptTime.substring(0, 5) : "";
  const dateTimeText = [appointment?.apptDate, apptTime].filter(Boolean).join(" · ");

  const handleQuickPick = (pick) => {
    setForm((f) => ({
      ...f,
      category: pick.category,
      testName: pick.test,
    }));
  };

  const handleAddToList = () => {
    if (!form.testName.trim()) {
      notify("Test name is required", "warning"); return;
    }
    if (!form.sourceName.trim()) {
      notify("Lab / clinic name is required", "warning"); return;
    }
    if (!form.testDate) {
      notify("Test date is required", "warning"); return;
    }
    setStaged((s) => [...s, { ...form, _key: Date.now() + Math.random() }]);
    setForm(blankForm());
  };

  const handleRemoveStaged = (key) => {
    setStaged((s) => s.filter((it) => it._key !== key));
  };

  const handleSaveAll = async () => {
    // Auto-stage the current form if it has content but the operator
    // hit Save All without clicking Add to list first. Common shortcut.
    const queue = [...staged];
    if (form.testName.trim() && form.sourceName.trim() && form.testDate) {
      queue.push({ ...form, _key: "current" });
    }
    if (queue.length === 0) {
      notify("Add at least one report to save", "warning"); return;
    }

    setSaving(true);
    let savedCount = 0;
    let failure = null;
    for (const entry of queue) {
      try {
        await externalResultsApi.create({
          hospitalId: user.hospitalId,
          patientId: appointment.patientId,
          recordId: undefined,                       // not tied to a specific record at triage time
          appointmentId: appointment.id,             // visit scope — the consult view & print read by this
          category: entry.category,
          testName: entry.testName.trim(),
          testCode: undefined,
          resultValue: undefined,
          resultUnit: undefined,
          referenceRange: undefined,
          isAbnormal: entry.isAbnormal,
          testDate: entry.testDate,
          sourceName: entry.sourceName.trim(),
          sourceDoctorName: undefined,
          attachmentId: undefined,
          notes: entry.notes?.trim() || undefined,
        });
        savedCount += 1;
      } catch (err) {
        failure = err?.response?.data?.message || "Save failed";
        break;
      }
    }

    setSaving(false);
    if (failure) {
      notify(
        savedCount > 0
          ? `Saved ${savedCount} / ${queue.length} — ${failure}. Remaining entries kept in the list.`
          : failure,
        "error",
      );
      // Drop the ones that did succeed; keep what failed so the operator can retry.
      if (savedCount > 0) {
        setStaged(queue.slice(savedCount).filter((it) => it._key !== "current"));
        if (queue[queue.length - 1]._key === "current" && savedCount < queue.length) {
          // Restore the form if its row was the failed one.
          setForm(queue[savedCount]);
        }
      }
      return;
    }
    notify(`Saved ${savedCount} report${savedCount === 1 ? "" : "s"}`, "success");
    onSaved?.(savedCount);
  };

  return (
    <div className="zu-modal-overlay">
      <div className="zu-modal is-xl">

        {/* Header */}
        <div className="zu-modal-header">
          <div className="zu-modal-header-row">
            <div className="hms-cmodal__title-block">
              <div className="hms-icon-tile is-violet">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="hms-cmodal__title">Add Lab Reports</h2>
                <p className="hms-cmodal__subtitle">
                  Outside-lab results the patient walked in with
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="zu-modal-close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Patient strip */}
          <div className="hms-cmodal__meta is-3col">
            <PreField icon={<UserIcon className="w-3.5 h-3.5" />} label="Patient" value={patientFullName || "—"} />
            <PreField icon={<IdCard className="w-3.5 h-3.5" />} label="UHID" value={uhidDisplay} mono />
            <PreField icon={<CalendarClock className="w-3.5 h-3.5" />} label="Appointment" value={dateTimeText || "—"} />
          </div>
        </div>

        {/* Body */}
        <div className="zu-modal-body">
          <div className="hms-form-stack">

            {/* Quick picks */}
            <div className="hms-clinical-section">
              <div className="hms-clinical-section__head">
                <h3 className="hms-clinical-section__title">
                  Quick pick
                </h3>
                <p className="hms-clinical-section__hint">
                  Tap to pre-fill — you can still edit
                </p>
              </div>
              <div className="hms-ext-quickpicks">
                {QUICK_PICKS.map((p) => {
                  const on = form.testName === p.test && form.category === p.category;
                  const toneCls =
                    p.category === "LAB" ? "is-lab" :
                    p.category === "RADIOLOGY" ? "is-radiology" : "is-pathology";
                  return (
                    <button
                      key={p.test}
                      type="button"
                      onClick={() => handleQuickPick(p)}
                      className={`hms-ext-quickpick${on ? " is-on" : ""}`}
                    >
                      <span className={`hms-ext-quickpick__icon ${toneCls}`}>
                        <p.icon className="w-4 h-4" />
                      </span>
                      <span className="hms-ext-quickpick__label">{p.test}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entry form */}
            <div className="hms-ext-form-card">
              <div className="hms-form-grid is-3col">
                <Field label="Category">
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="hms-ext-select"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Test name" required className="is-span-2">
                  <input
                    ref={testNameRef}
                    value={form.testName}
                    onChange={(e) => setForm((f) => ({ ...f, testName: e.target.value }))}
                    placeholder="e.g. CBC, X-Ray Chest, Biopsy"
                    className="hms-ext-input"
                  />
                </Field>
              </div>

              <div className="hms-form-grid is-2col">
                <Field label="Lab / clinic name" required>
                  <input
                    value={form.sourceName}
                    onChange={(e) => setForm((f) => ({ ...f, sourceName: e.target.value }))}
                    placeholder="e.g. Apollo Lab, Coimbatore"
                    className="hms-ext-input"
                  />
                </Field>

                <Field label="Test date" required icon={<Calendar className="w-3.5 h-3.5" />}>
                  <input
                    type="date"
                    value={form.testDate}
                    onChange={(e) => setForm((f) => ({ ...f, testDate: e.target.value }))}
                    className="hms-ext-input"
                  />
                </Field>
              </div>

              <Field label="Summary" hint="One line headline the doctor should see">
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. WBC 12,500 — high, bacterial picture"
                  className="hms-ext-textarea"
                />
              </Field>

              <div className="hms-ext-abnormal-row">
                <label className="hms-ext-abnormal-label">
                  <input
                    type="checkbox"
                    checked={form.isAbnormal}
                    onChange={(e) => setForm((f) => ({ ...f, isAbnormal: e.target.checked }))}
                    className="hms-ext-abnormal-label__cb"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`hms-ext-abnormal-label__icon${form.isAbnormal ? " is-on" : ""}`}>
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    Flag as abnormal
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleAddToList}
                  className="hms-ext-add-btn"
                >
                  <Plus className="w-4 h-4" /> Add to list
                </button>
              </div>
            </div>

            {/* Staging list */}
            {staged.length > 0 && (
              <div className="hms-clinical-section">
                <div className="hms-ext-pending-head">
                  <h3 className="hms-clinical-section__title">
                    Pending
                  </h3>
                  <span className="hms-ext-pending-count">
                    {staged.length} ready to save
                  </span>
                </div>
                <div className="hms-ext-pending-list">
                  {staged.map((entry) => (
                    <StagedRow key={entry._key} entry={entry} onRemove={() => handleRemoveStaged(entry._key)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="zu-modal-footer is-split">
          <p className="hms-ext-footer-hint">
            <FileText className="inline w-3 h-3 mr-1" />
            Reports stay on the patient chart forever — corrections add a new row, never overwrite.
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="zu-btn-cancel">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="zu-btn-primary"
            >
              {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? "Saving…" : `Save All${staged.length > 0 ? ` (${staged.length}${form.testName.trim() && form.sourceName.trim() ? "+1" : ""})` : ""}`}
            </button>
          </div>
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

function Field({ label, hint, icon, required, className = "", children }) {
  return (
    <div className={`hms-ext-field ${className}`.trim()}>
      <div className="hms-ext-field__head">
        <label className="hms-ext-field__label">
          {icon}{label}
          {required && <span className="hms-ext-field__label-req">*</span>}
        </label>
        {hint && <span className="hms-ext-field__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StagedRow({ entry, onRemove }) {
  const catCls =
    entry.category === "LAB" ? "is-lab" :
    entry.category === "RADIOLOGY" ? "is-radiology" :
    entry.category === "PATHOLOGY" ? "is-pathology" :
    "is-other";
  return (
    <div className="hms-ext-row">
      <div className="hms-ext-row__body">
        <div className="hms-ext-row__chips">
          <span className={`hms-ext-cat-badge ${catCls}`}>
            {entry.category}
          </span>
          <span className="hms-ext-row__name">{entry.testName}</span>
          {entry.isAbnormal && (
            <span className="hms-ext-abnormal-badge">
              <AlertTriangle className="w-3 h-3" /> Abnormal
            </span>
          )}
        </div>
        <p className="hms-ext-row__sub">
          {entry.sourceName} <span className="hms-ext-row__sub-sep">·</span> {entry.testDate}
        </p>
        {entry.notes && (
          <p className="hms-ext-row__notes">{entry.notes}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="hms-ext-row__remove"
        aria-label="Remove from list"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

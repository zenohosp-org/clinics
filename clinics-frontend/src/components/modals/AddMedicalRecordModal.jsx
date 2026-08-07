import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { recordApi, doctorsApi } from "@/utils/api";
import { FileText, CheckCircle2 } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { FormGroup, Textarea } from "@/components/ui";

const RECORD_TYPE_OPTIONS = [
  "PROGRESS_NOTE",
  "CONSULTATION",
  "PRESCRIPTION",
  "LAB_RESULT",
  "SURGERY",
  "DIAGNOSIS",
  "OTHERS",
].map((t) => ({ value: t, label: t.replace("_", " ") }));

/**
 * Modal for adding a non-prescription record (consultation, lab result,
 * surgery note, diagnosis, other) to a patient's IPD timeline. Replaces
 * the old cramped inline form so the type/date/notes fields have room to
 * breathe. Picking "Prescription" hands off to WritePrescriptionModal,
 * since that record type needs structured drug lines instead of free text.
 *
 * Props:
 *   patient — { id, firstName, lastName, uhid }
 *   admissionId / admissionNumber — IPD context the record is scoped to
 *   onClose — close handler
 *   onSaved — called with the created RecordDto + { historyType, description }
 *   onSwitchToPrescription — called instead of saving when "Prescription" is picked
 */
export default function AddMedicalRecordModal({
  patient, admissionId, admissionNumber, onClose, onSaved, onSwitchToPrescription,
}) {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [historyType, setHistoryType] = useState("PROGRESS_NOTE");
  const [description, setDescription] = useState("");
  const [soap, setSoap] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [attendingDoctorId, setAttendingDoctorId] = useState(null);

  useEffect(() => {
    doctorsApi.list(user.hospitalId).then((list) => {
      setDoctors(list ?? []);
      if (user.role === "doctor") setAttendingDoctorId(user.id);
    }).catch(() => {});
  }, [user.hospitalId, user.id, user.role]);

  const doctorOptions = doctors.map((d) => ({
    value: d.userId,
    label: `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(" ")}${d.specialization ? ` · ${d.specialization}` : ""}`,
  }));

  const handleTypeChange = (v) => {
    if (v === "PRESCRIPTION") {
      onSwitchToPrescription?.();
      return;
    }
    setHistoryType(v);
  };

  const isProgressNote = historyType === "PROGRESS_NOTE";

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (isProgressNote) {
      const hasSoap = Object.values(soap).some((v) => v.trim());
      if (!hasSoap) {
        notify("Add at least one SOAP section (Subjective, Objective, Assessment, or Plan)", "warning");
        return;
      }
    } else if (!description.trim()) {
      notify("Add notes or a description for this record", "warning");
      return;
    }
    if (!attendingDoctorId) {
      notify("Select the attending doctor", "warning");
      return;
    }
    setSaving(true);
    try {
      const saved = await recordApi.create({
        patientId: patient.id,
        hospitalId: user.hospitalId,
        historyType,
        description: isProgressNote ? "" : description,
        ...(isProgressNote && {
          soapSubjective: soap.subjective.trim() || undefined,
          soapObjective: soap.objective.trim() || undefined,
          soapAssessment: soap.assessment.trim() || undefined,
          soapPlan: soap.plan.trim() || undefined,
        }),
        admissionId,
        admissionNumber,
        attendingDoctorId: attendingDoctorId || undefined,
      });
      notify("Record added", "success");
      onSaved?.(saved, { historyType, description, soap: isProgressNote ? soap : undefined });
    } catch {
      notify("Failed to add record", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zu-modal-overlay">
      <div className="zu-modal is-md">

        <div className="zu-modal-header">
          <div className="zu-modal-header-row">
            <div className="hms-cmodal__title-block">
              <div className="hms-icon-tile is-info">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="hms-cmodal__title">New Medical Record</h2>
                <p className="hms-cmodal__subtitle">
                  {patient ? `${patient.firstName} ${patient.lastName ?? ""} · ${patient.uhid ?? ""}` : ""}
                  {admissionId && <span className="hms-badge is-violet is-soft ml-2">IPD</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="zu-modal-body">
          <div className="hms-form-stack">
            <FormGroup label="Type">
              <SearchableSelect
                value={historyType}
                onChange={handleTypeChange}
                options={RECORD_TYPE_OPTIONS}
                clearable={false}
                searchable={false}
              />
            </FormGroup>

            <FormGroup label={<span>Attending doctor <span className="text-danger">*</span></span>}>
              <SearchableSelect
                value={attendingDoctorId}
                onChange={setAttendingDoctorId}
                options={doctorOptions}
                placeholder="Select doctor…"
                clearable={false}
              />
            </FormGroup>

            {isProgressNote ? (
              <>
                <FormGroup label="Subjective">
                  <Textarea
                    rows={3}
                    placeholder="Patient-reported symptoms, history…"
                    value={soap.subjective}
                    onChange={(e) => setSoap((s) => ({ ...s, subjective: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Objective">
                  <Textarea
                    rows={3}
                    placeholder="Vitals, exam findings, test results…"
                    value={soap.objective}
                    onChange={(e) => setSoap((s) => ({ ...s, objective: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Assessment">
                  <Textarea
                    rows={3}
                    placeholder="Diagnosis, clinical impression…"
                    value={soap.assessment}
                    onChange={(e) => setSoap((s) => ({ ...s, assessment: e.target.value }))}
                  />
                </FormGroup>
                <FormGroup label="Plan">
                  <Textarea
                    rows={3}
                    placeholder="Treatment plan, next steps…"
                    value={soap.plan}
                    onChange={(e) => setSoap((s) => ({ ...s, plan: e.target.value }))}
                  />
                </FormGroup>
              </>
            ) : (
              <FormGroup
                label={
                  <span>
                    Notes / description <span className="text-danger">*</span>
                  </span>
                }
              >
                <Textarea
                  rows={6}
                  placeholder="Enter notes or description…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </FormGroup>
            )}
          </div>
        </form>

        <div className="zu-modal-footer">
          <button type="button" onClick={onClose} className="zu-btn-cancel">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="zu-btn-primary">
            {saving ? <Spinner className="w-4 h-4 zu-spinner" /> : <CheckCircle2 className="w-4 h-4" />}
            Save record
          </button>
        </div>
      </div>
    </div>
  );
}

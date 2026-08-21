import { useEffect, useState } from "react";
import { useNotification } from "@/context/NotificationContext";
import { Button, FormGroup, Input, Modal, Textarea } from "@/components/ui";

const todayIso = () => new Date().toISOString().slice(0, 10);

const EMPTY_CUSTOM_FORM = {
  vaccineName: "",
  doseNumber: "",
  scheduledDate: todayIso(),
  administeredNow: true,
  administeredDate: todayIso(),
  batchNumber: "",
  notes: "",
};

/**
 * One modal, two modes:
 *   - mode="administer": mark an existing scheduled dose (record) as given —
 *     just administeredDate/batchNumber/notes.
 *   - mode="custom": log a dose that isn't on the standard schedule (or
 *     back-fill a vaccine given before this record existed).
 *
 * Callers own the data (useVaccinations hook) — this component only
 * collects input and calls onAdminister/onAddCustom, which already know how
 * to talk to the API and reload the list.
 */
function VaccineDoseModal({ isOpen, mode, record, onClose, onAdminister, onAddCustom }) {
  const { notify } = useNotification();
  const [saving, setSaving] = useState(false);
  const [administerForm, setAdministerForm] = useState({
    administeredDate: todayIso(),
    batchNumber: "",
    notes: "",
  });
  const [customForm, setCustomForm] = useState(EMPTY_CUSTOM_FORM);

  useEffect(() => {
    if (!isOpen) return;
    setAdministerForm({ administeredDate: todayIso(), batchNumber: "", notes: "" });
    setCustomForm(EMPTY_CUSTOM_FORM);
  }, [isOpen, record]);

  if (!isOpen) return null;

  const isAdminister = mode === "administer";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isAdminister) {
        await onAdminister(record.id, administerForm);
        notify(`${record.vaccineName} marked as given`, "success");
      } else {
        if (!customForm.vaccineName.trim()) {
          notify("Vaccine name is required", "error");
          setSaving(false);
          return;
        }
        await onAddCustom({
          vaccineName: customForm.vaccineName.trim(),
          doseNumber: customForm.doseNumber ? Number(customForm.doseNumber) : null,
          scheduledDate: customForm.administeredNow ? customForm.administeredDate : customForm.scheduledDate,
          administeredDate: customForm.administeredNow ? customForm.administeredDate : null,
          batchNumber: customForm.batchNumber || null,
          notes: customForm.notes || null,
        });
        notify("Vaccine record added", "success");
      }
      onClose();
    } catch {
      notify("Failed to save vaccination record", "error");
    } finally {
      setSaving(false);
    }
  };

  const formId = "vaccine-dose-form";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAdminister ? `Record dose — ${record?.vaccineName}` : "Log a vaccine"}
      size="sm"
      footer={
        <>
          <Button variant="cancel" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={saving}>
            {isAdminister ? "Mark as given" : "Save"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isAdminister ? (
          <>
            {record?.doseNumber && (
              <p className="hms-pat-tab-head__sub" style={{ margin: 0 }}>Dose {record.doseNumber}</p>
            )}
            <FormGroup label="Date given">
              <Input
                type="date"
                value={administerForm.administeredDate}
                onChange={(e) => setAdministerForm((p) => ({ ...p, administeredDate: e.target.value }))}
                required
              />
            </FormGroup>
            <FormGroup label="Batch number">
              <Input
                value={administerForm.batchNumber}
                onChange={(e) => setAdministerForm((p) => ({ ...p, batchNumber: e.target.value }))}
                placeholder="Optional"
              />
            </FormGroup>
            <FormGroup label="Notes">
              <Textarea
                value={administerForm.notes}
                onChange={(e) => setAdministerForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Reaction, site, anything worth noting"
                rows={2}
              />
            </FormGroup>
          </>
        ) : (
          <>
            <FormGroup label="Vaccine name">
              <Input
                value={customForm.vaccineName}
                onChange={(e) => setCustomForm((p) => ({ ...p, vaccineName: e.target.value }))}
                placeholder="e.g. Influenza"
                required
              />
            </FormGroup>
            <FormGroup label="Dose number">
              <Input
                type="number"
                min="1"
                value={customForm.doseNumber}
                onChange={(e) => setCustomForm((p) => ({ ...p, doseNumber: e.target.value }))}
                placeholder="Optional"
              />
            </FormGroup>
            <div className="hms-svc-active-row">
              <div>
                <p className="hms-svc-active-row__title">Already given</p>
                <p className="hms-svc-active-row__description">Off — logs it as a scheduled/upcoming dose instead</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={customForm.administeredNow}
                onClick={() => setCustomForm((p) => ({ ...p, administeredNow: !p.administeredNow }))}
                className={`hms-toggle ${customForm.administeredNow ? "is-on" : ""}`}
              >
                <span className="hms-toggle__handle" />
              </button>
            </div>
            <FormGroup label={customForm.administeredNow ? "Date given" : "Scheduled date"}>
              <Input
                type="date"
                value={customForm.administeredNow ? customForm.administeredDate : customForm.scheduledDate}
                onChange={(e) =>
                  setCustomForm((p) => ({
                    ...p,
                    [customForm.administeredNow ? "administeredDate" : "scheduledDate"]: e.target.value,
                  }))
                }
                required
              />
            </FormGroup>
            {customForm.administeredNow && (
              <FormGroup label="Batch number">
                <Input
                  value={customForm.batchNumber}
                  onChange={(e) => setCustomForm((p) => ({ ...p, batchNumber: e.target.value }))}
                  placeholder="Optional"
                />
              </FormGroup>
            )}
            <FormGroup label="Notes">
              <Textarea
                value={customForm.notes}
                onChange={(e) => setCustomForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </FormGroup>
          </>
        )}
      </form>
    </Modal>
  );
}

export default VaccineDoseModal;

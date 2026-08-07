import { useEffect, useState } from "react";
import { Button, FormGroup, Input, Modal, Textarea } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { bioMedicalWasteApi } from "@/utils/api";
import { useNotification } from "@/context/NotificationContext";

const EMPTY_FORM = {
  logDate: new Date().toISOString().slice(0, 10),
  categoryCode: "",
  generationPointCode: "",
  weightKg: "",
  bagCount: "",
  notes: "",
};

export default function AddWasteLogModal({ isOpen, onClose, hospitalId, log, onSuccess }) {
  const { notify } = useNotification();
  const [categories, setCategories] = useState([]);
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !hospitalId) return;
    Promise.all([
      bioMedicalWasteApi.listLookups(hospitalId, "WASTE_CATEGORY").catch(() => []),
      bioMedicalWasteApi.listLookups(hospitalId, "GENERATION_POINT").catch(() => []),
    ]).then(([cats, pts]) => {
      setCategories(cats);
      setPoints(pts);
    });
  }, [isOpen, hospitalId]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      log
        ? {
            logDate: log.logDate || new Date().toISOString().slice(0, 10),
            categoryCode: log.categoryCode || "",
            generationPointCode: log.generationPointCode || "",
            weightKg: log.weightKg != null ? String(log.weightKg) : "",
            bagCount: log.bagCount != null ? String(log.bagCount) : "",
            notes: log.notes || "",
          }
        : EMPTY_FORM
    );
  }, [isOpen, log]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.categoryCode) return notify("Waste category is required", "error");
    if (!form.generationPointCode) return notify("Generation point is required", "error");
    if (!form.weightKg || Number(form.weightKg) <= 0) return notify("Weight must be greater than zero", "error");

    setSaving(true);
    try {
      const payload = {
        logDate: form.logDate || null,
        categoryCode: form.categoryCode,
        generationPointCode: form.generationPointCode,
        weightKg: Number(form.weightKg),
        bagCount: form.bagCount ? Number(form.bagCount) : null,
        notes: form.notes || null,
      };
      if (log) {
        await bioMedicalWasteApi.updateLog(log.id, hospitalId, payload);
        notify("Entry updated", "success");
      } else {
        await bioMedicalWasteApi.createLog(hospitalId, payload);
        notify("Entry logged", "success");
      }
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to save entry", "error");
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="cancel" type="button" onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="submit" form="bmw-log-form" loading={saving}>
        {log ? "Save changes" : "Add entry"}
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={log ? "Edit waste entry" : "Add waste entry"} size="md" footer={footer}>
      <form id="bmw-log-form" onSubmit={submit}>
        <div className="hms-bb-modal-grid">
          <FormGroup label="Date">
            <Input type="date" value={form.logDate} onChange={(e) => set("logDate", e.target.value)} />
          </FormGroup>
          <FormGroup label="Waste category *">
            <SearchableSelect
              value={form.categoryCode}
              onChange={(v) => set("categoryCode", v)}
              options={categories.map((c) => ({ value: c.code, label: c.label }))}
              placeholder="Select category"
            />
          </FormGroup>
          <FormGroup label="Generation point *">
            <SearchableSelect
              value={form.generationPointCode}
              onChange={(v) => set("generationPointCode", v)}
              options={points.map((p) => ({ value: p.code, label: p.label }))}
              placeholder="Select department"
            />
          </FormGroup>
          <FormGroup label="Weight (kg) *">
            <Input type="number" min="0" step="0.01" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
          </FormGroup>
          <FormGroup label="Bag count">
            <Input type="number" min="0" value={form.bagCount} onChange={(e) => set("bagCount", e.target.value)} />
          </FormGroup>
          <div className="hms-bb-modal-grid__full">
            <FormGroup label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </FormGroup>
          </div>
        </div>
      </form>
    </Modal>
  );
}

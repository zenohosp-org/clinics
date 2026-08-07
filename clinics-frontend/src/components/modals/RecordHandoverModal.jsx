import { useEffect, useMemo, useState } from "react";
import { Button, FormGroup, Input, Modal, Textarea } from "@/components/ui";
import { bioMedicalWasteApi } from "@/utils/api";
import { useNotification } from "@/context/NotificationContext";

const EMPTY_FORM = {
  handoverDate: new Date().toISOString().slice(0, 10),
  vendorName: "",
  manifestNumber: "",
  vehicleNumber: "",
  receivedByName: "",
  costAmount: "",
  invoiceNumber: "",
  notes: "",
};

export default function RecordHandoverModal({ isOpen, onClose, hospitalId, onSuccess }) {
  const { notify } = useNotification();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !hospitalId) return;
    setForm(EMPTY_FORM);
    setSelected(new Set());
    setLoading(true);
    bioMedicalWasteApi
      .listLogs(hospitalId, { pending: true })
      .then(setPending)
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }, [isOpen, hospitalId]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = pending.length > 0 && selected.size === pending.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pending.map((p) => p.id)));

  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of pending) {
      if (!map.has(entry.categoryCode)) map.set(entry.categoryCode, { label: entry.categoryLabel, entries: [] });
      map.get(entry.categoryCode).entries.push(entry);
    }
    return Array.from(map.values());
  }, [pending]);

  const selectedTotal = useMemo(
    () => pending.filter((p) => selected.has(p.id)).reduce((sum, e) => sum + Number(e.weightKg || 0), 0),
    [pending, selected]
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vendorName.trim()) return notify("Vendor / CTF name is required", "error");
    if (selected.size === 0) return notify("Select at least one pending entry", "error");
    setSaving(true);
    try {
      await bioMedicalWasteApi.createHandover(hospitalId, {
        handoverDate: form.handoverDate || null,
        vendorName: form.vendorName.trim(),
        manifestNumber: form.manifestNumber || null,
        vehicleNumber: form.vehicleNumber || null,
        receivedByName: form.receivedByName || null,
        costAmount: form.costAmount ? Number(form.costAmount) : null,
        invoiceNumber: form.invoiceNumber || null,
        notes: form.notes || null,
        logIds: Array.from(selected),
      });
      notify("Handover recorded", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to record handover", "error");
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="cancel" type="button" onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="submit" form="bmw-handover-form" loading={saving} disabled={selected.size === 0}>
        Record handover{selected.size > 0 ? ` (${selected.size})` : ""}
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record handover to vendor" size="lg" footer={footer}>
      <form id="bmw-handover-form" onSubmit={submit}>
        <div className="hms-bb-modal-grid">
          <FormGroup label="Handover date">
            <Input type="date" value={form.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} />
          </FormGroup>
          <FormGroup label="Vendor / CTF name *">
            <Input value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} placeholder="Authorized CTF operator" />
          </FormGroup>
          <FormGroup label="Manifest number">
            <Input value={form.manifestNumber} onChange={(e) => set("manifestNumber", e.target.value)} />
          </FormGroup>
          <FormGroup label="Vehicle number">
            <Input value={form.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} />
          </FormGroup>
          <FormGroup label="Received by">
            <Input value={form.receivedByName} onChange={(e) => set("receivedByName", e.target.value)} placeholder="Vendor representative" />
          </FormGroup>
          <FormGroup label="Cost amount (₹)">
            <Input type="number" min="0" step="0.01" value={form.costAmount} onChange={(e) => set("costAmount", e.target.value)} placeholder="Amount payable to vendor" />
          </FormGroup>
          <FormGroup label="Invoice number">
            <Input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="Vendor invoice / receipt #" />
          </FormGroup>
          <div className="hms-bb-modal-grid__full">
            <FormGroup label="Notes">
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </FormGroup>
          </div>

          <div className="hms-bb-modal-grid__full">
            <div className="flex items-center justify-between mb-2">
              <span className="hms-label">Pending entries *</span>
              {pending.length > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  Select all
                </label>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-gray-500">Loading pending entries…</p>
            ) : pending.length === 0 ? (
              <p className="text-sm text-gray-500">No pending entries to hand over.</p>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                {groups.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                      {group.label}
                    </div>
                    {group.entries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                      >
                        <span className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggle(entry.id)} />
                          <span className="text-gray-900">{entry.logDate}</span>
                          <span className="text-gray-500">· {entry.generationPointLabel}</span>
                        </span>
                        <span className="text-gray-700 tabular-nums">{Number(entry.weightKg).toFixed(2)} kg</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {selected.size > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {selected.size} entr{selected.size === 1 ? "y" : "ies"} · {selectedTotal.toFixed(2)} kg total
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

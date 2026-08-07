import { useEffect, useState } from "react";
import { Button, FormGroup, Input, Modal, Textarea } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { bloodBankApi, roomApi } from "@/utils/api";
import { useNotification } from "@/context/NotificationContext";

export default function RegisterBloodUnitModal({ isOpen, onClose, hospitalId, onSuccess }) {
  const { notify } = useNotification();
  const [groups, setGroups] = useState([]);
  const [components, setComponents] = useState([]);
  const [sources, setSources] = useState([]);
  const [donors, setDonors] = useState([]);
  const [storageRooms, setStorageRooms] = useState([]);
  const [form, setForm] = useState({
    bagNumber: "",
    bloodGroupCode: "",
    componentCode: "WHOLE_BLOOD",
    sourceCode: "IN_HOUSE_DONOR",
    donorId: "",
    volumeMl: "",
    collectionDate: new Date().toISOString().slice(0, 10),
    storageLocation: "",
    screeningPassed: false,
    costPrice: "",
    salePrice: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !hospitalId) return;
    Promise.all([
      bloodBankApi.listLookups(hospitalId, "BLOOD_GROUP").catch(() => []),
      bloodBankApi.listLookups(hospitalId, "COMPONENT").catch(() => []),
      bloodBankApi.listLookups(hospitalId, "SOURCE_TYPE").catch(() => []),
      bloodBankApi.listDonors(hospitalId).catch(() => []),
      roomApi.list(hospitalId).catch(() => []),
      bloodBankApi.getNextBagNumber(hospitalId).catch(() => ""),
    ]).then(([g, c, s, d, rooms, nextBag]) => {
      setGroups(g);
      setComponents(c);
      setSources(s);
      setDonors(d);
      setStorageRooms(
        (rooms || []).filter((r) => r.roomType === "BLOOD_BANK")
      );
      if (nextBag) setForm((p) => ({ ...p, bagNumber: nextBag }));
    });
  }, [isOpen, hospitalId]);

  // Default volume from component metadata if available
  useEffect(() => {
    if (!form.componentCode || form.volumeMl) return;
    const comp = components.find((c) => c.code === form.componentCode);
    if (comp && comp.metadata) {
      try {
        const meta = JSON.parse(comp.metadata);
        if (meta.defaultVolumeMl) setForm((p) => ({ ...p, volumeMl: meta.defaultVolumeMl }));
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.componentCode, components]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const isExternal = form.sourceCode === "EXTERNAL_PURCHASE";

  // Donor must match the selected blood group — a donor's bag carries the
  // donor's group, so cross-group registration would be a data integrity bug.
  // Deferred donors (isEligible === false) are excluded — they're hard-blocked
  // from supplying new units (positive TTI, repeat deferral, etc.).
  const eligibleDonors = donors.filter(
    (d) => d.isEligible !== false && (!form.bloodGroupCode || d.bloodGroupCode === form.bloodGroupCode)
  );

  // If the currently-picked donor no longer matches the group, clear it so
  // the user re-picks intentionally instead of submitting a mismatched bag.
  useEffect(() => {
    if (!form.donorId) return;
    const stillEligible = eligibleDonors.some((d) => d.id === form.donorId);
    if (!stillEligible) setForm((p) => ({ ...p, donorId: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.bloodGroupCode, donors]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.bloodGroupCode) return notify("Blood group is required", "error");
    if (!form.componentCode) return notify("Component is required", "error");
    if (!isExternal && !form.donorId) return notify("Donor is required for in-house bags", "error");
    setSaving(true);
    try {
      await bloodBankApi.registerUnit(hospitalId, {
        bagNumber: form.bagNumber.trim(),
        bloodGroupCode: form.bloodGroupCode,
        componentCode: form.componentCode,
        sourceCode: form.sourceCode,
        donorId: isExternal ? null : form.donorId || null,
        volumeMl: form.volumeMl ? Number(form.volumeMl) : null,
        collectionDate: form.collectionDate || null,
        storageLocation: form.storageLocation || null,
        screeningPassed: !!form.screeningPassed,
        costPrice: form.costPrice ? Number(form.costPrice) : null,
        salePrice: form.salePrice ? Number(form.salePrice) : null,
        notes: form.notes || null,
      });
      notify("Bag registered", "success");
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to register bag", "error");
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="cancel" type="button" onClick={onClose}>Cancel</Button>
      <Button variant="primary" type="submit" form="bb-unit-form" loading={saving}>
        Register bag
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register blood bag" size="md" footer={footer}>
      <form id="bb-unit-form" onSubmit={submit}>
        <div className="hms-bb-modal-grid">
          <FormGroup label="Bag number" hint="Auto-generated">
            <Input value={form.bagNumber} readOnly placeholder="…" />
          </FormGroup>
          <FormGroup label="Source *">
            <SearchableSelect
              value={form.sourceCode}
              onChange={(v) => set("sourceCode", v)}
              options={sources.map((s) => ({ value: s.code, label: s.label }))}
            />
          </FormGroup>
          <FormGroup label="Blood group *">
            <SearchableSelect
              value={form.bloodGroupCode}
              onChange={(v) => set("bloodGroupCode", v)}
              options={groups.map((g) => ({ value: g.code, label: g.label }))}
              placeholder="Select group"
            />
          </FormGroup>
          <FormGroup label="Component *">
            <SearchableSelect
              value={form.componentCode}
              onChange={(v) => set("componentCode", v)}
              options={components.map((c) => ({ value: c.code, label: c.label }))}
            />
          </FormGroup>
          {!isExternal && (
            <div className="hms-bb-modal-grid__full">
              <FormGroup
                label="Donor *"
                hint={
                  form.bloodGroupCode && eligibleDonors.length === 0
                    ? "No donors registered for this blood group. Register one in the Donors tab."
                    : form.bloodGroupCode
                      ? `Showing donors with matching blood group only.`
                      : "Pick a blood group first to filter eligible donors."
                }
              >
                <SearchableSelect
                  value={form.donorId}
                  onChange={(v) => set("donorId", v)}
                  options={eligibleDonors.map((d) => ({
                    value: d.id,
                    label: `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || d.donorCode,
                  }))}
                  placeholder="Search donor"
                />
              </FormGroup>
            </div>
          )}
          <FormGroup label="Volume (ml)">
            <Input type="number" min="0" value={form.volumeMl} onChange={(e) => set("volumeMl", e.target.value)} />
          </FormGroup>
          <FormGroup label="Collection date">
            <Input type="date" value={form.collectionDate} onChange={(e) => set("collectionDate", e.target.value)} />
          </FormGroup>
          <FormGroup
            label="Storage location"
            hint={
              storageRooms.length === 0
                ? "No blood bank rooms configured. Add one in Settings → Infrastructure."
                : undefined
            }
          >
            {storageRooms.length > 0 ? (
              <SearchableSelect
                value={form.storageLocation}
                onChange={(v) => set("storageLocation", v)}
                options={storageRooms.map((r) => ({
                  value: r.roomNumber,
                  label: r.floorName ? `${r.floorName} · ${r.roomNumber}` : r.roomNumber,
                }))}
                placeholder="Select blood bank room"
              />
            ) : (
              <Input
                value={form.storageLocation}
                onChange={(e) => set("storageLocation", e.target.value)}
                placeholder="Refrigerator A, shelf 2"
              />
            )}
          </FormGroup>
          <FormGroup label="Cost price (₹)">
            <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} />
          </FormGroup>
          <FormGroup label="Sale price (₹)">
            <Input type="number" min="0" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
          </FormGroup>
          <FormGroup label="Screening cleared">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.screeningPassed}
                onChange={(e) => set("screeningPassed", e.target.checked)}
              />
              All TTI tests negative
            </label>
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

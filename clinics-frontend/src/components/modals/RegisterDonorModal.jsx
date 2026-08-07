import { useEffect, useState } from "react";
import { Button, FormGroup, Input, Modal, Textarea } from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { bloodBankApi } from "@/utils/api";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import { useNotification } from "@/context/NotificationContext";

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

export default function RegisterDonorModal({ isOpen, onClose, hospitalId, onSuccess }) {
  const { notify } = useNotification();
  const [groups, setGroups] = useState([]);
  const [donorTypes, setDonorTypes] = useState([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    dob: "",
    gender: "",
    bloodGroupCode: "",
    donorTypeCode: "VOLUNTARY",
    address: "",
    aadhaarNumber: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !hospitalId) return;
    Promise.all([
      bloodBankApi.listLookups(hospitalId, "BLOOD_GROUP").catch(() => []),
      bloodBankApi.listLookups(hospitalId, "DONOR_TYPE").catch(() => []),
    ]).then(([g, t]) => {
      setGroups(g);
      setDonorTypes(t);
    });
  }, [isOpen, hospitalId]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.firstName.trim()) return notify("First name is required", "error");
    if (!form.bloodGroupCode) return notify("Blood group is required", "error");
    setSaving(true);
    try {
      await bloodBankApi.registerDonor(hospitalId, form);
      notify("Donor registered", "success");
      onSuccess && onSuccess();
      onClose();
    } catch {
      notify("Failed to register donor", "error");
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="cancel" onClick={onClose} type="button">Cancel</Button>
      <Button variant="primary" type="submit" form="bb-donor-form" loading={saving}>
        Register donor
      </Button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register blood donor" size="md" footer={footer}>
      <form id="bb-donor-form" onSubmit={submit}>
        <div className="hms-bb-modal-grid">
          <FormGroup label="First name *">
            <Input value={form.firstName} onChange={(e) => set("firstName", sanitizeName(e.target.value))} placeholder="Ravi" />
          </FormGroup>
          <FormGroup label="Last name">
            <Input value={form.lastName} onChange={(e) => set("lastName", sanitizeName(e.target.value))} placeholder="Kumar" />
          </FormGroup>
          <FormGroup label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", sanitizePhone(e.target.value))} placeholder="+91 9XXXXXXXXX" />
          </FormGroup>
          <FormGroup label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </FormGroup>
          <FormGroup label="Date of birth">
            <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
          </FormGroup>
          <FormGroup label="Gender">
            <SearchableSelect
              value={form.gender}
              onChange={(v) => set("gender", v)}
              options={GENDERS}
              placeholder="Select gender"
              searchable={false}
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
          <FormGroup label="Donor type *">
            <SearchableSelect
              value={form.donorTypeCode}
              onChange={(v) => set("donorTypeCode", v)}
              options={donorTypes.map((t) => ({ value: t.code, label: t.label }))}
              placeholder="Select type"
            />
          </FormGroup>
          <FormGroup label="Aadhaar number">
            <Input value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value)} placeholder="XXXX XXXX XXXX" />
          </FormGroup>
          <div className="hms-bb-modal-grid__full">
            <FormGroup label="Address">
              <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} />
            </FormGroup>
          </div>
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

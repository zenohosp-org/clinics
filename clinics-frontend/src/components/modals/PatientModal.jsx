import { useState } from "react";
import { validateEmail, validateRequired, validatePhone, sanitizePhone, sanitizeName } from "@/utils/validators";
import StateSelect from "@/components/StateSelect";
import SidePane from "@/components/SidePane";
import SearchableSelect from "@/components/ui/SearchableSelect";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const INSURANCE_SCHEMES = [
  "None",
  "Ayushman Bharat / PMJAY",
  "CGHS",
  "ESI / ESIC",
  "ECHS (Defence)",
  "Private / Corporate",
  "Other",
];

const EMERGENCY_RELATIONS = [
  "Father", "Mother", "Spouse / Partner", "Son", "Daughter",
  "Brother", "Sister", "Guardian", "Friend", "Other",
];

function formatAadhaar(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  return digits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_, a, b, c) => [a, b, c].filter(Boolean).join('-'));
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const MIN_DOB = (() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return d.toISOString().slice(0, 10);
})();

function PatientModal({ patient, onClose, onSave }) {
  const isEdit = !!patient;
  const [paneOpen, setPaneOpen] = useState(true);
  const VALID_GENDERS = ["Male", "Female", "Other"];
  const [form, setForm] = useState({
    firstName: patient?.firstName ?? "",
    lastName: patient?.lastName === "—" ? "" : (patient?.lastName ?? ""),
    dob: patient?.dob ?? "",
    gender: VALID_GENDERS.includes(patient?.gender) ? patient.gender : "",
    phone: patient?.phone ?? "",
    email: patient?.email ?? "",
    bloodGroup: patient?.bloodGroup ?? "",
    address: patient?.address ?? "",
    state: patient?.state ?? "",
    aadhaarNumber: patient?.aadhaarNumber
      ? patient.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1-$2-$3')
      : "",
    maritalStatus: patient?.maritalStatus ?? "",
    occupation: patient?.occupation ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    emergencyContactRelation: patient?.emergencyContactRelation ?? "",
    insuranceScheme: patient?.insuranceScheme ?? "",
    insurancePolicyNumber: patient?.insurancePolicyNumber ?? "",
    allergies: patient?.allergies ?? "",
    chronicConditions: patient?.chronicConditions ?? "",
    referredBy: patient?.referredBy ?? "",
    paymentCategory: patient?.paymentCategory ?? "CASH",
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleClose = () => {
    if (isEdit) {
      setPaneOpen(false);
      setTimeout(onClose, 290);
    } else {
      onClose();
    }
  };

  const validate = () => {
    const e = {};
    const fn = validateRequired(form.firstName, "First name");
    const ln = validateRequired(form.lastName, "Last name");
    const db = validateRequired(form.dob, "Date of birth");
    const ph = validatePhone(form.phone);
    const em = form.email ? validateEmail(form.email) : undefined;
    if (fn) e.firstName = fn;
    if (ln) e.lastName = ln;
    if (db) e.dob = db;
    else if (form.dob > todayISO()) e.dob = "Date of birth cannot be in the future";
    else if (form.dob < MIN_DOB) e.dob = "Please enter a valid date of birth";
    if (!form.gender) e.gender = "Gender is required";
    if (ph) e.phone = ph;
    if (em) e.email = em;
    const aadhaarDigits = form.aadhaarNumber.replace(/\D/g, '');
    if (form.aadhaarNumber && aadhaarDigits.length !== 12) {
      e.aadhaarNumber = "Aadhaar must be exactly 12 digits";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({ ...form, aadhaarNumber: form.aadhaarNumber.replace(/\D/g, '') || null });
      if (isEdit) {
        setPaneOpen(false);
        setTimeout(onClose, 290);
      }
    } finally {
      setSaving(false);
    }
  };

  const formContent = (
    <form id="patientForm" onSubmit={handleSubmit} className="hms-patient-form">

      {/* ── Personal Information ── */}
      <div>
        <p className="hms-form-section-label">Personal Information</p>
        <div className="hms-patient-form__group">
          <div className="hms-form-grid is-2col">
            <div className="hms-form-group">
              <label className="hms-label">First Name *</label>
              <input className="hms-input" value={form.firstName} onChange={(e) => set("firstName", sanitizeName(e.target.value))} />
              {errors.firstName && <p className="hms-field-error">{errors.firstName}</p>}
            </div>
            <div className="hms-form-group">
              <label className="hms-label">Last Name *</label>
              <input className="hms-input" value={form.lastName} onChange={(e) => set("lastName", sanitizeName(e.target.value))} />
              {errors.lastName && <p className="hms-field-error">{errors.lastName}</p>}
            </div>
          </div>
          <div className="hms-form-grid is-2col">
            <div className="hms-form-group">
              <label className="hms-label">Date of Birth *</label>
              <input type="date" className="hms-input" min={MIN_DOB} max={todayISO()} value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              {errors.dob && <p className="hms-field-error">{errors.dob}</p>}
            </div>
            <div className="hms-form-group">
              <label className="hms-label">Gender *</label>
              <SearchableSelect
                options={[
                  { value: "Male", label: "Male" },
                  { value: "Female", label: "Female" },
                  { value: "Other", label: "Other" },
                ]}
                value={form.gender}
                onChange={(v) => set("gender", v)}
                placeholder="Select gender"
                searchable={false}
              />
              {errors.gender && <p className="hms-field-error">{errors.gender}</p>}
            </div>
          </div>
          <div className="hms-form-grid is-2col">
            <div className="hms-form-group">
              <label className="hms-label">Marital Status</label>
              <SearchableSelect
                options={[
                  { value: "Single", label: "Single" },
                  { value: "Married", label: "Married" },
                  { value: "Divorced", label: "Divorced" },
                  { value: "Widowed", label: "Widowed" },
                  { value: "Separated", label: "Separated" },
                ]}
                value={form.maritalStatus}
                onChange={(v) => set("maritalStatus", v)}
                placeholder="Select"
              />
            </div>
            <div className="hms-form-group">
              <label className="hms-label">Occupation</label>
              <input className="hms-input" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} placeholder="e.g. Farmer, Teacher, Business" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact ── */}
      <div>
        <p className="hms-form-section-label">Contact</p>
        <div className="hms-patient-form__group">
          <div className="hms-form-grid is-2col">
            <div className="hms-form-group">
              <label className="hms-label">Phone *</label>
              <input type="tel" className="hms-input" value={form.phone} onChange={(e) => set("phone", sanitizePhone(e.target.value))} placeholder="+91 98765 43210" />
              {errors.phone && <p className="hms-field-error">{errors.phone}</p>}
            </div>
            <div className="hms-form-group">
              <label className="hms-label">Email</label>
              <input type="email" className="hms-input" value={form.email} onChange={(e) => set("email", e.target.value)} />
              {errors.email && <p className="hms-field-error">{errors.email}</p>}
            </div>
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Address</label>
            <textarea rows={2} className="hms-textarea" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <StateSelect value={form.state} onChange={(val) => set("state", val)}
            inputClassName="hms-input"
            labelClassName="hms-label" />
        </div>
      </div>


      {/* ── Medical Identifiers ── */}
      <div>
        <p className="hms-form-section-label">Medical Identifiers</p>
        <div className="hms-form-grid is-2col">
          <div className="hms-form-group">
            <label className="hms-label">Blood Group</label>
            <SearchableSelect
              options={BLOOD_GROUPS.map((g) => ({ value: g, label: g }))}
              value={form.bloodGroup}
              onChange={(v) => set("bloodGroup", v)}
              placeholder="Select"
            />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Aadhaar Number</label>
            <input
              className="hms-input"
              value={form.aadhaarNumber}
              onChange={(e) => set("aadhaarNumber", formatAadhaar(e.target.value))}
              placeholder="XXXX-XXXX-XXXX"
              maxLength={14}
            />
            {errors.aadhaarNumber
              ? <p className="hms-field-error">{errors.aadhaarNumber}</p>
              : <p className="hms-field-hint">Used for Ayushman Bharat / PMJAY identification</p>
            }
          </div>
        </div>
      </div>

      {/* ── Insurance ── */}
      <div>
        <p className="hms-form-section-label">Insurance</p>
        <div className="hms-form-grid is-2col">
          <div className="hms-form-group">
            <label className="hms-label">Scheme</label>
            <SearchableSelect
              options={INSURANCE_SCHEMES.map((s) => ({ value: s, label: s }))}
              value={form.insuranceScheme}
              onChange={(v) => set("insuranceScheme", v)}
              placeholder="Select"
            />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Policy / Card Number</label>
            <input className="hms-input" value={form.insurancePolicyNumber} onChange={(e) => set("insurancePolicyNumber", e.target.value)} placeholder="e.g. PMJAY-XXXXXXXX" />
          </div>
        </div>
      </div>

      {/* ── Clinical History ── */}
      <div>
        <p className="hms-form-section-label">Clinical History</p>
        <div className="hms-patient-form__group">
          <div className="hms-form-group">
            <label className="hms-label">Known Allergies</label>
            <textarea rows={2} className="hms-textarea" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="e.g. Penicillin, Aspirin, Peanuts — leave blank if none" />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Chronic Conditions / Medical History</label>
            <textarea rows={2} className="hms-textarea" value={form.chronicConditions} onChange={(e) => set("chronicConditions", e.target.value)} placeholder="e.g. Diabetes Type 2, Hypertension, Asthma" />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Referred By</label>
            <input className="hms-input" value={form.referredBy} onChange={(e) => set("referredBy", e.target.value)} placeholder="Doctor name or clinic" />
          </div>
        </div>
      </div>

      {/* ── Emergency Contact ── */}
      <div>
        <p className="hms-form-section-label">Emergency Contact</p>
        <div className="hms-form-grid is-3col">
          <div className="hms-form-group">
            <label className="hms-label">Name</label>
            <input className="hms-input" value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", sanitizeName(e.target.value))} placeholder="Full name" />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Phone</label>
            <input type="tel" className="hms-input" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", sanitizePhone(e.target.value))} placeholder="+91 XXXXX XXXXX" />
          </div>
          <div className="hms-form-group">
            <label className="hms-label">Relation</label>
            <SearchableSelect
              options={EMERGENCY_RELATIONS.map((r) => ({ value: r, label: r }))}
              value={form.emergencyContactRelation}
              onChange={(v) => set("emergencyContactRelation", v)}
              placeholder="Select"
            />
          </div>
        </div>
      </div>

    </form>
  );

  if (isEdit) {
    return (
      <SidePane
        isOpen={paneOpen}
        onClose={handleClose}
        title="Edit Patient"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="zu-btn-cancel" onClick={handleClose}>Cancel</button>
            <button type="submit" form="patientForm" className="zu-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Update Patient"}
            </button>
          </div>
        }
      >
        {formContent}
      </SidePane>
    );
  }

  return (
    <div className="zu-modal-overlay">
      <div className="hms-patient-modal">
        <div className="hms-patient-modal__head">
          <h2 className="hms-patient-modal__title">Register New Patient</h2>
          <button onClick={onClose} className="zu-modal-close">✕</button>
        </div>
        <div className="hms-patient-modal__body">
          {formContent}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="zu-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" form="patientForm" className="zu-btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Register Patient"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { PatientModal as default };

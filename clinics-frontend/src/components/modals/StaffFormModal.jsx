import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import {
    staffApi,
    departmentApi,
    designationApi,
    doctorsApi,
    specializationApi,
} from "@/utils/api";
import {
    User as UserIcon,
    ShieldAlert,
    Building2,
    CreditCard,
    Stethoscope,
} from "lucide-react";
import StateSelect from "@/components/StateSelect";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function formatAadhaar(raw) {
    const digits = raw.replace(/\D/g, "").slice(0, 12);
    return digits.replace(/(\d{4})(\d{0,4})(\d{0,4})/, (_, a, b, c) =>
        [a, b, c].filter(Boolean).join("-")
    );
}

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

/** Inline section heading (icon + bold label + bottom rule). Uses the
 *  shared .hms-section-head primitive; `iconTone` flips the icon colour
 *  through .hms-section-head__icon.is-* modifiers. */
function SectionHead({ icon: Icon, iconTone, children }) {
    return (
        <h3 className="hms-section-head">
            {Icon && (
                <span className={`hms-section-head__icon ${iconTone ? `is-${iconTone}` : ""}`}>
                    <Icon size={14} />
                </span>
            )}
            {children}
        </h3>
    );
}

/**
 * Add / Edit staff (also handles add/update of the linked Doctor
 * profile when the role is set to "doctor"). Phase 6b migration —
 * exhaustive form, every input swapped to FormGroup + Input + the
 * legacy SearchableSelect for comboboxes. State management, validators
 * (Aadhaar 12 digits, PAN regex), and the dual-save pipeline
 * (staffApi → doctorsApi) are byte-for-byte unchanged.
 *
 * UX asymmetry preserved exactly:
 *   * editStaff truthy → right-edge Drawer.
 *   * editStaff falsey → centred Modal (size lg ≈ 760px).
 */
export default function StaffFormModal({ onClose, onSaved, editStaff }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [submitting, setSubmitting] = useState(false);
    const [departments, setDepartments] = useState([]);
    const [designations, setDesignations] = useState([]);
    const [specializations, setSpecializations] = useState([]);
    const [doctorProfileId, setDoctorProfileId] = useState(null);

    const [form, setForm] = useState({
        firstName: editStaff?.firstName || "",
        lastName: editStaff?.lastName || "",
        phone: editStaff?.phone || "",
        gender: editStaff?.gender || "MALE",
        state: editStaff?.state || "",
        aadhaarNumber: editStaff?.aadhaarNumber
            ? editStaff.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, "$1-$2-$3")
            : "",
        panNumber: editStaff?.panNumber || "",
        email: editStaff?.email || "",
        workEmail: editStaff?.workEmail || "",
        password: "",
        role: editStaff?.role || "staff",
        employeeCode: editStaff?.employeeCode || "",
        designation: editStaff?.designationName || editStaff?.designation || "",
        dateOfJoining: editStaff?.dateOfJoining || "",
        departmentId: editStaff?.departmentId || "",
        designationId: editStaff?.designationId || "",
        // Doctor-specific fields
        specialization: "",
        qualification: "",
        medicalRegistrationNumber: "",
        registrationCouncil: "",
        consultationFee: "",
    });

    const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

    useEffect(() => {
        if (!user?.hospitalId) return;
        departmentApi
            .list(user.hospitalId, true)
            .then(setDepartments)
            .catch(() => { });
        specializationApi
            .list(user.hospitalId)
            .then(setSpecializations)
            .catch(() => { });
    }, [user?.hospitalId]);

    useEffect(() => {
        if (!user?.hospitalId) return;
        designationApi
            .list(user.hospitalId, true, form.departmentId || null)
            .then(setDesignations)
            .catch(() => { });
    }, [user?.hospitalId, form.departmentId]);

    useEffect(() => {
        if (!editStaff?.id || editStaff?.role !== "doctor") return;
        doctorsApi
            .getByUserId(editStaff.id)
            .then((profile) => {
                setDoctorProfileId(profile.id);
                setForm((f) => ({
                    ...f,
                    specialization: profile.specialization || "",
                    qualification: profile.qualification || "",
                    medicalRegistrationNumber: profile.medicalRegistrationNumber || "",
                    registrationCouncil: profile.registrationCouncil || "",
                    consultationFee:
                        profile.consultationFee != null
                            ? String(profile.consultationFee)
                            : "",
                }));
            })
            .catch(() => { });
    }, [editStaff?.id, editStaff?.role]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user?.hospitalId) return;

        const aadhaarDigits = form.aadhaarNumber.replace(/\D/g, "");
        if (form.aadhaarNumber && aadhaarDigits.length !== 12) {
            notify("Aadhaar number must be exactly 12 digits", "error");
            return;
        }
        const pan = form.panNumber.trim().toUpperCase();
        if (pan && !PAN_REGEX.test(pan)) {
            notify("Invalid PAN format — expected ABCDE1234F", "error");
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                ...form,
                panNumber: pan || null,
                aadhaarNumber: aadhaarDigits || null,
                departmentId: form.departmentId || null,
                designationId: form.designationId || null,
            };

            let savedUser;
            if (editStaff) {
                savedUser = await staffApi.update(editStaff.id, payload);
                notify("Staff profile updated", "success");
            } else {
                savedUser = await staffApi.create({
                    ...payload,
                    hospitalId: user.hospitalId,
                });
                notify("Staff access created successfully", "success");
            }

            if (form.role === "doctor") {
                const doctorPayload = {
                    specialization: form.specialization || null,
                    qualification: form.qualification || null,
                    medicalRegistrationNumber:
                        form.medicalRegistrationNumber || null,
                    registrationCouncil: form.registrationCouncil || null,
                    consultationFee: form.consultationFee
                        ? parseFloat(form.consultationFee)
                        : null,
                };
                const userId = editStaff?.id || savedUser?.id;
                if (doctorProfileId) {
                    await doctorsApi.update(doctorProfileId, doctorPayload);
                } else if (userId) {
                    await doctorsApi.create({
                        ...doctorPayload,
                        userId,
                        hospitalId: user.hospitalId,
                    });
                }
            }

            onSaved();
            onClose();
        } catch (error) {
            notify(error.response?.data?.error || "Operation failed", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const formId = "staff-form";

    const formBody = (
        <form id={formId} onSubmit={handleSubmit} className="hms-form-section-list">
            {/* Personal Information */}
            <div className="hms-form-section">
                <SectionHead icon={UserIcon}>Personal information</SectionHead>
                <div className="hms-form-grid is-2col">
                    <FormGroup label="First name *">
                        <Input
                            required
                            value={form.firstName}
                            onChange={(e) => set("firstName", sanitizeName(e.target.value))}
                            placeholder="e.g. Priya"
                        />
                    </FormGroup>
                    <FormGroup label="Last name *">
                        <Input
                            required
                            value={form.lastName}
                            onChange={(e) => set("lastName", sanitizeName(e.target.value))}
                            placeholder="e.g. Sharma"
                        />
                    </FormGroup>
                    <FormGroup label="Phone number">
                        <Input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => set("phone", sanitizePhone(e.target.value))}
                            placeholder="+91 98765 43210"
                        />
                    </FormGroup>
                    <FormGroup label="Gender *">
                        <SearchableSelect
                            options={[
                                { value: "MALE", label: "Male" },
                                { value: "FEMALE", label: "Female" },
                                { value: "OTHER", label: "Other" },
                            ]}
                            value={form.gender}
                            onChange={(v) => set("gender", v)}
                            placeholder="Select gender"
                            searchable={false}
                        />
                    </FormGroup>
                    <div className="is-span-2">
                        <StateSelect
                            value={form.state}
                            onChange={(val) => set("state", val)}
                            inputClassName="hms-input"
                            labelClassName="hms-label"
                        />
                    </div>
                </div>
            </div>

            {/* Identity Documents */}
            <div className="hms-form-section">
                <SectionHead icon={CreditCard} iconTone="success">
                    Identity documents
                </SectionHead>
                <div className="hms-form-grid is-2col">
                    <FormGroup
                        label="Aadhaar number"
                        hint="Required for NMC / MCI staff verification"
                    >
                        <Input
                            value={form.aadhaarNumber}
                            onChange={(e) =>
                                set("aadhaarNumber", formatAadhaar(e.target.value))
                            }
                            placeholder="XXXX-XXXX-XXXX"
                            maxLength={14}
                        />
                    </FormGroup>
                    <FormGroup
                        label="PAN number"
                        hint="Required for salary disbursement & TDS filing"
                    >
                        <Input
                            value={form.panNumber}
                            onChange={(e) =>
                                set(
                                    "panNumber",
                                    e.target.value.toUpperCase().slice(0, 10)
                                )
                            }
                            placeholder="ABCDE1234F"
                            maxLength={10}
                        />
                    </FormGroup>
                </div>
            </div>

            {/* Account & Access */}
            <div className="hms-form-section">
                <SectionHead icon={ShieldAlert} iconTone="warning">
                    Account & access
                </SectionHead>
                <div className="hms-form-grid is-2col">
                    <FormGroup
                        label="Login email *"
                        hint="Personal address. Used to sign in; only admins and the member themselves can see it."
                        className={editStaff ? "grid-col-full" : ""}
                    >
                        <Input
                            required
                            type="email"
                            value={form.email}
                            disabled={!!editStaff}
                            onChange={(e) => set("email", e.target.value)}
                            placeholder="staff@hospital.com"
                        />
                    </FormGroup>
                    <FormGroup
                        label="Work email"
                        hint="Shown to everyone in the staff directory. Leave blank to show no email."
                        className={editStaff ? "grid-col-full" : ""}
                    >
                        <Input
                            type="email"
                            value={form.workEmail}
                            onChange={(e) => set("workEmail", e.target.value)}
                            placeholder="name@hospital.com"
                        />
                    </FormGroup>
                    {!editStaff && (
                        <FormGroup label="Temporary password *">
                            <Input
                                required
                                type="password"
                                value={form.password}
                                onChange={(e) => set("password", e.target.value)}
                                placeholder="Minimum 6 characters"
                            />
                        </FormGroup>
                    )}
                    <FormGroup
                        label="System role *"
                        hint="Doctors will also appear in the Doctors directory. Hospital Administrators have full access across all modules."
                        className="grid-col-full"
                    >
                        <SearchableSelect
                            options={[
                                { value: "staff", label: "General Staff" },
                                { value: "doctor", label: "Doctor" },
                                { value: "technician", label: "Technician" },
                                {
                                    value: "hospital_admin",
                                    label: "Hospital Administrator",
                                },
                            ]}
                            value={form.role}
                            onChange={(v) => set("role", v)}
                            placeholder="Select role"
                        />
                    </FormGroup>
                </div>
            </div>

            {/* Medical Profile — only when role is doctor */}
            {form.role === "doctor" && (
                <div className="hms-form-section">
                    <SectionHead icon={Stethoscope} iconTone="info">
                        Medical profile
                    </SectionHead>
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Specialisation">
                            <SearchableSelect
                                options={specializations.map((s) => ({
                                    value: s.name,
                                    label: s.name,
                                }))}
                                value={form.specialization}
                                onChange={(v) => set("specialization", v)}
                                placeholder="Select specialisation…"
                            />
                        </FormGroup>
                        <FormGroup label="Qualification">
                            <SearchableSelect
                                options={QUALIFICATION_OPTIONS}
                                value={form.qualification}
                                onChange={(v) => set("qualification", v)}
                                placeholder="Select qualification"
                            />
                        </FormGroup>
                        <FormGroup label="Medical registration no.">
                            <Input
                                value={form.medicalRegistrationNumber}
                                onChange={(e) =>
                                    set("medicalRegistrationNumber", e.target.value)
                                }
                                placeholder="e.g. MH-12345"
                            />
                        </FormGroup>
                        <FormGroup label="Registration council">
                            <Input
                                value={form.registrationCouncil}
                                onChange={(e) =>
                                    set("registrationCouncil", e.target.value)
                                }
                                placeholder="e.g. Maharashtra Medical Council"
                            />
                        </FormGroup>
                        <FormGroup label="Consultation fee (₹)">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.consultationFee}
                                onChange={(e) => set("consultationFee", e.target.value)}
                                placeholder="e.g. 500"
                            />
                        </FormGroup>
                    </div>
                </div>
            )}

            {/* Organisational Details */}
            <div className="hms-form-section">
                <SectionHead icon={Building2} iconTone="info">
                    Organisational details
                </SectionHead>
                <div className="hms-form-grid is-2col">
                    <FormGroup label="Employee code">
                        <Input
                            value={form.employeeCode}
                            onChange={(e) => set("employeeCode", e.target.value)}
                            placeholder="e.g. EMP-1042"
                        />
                    </FormGroup>
                    <FormGroup label="Date of joining">
                        <Input
                            type="date"
                            value={form.dateOfJoining}
                            onChange={(e) => set("dateOfJoining", e.target.value)}
                        />
                    </FormGroup>
                    <FormGroup
                        label="Department"
                        hint={
                            departments.length === 0
                                ? "No active departments — add them in HR & Staff → Departments"
                                : undefined
                        }
                    >
                        <SearchableSelect
                            options={departments.map((d) => ({
                                value: d.id,
                                label: `${d.name} (${titleCase(d.type)})`,
                            }))}
                            value={form.departmentId}
                            onChange={(v) =>
                                setForm((f) => ({
                                    ...f,
                                    departmentId: v,
                                    designationId: "",
                                }))
                            }
                            placeholder="Select department…"
                        />
                    </FormGroup>
                    <FormGroup
                        label="Designation / title"
                        hint={
                            designations.length === 0 && form.departmentId
                                ? "No active designations for this department"
                                : undefined
                        }
                    >
                        <SearchableSelect
                            options={designations.map((d) => ({
                                value: d.id,
                                label: `${d.name} (${titleCase(d.category)})`,
                            }))}
                            value={form.designationId}
                            onChange={(v) => set("designationId", v)}
                            placeholder="Select designation…"
                        />
                    </FormGroup>
                </div>
            </div>
        </form>
    );

    const actionRow = (
        <>
            <Button variant="cancel" onClick={onClose} type="button">
                Cancel
            </Button>
            <Button
                variant="primary"
                type="submit"
                form={formId}
                loading={submitting}
            >
                {editStaff ? "Save changes" : "Create staff account"}
            </Button>
        </>
    );

    if (editStaff) {
        return (
            <Drawer
                isOpen
                onClose={onClose}
                title="Edit staff profile"
                footer={actionRow}
            >
                {formBody}
            </Drawer>
        );
    }

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="lg"
            title={
                <span className="inline-flex items-center gap-2">
                    <UserIcon size={16} /> Add new staff
                </span>
            }
            footer={actionRow}
        >
            {formBody}
        </Modal>
    );
}

const QUALIFICATION_OPTIONS = [
    { value: "MBBS", label: "MBBS" },
    { value: "MBBS, MD", label: "MBBS, MD" },
    { value: "MBBS, MS", label: "MBBS, MS" },
    { value: "MBBS, DNB", label: "MBBS, DNB" },
    { value: "MBBS, Diploma", label: "MBBS, Diploma" },
    { value: "MBBS, MD, DM", label: "MBBS, MD, DM" },
    { value: "MBBS, MS, MCh", label: "MBBS, MS, MCh" },
    { value: "MBBS, DNB, DrNB", label: "MBBS, DNB, DrNB" },
    { value: "MBBS, FRCS", label: "MBBS, FRCS" },
    { value: "MBBS, MRCP", label: "MBBS, MRCP" },
    { value: "MBBS, MRCS", label: "MBBS, MRCS" },
    { value: "MD (USA/UK)", label: "MD (USA/UK)" },
    { value: "BDS", label: "BDS" },
    { value: "BDS, MDS", label: "BDS, MDS" },
    { value: "BDS, DNB", label: "BDS, DNB" },
    { value: "BAMS", label: "BAMS (Ayurveda)" },
    { value: "BAMS, MD (Ay.)", label: "BAMS, MD (Ay.)" },
    { value: "BHMS", label: "BHMS (Homeopathy)" },
    { value: "BUMS", label: "BUMS (Unani)" },
    { value: "BNYS", label: "BNYS (Naturopathy)" },
    { value: "PhD", label: "PhD (Medical)" },
    { value: "MSc (Nursing)", label: "MSc (Nursing)" },
    { value: "MPH", label: "MPH (Public Health)" },
];

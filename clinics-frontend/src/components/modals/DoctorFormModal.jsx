import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { doctorsApi, staffApi, specializationApi } from "@/utils/api";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import StateSelect from "@/components/StateSelect";
import { Home, X } from "lucide-react";
import {
    Button,
    Drawer,
    FormGroup,
    Input,
    Modal,
    Textarea,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

// MON=bit0=1 … SUN=bit6=64
const DAYS = [
    { label: "MON", bit: 1 },
    { label: "TUE", bit: 2 },
    { label: "WED", bit: 4 },
    { label: "THU", bit: 8 },
    { label: "FRI", bit: 16 },
    { label: "SAT", bit: 32 },
    { label: "SUN", bit: 64 },
];
const MAX_SPECS = 6;

/** Section heading (.hms-section-label) plus a 12px gap below it. */
function SectionLabel({ children }) {
    return <p className="hms-section-label mb-3">{children}</p>;
}

/** Specialisation chip picker.
 *  Renders selected specs as removable Info-tone chips, then a
 *  SearchableSelect that adds new ones until MAX_SPECS is reached. */
function SpecPicker({ specializations, value, onChange, loading }) {
    const remaining = specializations.filter((s) => !value.includes(s.id));

    const add = (id) => {
        if (!id || value.length >= MAX_SPECS || value.includes(id)) return;
        onChange([...value, id]);
    };
    const remove = (id) => onChange(value.filter((v) => v !== id));

    return (
        <div className="flex flex-col gap-2">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((id) => {
                        const spec = specializations.find((s) => s.id === id);
                        return (
                            <span key={id} className="hms-spec-chip">
                                {spec?.name || "Unknown"}
                                <button
                                    type="button"
                                    onClick={() => remove(id)}
                                    aria-label={`Remove ${spec?.name || "specialisation"}`}
                                    className="hms-spec-chip__remove"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
            {value.length < MAX_SPECS ? (
                <SearchableSelect
                    options={remaining.map((s) => ({ value: s.id, label: s.name }))}
                    value=""
                    onChange={(v) => add(v)}
                    placeholder={
                        loading
                            ? "Loading…"
                            : remaining.length === 0
                                ? "All specialisations added"
                                : "Add specialisation…"
                    }
                    disabled={loading || remaining.length === 0}
                />
            ) : (
                <p className="hms-spec-chip__max">
                    Maximum {MAX_SPECS} specialisations reached.
                </p>
            )}
        </div>
    );
}

function fmtDuration(mins) {
    if (!mins) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h} hrs`;
    return `${m} min`;
}

/**
 * Add / Edit doctor profile.
 *
 * Asymmetric UX preserved exactly:
 *   * editDoctor truthy → right-edge Drawer with the professional-only
 *     subset (no account credentials — those exist already).
 *   * editDoctor falsey → centred extra-wide Modal with a full account-
 *     setup + professional + schedule form.
 *
 * Data layer, validators, and API surfaces are unchanged byte-for-byte.
 * SearchableSelect and StateSelect remain on the legacy stack.
 */
function DoctorFormModal({ onClose, onSaved, editDoctor }) {
    const { user } = useAuth();
    const { notify } = useNotification();

    const [submitting, setSubmitting] = useState(false);
    const [specializations, setSpecializations] = useState([]);
    const [specsLoading, setSpecsLoading] = useState(false);

    const [userForm, setUserForm] = useState({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        password: "",
        state: "",
    });

    const [doctorForm, setDoctorForm] = useState({
        specializationIds: editDoctor?.specializationIds || [],
        qualification: editDoctor?.qualification || "",
        medicalRegistrationNumber: editDoctor?.medicalRegistrationNumber || "",
        registrationCouncil: editDoctor?.registrationCouncil || "",
        personalPhone: editDoctor?.personalPhone || "",
        personalEmail: editDoctor?.personalEmail || "",
        residentialAddress: editDoctor?.residentialAddress || "",
        consultationFee: editDoctor?.consultationFee || 500,
        followUpFee: editDoctor?.followUpFee || 300,
        availableDaysMask: editDoctor?.availableDaysMask ?? 31,
        slotDurationMin: editDoctor?.slotDurationMin || 15,
        maxDailySlots: editDoctor?.maxDailySlots || 40,
    });

    useEffect(() => {
        if (!user?.hospitalId) return;
        setSpecsLoading(true);
        specializationApi
            .list(user.hospitalId)
            .then((data) => setSpecializations(data))
            .catch(() => setSpecializations([]))
            .finally(() => setSpecsLoading(false));
    }, [user?.hospitalId]);

    const setDoc = (patch) => setDoctorForm((p) => ({ ...p, ...patch }));
    const setUser = (patch) => setUserForm((p) => ({ ...p, ...patch }));

    const mask = doctorForm.availableDaysMask || 0;
    const activeDayCount = DAYS.filter((d) => mask & d.bit).length;
    const slotMin = doctorForm.slotDurationMin || 0;
    const slotsPerDay = doctorForm.maxDailySlots || 0;
    const totalMinPerDay = slotMin * slotsPerDay;
    const totalMinPerWeek = totalMinPerDay * activeDayCount;

    const toggleDay = (bit) => setDoc({ availableDaysMask: mask ^ bit });

    const validateCreate = () => {
        if (
            !userForm.firstName.trim() ||
            !userForm.email.trim() ||
            !userForm.phone.trim() ||
            !userForm.password.trim()
        ) {
            notify("Please fill in all required account fields", "error");
            return false;
        }
        const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
        if (!pwdRegex.test(userForm.password)) {
            notify(
                "Password must be at least 6 characters with 1 uppercase, 1 number and 1 special character",
                "error"
            );
            return false;
        }
        if (doctorForm.specializationIds.length === 0) {
            notify("Please select at least one specialization", "error");
            return false;
        }
        if (
            !doctorForm.qualification.trim() ||
            !doctorForm.medicalRegistrationNumber.trim() ||
            !doctorForm.registrationCouncil.trim()
        ) {
            notify("Please fill in all professional details", "error");
            return false;
        }
        if (
            !doctorForm.consultationFee ||
            !doctorForm.slotDurationMin ||
            !doctorForm.maxDailySlots ||
            activeDayCount === 0
        ) {
            notify("Please complete scheduling & fee details", "error");
            return false;
        }
        return true;
    };

    const handleCreate = async () => {
        if (!validateCreate() || !user?.hospitalId) return;
        setSubmitting(true);
        try {
            const newUser = await staffApi.create({
                ...userForm,
                role: "DOCTOR",
                hospitalId: user.hospitalId,
            });
            const {
                specializationIds,
                qualification,
                medicalRegistrationNumber,
                registrationCouncil,
                personalPhone,
                personalEmail,
                residentialAddress,
                consultationFee,
                followUpFee,
                availableDaysMask,
                slotDurationMin,
                maxDailySlots,
            } = doctorForm;
            await doctorsApi.create({
                specializationIds,
                qualification,
                medicalRegistrationNumber,
                registrationCouncil,
                personalPhone,
                personalEmail,
                residentialAddress,
                consultationFee,
                followUpFee,
                availableDaysMask,
                slotDurationMin,
                maxDailySlots,
                userId: newUser.id,
                hospitalId: user.hospitalId,
            });
            notify("Doctor profile created", "success");
            onSaved();
            onClose();
        } catch (error) {
            notify(error.response?.data?.error || "Operation failed", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (e) => {
        e?.preventDefault();
        if (!user?.hospitalId) return;
        setSubmitting(true);
        try {
            await doctorsApi.update(editDoctor.id, doctorForm);
            notify("Doctor profile updated", "success");
            onSaved();
            onClose();
        } catch (error) {
            notify(error.response?.data?.error || "Operation failed", "error");
        } finally {
            setSubmitting(false);
        }
    };

    /* ───── Shared schedule + fees block (Schedule & fees + day pills + preview) ───── */
    const scheduleFields = (
        <>
            <div className="hms-form-grid is-2col">
                <FormGroup label="Consultation fee (₹) *">
                    <Input
                        type="number"
                        step="0.01"
                        min="1"
                        value={doctorForm.consultationFee || ""}
                        onChange={(e) =>
                            setDoc({ consultationFee: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="500"
                    />
                </FormGroup>
                <FormGroup label="Follow-up fee (₹) *">
                    <Input
                        type="number"
                        step="0.01"
                        min="1"
                        value={doctorForm.followUpFee || ""}
                        onChange={(e) =>
                            setDoc({ followUpFee: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="300"
                    />
                </FormGroup>
                <FormGroup label="Slot duration (min) *">
                    <Input
                        type="number"
                        step="5"
                        min="5"
                        value={doctorForm.slotDurationMin || ""}
                        onChange={(e) =>
                            setDoc({ slotDurationMin: parseInt(e.target.value) || 0 })
                        }
                        placeholder="15"
                    />
                </FormGroup>
                <FormGroup label="Max daily slots *">
                    <Input
                        type="number"
                        min="1"
                        value={doctorForm.maxDailySlots || ""}
                        onChange={(e) =>
                            setDoc({ maxDailySlots: parseInt(e.target.value) || 0 })
                        }
                        placeholder="40"
                    />
                </FormGroup>
            </div>
            <div className="mt-3">
                <FormGroup label="Available days *">
                    <div className="hms-day-pill-row">
                        {DAYS.map(({ label, bit }) => {
                            const active = !!(mask & bit);
                            return (
                                <button
                                    key={bit}
                                    type="button"
                                    onClick={() => toggleDay(bit)}
                                    className={`hms-day-pill ${active ? "is-on" : ""}`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </FormGroup>
            </div>
        </>
    );

    const schedulePreview = (
        <div className="hms-schedule-preview mt-3">
            <SectionLabel>Weekly schedule preview</SectionLabel>
            <div className="hms-schedule-preview__grid">
                {[
                    { label: "Slot", value: slotMin > 0 ? `${slotMin} min` : "—" },
                    { label: "Per day", value: slotsPerDay > 0 ? slotsPerDay : "—" },
                    { label: "Hrs / day", value: fmtDuration(totalMinPerDay) },
                    { label: "Days / wk", value: activeDayCount > 0 ? activeDayCount : "—" },
                ].map(({ label, value }) => (
                    <div key={label} className="hms-schedule-preview__tile">
                        <p className="hms-schedule-preview__label">{label}</p>
                        <p className="hms-schedule-preview__value">{value}</p>
                    </div>
                ))}
            </div>
            <div className="hms-schedule-preview__total">
                <span className="hms-schedule-preview__total-label">
                    Total clinical hours / week
                </span>
                <span className="hms-schedule-preview__total-value">
                    {fmtDuration(totalMinPerWeek)}
                </span>
            </div>
        </div>
    );

    /* ───────────────────────── Edit mode (Drawer) ──────────────────────── */
    if (editDoctor) {
        const initials = `${editDoctor.firstName?.[0] ?? ""}${editDoctor.lastName?.[0] ?? ""}`.toUpperCase();
        return (
            <Drawer
                isOpen
                onClose={onClose}
                title="Edit doctor profile"
                footer={
                    <>
                        <Button variant="cancel" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="doctor-edit-form"
                            loading={submitting}
                        >
                            Save changes
                        </Button>
                    </>
                }
            >
                <form
                    id="doctor-edit-form"
                    onSubmit={handleUpdate}
                    className="hms-doctor-form"
                >
                    {/* Doctor identity card */}
                    <div className="hms-doctor-identity">
                        <span className="hms-avatar is-xl is-info">{initials}</span>
                        <div className="hms-doctor-identity__body">
                            <div className="hms-doctor-identity__name">
                                Dr. {editDoctor.firstName} {editDoctor.lastName}
                            </div>
                            <div className="hms-doctor-identity__email">
                                {editDoctor.email}
                            </div>
                        </div>
                    </div>

                    {/* Professional */}
                    <div>
                        <SectionLabel>Professional</SectionLabel>
                        <FormGroup label="Specialisations *">
                            <SpecPicker
                                specializations={specializations}
                                value={doctorForm.specializationIds}
                                onChange={(ids) => setDoc({ specializationIds: ids })}
                                loading={specsLoading}
                            />
                        </FormGroup>
                        <div className="hms-form-grid is-2col mt-3">
                            <FormGroup label="Qualification *">
                                <Input
                                    value={doctorForm.qualification}
                                    onChange={(e) => setDoc({ qualification: e.target.value })}
                                    placeholder="e.g. MBBS, MD"
                                />
                            </FormGroup>
                            <FormGroup label="Registration no. *">
                                <Input
                                    value={doctorForm.medicalRegistrationNumber}
                                    onChange={(e) =>
                                        setDoc({ medicalRegistrationNumber: e.target.value })
                                    }
                                    placeholder="MRC-XXXXXX"
                                />
                            </FormGroup>
                            <FormGroup label="Council *">
                                <Input
                                    value={doctorForm.registrationCouncil}
                                    onChange={(e) =>
                                        setDoc({ registrationCouncil: e.target.value })
                                    }
                                    placeholder="Tamil Nadu MC"
                                />
                            </FormGroup>
                        </div>
                    </div>

                    {/* Contact */}
                    <div>
                        <SectionLabel>Personal contact</SectionLabel>
                        <div className="hms-form-grid is-2col">
                            <FormGroup label="Phone">
                                <Input
                                    type="tel"
                                    value={doctorForm.personalPhone}
                                    onChange={(e) =>
                                        setDoc({ personalPhone: e.target.value })
                                    }
                                    placeholder="+91 99999 00000"
                                />
                            </FormGroup>
                            <FormGroup label="Email">
                                <Input
                                    type="email"
                                    value={doctorForm.personalEmail}
                                    onChange={(e) =>
                                        setDoc({ personalEmail: e.target.value })
                                    }
                                    placeholder="name@personal.com"
                                />
                            </FormGroup>
                        </div>
                    </div>

                    {/* Address */}
                    <div>
                        <SectionLabel>Address</SectionLabel>
                        <FormGroup
                            label={
                                <span className="inline-flex items-center gap-1.5">
                                    <Home size={14} className="text-accent-external" />
                                    Residential
                                </span>
                            }
                        >
                            <Textarea
                                rows={3}
                                value={doctorForm.residentialAddress}
                                onChange={(e) =>
                                    setDoc({ residentialAddress: e.target.value })
                                }
                                placeholder="Home, street, city, pincode"
                            />
                        </FormGroup>
                    </div>

                    {/* Schedule & Fees */}
                    <div>
                        <SectionLabel>Schedule & fees</SectionLabel>
                        {scheduleFields}
                    </div>
                </form>
            </Drawer>
        );
    }

    /* ───────────────────────── Create mode (Modal) ─────────────────────── */
    return (
        <Modal
            isOpen
            onClose={onClose}
            size="xl"
            title="Add new doctor"
            footer={
                <>
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleCreate} loading={submitting}>
                        Create profile
                    </Button>
                </>
            }
        >
            <div className="hms-doctor-form">
                {/* Account setup */}
                <div>
                    <SectionLabel>Account setup</SectionLabel>
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="First name *">
                            <Input
                                autoFocus
                                value={userForm.firstName}
                                onChange={(e) => setUser({ firstName: sanitizeName(e.target.value) })}
                                placeholder="Arjun"
                            />
                        </FormGroup>
                        <FormGroup label="Last name">
                            <Input
                                value={userForm.lastName}
                                onChange={(e) => setUser({ lastName: sanitizeName(e.target.value) })}
                                placeholder="Sharma"
                            />
                        </FormGroup>
                        <FormGroup label="Email address *">
                            <Input
                                type="email"
                                value={userForm.email}
                                onChange={(e) => setUser({ email: e.target.value })}
                                placeholder="doctor@hospital.com"
                            />
                        </FormGroup>
                        <FormGroup label="Phone number *">
                            <Input
                                type="tel"
                                value={userForm.phone}
                                onChange={(e) => setUser({ phone: sanitizePhone(e.target.value) })}
                                placeholder="+91 98765 43210"
                            />
                        </FormGroup>
                        <FormGroup
                            label="Temporary password *"
                            hint="Min. 6 chars, 1 uppercase, 1 number, 1 special"
                            className="grid-col-full"
                        >
                            <Input
                                type="password"
                                value={userForm.password}
                                onChange={(e) => setUser({ password: e.target.value })}
                                placeholder="Minimum 6 characters"
                            />
                        </FormGroup>
                    </div>
                </div>

                {/* Professional identity */}
                <div>
                    <SectionLabel>Professional identity</SectionLabel>
                    <FormGroup
                        label={
                            <span>
                                Specialisations *{" "}
                                <span className="font-normal text-gray-400">
                                    (up to {MAX_SPECS})
                                </span>
                            </span>
                        }
                    >
                        <SpecPicker
                            specializations={specializations}
                            value={doctorForm.specializationIds}
                            onChange={(ids) => setDoc({ specializationIds: ids })}
                            loading={specsLoading}
                        />
                    </FormGroup>
                    <div className="hms-form-grid is-2col mt-3">
                        <FormGroup label="Qualification *">
                            <Input
                                value={doctorForm.qualification}
                                onChange={(e) => setDoc({ qualification: e.target.value })}
                                placeholder="e.g. MBBS, MD"
                            />
                        </FormGroup>
                        <FormGroup label="Registration number *">
                            <Input
                                value={doctorForm.medicalRegistrationNumber}
                                onChange={(e) =>
                                    setDoc({ medicalRegistrationNumber: e.target.value })
                                }
                                placeholder="MRC-XXXXXX"
                            />
                        </FormGroup>
                        <FormGroup
                            label="Registration council *"
                            className="grid-col-full"
                        >
                            <Input
                                value={doctorForm.registrationCouncil}
                                onChange={(e) =>
                                    setDoc({ registrationCouncil: e.target.value })
                                }
                                placeholder="e.g. Tamil Nadu Medical Council"
                            />
                        </FormGroup>
                    </div>
                </div>

                {/* Personal contact */}
                <div>
                    <SectionLabel>Personal contact</SectionLabel>
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Phone">
                            <Input
                                type="tel"
                                value={doctorForm.personalPhone}
                                onChange={(e) => setDoc({ personalPhone: sanitizePhone(e.target.value) })}
                                placeholder="+91 99999 00000"
                            />
                        </FormGroup>
                        <FormGroup label="Email">
                            <Input
                                type="email"
                                value={doctorForm.personalEmail}
                                onChange={(e) => setDoc({ personalEmail: e.target.value })}
                                placeholder="name@personal.com"
                            />
                        </FormGroup>
                    </div>
                </div>

                {/* Address */}
                <div>
                    <SectionLabel>Address</SectionLabel>
                    <FormGroup label="Residential address">
                        <Textarea
                            rows={2}
                            value={doctorForm.residentialAddress}
                            onChange={(e) =>
                                setDoc({ residentialAddress: e.target.value })
                            }
                            placeholder="Home address, street, area, city, pincode"
                        />
                    </FormGroup>
                    <div className="mt-3">
                        <StateSelect
                            value={userForm.state}
                            onChange={(val) => setUser({ state: val })}
                            inputClassName="hms-input"
                            labelClassName="hms-label"
                        />
                    </div>
                </div>

                {/* Schedule & fees */}
                <div>
                    <SectionLabel>Schedule & fees</SectionLabel>
                    {scheduleFields}
                    {schedulePreview}
                </div>
            </div>
        </Modal>
    );
}

export { DoctorFormModal as default };

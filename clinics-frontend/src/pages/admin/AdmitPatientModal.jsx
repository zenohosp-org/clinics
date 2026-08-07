import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { sanitizePhone, sanitizeName } from "@/utils/validators";
import { BedSelectionModal } from "./BedSelectionModal";
import {
    admissionApi,
    departmentApi,
    doctorsApi,
    patientApi,
    bedApi,
    patientAdvanceApi,
    bankApi,
} from "@/utils/api";
import api from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { Search, BedDouble, User, CheckCircle2,  } from "lucide-react";
import {
    Alert,
    Button,
    FormGroup,
    Input,
    Drawer,
    Textarea,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

const ADMISSION_SOURCES = ["OPD_REFERRAL", "EMERGENCY", "DIRECT"];
const RELATIONSHIPS = ["Spouse", "Parent", "Child", "Sibling", "Friend", "Guardian", "Other"];
const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer"];

/** Cash pays into a CASH-type drawer; everything else lands in a
 *  SAVINGS or CURRENT bank account. */
const PAYMENT_METHOD_TO_ACCOUNT_TYPES = {
    Cash: ["CASH"],
    UPI: ["SAVINGS", "CURRENT"],
    Card: ["SAVINGS", "CURRENT"],
    "Bank Transfer": ["SAVINGS", "CURRENT"],
};

/** Numbered section header — uses the shared .hms-section-num primitive
 *  from admin.css (number circle + title + optional subtitle, separated
 *  by a thin underline). */
function SectionHeader({ number, title, subtitle }) {
    return (
        <div className="hms-section-num">
            <div className="hms-section-num__circle">{number}</div>
            <div>
                <h3 className="hms-section-num__title">{title}</h3>
                {subtitle && <p className="hms-section-num__subtitle">{subtitle}</p>}
            </div>
        </div>
    );
}

/**
 * Admit patient wizard. Single-page form with four numbered sections:
 * Patient & source · Clinical & room · Attender · Finance. Layout
 * pieces live in admin.css under .hms-patient-pick* (patient picker),
 * .hms-patient-suggest* (search dropdown), .hms-bed-grid + .hms-bed-chip
 * (bed selector), .hms-pay-card (payment category card),
 * .hms-advance-block + .hms-admit-summary (advance + summary blocks).
 */
export default function AdmitPatientModal({ onClose, onAdmitted, prefill }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [patients, setPatients] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [availableBeds, setAvailableBeds] = useState([]);
    const [allBeds, setAllBeds] = useState([]);
    const [bedsLoading, setBedsLoading] = useState(false);
    const [patientSearch, setPatientSearch] = useState("");
    const [selectedPatient, setSelectedPatient] = useState(prefill?.patient || null);
    const [admittedPatientIds, setAdmittedPatientIds] = useState(new Set());
    const [form, setForm] = useState({
        admissionType: prefill?.admissionType || "OPD_REFERRAL",
        departmentId: "",
        admittingDoctorId: prefill?.doctorId || "",
        roomId: "",
        bedId: "",
        chiefComplaint: prefill?.chiefComplaint || "",
        approxDischargeDate: "",
        attenderName: "",
        attenderPhone: "",
        attenderRelationship: "",
    });

    const [paymentCategory, setPaymentCategory] = useState("CASH");
    const [advanceAmount, setAdvanceAmount] = useState("");
    const [advancePaymentMethod, setAdvancePaymentMethod] = useState("Cash");
    const [advanceNotes, setAdvanceNotes] = useState("");
    const [bankAccounts, setBankAccounts] = useState([]);
    const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
    const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [isBedModalOpen, setIsBedModalOpen] = useState(false);

    useEffect(() => {
        if (!user?.hospitalId) return;
        Promise.all([
            departmentApi.list(user.hospitalId, true),
            doctorsApi.list(user.hospitalId),
            admissionApi.list(user.hospitalId, false),
        ]).then(([depts, docs, activeAdmissions]) => {
            setDepartments(depts);
            setDoctors(docs.filter((d) => d.userIsActive));
            setAdmittedPatientIds(new Set(activeAdmissions.map((a) => a.patientId)));
        });
    }, [user?.hospitalId]);

    useEffect(() => {
        if (!user?.hospitalId) return;
        const q = patientSearch.trim();
        if (q.length < 2) {
            setPatients([]);
            return;
        }
        patientApi.list(user.hospitalId).then((all) =>
            setPatients(
                all
                    .filter(
                        (p) =>
                            !admittedPatientIds.has(p.id) &&
                            `${p.firstName} ${p.lastName} ${p.uhid}`
                                .toLowerCase()
                                .includes(q.toLowerCase())
                    )
                    .slice(0, 8)
            )
        );
    }, [patientSearch, admittedPatientIds, user?.hospitalId]);

    useEffect(() => {
        if (!user?.hospitalId) return;
        setBedsLoading(true);
        bedApi.getAll(user.hospitalId)
            .then((beds) => {
                // Filter only WARD category beds or beds belonging to a WARD
                const assignable = beds.filter(b => b.roomType !== 'OT' && b.roomType !== 'POST_OT' && b.roomType !== 'STORE');
                setAllBeds(assignable);
                // The BedDto has no `status` field — derive availability from
                // the three flags the backend actually exposes. Without this,
                // availableBeds ended up empty and the auto-pick fallback
                // could not resolve a free bed for single-bed-room flows.
                setAvailableBeds(assignable.filter(
                    (b) => !b.occupied && !b.roomLocked && !b.underMaintenance,
                ));
            })
            .catch(() => { })
            .finally(() => setBedsLoading(false));
    }, [user?.hospitalId]);

    const selectedDept = departments.find((d) => String(d.id) === String(form.departmentId));
    const filteredDoctors =
        form.departmentId && selectedDept
            ? doctors.filter(
                (d) => d.specialization?.toLowerCase() === selectedDept.name?.toLowerCase()
            )
            : doctors;

    useEffect(() => {
        if (selectedPatient) setPaymentCategory(selectedPatient.paymentCategory || "CASH");
    }, [selectedPatient]);

    useEffect(() => {
        if (!user?.hospitalId) return;
        const types = PAYMENT_METHOD_TO_ACCOUNT_TYPES[advancePaymentMethod] || [];
        setBankAccountsLoading(true);
        bankApi
            .list(user.hospitalId, types)
            .then((accounts) => {
                setBankAccounts(accounts || []);
                if (accounts && accounts.length === 1) {
                    setSelectedBankAccountId(accounts[0].id);
                } else if (accounts && accounts.length > 1) {
                    const def = accounts.find((a) => a.isDefault);
                    setSelectedBankAccountId(def ? def.id : "");
                } else {
                    setSelectedBankAccountId("");
                }
            })
            .catch(() => {
                setBankAccounts([]);
                setSelectedBankAccountId("");
            })
            .finally(() => setBankAccountsLoading(false));
    }, [advancePaymentMethod, user?.hospitalId]);

    const handleSubmit = async () => {
        if (!selectedPatient) return;
        setSubmitting(true);
        try {
            const admission = await admissionApi.admit({
                hospitalId: user.hospitalId,
                patientId: selectedPatient.id,
                roomId: form.roomId ? Number(form.roomId) : null,
                bedId: form.bedId ? Number(form.bedId) : null,
                admittingDoctorId: form.admittingDoctorId || null,
                departmentId: form.departmentId || null,
                sourceAppointmentId: prefill?.appointmentId || null,
                admissionType: form.admissionType,
                chiefComplaint: form.chiefComplaint,
                approxDischargeDate: form.approxDischargeDate || null,
                attenderName: form.attenderName,
                attenderPhone: form.attenderPhone,
                attenderRelationship: form.attenderRelationship,
            });

            const amt = Number(advanceAmount);
            if (amt > 0 && admission?.id) {
                try {
                    await patientAdvanceApi.createForAdmission(admission.id, {
                        amount: amt,
                        paymentMethod: advancePaymentMethod,
                        bankAccountId: selectedBankAccountId || null,
                        notes: advanceNotes || null,
                        collectedBy: user?.name || null,
                    });
                } catch {
                    // Advance failure must not block admission success
                }
            }

            try {
                await patientApi.update(selectedPatient.id, {
                    ...selectedPatient,
                    paymentCategory,
                    hospitalId: user.hospitalId,
                });
            } catch {
                // Non-blocking
            }

            onAdmitted();
        } catch (err) {
            notify(err.response?.data?.message || "Admission failed", "error");
        } finally {
            setSubmitting(false);
        }
    };

    const advanceAmt = Number(advanceAmount) || 0;

    return (
        <Drawer
            isOpen
            onClose={onClose}
            width="650px"
            title="Admit patient to IPD"
            subtitle="All sections in one place — scroll to fill, submit when ready."
            footer={
                <>
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={submitting || !selectedPatient}
                        loading={submitting}
                    >
                        <CheckCircle2 size={14} /> Confirm admission
                    </Button>
                </>
            }
        >
            <div className="hms-form-section-list">
                {/* Section 1: Patient & Source */}
                <section className="hms-form-section">
                    <SectionHeader number={1} title="Patient & source" />
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Search patient *">
                            {selectedPatient ? (
                                <div className="hms-patient-pick">
                                    <div className="hms-patient-pick__identity">
                                        <span className="hms-patient-pick__icon">
                                            <User size={16} />
                                        </span>
                                        <div>
                                            <p className="hms-patient-pick__name">
                                                {selectedPatient.firstName} {selectedPatient.lastName}
                                            </p>
                                            <p className="hms-patient-pick__sub">
                                                UHID: {fmtId(selectedPatient.uhid)} · {selectedPatient.gender}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedPatient(null)}
                                        className="hms-patient-pick__change"
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : (
                                <div className="hms-patient-search">
                                    <Search size={16} className="hms-patient-search__icon" />
                                    <Input
                                        value={patientSearch}
                                        onChange={(e) => setPatientSearch(e.target.value)}
                                        placeholder="Search by name or UHID…"
                                        className="hms-patient-search__input"
                                    />
                                    {patients.length > 0 && (
                                        <div className="hms-patient-suggest">
                                            {patients.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedPatient(p);
                                                        setPatients([]);
                                                        setPatientSearch("");
                                                    }}
                                                    className="hms-patient-suggest__item"
                                                >
                                                    <User size={16} className="text-gray-400 shrink-0" />
                                                    <div>
                                                        <p className="hms-patient-suggest__name">
                                                            {p.firstName} {p.lastName}
                                                        </p>
                                                        <p className="hms-patient-suggest__sub">
                                                            UHID: {fmtId(p.uhid)}
                                                        </p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </FormGroup>
                        <FormGroup label="Admission source">
                            <SearchableSelect
                                value={form.admissionType}
                                onChange={(v) => setForm({ ...form, admissionType: v })}
                                options={ADMISSION_SOURCES.map((s) => ({
                                    value: s,
                                    label: s.replace(/_/g, " "),
                                }))}
                            />
                        </FormGroup>
                    </div>
                </section>

                {/* Section 2: Clinical & Room */}
                <section className="hms-form-section">
                    <SectionHeader number={2} title="Clinical & room" />
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Department">
                            <SearchableSelect
                                value={form.departmentId}
                                onChange={(v) =>
                                    setForm({ ...form, departmentId: v, admittingDoctorId: "" })
                                }
                                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                placeholder="Select department…"
                            />
                        </FormGroup>
                        <FormGroup label="Admitting doctor">
                            <SearchableSelect
                                value={form.admittingDoctorId}
                                onChange={(v) => setForm({ ...form, admittingDoctorId: v })}
                                options={filteredDoctors.map((d) => ({
                                    value: d.id,
                                    label: `Dr. ${d.firstName} ${d.lastName}`,
                                }))}
                                placeholder="Select doctor…"
                            />
                        </FormGroup>
                    </div>
                    <FormGroup label="Chief complaint">
                        <Textarea
                            rows={3}
                            value={form.chiefComplaint}
                            onChange={(e) => setForm({ ...form, chiefComplaint: e.target.value })}
                            placeholder="Presenting complaint or reason for admission…"
                        />
                    </FormGroup>
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Assign location (optional)">
                            <div className="flex gap-2 items-center">
                                {form.bedId ? (
                                    <div className="flex-1 p-2 border rounded-md bg-gray-50 flex justify-between items-center">
                                        <span className="text-sm">
                                            {availableBeds.find(b => String(b.id) === String(form.bedId))?.roomName ? 
                                                `Room ${availableBeds.find(b => String(b.id) === String(form.bedId))?.roomName} - ` : ''}
                                            {availableBeds.find(b => String(b.id) === String(form.bedId))?.bedNumber}
                                        </span>
                                        <button 
                                            type="button" 
                                            onClick={() => setForm({ ...form, bedId: "", roomId: "" })}
                                            className="text-red-500 hover:text-red-700 p-1"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ) : (
                                    <Button 
                                        type="button" 
                                        variant="secondary" 
                                        onClick={() => setIsBedModalOpen(true)}
                                        className="w-full justify-center border-dashed"
                                    >
                                        + Select Bed / Room
                                    </Button>
                                )}
                            </div>
                        </FormGroup>
                        <FormGroup label="Approx. discharge">
                            <Input
                                type="datetime-local"
                                value={form.approxDischargeDate}
                                onChange={(e) =>
                                    setForm({ ...form, approxDischargeDate: e.target.value })
                                }
                            />
                        </FormGroup>
                    </div>
                </section>

                {/* Section 3: Attender */}
                <section className="hms-form-section">
                    <SectionHeader
                        number={3}
                        title="Attender / guardian"
                        subtitle="Optional but recommended — required for discharge handover."
                    />
                    <div className="hms-form-grid is-2col">
                        <FormGroup label="Attender name">
                            <Input
                                value={form.attenderName}
                                onChange={(e) => setForm({ ...form, attenderName: sanitizeName(e.target.value) })}
                                placeholder="Full name"
                            />
                        </FormGroup>
                        <FormGroup label="Phone">
                            <Input
                                type="tel"
                                value={form.attenderPhone}
                                onChange={(e) => setForm({ ...form, attenderPhone: sanitizePhone(e.target.value) })}
                                placeholder="+91 98765 43210"
                            />
                        </FormGroup>
                        <FormGroup label="Relationship">
                            <SearchableSelect
                                value={form.attenderRelationship}
                                onChange={(v) => setForm({ ...form, attenderRelationship: v })}
                                options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
                                placeholder="Select…"
                            />
                        </FormGroup>
                    </div>
                </section>

                {/* Section 4: Finance */}
                <section className="hms-form-section">
                    <SectionHeader number={4} title="Finance" />

                    {/* Payment Category */}
                    <div>
                        <p className="hms-label mb-2">Payment category</p>
                        <div className="hms-form-grid is-2col">
                            {[
                                { value: "CASH",   label: "Cash",   desc: "Periodic payments during stay" },
                                { value: "CREDIT", label: "Credit", desc: "Full bill settled at discharge" },
                            ].map((opt) => {
                                const selected = paymentCategory === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setPaymentCategory(opt.value)}
                                        className={`hms-pay-card ${selected ? "is-on" : ""}`}
                                    >
                                        <p className="hms-pay-card__label">{opt.label}</p>
                                        <p className="hms-pay-card__desc">{opt.desc}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Admission advance */}
                    <div className="hms-admit-advance-block">
                        <div>
                            <p className="hms-label mb-1">
                                Admission advance / room deposit
                            </p>
                            <p className="hms-form-hint">
                                Optional. Collect a room security deposit or initial advance — it will
                                be auto-deducted from the final IPD bill.
                            </p>
                        </div>

                        <div className="hms-form-grid is-2col">
                            <FormGroup label="Amount (₹)">
                                <Input
                                    type="number"
                                    min="0"
                                    step="100"
                                    placeholder="0"
                                    value={advanceAmount}
                                    onChange={(e) => setAdvanceAmount(e.target.value)}
                                />
                            </FormGroup>
                            <FormGroup label="Payment method">
                                <SearchableSelect
                                    value={advancePaymentMethod}
                                    onChange={(v) => setAdvancePaymentMethod(v)}
                                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                                />
                            </FormGroup>
                        </div>

                        {advanceAmt > 0 && (
                            <FormGroup
                                label={
                                    <span>
                                        Deposit account
                                        <span className="hms-advance-account-hint">
                                            (
                                            {advancePaymentMethod === "Cash"
                                                ? "CASH only"
                                                : "SAVINGS / CURRENT only"}
                                            )
                                        </span>
                                    </span>
                                }
                            >
                                {bankAccountsLoading ? (
                                    <CenterLoader text="Loading accounts…" />
                                ) : bankAccounts.length === 0 ? (
                                    <Alert tone="warning">
                                        No {advancePaymentMethod === "Cash" ? "CASH" : "SAVINGS / CURRENT"}{" "}
                                        account found. Configure banks in the Finance app to enable
                                        deposit tracking.
                                    </Alert>
                                ) : (
                                    <SearchableSelect
                                        value={selectedBankAccountId}
                                        onChange={(v) => setSelectedBankAccountId(v)}
                                        options={bankAccounts.map((a) => ({
                                            value: a.id,
                                            label: `${a.accountName} · ${a.accountType}${a.bankName ? ` · ${a.bankName}` : ""
                                                }`,
                                        }))}
                                        placeholder="Select account…"
                                    />
                                )}
                            </FormGroup>
                        )}

                        {advanceAmt > 0 && (
                            <FormGroup label="Note (optional)">
                                <Input
                                    placeholder="e.g. Room security deposit, initial advance…"
                                    value={advanceNotes}
                                    onChange={(e) => setAdvanceNotes(e.target.value)}
                                />
                            </FormGroup>
                        )}

                        {advanceAmt > 0 && (
                            <Alert tone="success" icon={<CheckCircle2 size={16} />}>
                                <strong>₹{advanceAmt.toLocaleString("en-IN")}</strong> via{" "}
                                {advancePaymentMethod} will be recorded and automatically deducted from
                                the final discharge bill.
                            </Alert>
                        )}
                    </div>
                </section>

                {/* Summary */}
                {selectedPatient && (
                    <div className="hms-admit-summary">
                        <p className="hms-admit-summary__title">Admission summary</p>
                        <div className="hms-admit-summary__grid">
                            <div>
                                <span className="font-medium">Patient: </span>
                                {selectedPatient.firstName} {selectedPatient.lastName}
                            </div>
                            <div>
                                <span className="font-medium">Source: </span>
                                {form.admissionType.replace(/_/g, " ")}
                            </div>
                            <div>
                                <span className="font-medium">Location: </span>
                                {form.bedId ? (
                                    (() => {
                                        const b = availableBeds.find((b) => String(b.id) === String(form.bedId));
                                        if (!b) return "To be assigned";
                                        return `${b.roomName ? `Room ${b.roomName} - ` : (b.wardName ? `Ward ${b.wardName} - ` : '')}${b.bedNumber}`;
                                    })()
                                ) : "To be assigned"}
                            </div>
                            <div>
                                <span className="font-medium">Payment: </span>
                                {paymentCategory}
                                {advanceAmt > 0
                                    ? ` (₹${advanceAmt.toLocaleString("en-IN")} advance)`
                                    : ""}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <BedSelectionModal 
                isOpen={isBedModalOpen}
                onClose={() => setIsBedModalOpen(false)}
                availableBeds={allBeds}
                onSelect={(bed) => {
                    setForm({ ...form, bedId: String(bed.id), roomId: bed.roomId ? String(bed.roomId) : "" });
                    setIsBedModalOpen(false);
                }}
            />
        </Drawer>
    );
}

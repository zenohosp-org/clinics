import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { departmentApi, designationApi } from "@/utils/api";
import { Award, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import {
    Badge,
    Button,
    Card,
    FormGroup,
    Input,
    Modal,
    PageHeader,
    Table,
    Tabs,
} from "@/components/ui";
import SearchableSelect from "@/components/ui/SearchableSelect";

// Six-category classifier shared with the People app — must match the
// designations_category_check constraint (People V018).
const CATEGORIES = ["CLINICAL", "NURSING", "ADMIN", "SUPPORT", "TECHNICAL", "OTHER"];

const CAT_TONE = {
    CLINICAL: "info",
    NURSING: "rose",
    ADMIN: "neutral",
    SUPPORT: "neutral",
    TECHNICAL: "amber",
    OTHER: "neutral",
};

const PRESETS = {
    CLINICAL: [
        "Senior Consultant",
        "Consultant",
        "Associate Consultant",
        "Senior Resident",
        "Junior Resident",
        "House Surgeon",
        "Registrar",
    ],
    NURSING: [
        "Chief Nursing Officer",
        "Nursing Superintendent",
        "Deputy Nursing Superintendent",
        "Ward Sister",
        "Staff Nurse",
        "Junior Staff Nurse",
        "ANM",
    ],
    TECHNICAL: [
        "Senior Radiographer",
        "Radiographer",
        "Senior Lab Technician",
        "Lab Technician",
        "Lab Assistant",
        "Pharmacist",
        "Senior Pharmacist",
        "Physiotherapist",
        "Dietitian",
    ],
    ADMIN: [
        "Hospital Administrator",
        "Department Manager",
        "Executive",
        "Officer",
        "Coordinator",
        "Receptionist",
        "Medical Records Officer",
        "Billing Executive",
    ],
    SUPPORT: [
        "Senior Attender",
        "Attender",
        "Helper",
        "Security Officer",
        "Housekeeping Supervisor",
        "Housekeeping Staff",
    ],
};

const emptyForm = { name: "", category: "CLINICAL", departmentId: "" };

const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();

/**
 * Designations — hospital job-titles taxonomy by category, optionally
 * scoped to a department. Toggle-only row actions (no edit). Data
 * layer + department filter + preset quick-add behaviour preserved.
 */
export default function Designations() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [designations, setDesignations] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("CLINICAL");
    const [deptFilter, setDeptFilter] = useState("");

    const load = async () => {
        if (!user?.hospitalId) return;
        try {
            setLoading(true);
            const [desigs, depts] = await Promise.all([
                designationApi.list(user.hospitalId),
                departmentApi.list(user.hospitalId, true),
            ]);
            setDesignations(desigs);
            setDepartments(depts);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const openCreate = (preset = null) => {
        setForm(
            preset
                ? { name: preset, category: activeTab, departmentId: "" }
                : { ...emptyForm, category: activeTab }
        );
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await designationApi.create({
                hospitalId: user.hospitalId,
                name: form.name,
                category: form.category,
                departmentId: form.departmentId || null,
            });
            notify("Designation created", "success");
            setShowModal(false);
            load();
        } catch (err) {
            notify(err.response?.data?.message || "Failed", "error");
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (d) => {
        try {
            await designationApi.toggle(d.id);
            load();
        } catch {
            notify("Failed", "error");
        }
    };

    const grouped = CATEGORIES.reduce((acc, c) => {
        acc[c] = designations.filter(
            (d) =>
                d.category === c &&
                (!deptFilter || d.departmentId === deptFilter || !d.departmentId)
        );
        return acc;
    }, {});

    const existing = new Set(designations.map((d) => d.name));
    const rows = grouped[activeTab] || [];
    const presetsForTab = (PRESETS[activeTab] || []).filter((p) => !existing.has(p));
    const allPresetsAdded = (PRESETS[activeTab] || []).every((p) => existing.has(p));

    const columns = [
        {
            header: "Title",
            width: "36%",
            render: (d) => (
                <span className="font-semibold text-gray-900 text-14">{d.name}</span>
            ),
        },
        {
            header: "Category",
            width: "18%",
            render: (d) => (
                <Badge tone={CAT_TONE[d.category] || "neutral"} soft>
                    {titleCase(d.category)}
                </Badge>
            ),
        },
        {
            header: "Department",
            width: "22%",
            render: (d) =>
                d.departmentName ? (
                    <span className="text-13 text-gray-500">{d.departmentName}</span>
                ) : (
                    <span className="text-13 text-gray-300">Cross-department</span>
                ),
        },
        {
            header: "Status",
            width: "12%",
            render: (d) => (
                <Badge tone={d.isActive ? "success" : "neutral"} soft>
                    {d.isActive ? "Active" : "Inactive"}
                </Badge>
            ),
        },
        {
            header: "",
            width: "12%",
            align: "right",
            render: (d) => (
                <button
                    type="button"
                    className="zu-btn-icon"
                    aria-label={d.isActive ? "Deactivate" : "Activate"}
                    onClick={() => toggle(d)}
                >
                    {d.isActive ? (
                        <ToggleRight size={16} className="text-success" />
                    ) : (
                        <ToggleLeft size={16} />
                    )}
                </button>
            ),
        },
    ];

    return (
        <div className="zu-page">
            <PageHeader
                title="Designations"
                subtitle="Job titles and roles across departments"
                actions={
                    <Button variant="primary" onClick={() => openCreate()}>
                        <Plus size={14} strokeWidth={2.4} /> Add designation
                    </Button>
                }
            />

            <div className="zu-page-content">
                <div className="flex items-center gap-3 flex-wrap">
                    <Tabs
                        type="pill"
                        active={activeTab}
                        onChange={setActiveTab}
                        tabs={CATEGORIES.map((c) => ({
                            id: c,
                            label: titleCase(c),
                            count: grouped[c]?.length ?? 0,
                        }))}
                    />
                    <div className="ml-auto min-w-56">
                        <SearchableSelect
                            value={deptFilter}
                            onChange={(v) => setDeptFilter(v)}
                            options={[
                                { value: "", label: "All departments" },
                                ...departments.map((d) => ({ value: d.id, label: d.name })),
                            ]}
                            placeholder="Filter by department"
                        />
                    </div>
                </div>

                <Card className="p-0">
                    <div className="hms-group-header">
                        <span className="hms-group-header__title">
                            {titleCase(activeTab)} designations
                        </span>
                        <span className="hms-group-header__count">
                            {rows.length} {rows.length === 1 ? "title" : "titles"}
                        </span>
                    </div>

                    <Table
                        columns={columns}
                        data={rows}
                        loading={loading}
                        emptyMessage="No designations yet. Add from presets below."
                    />

                    <div className="hms-preset-strip">
                        <p className="hms-section-label is-tiny mb-3">Quick add presets</p>
                        <div className="hms-preset-strip__list">
                            {presetsForTab.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => openCreate(p)}
                                    className="hms-preset-chip"
                                >
                                    <Plus size={12} /> {p}
                                </button>
                            ))}
                            {allPresetsAdded && (
                                <span className="hms-preset-strip__none">
                                    All presets added
                                </span>
                            )}
                        </div>
                    </div>
                </Card>
            

            <Modal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                size="md"
                title="New designation"
                footer={
                    <>
                        <Button variant="cancel" onClick={() => setShowModal(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="designation-form"
                            loading={saving}
                        >
                            Create
                        </Button>
                    </>
                }
            >
                <form
                    id="designation-form"
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-4"
                >
                    <FormGroup label="Title / designation *">
                        <Input
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Staff Nurse"
                        />
                    </FormGroup>

                    <div className="grid grid-cols-2 gap-4">
                        <FormGroup label="Category *">
                            <SearchableSelect
                                required
                                value={form.category}
                                onChange={(v) => setForm({ ...form, category: v })}
                                options={CATEGORIES.map((c) => ({
                                    value: c,
                                    label: titleCase(c),
                                }))}
                            />
                        </FormGroup>
                        <FormGroup label="Department">
                            <SearchableSelect
                                value={form.departmentId}
                                onChange={(v) => setForm({ ...form, departmentId: v })}
                                options={[
                                    { value: "", label: "Cross-department" },
                                    ...departments.map((d) => ({
                                        value: d.id,
                                        label: d.name,
                                    })),
                                ]}
                            />
                        </FormGroup>
                    </div>
                </form>
            </Modal>
                    </div>
        </div>
    );
}

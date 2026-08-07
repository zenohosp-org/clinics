import { useState, useEffect, useCallback } from "react";
import { useNotification } from "@/context/NotificationContext";
import { nursingTaskApi } from "@/utils/api";
import { CenterLoader } from "@/components/ui/Loader";
import {
    ClipboardList, Plus, CheckCircle2, XCircle, Trash2,
    AlertCircle, Clock, Sun, Sunset, Moon,
} from "lucide-react";
import { fmtDateTime } from "@/utils/date";
import "@/styles/modules/ipd-nursing.css";

// ── Metadata ───────────────────────────────────────────────────────────────────

const CATEGORY_META = {
    MEDICATION:  { label: "Medication",    color: "violet"  },
    WOUND_CARE:  { label: "Wound care",    color: "rose"    },
    VITALS:      { label: "Vitals",        color: "blue"    },
    HYGIENE:     { label: "Hygiene",       color: "teal"    },
    MOBILITY:    { label: "Mobility",      color: "amber"   },
    IV_LINE:     { label: "IV line",       color: "indigo"  },
    OTHER:       { label: "Other",         color: "gray"    },
};

const SHIFT_META = {
    MORNING:   { label: "Morning",   icon: Sun,    cls: "is-morning"   },
    AFTERNOON: { label: "Afternoon", icon: Sunset, cls: "is-afternoon" },
    NIGHT:     { label: "Night",     icon: Moon,   cls: "is-night"     },
    ANY:       { label: "Any shift", icon: Clock,  cls: "is-any"       },
};

// Preset quick-add chips
const PRESETS = [
    { taskName: "Vitals check",          category: "VITALS",     shift: "ANY"       },
    { taskName: "Wound dressing",        category: "WOUND_CARE", shift: "MORNING"   },
    { taskName: "IV line check",         category: "IV_LINE",    shift: "ANY"       },
    { taskName: "Medication round",      category: "MEDICATION", shift: "ANY"       },
    { taskName: "Patient hygiene",       category: "HYGIENE",    shift: "MORNING"   },
    { taskName: "Mobility assistance",   category: "MOBILITY",   shift: "AFTERNOON" },
    { taskName: "Blood glucose check",   category: "VITALS",     shift: "ANY"       },
    { taskName: "Pressure ulcer check",  category: "WOUND_CARE", shift: "ANY"       },
];

const SHIFT_ORDER = { MORNING: 0, AFTERNOON: 1, NIGHT: 2, ANY: 3 };
const STATUS_ORDER = { PENDING: 0, DONE: 1, SKIPPED: 2 };

const BLANK_FORM = { taskName: "", category: "OTHER", shift: "ANY", dueDate: "", notes: "" };

export default function IpdNursingTab({ admissionId, isDischarged }) {
    const { notify } = useNotification();

    const [tasks, setTasks]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [form, setForm]         = useState(BLANK_FORM);
    const [filter, setFilter]     = useState("ALL"); // ALL | PENDING | DONE | SKIPPED

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const data = await nursingTaskApi.list(admissionId);
            setTasks(Array.isArray(data) ? data : []);
        } catch {
            notify("Failed to load nursing tasks", "error");
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    const handleCreate = async (overrides = {}) => {
        const payload = { ...form, ...overrides };
        if (!payload.taskName.trim()) {
            notify("Task name is required", "warning");
            return;
        }
        setSaving(true);
        try {
            const saved = await nursingTaskApi.create(admissionId, {
                ...payload,
                dueDate: payload.dueDate || undefined,
                notes:   payload.notes   || undefined,
            });
            setTasks((prev) => [saved, ...prev]);
            setForm(BLANK_FORM);
            setShowForm(false);
            notify("Task added", "success");
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to add task", "error");
        } finally {
            setSaving(false);
        }
    };

    const handlePreset = (preset) => {
        handleCreate(preset);
    };

    const handleComplete = async (taskId) => {
        try {
            const updated = await nursingTaskApi.complete(admissionId, taskId);
            setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
            notify("Task marked done", "success");
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to complete task", "error");
        }
    };

    const handleSkip = async (taskId) => {
        try {
            const updated = await nursingTaskApi.skip(admissionId, taskId, {});
            setTasks((prev) => prev.map((t) => t.id === taskId ? updated : t));
            notify("Task skipped", "success");
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to skip task", "error");
        }
    };

    const handleDelete = async (taskId) => {
        try {
            await nursingTaskApi.remove(admissionId, taskId);
            setTasks((prev) => prev.filter((t) => t.id !== taskId));
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to delete task", "error");
        }
    };

    // ── Counts ─────────────────────────────────────────────────────────────────
    const pendingCount = tasks.filter((t) => t.status === "PENDING").length;
    const doneCount    = tasks.filter((t) => t.status === "DONE").length;
    const skippedCount = tasks.filter((t) => t.status === "SKIPPED").length;

    // ── Filtered + sorted ──────────────────────────────────────────────────────
    const visible = tasks
        .filter((t) => filter === "ALL" || t.status === filter)
        .sort((a, b) => {
            const statusDiff = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
            if (statusDiff !== 0) return statusDiff;
            return (SHIFT_ORDER[a.shift] ?? 3) - (SHIFT_ORDER[b.shift] ?? 3);
        });

    return (
        <div className="hms-ipd-tab-body nursing-tab">

            {/* Summary + filter row */}
            {tasks.length > 0 && (
                <div className="nursing-summary-row">
                    <div className="nursing-summary">
                        <button
                            type="button"
                            className={`nursing-filter-pill is-pending${filter === "PENDING" ? " is-active" : ""}`}
                            onClick={() => setFilter((f) => f === "PENDING" ? "ALL" : "PENDING")}
                        >
                            <Clock size={10} /> {pendingCount} Pending
                        </button>
                        <button
                            type="button"
                            className={`nursing-filter-pill is-done${filter === "DONE" ? " is-active" : ""}`}
                            onClick={() => setFilter((f) => f === "DONE" ? "ALL" : "DONE")}
                        >
                            <CheckCircle2 size={10} /> {doneCount} Done
                        </button>
                        <button
                            type="button"
                            className={`nursing-filter-pill is-skipped${filter === "SKIPPED" ? " is-active" : ""}`}
                            onClick={() => setFilter((f) => f === "SKIPPED" ? "ALL" : "SKIPPED")}
                        >
                            <XCircle size={10} /> {skippedCount} Skipped
                        </button>
                    </div>
                </div>
            )}

            {/* Quick-add presets */}
            {!isDischarged && (
                <div className="nursing-presets">
                    <p className="nursing-presets__label">Quick add:</p>
                    <div className="nursing-presets__chips">
                        {PRESETS.map((p) => (
                            <button
                                key={p.taskName}
                                type="button"
                                className="nursing-preset-chip"
                                onClick={() => handleCreate(p)}
                            >
                                <Plus size={10} /> {p.taskName}
                            </button>
                        ))}
                        <button
                            type="button"
                            className="nursing-preset-chip is-custom"
                            onClick={() => setShowForm((v) => !v)}
                        >
                            <Plus size={10} /> Custom…
                        </button>
                    </div>
                </div>
            )}

            {/* Custom task form */}
            {showForm && (
                <div className="nursing-form">
                    <div className="nursing-form__fields">
                        <div className="nursing-form__field nursing-form__field--grow">
                            <label className="nursing-form__label">Task name *</label>
                            <input
                                className="nursing-form__input"
                                placeholder="e.g. Change IV catheter, Nebulisation"
                                value={form.taskName}
                                onChange={(e) => setForm((f) => ({ ...f, taskName: e.target.value }))}
                            />
                        </div>
                        <div className="nursing-form__field">
                            <label className="nursing-form__label">Category</label>
                            <select
                                className="nursing-form__select"
                                value={form.category}
                                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                            >
                                {Object.entries(CATEGORY_META).map(([v, m]) => (
                                    <option key={v} value={v}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="nursing-form__field">
                            <label className="nursing-form__label">Shift</label>
                            <select
                                className="nursing-form__select"
                                value={form.shift}
                                onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
                            >
                                {Object.entries(SHIFT_META).map(([v, m]) => (
                                    <option key={v} value={v}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="nursing-form__field">
                            <label className="nursing-form__label">Due date</label>
                            <input
                                type="date"
                                className="nursing-form__input"
                                value={form.dueDate}
                                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                            />
                        </div>
                        <div className="nursing-form__field nursing-form__field--full">
                            <label className="nursing-form__label">Notes (optional)</label>
                            <input
                                className="nursing-form__input"
                                placeholder="Any instructions or context"
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="nursing-form__actions">
                        <button
                            type="button"
                            className="nursing-form__save-btn"
                            onClick={() => handleCreate()}
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Add task"}
                        </button>
                        <button
                            type="button"
                            className="nursing-form__cancel-btn"
                            onClick={() => { setShowForm(false); setForm(BLANK_FORM); }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {isDischarged && (
                <div className="mar-discharge-notice">
                    <AlertCircle size={14} />
                    <span>Patient discharged — task list is read-only</span>
                </div>
            )}

            {/* Task list */}
            {loading ? (
                <CenterLoader text="Loading tasks…" />
            ) : visible.length === 0 ? (
                <div className="hms-ipd-center-empty">
                    <div className="hms-ipd-center-empty__icon"><ClipboardList size={32} /></div>
                    <p className="hms-ipd-center-empty__text">
                        {filter === "ALL" ? "No nursing tasks yet" : `No ${filter.toLowerCase()} tasks`}
                    </p>
                    {filter === "ALL" && (
                        <p className="hms-ipd-center-empty__sub">
                            Use the quick-add chips above to create tasks
                        </p>
                    )}
                </div>
            ) : (
                <div className="nursing-list">
                    {visible.map((task) => (
                        <TaskRow
                            key={task.id}
                            task={task}
                            isDischarged={isDischarged}
                            onComplete={() => handleComplete(task.id)}
                            onSkip={() => handleSkip(task.id)}
                            onDelete={() => handleDelete(task.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Task row ───────────────────────────────────────────────────────────────────

function TaskRow({ task, isDischarged, onComplete, onSkip, onDelete }) {
    const isPending  = task.status === "PENDING";
    const isDone     = task.status === "DONE";
    const isSkipped  = task.status === "SKIPPED";
    const catMeta    = CATEGORY_META[task.category] || CATEGORY_META.OTHER;
    const shiftMeta  = SHIFT_META[task.shift]       || SHIFT_META.ANY;
    const ShiftIcon  = shiftMeta.icon;

    return (
        <div className={`nursing-row${isDone ? " is-done" : isSkipped ? " is-skipped" : ""}`}>
            {/* Status indicator */}
            <div className={`nursing-row__status-dot${isDone ? " is-done" : isSkipped ? " is-skipped" : " is-pending"}`} />

            <div className="nursing-row__body">
                <div className="nursing-row__top">
                    <span className={`nursing-row__name${isDone || isSkipped ? " is-muted" : ""}`}>
                        {task.taskName}
                    </span>
                    <div className="nursing-row__badges">
                        <span className={`nursing-cat-badge is-${catMeta.color}`}>{catMeta.label}</span>
                        <span className={`nursing-shift-badge ${shiftMeta.cls}`}>
                            <ShiftIcon size={9} /> {shiftMeta.label}
                        </span>
                    </div>
                </div>

                {task.notes && (
                    <p className="nursing-row__notes">{task.notes}</p>
                )}

                <p className="nursing-row__meta">
                    {task.dueDate && <span>Due {task.dueDate}</span>}
                    {task.createdByName && <span>By {task.createdByName}</span>}
                    {isDone && task.completedAt && (
                        <span className="nursing-row__completed">
                            <CheckCircle2 size={9} />
                            Done {fmtDateTime(task.completedAt)}
                            {task.completedByName && ` · ${task.completedByName}`}
                        </span>
                    )}
                    {isSkipped && <span className="nursing-row__skipped-label">Skipped</span>}
                </p>
            </div>

            {/* Actions */}
            {!isDischarged && isPending && (
                <div className="nursing-row__actions">
                    <button
                        type="button"
                        className="nursing-row__btn is-done"
                        title="Mark done"
                        onClick={onComplete}
                    >
                        <CheckCircle2 size={13} />
                    </button>
                    <button
                        type="button"
                        className="nursing-row__btn is-skip"
                        title="Skip"
                        onClick={onSkip}
                    >
                        <XCircle size={13} />
                    </button>
                    <button
                        type="button"
                        className="nursing-row__btn is-delete"
                        title="Delete"
                        onClick={onDelete}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            )}
        </div>
    );
}

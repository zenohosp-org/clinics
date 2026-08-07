import { useState, useEffect, useCallback } from "react";
import { useNotification } from "@/context/NotificationContext";
import { ioApi } from "@/utils/api";
import { CenterLoader } from "@/components/ui/Loader";
import {
    Droplets, ArrowDownToLine, ArrowUpFromLine, Plus, Trash2, AlertCircle,
} from "lucide-react";
import { fmtDateTime } from "@/utils/date";
import "@/styles/modules/ipd-io.css";

// ── Category labels ────────────────────────────────────────────────────────────

const INTAKE_CATEGORIES = [
    { value: "IV_FLUID",    label: "IV Fluid"    },
    { value: "ORAL",        label: "Oral"        },
    { value: "BLOOD",       label: "Blood"       },
    { value: "MEDICATION",  label: "Medication"  },
    { value: "OTHER_INTAKE",label: "Other"       },
];

const OUTPUT_CATEGORIES = [
    { value: "URINE",        label: "Urine"       },
    { value: "DRAIN",        label: "Drain"       },
    { value: "VOMIT",        label: "Vomit"       },
    { value: "STOOL",        label: "Stool"       },
    { value: "BLOOD_LOSS",   label: "Blood loss"  },
    { value: "OTHER_OUTPUT", label: "Other"       },
];

const CATEGORY_LABEL = Object.fromEntries(
    [...INTAKE_CATEGORIES, ...OUTPUT_CATEGORIES].map((c) => [c.value, c.label])
);

const BLANK_FORM = {
    entryType: "INTAKE",
    category:  "IV_FLUID",
    volumeMl:  "",
    notes:     "",
    entryTime: "",
};

export default function IpdIoTab({ admissionId, isDischarged }) {
    const { notify } = useNotification();

    const [entries, setEntries]   = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [form, setForm]         = useState(BLANK_FORM);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const data = await ioApi.list(admissionId);
            setEntries(Array.isArray(data) ? data : []);
        } catch {
            notify("Failed to load I/O entries", "error");
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    // Recompute when form entryType changes — reset category to first in list
    const setEntryType = (type) => {
        const defaultCat = type === "INTAKE" ? "IV_FLUID" : "URINE";
        setForm((f) => ({ ...f, entryType: type, category: defaultCat }));
    };

    const handleSave = async () => {
        if (!form.volumeMl || Number(form.volumeMl) <= 0) {
            notify("Enter a positive volume in mL", "warning");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                entryType: form.entryType,
                category:  form.category,
                volumeMl:  Number(form.volumeMl),
                notes:     form.notes || undefined,
                entryTime: form.entryTime || undefined,
            };
            const saved = await ioApi.add(admissionId, payload);
            setEntries((prev) => [saved, ...prev]);
            setForm(BLANK_FORM);
            setShowForm(false);
            notify("Entry recorded", "success");
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to save entry", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (entryId) => {
        try {
            await ioApi.remove(admissionId, entryId);
            setEntries((prev) => prev.filter((e) => e.id !== entryId));
        } catch {
            notify("Failed to remove entry", "error");
        }
    };

    // ── Totals ────────────────────────────────────────────────────────────────
    const totalIntake  = entries.filter((e) => e.entryType === "INTAKE") .reduce((s, e) => s + (e.volumeMl || 0), 0);
    const totalOutput  = entries.filter((e) => e.entryType === "OUTPUT") .reduce((s, e) => s + (e.volumeMl || 0), 0);
    const balance      = totalIntake - totalOutput;

    // ── Group entries by calendar date ────────────────────────────────────────
    const grouped = groupByDate(entries);

    const categoryOptions = form.entryType === "INTAKE" ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES;

    return (
        <div className="hms-ipd-tab-body io-tab">

            {/* Summary strip */}
            <div className="io-summary">
                <div className="io-summary__card is-intake">
                    <ArrowDownToLine size={14} className="io-summary__icon" />
                    <div>
                        <p className="io-summary__label">Total Intake</p>
                        <p className="io-summary__value">{fmtMl(totalIntake)}</p>
                    </div>
                </div>
                <div className="io-summary__card is-output">
                    <ArrowUpFromLine size={14} className="io-summary__icon" />
                    <div>
                        <p className="io-summary__label">Total Output</p>
                        <p className="io-summary__value">{fmtMl(totalOutput)}</p>
                    </div>
                </div>
                <div className={`io-summary__card is-balance${balance < 0 ? " is-negative" : ""}`}>
                    <Droplets size={14} className="io-summary__icon" />
                    <div>
                        <p className="io-summary__label">Balance</p>
                        <p className="io-summary__value">
                            {balance >= 0 ? "+" : ""}{fmtMl(balance)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Add entry button */}
            {!isDischarged && (
                <div className="io-actions">
                    <button
                        type="button"
                        className="io-add-btn"
                        onClick={() => setShowForm((v) => !v)}
                    >
                        <Plus size={12} /> Add entry
                    </button>
                </div>
            )}

            {/* Add entry form */}
            {showForm && (
                <div className="io-form">
                    {/* Type toggle */}
                    <div className="io-form__type-row">
                        <button
                            type="button"
                            className={`io-type-btn${form.entryType === "INTAKE" ? " is-active-intake" : ""}`}
                            onClick={() => setEntryType("INTAKE")}
                        >
                            <ArrowDownToLine size={12} /> Intake
                        </button>
                        <button
                            type="button"
                            className={`io-type-btn${form.entryType === "OUTPUT" ? " is-active-output" : ""}`}
                            onClick={() => setEntryType("OUTPUT")}
                        >
                            <ArrowUpFromLine size={12} /> Output
                        </button>
                    </div>

                    <div className="io-form__fields">
                        <div className="io-form__field">
                            <label className="io-form__label">Category</label>
                            <select
                                className="io-form__select"
                                value={form.category}
                                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                            >
                                {categoryOptions.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="io-form__field">
                            <label className="io-form__label">Volume (mL) *</label>
                            <input
                                type="number"
                                min="1"
                                className="io-form__input"
                                placeholder="e.g. 500"
                                value={form.volumeMl}
                                onChange={(e) => setForm((f) => ({ ...f, volumeMl: e.target.value }))}
                            />
                        </div>

                        <div className="io-form__field">
                            <label className="io-form__label">Time</label>
                            <input
                                type="datetime-local"
                                className="io-form__input"
                                value={form.entryTime}
                                onChange={(e) => setForm((f) => ({ ...f, entryTime: e.target.value }))}
                            />
                        </div>

                        <div className="io-form__field io-form__field--full">
                            <label className="io-form__label">Notes (optional)</label>
                            <input
                                type="text"
                                className="io-form__input"
                                placeholder="e.g. Normal Saline 0.9%, post-op drain"
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="io-form__actions">
                        <button
                            type="button"
                            className="io-form__save-btn"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                            type="button"
                            className="io-form__cancel-btn"
                            onClick={() => { setShowForm(false); setForm(BLANK_FORM); }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Discharge notice */}
            {isDischarged && (
                <div className="mar-discharge-notice">
                    <AlertCircle size={14} />
                    <span>Patient discharged — I/O chart is read-only</span>
                </div>
            )}

            {/* Entry list */}
            {loading ? (
                <CenterLoader text="Loading I/O entries…" />
            ) : entries.length === 0 ? (
                <div className="hms-ipd-center-empty">
                    <div className="hms-ipd-center-empty__icon"><Droplets size={32} /></div>
                    <p className="hms-ipd-center-empty__text">No I/O entries recorded</p>
                    <p className="hms-ipd-center-empty__sub">
                        Use "Add entry" above to log intake and output
                    </p>
                </div>
            ) : (
                <div className="io-list">
                    {grouped.map(({ date, items }) => (
                        <div key={date} className="io-group">
                            <div className="io-group__header">
                                <span className="io-group__date">{date}</span>
                                <span className="io-group__tally">
                                    <ArrowDownToLine size={10} />
                                    {fmtMl(items.filter((e) => e.entryType === "INTAKE").reduce((s, e) => s + e.volumeMl, 0))}
                                    <ArrowUpFromLine size={10} />
                                    {fmtMl(items.filter((e) => e.entryType === "OUTPUT").reduce((s, e) => s + e.volumeMl, 0))}
                                </span>
                            </div>
                            {items.map((entry) => (
                                <EntryRow
                                    key={entry.id}
                                    entry={entry}
                                    onRemove={isDischarged ? null : () => handleRemove(entry.id)}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EntryRow({ entry, onRemove }) {
    const isIntake = entry.entryType === "INTAKE";
    return (
        <div className={`io-entry${isIntake ? " is-intake" : " is-output"}`}>
            <div className={`io-entry__indicator${isIntake ? " is-intake" : " is-output"}`}>
                {isIntake
                    ? <ArrowDownToLine size={11} />
                    : <ArrowUpFromLine size={11} />}
            </div>
            <div className="io-entry__body">
                <div className="io-entry__top">
                    <span className="io-entry__category">
                        {CATEGORY_LABEL[entry.category] || entry.category}
                    </span>
                    <span className={`io-entry__volume${isIntake ? " is-intake" : " is-output"}`}>
                        {isIntake ? "+" : "−"}{entry.volumeMl} mL
                    </span>
                </div>
                {entry.notes && (
                    <p className="io-entry__notes">{entry.notes}</p>
                )}
                <p className="io-entry__meta">
                    {fmtDateTime(entry.entryTime)}
                    {entry.recordedByName && ` · ${entry.recordedByName}`}
                </p>
            </div>
            {onRemove && (
                <button
                    type="button"
                    className="io-entry__del"
                    onClick={onRemove}
                    aria-label="Remove entry"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMl(ml) {
    if (Math.abs(ml) >= 1000) return `${(ml / 1000).toFixed(1)} L`;
    return `${ml} mL`;
}

function groupByDate(entries) {
    const map = new Map();
    for (const e of entries) {
        const d = e.entryTime
            ? new Date(e.entryTime).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : "Unknown date";
        if (!map.has(d)) map.set(d, []);
        map.get(d).push(e);
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

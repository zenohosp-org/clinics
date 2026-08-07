import { useState, useEffect, useCallback } from "react";
import { useNotification } from "@/context/NotificationContext";
import { referralApi } from "@/utils/api";
import { CenterLoader } from "@/components/ui/Loader";
import {
    ArrowRightLeft, Plus, CheckCircle2, XCircle,
    AlertCircle, Clock, ExternalLink, Building2, ChevronDown, ChevronUp,
} from "lucide-react";
import { fmtDateTime } from "@/utils/date";
import "@/styles/modules/ipd-referral.css";

// ── Metadata ───────────────────────────────────────────────────────────────────

const STATUS_META = {
    PENDING:   { label: "Pending",   cls: "is-pending"   },
    ACCEPTED:  { label: "Accepted",  cls: "is-accepted"  },
    COMPLETED: { label: "Completed", cls: "is-completed" },
    CANCELLED: { label: "Cancelled", cls: "is-cancelled" },
};

const PRIORITY_META = {
    ROUTINE:   { label: "Routine",   cls: "is-routine"   },
    URGENT:    { label: "Urgent",    cls: "is-urgent"    },
    EMERGENCY: { label: "Emergency", cls: "is-emergency" },
};

const STATUS_ORDER = { PENDING: 0, ACCEPTED: 1, COMPLETED: 2, CANCELLED: 3 };

const BLANK_FORM = {
    referredToName: "", referredToType: "INTERNAL",
    reason: "", priority: "ROUTINE", notes: "",
};

const BLANK_RESPOND_FORM = { acceptedByName: "", notes: "" };

export default function IpdReferralTab({ admissionId, isDischarged }) {
    const { notify } = useNotification();

    const [referrals, setReferrals] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [showForm, setShowForm]   = useState(false);
    const [saving, setSaving]       = useState(false);
    const [form, setForm]           = useState(BLANK_FORM);

    // Per-referral respond panels: { [id]: { action, open, saving, form } }
    const [panels, setPanels] = useState({});

    const fetchReferrals = useCallback(async () => {
        setLoading(true);
        try {
            const data = await referralApi.list(admissionId);
            const sorted = (Array.isArray(data) ? data : []).sort(
                (a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)
            );
            setReferrals(sorted);
        } catch {
            notify("Failed to load referrals", "error");
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

    const handleCreate = async () => {
        if (!form.referredToName.trim()) { notify("Refer-to name is required", "warning"); return; }
        if (!form.reason.trim())         { notify("Reason is required", "warning");         return; }
        setSaving(true);
        try {
            const saved = await referralApi.create(admissionId, {
                ...form,
                notes: form.notes || undefined,
            });
            setReferrals((prev) =>
                [saved, ...prev].sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0))
            );
            setForm(BLANK_FORM);
            setShowForm(false);
            notify("Referral created", "success");
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to create referral", "error");
        } finally {
            setSaving(false);
        }
    };

    const openPanel = (id, action) => {
        setPanels((prev) => ({
            ...prev,
            [id]: { action, open: true, saving: false, form: { ...BLANK_RESPOND_FORM } },
        }));
    };

    const closePanel = (id) => setPanels((prev) => ({ ...prev, [id]: { ...prev[id], open: false } }));

    const setPanelField = (id, field, value) =>
        setPanels((prev) => ({ ...prev, [id]: { ...prev[id], form: { ...prev[id].form, [field]: value } } }));

    const handleRespond = async (referralId) => {
        const panel = panels[referralId];
        if (!panel) return;
        setPanels((prev) => ({ ...prev, [referralId]: { ...prev[referralId], saving: true } }));
        try {
            let updated;
            if (panel.action === "accept") {
                updated = await referralApi.accept(admissionId, referralId, panel.form);
            } else if (panel.action === "complete") {
                updated = await referralApi.complete(admissionId, referralId, { notes: panel.form.notes });
            } else {
                updated = await referralApi.cancel(admissionId, referralId, { notes: panel.form.notes });
            }
            setReferrals((prev) =>
                prev.map((r) => r.id === referralId ? updated : r)
                    .sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0))
            );
            setPanels((prev) => ({ ...prev, [referralId]: { open: false, saving: false, form: { ...BLANK_RESPOND_FORM } } }));
            notify(
                panel.action === "accept" ? "Referral accepted" :
                panel.action === "complete" ? "Referral completed" : "Referral cancelled",
                "success"
            );
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to update referral", "error");
            setPanels((prev) => ({ ...prev, [referralId]: { ...prev[referralId], saving: false } }));
        }
    };

    const pendingCount   = referrals.filter((r) => r.status === "PENDING").length;
    const acceptedCount  = referrals.filter((r) => r.status === "ACCEPTED").length;
    const completedCount = referrals.filter((r) => r.status === "COMPLETED").length;

    return (
        <div className="hms-ipd-tab-body referral-tab">

            {/* Summary */}
            {referrals.length > 0 && (
                <div className="referral-summary">
                    <div className="referral-summary__pill is-pending">
                        <Clock size={10} /> {pendingCount} Pending
                    </div>
                    <div className="referral-summary__pill is-accepted">
                        <CheckCircle2 size={10} /> {acceptedCount} Accepted
                    </div>
                    <div className="referral-summary__pill is-completed">
                        <ArrowRightLeft size={10} /> {completedCount} Completed
                    </div>
                </div>
            )}

            {/* New referral button */}
            {!isDischarged && (
                <div className="referral-actions">
                    <button
                        type="button"
                        className="referral-add-btn"
                        onClick={() => setShowForm((v) => !v)}
                    >
                        <Plus size={12} /> New referral
                    </button>
                </div>
            )}

            {/* New referral form */}
            {showForm && (
                <div className="referral-form">
                    <div className="referral-form__fields">
                        <div className="referral-form__field referral-form__field--grow">
                            <label className="referral-form__label">Refer to (specialty / hospital) *</label>
                            <input
                                className="referral-form__input"
                                placeholder="e.g. Cardiology, Neurology, City Hospital"
                                value={form.referredToName}
                                onChange={(e) => setForm((f) => ({ ...f, referredToName: e.target.value }))}
                            />
                        </div>
                        <div className="referral-form__field">
                            <label className="referral-form__label">Type</label>
                            <select
                                className="referral-form__select"
                                value={form.referredToType}
                                onChange={(e) => setForm((f) => ({ ...f, referredToType: e.target.value }))}
                            >
                                <option value="INTERNAL">Internal</option>
                                <option value="EXTERNAL">External</option>
                            </select>
                        </div>
                        <div className="referral-form__field">
                            <label className="referral-form__label">Priority</label>
                            <select
                                className="referral-form__select"
                                value={form.priority}
                                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                            >
                                <option value="ROUTINE">Routine</option>
                                <option value="URGENT">Urgent</option>
                                <option value="EMERGENCY">Emergency</option>
                            </select>
                        </div>
                        <div className="referral-form__field referral-form__field--full">
                            <label className="referral-form__label">Reason / clinical summary *</label>
                            <textarea
                                className="referral-form__textarea"
                                rows={3}
                                placeholder="Brief clinical summary and reason for referral…"
                                value={form.reason}
                                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                            />
                        </div>
                        <div className="referral-form__field referral-form__field--full">
                            <label className="referral-form__label">Additional notes (optional)</label>
                            <input
                                className="referral-form__input"
                                placeholder="Any extra context for the receiving team"
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="referral-form__actions">
                        <button
                            type="button"
                            className="referral-form__save-btn"
                            onClick={handleCreate}
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Create referral"}
                        </button>
                        <button
                            type="button"
                            className="referral-form__cancel-btn"
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
                    <span>Patient discharged — referrals are read-only</span>
                </div>
            )}

            {/* List */}
            {loading ? (
                <CenterLoader text="Loading referrals…" />
            ) : referrals.length === 0 ? (
                <div className="hms-ipd-center-empty">
                    <div className="hms-ipd-center-empty__icon"><ArrowRightLeft size={32} /></div>
                    <p className="hms-ipd-center-empty__text">No referrals for this admission</p>
                    <p className="hms-ipd-center-empty__sub">
                        Use "New referral" above to refer to a specialist or department
                    </p>
                </div>
            ) : (
                <div className="referral-list">
                    {referrals.map((ref) => {
                        const panel = panels[ref.id] || { open: false, saving: false, form: BLANK_RESPOND_FORM };
                        return (
                            <ReferralCard
                                key={ref.id}
                                referral={ref}
                                panel={panel}
                                isDischarged={isDischarged}
                                onOpenPanel={(action) => openPanel(ref.id, action)}
                                onClosePanel={() => closePanel(ref.id)}
                                onPanelFieldChange={(field, value) => setPanelField(ref.id, field, value)}
                                onRespond={() => handleRespond(ref.id)}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Referral card ──────────────────────────────────────────────────────────────

function ReferralCard({
    referral, panel, isDischarged,
    onOpenPanel, onClosePanel, onPanelFieldChange, onRespond,
}) {
    const statusMeta   = STATUS_META[referral.status]     || STATUS_META.PENDING;
    const priorityMeta = PRIORITY_META[referral.priority] || PRIORITY_META.ROUTINE;
    const isInternal   = referral.referredToType === "INTERNAL";
    const isPending    = referral.status === "PENDING";
    const isAccepted   = referral.status === "ACCEPTED";
    const isTerminal   = referral.status === "COMPLETED" || referral.status === "CANCELLED";

    const TypeIcon = isInternal ? Building2 : ExternalLink;

    return (
        <div className={`referral-card${isTerminal ? ` is-${referral.status.toLowerCase()}` : ""}`}>
            {/* Header */}
            <div className="referral-card__head">
                <div className="referral-card__title-row">
                    <TypeIcon size={14} className="referral-card__icon" />
                    <span className="referral-card__name">{referral.referredToName}</span>
                    <span className={`referral-type-badge${isInternal ? " is-internal" : " is-external"}`}>
                        {isInternal ? "Internal" : "External"}
                    </span>
                </div>
                <div className="referral-card__badges">
                    <span className={`referral-status-badge ${statusMeta.cls}`}>{statusMeta.label}</span>
                    <span className={`referral-priority-badge ${priorityMeta.cls}`}>{priorityMeta.label}</span>
                </div>
            </div>

            {/* Reason */}
            <p className="referral-card__reason">{referral.reason}</p>

            {/* Meta */}
            <div className="referral-card__meta">
                {referral.referredByName && <span>By {referral.referredByName}</span>}
                <span>{fmtDateTime(referral.createdAt)}</span>
            </div>

            {/* Accepted info */}
            {isAccepted && referral.acceptedAt && (
                <p className="referral-card__accepted-info">
                    <CheckCircle2 size={11} />
                    Accepted {fmtDateTime(referral.acceptedAt)}
                    {referral.acceptedByName && ` by ${referral.acceptedByName}`}
                </p>
            )}

            {/* Completion / notes */}
            {isTerminal && referral.notes && (
                <div className="referral-card__outcome">
                    <p className="referral-card__outcome-notes">{referral.notes}</p>
                    {referral.completedAt && (
                        <p className="referral-card__outcome-meta">
                            {fmtDateTime(referral.completedAt)}
                            {referral.respondedByName && ` · ${referral.respondedByName}`}
                        </p>
                    )}
                </div>
            )}

            {/* Action buttons */}
            {!isDischarged && !isTerminal && (
                <div className="referral-card__actions">
                    {isPending && (
                        <button
                            type="button"
                            className="referral-card__btn is-accept"
                            onClick={() => onOpenPanel(panel.open && panel.action === "accept" ? null : "accept")}
                        >
                            <CheckCircle2 size={11} /> Accept
                            {panel.open && panel.action === "accept" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                    )}
                    {(isPending || isAccepted) && (
                        <button
                            type="button"
                            className="referral-card__btn is-complete"
                            onClick={() => onOpenPanel(panel.open && panel.action === "complete" ? null : "complete")}
                        >
                            <ArrowRightLeft size={11} /> Complete
                            {panel.open && panel.action === "complete" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                    )}
                    <button
                        type="button"
                        className="referral-card__btn is-cancel"
                        onClick={() => onOpenPanel(panel.open && panel.action === "cancel" ? null : "cancel")}
                    >
                        <XCircle size={11} /> Cancel
                        {panel.open && panel.action === "cancel" ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                </div>
            )}

            {/* Respond panel */}
            {panel.open && (
                <div className="referral-respond-panel">
                    {panel.action === "accept" && (
                        <div className="referral-form__field">
                            <label className="referral-form__label">Accepted by (consultant name)</label>
                            <input
                                className="referral-form__input"
                                placeholder="Dr. Name (optional)"
                                value={panel.form.acceptedByName}
                                onChange={(e) => onPanelFieldChange("acceptedByName", e.target.value)}
                            />
                        </div>
                    )}
                    <div className="referral-form__field">
                        <label className="referral-form__label">
                            {panel.action === "accept"   ? "Notes (optional)"  :
                             panel.action === "complete" ? "Outcome / summary (optional)" :
                             "Reason for cancellation (optional)"}
                        </label>
                        <input
                            className="referral-form__input"
                            placeholder={
                                panel.action === "complete" ? "e.g. Reviewed, managed conservatively…" :
                                panel.action === "cancel"   ? "e.g. Patient condition improved…" : ""
                            }
                            value={panel.form.notes}
                            onChange={(e) => onPanelFieldChange("notes", e.target.value)}
                        />
                    </div>
                    <div className="referral-form__actions" style={{ marginTop: 10 }}>
                        <button
                            type="button"
                            className={`referral-respond-btn is-${panel.action}`}
                            onClick={onRespond}
                            disabled={panel.saving}
                        >
                            {panel.saving ? "Saving…" :
                             panel.action === "accept"   ? "Confirm accept"   :
                             panel.action === "complete" ? "Confirm complete" :
                             "Confirm cancel"}
                        </button>
                        <button type="button" className="referral-form__cancel-btn" onClick={onClosePanel}>
                            Back
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

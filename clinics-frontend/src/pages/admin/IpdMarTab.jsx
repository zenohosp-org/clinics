import { useState, useEffect, useCallback, useRef } from "react";
import { useNotification } from "@/context/NotificationContext";
import { marApi, drugsApi } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { CenterLoader, Spinner } from "@/components/ui/Loader";
import {
    Pill, Clock, User as UserIcon, CheckCircle2, XCircle,
    PauseCircle, AlertCircle, ChevronDown, ChevronUp,
    StopCircle, BanIcon, AlertTriangle, Undo2, ArrowRightLeft, Search,
} from "lucide-react";
import { fmtDateTime, fmtTime } from "@/utils/date";
import "@/styles/modules/ipd-mar.css";

// ── Status metadata ────────────────────────────────────────────────────────────

const STATUS_META = {
    GIVEN:   { label: "Given",              Icon: CheckCircle2, cls: "is-given"   },
    HELD:    { label: "Held",               Icon: PauseCircle,  cls: "is-held"    },
    REFUSED: { label: "Refused by patient", Icon: XCircle,      cls: "is-refused" },
};

const STATUS_OPTIONS = [
    { value: "GIVEN",   label: "Given"             },
    { value: "HELD",    label: "Held (withheld)"    },
    { value: "REFUSED", label: "Refused by patient" },
];

// Roles that may stop an order (mirrors @PreAuthorize on the backend endpoint)
const CAN_STOP_ROLES = new Set(["doctor", "hospital_admin", "super_admin"]);

// Roles that may initiate a ward return. Nurses are the primary caller —
// they're the ones physically returning unused units to pharmacy.
const CAN_RETURN_ROLES = new Set(["nurse", "doctor", "hospital_admin", "super_admin"]);

// Roles that may attach a replacement drug to a return (the "switch drug"
// branch). Mirrors the backend's CAN_PRESCRIBE_ROLES — switching IS
// prescribing, and only doctors / admins may prescribe.
const CAN_SWITCH_ROLES = new Set(["doctor", "hospital_admin", "super_admin"]);

// Drug frequencies + routes — must mirror the backend enums byte-for-byte.
// Kept local here so the IpdMarTab doesn't have to depend on the heavier
// PrescriptionDrugRow component (which carries a full table layout).
const REPLACEMENT_FREQUENCIES = [
    { value: "OD",   label: "OD — Once daily" },
    { value: "BD",   label: "BD — Twice daily" },
    { value: "TDS",  label: "TDS — Thrice daily" },
    { value: "QID",  label: "QID — Four times daily" },
    { value: "Q4H",  label: "Q4H — Every 4 hours" },
    { value: "Q6H",  label: "Q6H — Every 6 hours" },
    { value: "Q8H",  label: "Q8H — Every 8 hours" },
    { value: "HS",   label: "HS — At bedtime" },
    { value: "AC",   label: "AC — Before meals" },
    { value: "PC",   label: "PC — After meals" },
    { value: "SOS",  label: "SOS — As needed" },
    { value: "STAT", label: "STAT — Immediately, once" },
];
const REPLACEMENT_ROUTES = [
    { value: "ORAL", label: "Oral" }, { value: "IV", label: "IV" },
    { value: "IM",   label: "IM"   }, { value: "SC", label: "Subcutaneous" },
    { value: "TOPICAL", label: "Topical" }, { value: "INHALED", label: "Inhaled" },
    { value: "OPHTHALMIC", label: "Eye" }, { value: "OTIC", label: "Ear" },
    { value: "NASAL",  label: "Nasal" }, { value: "RECTAL", label: "Rectal" },
];

// Categorical reasons the backend accepts. Order is intentional: the most
// common nurse-side scenarios up top. The QUARANTINE-bound reasons (the
// pharmacist won't credit sellable stock) are grouped and visually flagged
// in the select via a "→ quarantine" suffix.
const RETURN_REASONS = [
    { value: "INEFFECTIVE",          label: "Drug ineffective",          quarantine: true  },
    { value: "ADVERSE_REACTION",     label: "Adverse reaction",          quarantine: true  },
    { value: "DOSE_CHANGE",          label: "Doctor changed dose",       quarantine: false },
    { value: "ORDER_STOPPED",        label: "Order stopped",             quarantine: false },
    { value: "WRONG_DRUG_DISPENSED", label: "Wrong drug dispensed",      quarantine: false },
    { value: "EXPIRY_NEAR",          label: "Near expiry",               quarantine: true  },
    { value: "WASTAGE_BROKEN",       label: "Wastage — broken/damaged",  quarantine: true  },
    { value: "WASTAGE_SPILLED",      label: "Wastage — spilled",         quarantine: true  },
    { value: "OTHER",                label: "Other (specify in notes)",  quarantine: false },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function localNow() {
    const d = new Date();
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
}

function emptyForm() {
    return { administeredAt: localNow(), status: "GIVEN", doseGiven: "", reason: "", notes: "" };
}

function emptyStopForm() {
    return { reason: "" };
}

function emptyReturnForm(defaultQty = 1, isStopped = false) {
    return {
        returnQty:   String(defaultQty),
        reasonCode:  "INEFFECTIVE",
        reasonNotes: "",
        // Batch identifier the nurse reads off the physical strip. Optional —
        // pharmacy falls back to the earliest-dispense default when blank, so
        // single-batch returns don't have to deal with this field.
        batchNumber: "",
        // Default to "also stop this order" only when the order is still
        // active — otherwise the hidden stop-reason field would block
        // submission with a stale "reason required" check.
        stopOrder:   !isStopped,
        stopReason:  "",
        // Replacement-drug fields. The picker stays collapsed until the user
        // explicitly chooses to switch — so the typical "just return unused"
        // path stays one-click.
        switchDrug:        false,
        replDrugId:        null,
        replDrugName:      "",
        replDrugGeneric:   "",
        replDrugStrength:  "",
        replDrugForm:      "",
        replDose:          "",
        replFrequency:     "BD",
        replDurationDays:  "",
        replQuantity:      "",
        replRoute:         "ORAL",
        replInstructions:  "",
    };
}

/** Effective returnable units = pharmacy-issued minus already returned. */
function returnableQty(order) {
    const d = Number(order?.dispensedQty ?? 0);
    const r = Number(order?.returnedQty  ?? 0);
    return Math.max(0, d - r);
}

// Hours between scheduled doses for fixed-interval frequencies. Frequencies
// tied to events (meals, bedtime) or given as-needed have no fixed schedule
// and are intentionally omitted — they never show a due/overdue badge.
const FREQUENCY_INTERVAL_HOURS = {
    OD: 24, BD: 12, TDS: 8, QID: 6,
    Q4H: 4, Q6H: 6, Q8H: 8,
};

const DUE_SOON_WINDOW_MS = 30 * 60 * 1000;

/** Returns { state: "due"|"overdue", nextDueAt: Date } or null if no badge applies. */
function getDoseSchedule(order, now) {
    if (order.status === "STOPPED") return null;
    const intervalHours = FREQUENCY_INTERVAL_HOURS[order.frequency];
    if (!intervalHours) return null;

    const lastGiven = (order.administrations || [])
        .filter((a) => a.status === "GIVEN" && a.administeredAt)
        .map((a) => new Date(a.administeredAt).getTime())
        .sort((a, b) => b - a)[0];

    const baseline = lastGiven ?? (order.prescribedAt ? new Date(order.prescribedAt).getTime() : null);
    if (baseline == null || Number.isNaN(baseline)) return null;

    const nextDueAt = baseline + intervalHours * 60 * 60 * 1000;
    const diffMs = nextDueAt - now.getTime();

    if (diffMs <= 0) return { state: "overdue", nextDueAt: new Date(nextDueAt) };
    if (diffMs <= DUE_SOON_WINDOW_MS) return { state: "due", nextDueAt: new Date(nextDueAt) };
    return null;
}

// ── Main component ──────────────────────────────────────────────────────────────

export default function IpdMarTab({ admissionId, isDischarged, allergies }) {
    const { notify }    = useNotification();
    const { user }      = useAuth();
    const canStop       = CAN_STOP_ROLES.has(user?.role);
    const canReturn     = CAN_RETURN_ROLES.has(user?.role);
    const canSwitch     = CAN_SWITCH_ROLES.has(user?.role);

    const [orders, setOrders]             = useState([]);
    const [loading, setLoading]           = useState(true);
    const [forms, setForms]               = useState({});
    const [stopForms, setStopForms]       = useState({});
    const [stopOpen, setStopOpen]         = useState({});
    const [returnForms, setReturnForms]   = useState({});
    const [returnOpen, setReturnOpen]     = useState({});
    const [returningId, setReturningId]   = useState(null);
    const [expanded, setExpanded]         = useState({});
    const [savingId, setSavingId]         = useState(null);
    const [stoppingId, setStoppingId]     = useState(null);
    const [now, setNow]                   = useState(() => new Date());

    // Keep due/overdue badges current without requiring a page refresh.
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const fetchOrders = useCallback(async () => {
        try {
            const data = await marApi.list(admissionId);
            // ACTIVE orders first, STOPPED last; within each group preserve server order
            const sorted = [...(data ?? [])].sort((a, b) => {
                const aS = "STOPPED" === a.status ? 1 : 0;
                const bS = "STOPPED" === b.status ? 1 : 0;
                return aS - bS;
            });
            setOrders(sorted);
        } catch {
            // Non-fatal — empty state shown
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const getForm        = (id) => forms[id] ?? emptyForm();
    const getStopForm    = (id) => stopForms[id] ?? emptyStopForm();
    const getReturnForm  = (id, defaultQty, isStopped = false) =>
        returnForms[id] ?? emptyReturnForm(defaultQty, isStopped);
    const setField       = (id, field) => (e) =>
        setForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyForm()), [field]: e.target.value } }));
    const setStopField   = (id, field) => (e) =>
        setStopForms((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyStopForm()), [field]: e.target.value } }));
    const setReturnField = (id, field) => (e) => {
        // Checkboxes use .checked, every other input uses .value.
        const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setReturnForms((prev) => ({
            ...prev,
            [id]: { ...(prev[id] ?? emptyReturnForm()), [field]: val },
        }));
    };
    const resetForm    = (id) => setForms((prev) => ({ ...prev, [id]: emptyForm() }));
    const toggleLog    = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    const toggleStop   = (id) => setStopOpen((prev) => ({ ...prev, [id]: !prev[id] }));
    const toggleReturn = (id, defaultQty, isStopped = false) => {
        setReturnOpen((prev) => ({ ...prev, [id]: !prev[id] }));
        // Seed the form with a sane default qty the first time the panel opens
        // so the nurse doesn't have to type "1" for the common single-strip case.
        // isStopped flips the stopOrder default off — a stopped order can't be
        // re-stopped, and the stopReason input is hidden in that branch.
        setReturnForms((prev) =>
            prev[id] ? prev : { ...prev, [id]: emptyReturnForm(defaultQty, isStopped) },
        );
    };

    const handleSubmit = async (e, orderId) => {
        e.preventDefault();
        const f = getForm(orderId);

        if ((f.status === "HELD" || f.status === "REFUSED") && !f.reason.trim()) {
            notify("Reason is required when status is Held or Refused", "warning");
            return;
        }

        const payload = {
            admissionId,
            orderId,
            administeredAt: f.administeredAt || undefined,
            status:         f.status,
            doseGiven:      f.doseGiven.trim() || undefined,
            reason:         f.reason.trim()    || undefined,
            notes:          f.notes.trim()     || undefined,
        };

        setSavingId(orderId);
        try {
            const saved = await marApi.create(payload);
            setOrders((prev) =>
                prev.map((o) =>
                    o.orderId === orderId
                        ? { ...o, administrations: [...(o.administrations ?? []), saved] }
                        : o
                )
            );
            setExpanded((prev) => ({ ...prev, [orderId]: true }));
            resetForm(orderId);
            notify("Administration recorded", "success");
            fetchOrders();
        } catch (err) {
            const msg = err?.response?.data?.message ?? "Failed to record administration";
            notify(msg, "error");
        } finally {
            setSavingId(null);
        }
    };

    const handleStop = async (e, orderId) => {
        e.preventDefault();
        const f = getStopForm(orderId);
        if (!f.reason.trim()) {
            notify("Reason is required to stop an order", "warning");
            return;
        }

        setStoppingId(orderId);
        try {
            await marApi.stopOrder(orderId, f.reason.trim());
            setOrders((prev) =>
                [...prev].sort((a, b) => {
                    const aId = a.orderId === orderId ? 1 : ("STOPPED" === a.status ? 1 : 0);
                    const bId = b.orderId === orderId ? 1 : ("STOPPED" === b.status ? 1 : 0);
                    return aId - bId;
                })
            );
            setStopOpen((prev) => ({ ...prev, [orderId]: false }));
            notify("Order stopped", "success");
            fetchOrders();
        } catch (err) {
            const msg = err?.response?.data?.message ?? "Failed to stop order";
            notify(msg, "error");
        } finally {
            setStoppingId(null);
        }
    };

    const handleReturn = async (e, order) => {
        e.preventDefault();
        const orderId    = order.orderId;
        const isStopped  = order.status === "STOPPED";
        const f          = getReturnForm(orderId, 1, isStopped);
        const max        = returnableQty(order);
        const qty        = Number(f.returnQty);
        // A stopped order can't be re-stopped, so the stopOrder flag is a no-op.
        // We squash it here so both validation and the outgoing payload behave
        // as if the user had unchecked it.
        const willStop   = !isStopped && !!f.stopOrder;
        const willSwitch = canSwitch && !!f.switchDrug;

        if (!Number.isFinite(qty) || qty <= 0) {
            notify("Return quantity must be a positive number", "warning");
            return;
        }
        if (qty > max) {
            notify(`Cannot return more than ${max} unit(s) — that's all pharmacy has issued`, "warning");
            return;
        }
        if (!f.reasonCode) {
            notify("Pick a reason for the return", "warning");
            return;
        }
        if (f.reasonCode === "OTHER" && !f.reasonNotes.trim()) {
            notify("Notes are required when the reason is Other", "warning");
            return;
        }
        if (willStop && !f.stopReason.trim()) {
            notify("Reason is required when stopping the order with the return", "warning");
            return;
        }

        // Replacement-drug validation — only enforced when the switch panel is open.
        let replacement;
        if (willSwitch) {
            if (!f.replDrugName?.trim()) {
                notify("Pick the replacement drug from search before submitting the switch", "warning");
                return;
            }
            const replQty = Number(f.replQuantity);
            if (!Number.isFinite(replQty) || replQty <= 0) {
                notify("Replacement quantity must be a positive number", "warning");
                return;
            }
            replacement = {
                drugId:        f.replDrugId || undefined,
                drugName:      f.replDrugName.trim(),
                drugGeneric:   f.replDrugGeneric?.trim()  || undefined,
                drugStrength:  f.replDrugStrength?.trim() || undefined,
                drugForm:      f.replDrugForm?.trim()     || undefined,
                dose:          f.replDose?.trim()         || undefined,
                frequency:     f.replFrequency,
                durationDays:  f.replDurationDays ? Number(f.replDurationDays) : undefined,
                quantity:      replQty,
                route:         f.replRoute,
                instructions:  f.replInstructions?.trim() || undefined,
            };
        }

        setReturningId(orderId);
        try {
            const resp = await marApi.initiateReturn(orderId, {
                stopOrder:   willStop,
                stopReason:  willStop ? f.stopReason.trim() : undefined,
                returnQty:   qty,
                reasonCode:  f.reasonCode,
                reasonNotes: f.reasonNotes.trim() || undefined,
                // Trim + upper-case so pharmacy's case-insensitive batch
                // resolve doesn't trip on stray spaces or lowercase entry.
                batchNumber: f.batchNumber?.trim()
                    ? f.batchNumber.trim().toUpperCase()
                    : undefined,
                replacement,
            });
            setReturnOpen((prev)  => ({ ...prev, [orderId]: false }));
            setReturnForms((prev) => ({ ...prev, [orderId]: emptyReturnForm(1, isStopped) }));
            const switchedTo = resp?.replacementDrugName;
            notify(
                switchedTo
                    ? `Return sent · switched to ${switchedTo}`
                    : willStop
                        ? `Return of ${qty} unit(s) sent to pharmacy and order stopped`
                        : `Return of ${qty} unit(s) sent to pharmacy`,
                "success",
            );
            fetchOrders();
        } catch (err) {
            // Surface the server's BadRequestException message verbatim — it
            // already says things like "returnQty exceeds returnable units …".
            const msg = err?.response?.data?.message ?? "Failed to initiate return";
            notify(msg, "error");
        } finally {
            setReturningId(null);
        }
    };

    const knownAllergies = Array.isArray(allergies) ? allergies : [];

    return (
        <div className="hms-ipd-tab-body mar-tab">

            {knownAllergies.length > 0 && (
                <div className="hms-allergy-banner">
                    <AlertTriangle size={13} className="hms-allergy-banner__icon" />
                    <span className="hms-allergy-banner__label">Known allergies:</span>
                    <div className="hms-allergy-chip-row">
                        {knownAllergies.map((a) => (
                            <span
                                key={a.id}
                                className={`hms-allergy-chip is-${(a.severity || "UNKNOWN").toLowerCase()} is-readonly`}
                                title={a.reaction || undefined}
                            >
                                {a.allergen}
                                {a.reaction && <span className="hms-allergy-chip__reaction">· {a.reaction}</span>}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {isDischarged && (
                <div className="mar-discharge-notice">
                    <AlertCircle size={14} />
                    <span>Patient discharged — MAR is read-only</span>
                </div>
            )}

            {loading ? (
                <CenterLoader text="Loading medication orders…" />
            ) : orders.length === 0 ? (
                <div className="hms-ipd-center-empty">
                    <div className="hms-ipd-center-empty__icon"><Pill size={32} /></div>
                    <p className="hms-ipd-center-empty__text">No prescription orders for this admission</p>
                    <p className="hms-ipd-center-empty__sub">
                        Write a prescription from the IPD log tab to add orders here
                    </p>
                </div>
            ) : (
                <div className="mar-list">
                    {orders.map((order) => {
                        const max         = returnableQty(order);
                        const isStopped   = order.status === "STOPPED";
                        const seedQty     = Math.max(1, max);
                        return (
                            <OrderCard
                                key={order.orderId}
                                order={order}
                                now={now}
                                form={getForm(order.orderId)}
                                stopForm={getStopForm(order.orderId)}
                                returnForm={getReturnForm(order.orderId, seedQty, isStopped)}
                                setField={setField}
                                setStopField={setStopField}
                                setReturnField={setReturnField}
                                onSubmit={handleSubmit}
                                onStop={handleStop}
                                onReturn={handleReturn}
                                saving={savingId === order.orderId}
                                stopping={stoppingId === order.orderId}
                                returning={returningId === order.orderId}
                                stopOpen={!!stopOpen[order.orderId]}
                                onToggleStop={() => toggleStop(order.orderId)}
                                returnOpen={!!returnOpen[order.orderId]}
                                onToggleReturn={() => toggleReturn(order.orderId, seedQty, isStopped)}
                                returnableQty={max}
                                logExpanded={!!expanded[order.orderId]}
                                onToggleLog={() => toggleLog(order.orderId)}
                                isDischarged={isDischarged}
                                canStop={canStop}
                                canReturn={canReturn}
                                canSwitch={canSwitch}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Order card ──────────────────────────────────────────────────────────────────

function OrderCard({
    order, now, form, stopForm, returnForm,
    setField, setStopField, setReturnField,
    onSubmit, onStop, onReturn,
    saving, stopping, returning,
    stopOpen, onToggleStop,
    returnOpen, onToggleReturn, returnableQty,
    logExpanded, onToggleLog,
    isDischarged, canStop, canReturn, canSwitch,
}) {
    const isStopped       = "STOPPED" === order.status;
    const adminCount      = order.administrations?.length ?? 0;
    // GIVEN-only count drives the clinical "consumed so far" pill. HELD and
    // REFUSED rows exist in MAR but no drug actually entered the patient,
    // so they're intentionally excluded.
    const givenCount      = Array.isArray(order.administrations)
        ? order.administrations.filter((a) => "GIVEN" === a.status).length
        : 0;
    // Pharmacy hand-off status surfacing.
    //   pendingReturnQty   = nurse-initiated, awaiting pharmacy verify
    //   confirmedReturnQty = pharmacy verified, ledger IN + credit note posted
    // Without this the nurse has to phone pharmacy to know whether the audit
    // chain on the return she initiated has closed out.
    const pendingReturnQty   = Number(order.pendingReturnQty ?? 0);
    const confirmedReturnQty = Math.max(0, Number(order.returnedQty ?? 0) - pendingReturnQty);
    const needsReason     = form.status === "HELD" || form.status === "REFUSED";
    const drugTitle       = [order.drugName, order.drugStrength, order.drugForm].filter(Boolean).join(" ");
    const doseSchedule    = getDoseSchedule(order, now);
    // Dispense banner state — used by the inline notice above the log form
    // and (via onSubmit) the soft-confirm before saving a dose with no stock.
    const dispensedQty    = Number(order.dispensedQty ?? 0);
    const prescribedQty   = Number(order.quantity     ?? 0);
    const dispenseState   =
        prescribedQty > 0 && dispensedQty >= prescribedQty ? "DISPENSED"
        : dispensedQty > 0                                  ? "PARTIAL"
        : "PENDING";
    const reasonMeta      = RETURN_REASONS.find((r) => r.value === returnForm?.reasonCode);
    const reasonNotesReq  = returnForm?.reasonCode === "OTHER";
    // Show the action only when there's something physically returnable. We
    // also allow it on STOPPED orders — the strips are still on the trolley
    // even after the doctor stopped the order.
    const canShowReturn   = canReturn && !isDischarged && returnableQty > 0;
    const replacedByName  = order.replacedByDrugName;
    const replacesName    = order.replacesDrugName;

    return (
        <div className={`mar-card${isStopped ? " is-stopped" : ""}`}>

            {/* ── Drug info ── */}
            <div className="mar-card__info">
                <div className="mar-card__icon">
                    <Pill size={15} />
                </div>
                <div className="mar-card__text">
                    <div className="mar-card__name-row">
                        <p className="mar-card__drug-name">{drugTitle}</p>
                        {order.allergyOverrideReason && (
                            <span className="mar-card__allergy-badge" title={`Prescribed despite recorded allergy — ${order.allergyOverrideReason}`}>
                                <AlertTriangle size={10} /> Allergy override
                            </span>
                        )}
                        {isStopped && (
                            <span className="mar-card__stopped-badge">
                                <BanIcon size={10} /> Stopped
                            </span>
                        )}
                        {/* Drug-switch chain — visible on BOTH the old and new orders so
                            a nurse skimming the MAR sees the relationship without
                            opening the IPD log. */}
                        {replacedByName && (
                            <span className="mar-card__switch-badge is-out" title={`Switched to ${replacedByName}`}>
                                <ArrowRightLeft size={10} /> → {replacedByName}
                            </span>
                        )}
                        {replacesName && (
                            <span className="mar-card__switch-badge is-in" title={`Replaces ${replacesName}`}>
                                <ArrowRightLeft size={10} /> ← replaces {replacesName}
                            </span>
                        )}
                    </div>

                    {/* Frequency + route pills + per-dose amount */}
                    <div className="mar-card__signa">
                        {order.frequency && (
                            <span className="mar-signa-pill is-freq">{order.frequency}</span>
                        )}
                        {order.route && (
                            <span className="mar-signa-pill is-route">{order.route}</span>
                        )}
                        {doseSchedule?.state === "overdue" && (
                            <span className="mar-signa-pill is-overdue" title={`Next dose was due at ${fmtTime(doseSchedule.nextDueAt)}`}>
                                <AlertCircle size={10} /> Overdue
                            </span>
                        )}
                        {doseSchedule?.state === "due" && (
                            <span className="mar-signa-pill is-due" title={`Next dose due at ${fmtTime(doseSchedule.nextDueAt)}`}>
                                <Clock size={10} /> Due now
                            </span>
                        )}
                        {/* Dispense tally — gives the nurse instant "how much is on the ward" context. */}
                        {(order.quantity != null || order.dispensedQty != null) && (
                            <span
                                className={`mar-signa-pill is-dispense is-${(order.dispenseStatus || "PENDING").toLowerCase()}`}
                                title={`Returned: ${order.returnedQty ?? 0}`}
                            >
                                <Pill size={10} />
                                {order.dispensedQty ?? 0}/{order.quantity ?? "—"} dispensed
                            </span>
                        )}
                        {/* Consumption tally (MAR) — "how many doses has the patient
                            actually received". Hidden when there's nothing to show on
                            either side so the new prescription cards stay clean. */}
                        {(givenCount > 0 || order.quantity != null) && (
                            <span
                                className={`mar-signa-pill is-given-count${givenCount > 0 ? " has-doses" : ""}`}
                                title="Doses logged as GIVEN in the MAR — does not include HELD or REFUSED entries"
                            >
                                <CheckCircle2 size={10} />
                                {givenCount}/{order.quantity ?? "—"} given
                            </span>
                        )}
                        {/* Pharmacy hand-off chips — visibility is the entire point of
                            this surface, so we render even when zero only on the
                            confirmed side (after at least one verified return) so the
                            nurse has a permanent record on the card.  Pending chip
                            disappears once pharmacy verifies; confirmed chip fills in. */}
                        {pendingReturnQty > 0 && (
                            <span
                                className="mar-signa-pill is-return-pending"
                                title="Pharmacy verification still open — strips not yet re-credited to stock and credit note not yet posted to the IPD bill"
                            >
                                <Undo2 size={10} />
                                {pendingReturnQty} pending verify
                            </span>
                        )}
                        {confirmedReturnQty > 0 && (
                            <span
                                className="mar-signa-pill is-return-confirmed"
                                title="Pharmacy verified the physical units — stock re-credited and credit note posted to the IPD bill"
                            >
                                <Undo2 size={10} />
                                {confirmedReturnQty} returned
                            </span>
                        )}
                        {order.dose && (
                            <span className="mar-signa-dose">· {order.dose} per dose</span>
                        )}
                    </div>

                    {order.instructions && (
                        <p className="mar-card__instr">{order.instructions}</p>
                    )}

                    {(order.prescribedBy || order.prescribedAt) && (
                        <p className="mar-card__prescriber">
                            <UserIcon size={10} />
                            {order.prescribedBy && <span>Dr. {order.prescribedBy}</span>}
                            {order.prescribedBy && order.prescribedAt && (
                                <span className="mar-card__prescriber-sep">·</span>
                            )}
                            {order.prescribedAt && <span>{fmtDateTime(order.prescribedAt)}</span>}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Stopped banner ── */}
            {isStopped && (
                <div className="mar-stopped-banner">
                    <StopCircle size={13} />
                    <span>
                        Stopped by Dr. {order.stoppedByName ?? "—"}
                        {order.stoppedAt ? ` on ${fmtDateTime(order.stoppedAt)}` : ""}
                        {order.stopReason ? ` — ${order.stopReason}` : ""}
                    </span>
                </div>
            )}

            {/* ── Log toggle ── */}
            <button type="button" className="mar-log-toggle" onClick={onToggleLog}>
                <span>
                    Administration log
                    <span className={`mar-log-count ${adminCount > 0 ? "has-entries" : "no-entries"}`}>
                        {adminCount}
                    </span>
                </span>
                {logExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {/* ── Log entries ── */}
            {logExpanded && (
                <div className="mar-log-list">
                    {adminCount === 0 ? (
                        <p className="mar-log-empty">No administrations recorded yet</p>
                    ) : (
                        order.administrations.map((a) => <EventRow key={a.id} admin={a} />)
                    )}
                </div>
            )}

            {/* ── Ward actions — return unused units ──
                Lives outside the administration form so it stays available
                even after the doctor stops the order (the strips are still
                on the trolley). Hidden after discharge. */}
            {canShowReturn && (
                <div className="mar-ward-actions">
                    {!returnOpen ? (
                        <button
                            type="button"
                            className="mar-return-btn"
                            onClick={onToggleReturn}
                            title={`Up to ${returnableQty} unit(s) returnable to pharmacy`}
                        >
                            <Undo2 size={13} />
                            Return unused to pharmacy
                            <span className="mar-return-btn__hint">({returnableQty} available)</span>
                        </button>
                    ) : (
                        <form
                            className="mar-return-form"
                            onSubmit={(e) => onReturn(e, order)}
                        >
                            <p className="mar-return-form__heading">
                                <Undo2 size={13} /> Return unused units to pharmacy
                            </p>
                            <p className="mar-return-form__sub">
                                Pharmacy will receive a verify request. Stock is re-credited
                                only after the pharmacist confirms the physical units arrive.
                            </p>

                            {/* Qty + Reason */}
                            <div className="mar-form__row-2">
                                <div className="mar-form__field">
                                    <label className="mar-form__label">
                                        Qty to return <span className="req">*</span>
                                        <span className="hint">max {returnableQty}</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="mar-input"
                                        min="1"
                                        max={returnableQty}
                                        step="1"
                                        value={returnForm.returnQty}
                                        onChange={setReturnField(order.orderId, "returnQty")}
                                        required
                                    />
                                </div>
                                <div className="mar-form__field">
                                    <label className="mar-form__label">
                                        Reason <span className="req">*</span>
                                    </label>
                                    <select
                                        className="mar-input"
                                        value={returnForm.reasonCode}
                                        onChange={setReturnField(order.orderId, "reasonCode")}
                                        required
                                    >
                                        {RETURN_REASONS.map((r) => (
                                            <option key={r.value} value={r.value}>
                                                {r.label}{r.quarantine ? "  →  quarantine" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Batch number — optional, lets pharmacy credit the
                                exact batch instead of guessing the earliest dispense.
                                Nurse reads it off the strip label. Auto-upper-cased
                                on submit so the typed/scanned form matches the
                                pharmacy's stored case. */}
                            <div className="mar-form__field">
                                <label className="mar-form__label">
                                    Batch # <span className="hint">read from strip — optional</span>
                                </label>
                                <input
                                    type="text"
                                    className="mar-input"
                                    placeholder="e.g. ABC123"
                                    autoComplete="off"
                                    spellCheck={false}
                                    value={returnForm.batchNumber}
                                    onChange={setReturnField(order.orderId, "batchNumber")}
                                    style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
                                />
                            </div>

                            {/* Reason notes — always shown, required only for OTHER */}
                            <div className="mar-form__field">
                                <label className="mar-form__label">
                                    Notes {reasonNotesReq ? <span className="req">*</span> : <span className="hint">optional</span>}
                                </label>
                                <textarea
                                    className="mar-input is-textarea"
                                    rows={2}
                                    placeholder={
                                        reasonMeta?.value === "INEFFECTIVE"
                                            ? "e.g. No symptom relief after 6h, vitals unchanged"
                                            : "Clinical context for pharmacy / audit"
                                    }
                                    value={returnForm.reasonNotes}
                                    onChange={setReturnField(order.orderId, "reasonNotes")}
                                    required={reasonNotesReq}
                                />
                            </div>

                            {/* Optional: also stop the order in the same call.
                                Only offered when (a) the order is still ACTIVE
                                and (b) the caller's role can stop. */}
                            {!isStopped && canStop && (
                                <div className="mar-return-form__stop">
                                    <label className="mar-return-form__stop-toggle">
                                        <input
                                            type="checkbox"
                                            checked={returnForm.stopOrder}
                                            onChange={setReturnField(order.orderId, "stopOrder")}
                                        />
                                        Also stop this order
                                    </label>
                                    {returnForm.stopOrder && (
                                        <div className="mar-form__field">
                                            <label className="mar-form__label">
                                                Stop reason <span className="req">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="mar-input"
                                                placeholder="e.g. Switching to ibuprofen"
                                                value={returnForm.stopReason}
                                                onChange={setReturnField(order.orderId, "stopReason")}
                                                required
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Switch to a different drug — doctors / admins only.
                                Collapsed by default so the common "just return" flow
                                stays clean. The picker is inline (debounced search
                                against /api/drugs/search) so the user doesn't have to
                                open the full prescription modal for a single drug. */}
                            {canSwitch && (
                                <ReplacementDrugSection
                                    orderId={order.orderId}
                                    returnForm={returnForm}
                                    setReturnField={setReturnField}
                                />
                            )}

                            <div className="mar-return-form__actions">
                                <button
                                    type="submit"
                                    className="mar-return-confirm-btn"
                                    disabled={returning}
                                >
                                    {returning
                                        ? <span className="zu-spinner" style={{ width: 13, height: 13 }} />
                                        : <Undo2 size={13} />}
                                    Send return to pharmacy
                                </button>
                                <button
                                    type="button"
                                    className="mar-return-cancel-btn"
                                    onClick={onToggleReturn}
                                    disabled={returning}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            {/* ── Dispense status notice ──
                Lives just above the entry form so the nurse sees pharmacy
                state at the moment of administration, not buried in a header
                pill. PENDING is the loudest signal — administering without
                an issue means there's no inventory backing the dose. */}
            {!isStopped && !isDischarged && dispenseState !== "DISPENSED" && (
                <div className={`mar-dispense-notice is-${dispenseState.toLowerCase()}`}>
                    <Pill size={13} />
                    {dispenseState === "PENDING" ? (
                        <span>
                            <strong>Awaiting pharmacy issue</strong> — 0 of {prescribedQty || "?"} units
                            dispensed. Pharmacy hasn't sent any tablets to the ward yet.
                        </span>
                    ) : (
                        <span>
                            <strong>{dispensedQty}/{prescribedQty || "?"} dispensed</strong> — {Math.max(0, prescribedQty - dispensedQty)} more pending from pharmacy.
                        </span>
                    )}
                </div>
            )}

            {/* ── Administration entry form — hidden after discharge or when stopped ── */}
            {!isDischarged && !isStopped && (
                <form className="mar-form" onSubmit={(e) => {
                    // Soft-block: if recording a GIVEN with 0 dispensed, confirm.
                    // We don't hard-block because stat doses from ward float stock
                    // / emergency cabinets get administered before pharmacy paperwork
                    // catches up — this happens daily in IPD wards.
                    if (form.status === "GIVEN" && dispenseState === "PENDING") {
                        const ok = window.confirm(
                            "Pharmacy has not issued any units of this drug yet.\n\n" +
                            "If you're recording a dose from ward float stock or the emergency " +
                            "cabinet that's fine — but please make sure pharmacy is informed so " +
                            "they can dispense for the remainder of the course.\n\n" +
                            "Record this dose anyway?",
                        );
                        if (!ok) { e.preventDefault(); return; }
                    }
                    onSubmit(e, order.orderId);
                }}>
                    <p className="mar-form__heading">Log administration</p>

                    {/* Row 1: Time + Status */}
                    <div className="mar-form__row-2">
                        <div className="mar-form__field">
                            <label className="mar-form__label">
                                Time <span className="req">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                className="mar-input"
                                value={form.administeredAt}
                                onChange={setField(order.orderId, "administeredAt")}
                                required
                            />
                        </div>

                        <div className="mar-form__field">
                            <label className="mar-form__label">
                                Status <span className="req">*</span>
                            </label>
                            <select
                                className="mar-input"
                                value={form.status}
                                onChange={setField(order.orderId, "status")}
                                required
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Row 2: Dose given (optional) */}
                    <div className="mar-form__field">
                        <label className="mar-form__label">
                            Dose given
                            <span className="hint">
                                leave blank if same as ordered ({order.dose || "as prescribed"})
                            </span>
                        </label>
                        <input
                            type="text"
                            className="mar-input"
                            placeholder={order.dose ? `Default: ${order.dose}` : "e.g. 250mg, half tablet"}
                            value={form.doseGiven}
                            onChange={setField(order.orderId, "doseGiven")}
                        />
                    </div>

                    {/* Row 3: Reason — required for Held / Refused */}
                    {needsReason && (
                        <div className="mar-form__field">
                            <label className="mar-form__label">
                                Reason <span className="req">*</span>
                            </label>
                            <textarea
                                className="mar-input is-textarea"
                                rows={2}
                                placeholder={
                                    form.status === "HELD"
                                        ? "e.g. NPO before procedure, HR 130 — held per protocol"
                                        : "e.g. Patient declined, states nausea"
                                }
                                value={form.reason}
                                onChange={setField(order.orderId, "reason")}
                                required
                            />
                        </div>
                    )}

                    {/* Row 4: Notes (optional) */}
                    <div className="mar-form__field">
                        <label className="mar-form__label">Notes <span className="hint">optional</span></label>
                        <input
                            type="text"
                            className="mar-input"
                            placeholder="Any observations or context…"
                            value={form.notes}
                            onChange={setField(order.orderId, "notes")}
                        />
                    </div>

                    <div className="mar-form__actions">
                        <button type="submit" className="mar-record-btn" disabled={saving}>
                            {saving
                                ? <span className="zu-spinner" style={{ width: 14, height: 14 }} />
                                : <CheckCircle2 size={14} />}
                            Record
                        </button>

                        {/* Stop order — doctor / admin only */}
                        {canStop && (
                            <button
                                type="button"
                                className={`mar-stop-btn${stopOpen ? " is-open" : ""}`}
                                onClick={onToggleStop}
                            >
                                <StopCircle size={13} />
                                Stop order
                            </button>
                        )}
                    </div>

                    {/* Inline stop form */}
                    {canStop && stopOpen && (
                        <div className="mar-stop-form">
                            <p className="mar-stop-form__heading">Discontinue this order</p>
                            <div className="mar-form__field">
                                <label className="mar-form__label">
                                    Reason <span className="req">*</span>
                                </label>
                                <textarea
                                    className="mar-input is-textarea"
                                    rows={2}
                                    placeholder="e.g. Course completed, adverse reaction, switching drug"
                                    value={stopForm.reason}
                                    onChange={setStopField(order.orderId, "reason")}
                                    autoFocus
                                />
                            </div>
                            <div className="mar-stop-form__actions">
                                <button
                                    type="button"
                                    className="mar-stop-confirm-btn"
                                    disabled={stopping}
                                    onClick={(e) => onStop(e, order.orderId)}
                                >
                                    {stopping
                                        ? <span className="zu-spinner" style={{ width: 13, height: 13 }} />
                                        : <StopCircle size={13} />}
                                    Confirm stop
                                </button>
                                <button type="button" className="mar-stop-cancel-btn" onClick={onToggleStop}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            )}
        </div>
    );
}

// ── Administration event row ────────────────────────────────────────────────────

function EventRow({ admin }) {
    const meta = STATUS_META[admin.status] ?? STATUS_META.GIVEN;
    const Icon = meta.Icon;

    return (
        <div className={`mar-event ${meta.cls}`}>
            <div className="mar-event__top">
                <div className="mar-event__status">
                    <Icon size={13} />
                    <span>{meta.label}</span>
                </div>
                <div className="mar-event__meta">
                    {admin.administeredAt && (
                        <span className="mar-event__meta-item">
                            <Clock size={10} />
                            {fmtDateTime(admin.administeredAt)}
                        </span>
                    )}
                    {admin.administeredByName && (
                        <span className="mar-event__meta-item">
                            <UserIcon size={10} />
                            {admin.administeredByName}
                        </span>
                    )}
                    {admin.doseGiven && (
                        <span className="mar-event__dose-badge">{admin.doseGiven}</span>
                    )}
                </div>
            </div>
            {admin.reason && <p className="mar-event__reason">"{admin.reason}"</p>}
            {admin.notes  && <p className="mar-event__notes">{admin.notes}</p>}
        </div>
    );
}

// ── Replacement-drug section ─────────────────────────────────────────────────
//
// Inline debounced drug-master search + per-drug fields. Kept local to the
// IpdMarTab so the regular Stop/Record flows stay 1:1 with the existing UX —
// no behavioural change for nurses, the picker only appears when a doctor or
// admin explicitly opens it.

function ReplacementDrugSection({ orderId, returnForm, setReturnField }) {
    const { user } = useAuth();
    const [query, setQuery] = useState(returnForm.replDrugName || "");
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const debounceRef = useRef(null);
    const blurTimer   = useRef(null);

    // Keep the search field in lock-step with the form state — needed when the
    // user picks a drug, then later clears the field, then re-opens.
    useEffect(() => { setQuery(returnForm.replDrugName || ""); }, [returnForm.replDrugName]);

    const runSearch = useCallback(async (q) => {
        if (!user?.hospitalId) return;
        setSearching(true);
        try {
            const data = await drugsApi.search(user.hospitalId, q);
            setResults(Array.isArray(data) ? data.slice(0, 30) : []);
        } catch {
            setResults([]);
        } finally {
            setSearching(false);
        }
    }, [user?.hospitalId]);

    const onQueryChange = (e) => {
        const v = e.target.value;
        setQuery(v);
        setOpen(true);
        // The free-text drugName follows the search box so a doctor can override
        // the picker (e.g. brand-not-in-master) by typing a name and submitting
        // without picking from the dropdown.
        setReturnField(orderId, "replDrugName")({ target: { value: v } });
        // Picking from the dropdown re-sets drugId; typing freely clears it.
        setReturnField(orderId, "replDrugId")({ target: { value: null } });

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runSearch(v.trim()), 200);
    };

    const pickDrug = (d) => {
        setReturnField(orderId, "replDrugId")({       target: { value: d.id } });
        setReturnField(orderId, "replDrugName")({     target: { value: d.brandName || d.genericName || "" } });
        setReturnField(orderId, "replDrugGeneric")({  target: { value: d.genericName || "" } });
        setReturnField(orderId, "replDrugStrength")({ target: { value: d.strength   || "" } });
        setReturnField(orderId, "replDrugForm")({     target: { value: d.form       || "" } });
        setQuery(d.brandName || d.genericName || "");
        setOpen(false);
    };

    // Compute default quantity from frequency × duration so the doctor doesn't
    // have to do the math. Matches the doses-per-day map in PrescriptionDrugRow.
    useEffect(() => {
        if (!returnForm.switchDrug) return;
        if (returnForm.replQuantity) return; // user already entered something
        const dpd = { OD:1, BD:2, TDS:3, QID:4, Q4H:6, Q6H:4, Q8H:3, HS:1, AC:3, PC:3, STAT:1 }[returnForm.replFrequency];
        const days = Number(returnForm.replDurationDays);
        if (!dpd || !Number.isFinite(days) || days <= 0) return;
        const q = dpd * days;
        if (q > 0) {
            setReturnField(orderId, "replQuantity")({ target: { value: String(q) } });
        }
    // The setReturnField identity changes on every parent render — depending
    // on it would trigger an infinite loop. We want this effect keyed only on
    // the actual user-facing inputs, so suppressing the exhaustive-deps rule
    // is intentional here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [returnForm.switchDrug, returnForm.replFrequency, returnForm.replDurationDays]);

    return (
        <div className="mar-return-form__switch">
            <label className="mar-return-form__switch-toggle">
                <input
                    type="checkbox"
                    checked={!!returnForm.switchDrug}
                    onChange={setReturnField(orderId, "switchDrug")}
                />
                <ArrowRightLeft size={13} />
                Switch to a different drug
            </label>

            {returnForm.switchDrug && (
                <div className="mar-return-form__switch-body">
                    <div className="mar-form__field mar-drug-search">
                        <label className="mar-form__label">
                            Replacement drug <span className="req">*</span>
                        </label>
                        <div className="mar-drug-search__input-wrap">
                            <Search size={13} className="mar-drug-search__icon" />
                            <input
                                type="text"
                                className="mar-input mar-drug-search__input"
                                placeholder="Search by brand or generic name…"
                                value={query}
                                onChange={onQueryChange}
                                onFocus={() => { setOpen(true); if (!results.length) runSearch(query.trim()); }}
                                onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
                                autoComplete="off"
                            />
                            {searching && <Spinner className="mar-drug-search__spinner" />}
                        </div>
                        {open && (results.length > 0 || (!searching && query)) && (
                            <ul className="mar-drug-search__menu">
                                {results.map((d) => (
                                    <li
                                        key={d.id}
                                        className="mar-drug-search__option"
                                        onMouseDown={() => pickDrug(d)}
                                    >
                                        <span className="mar-drug-search__brand">
                                            {d.brandName || d.genericName}
                                        </span>
                                        {(d.strength || d.form) && (
                                            <span className="mar-drug-search__meta">
                                                {[d.strength, d.form].filter(Boolean).join(" · ")}
                                            </span>
                                        )}
                                        {d.brandName && d.genericName && d.brandName !== d.genericName && (
                                            <span className="mar-drug-search__generic">{d.genericName}</span>
                                        )}
                                    </li>
                                ))}
                                {!searching && results.length === 0 && query && (
                                    <li className="mar-drug-search__option is-empty">
                                        No match — will be saved as a free-text drug
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>

                    {/* Show the resolved drug context once the user has typed or picked. */}
                    {(returnForm.replDrugStrength || returnForm.replDrugForm) && (
                        <div className="mar-drug-context">
                            <Pill size={11} />
                            <span>{[returnForm.replDrugStrength, returnForm.replDrugForm].filter(Boolean).join(" · ")}</span>
                        </div>
                    )}

                    <div className="mar-form__row-2">
                        <div className="mar-form__field">
                            <label className="mar-form__label">Dose</label>
                            <input
                                type="text"
                                className="mar-input"
                                placeholder="e.g. 1 tablet, 10ml"
                                value={returnForm.replDose}
                                onChange={setReturnField(orderId, "replDose")}
                            />
                        </div>
                        <div className="mar-form__field">
                            <label className="mar-form__label">Frequency</label>
                            <select
                                className="mar-input"
                                value={returnForm.replFrequency}
                                onChange={setReturnField(orderId, "replFrequency")}
                            >
                                {REPLACEMENT_FREQUENCIES.map((f) => (
                                    <option key={f.value} value={f.value}>{f.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mar-form__row-2">
                        <div className="mar-form__field">
                            <label className="mar-form__label">Duration (days)</label>
                            <input
                                type="number"
                                className="mar-input"
                                min="1"
                                step="1"
                                value={returnForm.replDurationDays}
                                onChange={setReturnField(orderId, "replDurationDays")}
                            />
                        </div>
                        <div className="mar-form__field">
                            <label className="mar-form__label">
                                Qty to dispense <span className="req">*</span>
                            </label>
                            <input
                                type="number"
                                className="mar-input"
                                min="1"
                                step="1"
                                value={returnForm.replQuantity}
                                onChange={setReturnField(orderId, "replQuantity")}
                                required
                            />
                        </div>
                    </div>

                    <div className="mar-form__row-2">
                        <div className="mar-form__field">
                            <label className="mar-form__label">Route</label>
                            <select
                                className="mar-input"
                                value={returnForm.replRoute}
                                onChange={setReturnField(orderId, "replRoute")}
                            >
                                {REPLACEMENT_ROUTES.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mar-form__field">
                            <label className="mar-form__label">Instructions <span className="hint">optional</span></label>
                            <input
                                type="text"
                                className="mar-input"
                                placeholder="e.g. After food"
                                value={returnForm.replInstructions}
                                onChange={setReturnField(orderId, "replInstructions")}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

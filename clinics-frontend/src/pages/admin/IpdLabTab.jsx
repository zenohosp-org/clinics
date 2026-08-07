import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { investigationsApi, LABS_FRONTEND_URL } from "@/utils/api";
import { useInvestigationCatalog } from "@/hooks/useInvestigationCatalog";
import RequestInvestigationForm from "@/components/investigations/RequestInvestigationForm";
import { CenterLoader } from "@/components/ui/Loader";
import {
    FlaskConical, ScanLine, Plus, CheckCircle2, Clock, AlertCircle,
    Beaker, ExternalLink,
} from "lucide-react";
import { fmtDateTime } from "@/utils/date";
import "@/styles/modules/ipd-lab.css";

// Unified status semantics across lab + radiology orders (per the labs
// contract). LAB starts at PENDING_COLLECTION, RADIOLOGY at PENDING_SCAN;
// both run AWAITING_REPORT → IN_PROGRESS → REPORT_GENERATED → BILLED, or
// CANCELLED from any active state. labs.zenohosp.com owns every transition —
// HMS only observes, so this tab is read-only (see Open in Labs link).
const STATUS_META = {
    PENDING_COLLECTION: { label: "Pending Collection", cls: "is-pending"   },
    PENDING_SCAN:       { label: "Pending Scan",       cls: "is-pending"   },
    AWAITING_REPORT:    { label: "Sample with Lab",    cls: "is-awaiting"  },
    IN_PROGRESS:        { label: "In Progress",        cls: "is-progress"  },
    REPORT_GENERATED:   { label: "Reported",           cls: "is-reported"  },
    BILLED:             { label: "Billed",             cls: "is-billed"    },
    CANCELLED:          { label: "Cancelled",          cls: "is-cancelled" },
};

const PRIORITY_META = {
    ROUTINE: { label: "Routine", cls: "is-routine" },
    URGENT:  { label: "Urgent",  cls: "is-urgent"  },
    STAT:    { label: "STAT",    cls: "is-stat"    },
};

const STATUS_ORDER = {
    PENDING_COLLECTION: 0,
    PENDING_SCAN:       0,
    AWAITING_REPORT:    1,
    IN_PROGRESS:        2,
    REPORT_GENERATED:   3,
    BILLED:             4,
    CANCELLED:          5,
};

// Deep-link a row to labs.zenohosp.com — the report view for finished orders,
// the relevant queue for anything still in flight. All actions live there.
function openInLabsHref(order) {
    const area = order.kind === "RADIOLOGY" ? "radiology" : "lab";
    if (order.status === "REPORT_GENERATED" || order.status === "BILLED") {
        return `${LABS_FRONTEND_URL}/${area}/reports/${order.id}`;
    }
    return `${LABS_FRONTEND_URL}/${area}/queue`;
}

export default function IpdLabTab({ admissionId, patientId, isDischarged }) {
    const { user } = useAuth();
    const { notify } = useNotification();

    const [orders, setOrders]         = useState([]);
    const [loading, setLoading]       = useState(true);
    const [showForm, setShowForm]     = useState(false);

    // Top-level filter pill — All / Pathology / Radiology.
    const [kindFilter, setKindFilter] = useState("ALL");

    // Orderable investigation catalogue (labs lab_services for gated tenants,
    // legacy hospital_services otherwise) — shared hook, one fetch per
    // hospital-context, passed down to RequestInvestigationForm.
    const catalog = useInvestigationCatalog(user?.hospitalId);

    // Unified read — labs service merges lab + radiology by patient/admission.
    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await investigationsApi.byAdmission(admissionId);
            const sorted = (Array.isArray(data) ? data : []).sort(
                (a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0)
            );
            setOrders(sorted);
        } catch {
            notify("Failed to load investigations", "error");
        } finally {
            setLoading(false);
        }
    }, [admissionId]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    // Visible orders honor the kind filter pill.
    const visibleOrders = useMemo(() => {
        if (kindFilter === "ALL") return orders;
        return orders.filter((o) => o.kind === kindFilter);
    }, [orders, kindFilter]);

    const pendingCount   = visibleOrders.filter((o) => o.status === "PENDING_COLLECTION" || o.status === "PENDING_SCAN").length;
    const collectedCount = visibleOrders.filter((o) => o.status === "AWAITING_REPORT").length;
    const reportedCount  = visibleOrders.filter((o) => o.status === "REPORT_GENERATED" || o.status === "BILLED").length;

    return (
        <div className="hms-ipd-tab-body lab-tab">

            {/* Kind filter — All / Pathology / Radiology */}
            <div className="lab-kind-pills">
                {[
                    { key: "ALL",       label: "All" },
                    { key: "LAB",       label: "Pathology" },
                    { key: "RADIOLOGY", label: "Radiology" },
                ].map((p) => (
                    <button
                        key={p.key}
                        type="button"
                        className={`lab-kind-pill ${kindFilter === p.key ? "is-active" : ""}`}
                        onClick={() => setKindFilter(p.key)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Summary strip */}
            {visibleOrders.length > 0 && (
                <div className="lab-summary">
                    <div className="lab-summary__pill is-pending">
                        <Clock size={11} /> {pendingCount} Pending
                    </div>
                    <div className="lab-summary__pill is-collected">
                        <Beaker size={11} /> {collectedCount} With Lab
                    </div>
                    <div className="lab-summary__pill is-resulted">
                        <CheckCircle2 size={11} /> {reportedCount} Reported
                    </div>
                </div>
            )}

            {/* Order button — placing an order is the clinician's job and the only
                write HMS owns; the lifecycle that follows runs entirely on labs. */}
            {!isDischarged && (
                <div className="lab-actions">
                    <button
                        type="button"
                        className="lab-add-btn"
                        onClick={() => setShowForm((v) => !v)}
                    >
                        <Plus size={12} /> Order test
                    </button>
                </div>
            )}

            {/* Shared order form. Kind filter flows into defaultKind so the
                Radiology pill scopes the picker to radiology services; ALL
                shows both with an in-form sub-toggle. */}
            {showForm && (
                <RequestInvestigationForm
                    hospitalId={user?.hospitalId}
                    patientId={patientId}
                    admissionId={admissionId}
                    catalog={catalog}
                    defaultKind={kindFilter}
                    onCreated={() => {
                        setShowForm(false);
                        fetchOrders();
                    }}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {/* Discharge notice */}
            {isDischarged && (
                <div className="mar-discharge-notice">
                    <AlertCircle size={14} />
                    <span>Patient discharged — investigations are read-only</span>
                </div>
            )}

            {/* Order list */}
            {loading ? (
                <CenterLoader text="Loading investigations…" />
            ) : visibleOrders.length === 0 ? (
                <div className="hms-ipd-center-empty">
                    <div className="hms-ipd-center-empty__icon"><FlaskConical size={32} /></div>
                    <p className="hms-ipd-center-empty__text">
                        No {kindFilter === "ALL" ? "investigations" : kindFilter === "LAB" ? "pathology orders" : "radiology orders"} for this admission
                    </p>
                    <p className="hms-ipd-center-empty__sub">
                        Use "Order test" above to place an investigation
                    </p>
                </div>
            ) : (
                <div className="lab-list">
                    {visibleOrders.map((order) => (
                        <InvestigationCard key={`${order.kind}-${order.id}`} order={order} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Order card (read-only) ───────────────────────────────────────────────────

// One muted chip per lifecycle timestamp the order has actually reached.
function LifecycleStrip({ order }) {
    const items = [];
    if (order.createdAt)   items.push({ label: "Ordered",   at: order.createdAt });
    if (order.collectedAt) items.push({ label: "Collected", at: order.collectedAt });
    if (order.scannedAt)   items.push({ label: "Scanned",   at: order.scannedAt });
    if (order.receivedAt)  items.push({ label: "Received",  at: order.receivedAt });
    if (order.startedAt)   items.push({ label: "Started",   at: order.startedAt });
    if (order.reportedAt)  items.push({ label: "Reported",  at: order.reportedAt });
    if (order.cancelledAt) items.push({ label: "Cancelled", at: order.cancelledAt });
    if (items.length === 0) return null;
    return (
        <div className="lab-card__lifecycle">
            {items.map((it) => (
                <span key={it.label} className="lab-card__lifecycle-item">
                    <Clock size={10} /> {it.label}: {fmtDateTime(it.at)}
                </span>
            ))}
        </div>
    );
}

function InvestigationCard({ order }) {
    const statusMeta   = STATUS_META[order.status]   || STATUS_META.PENDING_COLLECTION;
    const priorityMeta = PRIORITY_META[order.priority] || PRIORITY_META.ROUTINE;
    const isReported   = order.status === "REPORT_GENERATED" || order.status === "BILLED";
    const isLab        = order.kind === "LAB";
    const Icon         = isLab ? FlaskConical : ScanLine;

    return (
        <div className={`lab-card${isReported ? " is-resulted" : ""}`}>
            {/* Card header */}
            <div className="lab-card__head">
                <div className="lab-card__title-row">
                    <Icon size={14} className="lab-card__icon" />
                    <span className="lab-card__name">{order.serviceName}</span>
                    <span className={`lab-kind-chip ${isLab ? "is-lab" : "is-radiology"}`}>
                        {isLab ? "Pathology" : "Radiology"}
                    </span>
                </div>
                <div className="lab-card__badges">
                    <span className={`lab-status-badge ${statusMeta.cls}`}>{statusMeta.label}</span>
                    <span className={`lab-priority-badge ${priorityMeta.cls}`}>{priorityMeta.label}</span>
                </div>
            </div>

            {/* Meta — who ordered + sample type */}
            <div className="lab-card__meta">
                {order.referredByName && (
                    <span>Ordered by {order.referredByName}</span>
                )}
                {isLab && order.sampleType && (
                    <span>Sample: {order.sampleType}</span>
                )}
            </div>

            {/* Lifecycle timestamps */}
            <LifecycleStrip order={order} />

            {/* Lab-side audit id + cancellation reason */}
            {order.accessionNumber && (
                <p className="lab-card__meta-line"><code>ACC: {order.accessionNumber}</code></p>
            )}
            {order.cancellationReason && (
                <p className="lab-card__meta-line is-muted">
                    Cancelled: {order.cancellationReason}
                </p>
            )}

            {/* Single read-only action — every mutation lives on labs. The link
                stays available after discharge (viewing is always fine). */}
            <div className="lab-card__actions">
                <a
                    href={openInLabsHref(order)}
                    target="_blank"
                    rel="noreferrer"
                    className="lab-card__action-btn is-link"
                >
                    <ExternalLink size={11} /> Open in Labs
                </a>
            </div>
        </div>
    );
}

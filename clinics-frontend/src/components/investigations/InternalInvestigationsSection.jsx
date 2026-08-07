import { FlaskConical, FileBarChart } from "lucide-react";
import { CenterLoader } from "@/components/ui/Loader";
import { LABS_FRONTEND_URL } from "@/utils/api";

/**
 * Shared read-only renderer for HMS-internal lab / radiology investigations.
 *
 * Consumes the unified InvestigationSummaryDTO produced by labs'
 * /api/investigations/* endpoints. `kind` drives the icon, tone, and the
 * absolute report URL path — pathology reports live at
 * labs.zenohosp.com/lab/reports/{id}, radiology at /radiology/reports/{id}.
 *
 * Used by:
 *   - ConsultationViewPage.LabTab (full-page queue-walk view)
 *   - ConsultationModal (the OPD check-in / resume-draft modal)
 * Both surfaces want the same investigation list with the same visual
 * language — extracting it here keeps them in lockstep when the DTO
 * shape evolves.
 */
export default function InternalInvestigationsSection({ rows, loading, title, kind }) {
    const isLab = kind === "LAB";
    const icon = isLab ? <FlaskConical className="w-4 h-4" /> : <ScanIcon />;
    const tone = isLab ? "violet" : "blue";
    const hint = isLab ? "Lab orders raised inside HMS" : "Radiology orders raised inside HMS";
    const reportPath = isLab ? "lab" : "radiology";

    if (loading) {
        return (
            <div>
                <SectionHeading icon={icon} title={title} hint={hint} />
                <CenterLoader text="Loading…" />
            </div>
        );
    }
    return (
        <div>
            <SectionHeading
                icon={icon}
                title={title}
                count={rows.length}
                hint={hint}
                tone={tone}
            />
            <div className="hms-cv-rad-table">
                <div className="hms-cv-rad-head">
                    <div className="hms-cv-rad-head__col-5">Investigation</div>
                    <div className="hms-cv-rad-head__col-3">Status</div>
                    <div className="hms-cv-rad-head__col-3">Date</div>
                    <div className="hms-cv-rad-head__col-1">Report</div>
                </div>
                <div className="hms-cv-rad-body">
                    {rows.map(order => (
                        <div key={order.id} className="hms-cv-rad-row">
                            <div className="hms-cv-rad-head__col-5">
                                <p className="hms-cv-rad-row__name">
                                    {order.serviceName || order.investigationName || "—"}
                                </p>
                                {(order.specializationName || order.modality) && (
                                    <p className="hms-cv-rad-row__mod">{order.specializationName || order.modality}</p>
                                )}
                                {order.accessionNumber && (
                                    <p className="hms-cv-rad-row__mod"><code>ACC: {order.accessionNumber}</code></p>
                                )}
                                {compactLifecycle(order) && (
                                    <p className="hms-cv-rad-row__mod">{compactLifecycle(order)}</p>
                                )}
                            </div>
                            <div className="hms-cv-rad-head__col-3"><StatusPill status={order.status} /></div>
                            <div className="hms-cv-rad-head__col-3 hms-cv-rad-row__date">
                                {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}
                            </div>
                            <div className="hms-cv-rad-head__col-1 hms-cv-rad-row__report-cell">
                                {order.reportUrl || order.reportId ? (
                                    <a
                                        href={order.reportUrl || `${LABS_FRONTEND_URL}/${reportPath}/reports/${order.reportId}`}
                                        className="hms-cv-rad-row__report-link"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        <FileBarChart className="w-3 h-3" /> Open
                                    </a>
                                ) : (
                                    <span className="hms-cv-rad-row__report-empty">—</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SectionHeading({ icon, title, count, hint, tone }) {
    const toneMod = tone === "violet" ? "is-violet" : tone === "blue" ? "is-blue" : "";
    return (
        <div className="hms-cv-sheading">
            <div className="hms-cv-sheading__left">
                <span className={`hms-cv-sheading__icon ${toneMod}`}>{icon}</span>
                <h3 className="hms-cv-sheading__title">{title}</h3>
                {count > 0 && (
                    <span className={`hms-cv-sheading__count ${toneMod}`}>{count}</span>
                )}
            </div>
            {hint && <span className="hms-cv-sheading__hint">{hint}</span>}
        </div>
    );
}

// Inline SVG so callers don't pull a second icon import.
function ScanIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
    );
}

// Compact one-line lifecycle for the consultation sidebar — the milestones an
// order has reached, joined inline. Full per-chip strip lives on the IPD tab.
function compactLifecycle(order) {
    const d = (v) => new Date(v).toLocaleDateString();
    return [
        order.collectedAt && `Collected ${d(order.collectedAt)}`,
        order.scannedAt   && `Scanned ${d(order.scannedAt)}`,
        order.startedAt   && `Started ${d(order.startedAt)}`,
        order.reportedAt  && `Reported ${d(order.reportedAt)}`,
        order.cancelledAt && `Cancelled ${d(order.cancelledAt)}${order.cancellationReason ? ` (${order.cancellationReason})` : ""}`,
    ].filter(Boolean).join(" · ");
}

function StatusPill({ status }) {
    const map = {
        PENDING_COLLECTION: "is-pending",
        PENDING_SCAN:       "is-pending",
        AWAITING_REPORT:    "is-awaiting",
        IN_PROGRESS:        "is-in-progress",
        REPORT_GENERATED:   "is-reported",
        REPORTED:           "is-reported",
        BILLED:             "is-billed",
        CANCELLED:          "is-cancelled",
    };
    const mod = map[status] || "is-default";
    return (
        <span className={`hms-cv-rad-status ${mod}`}>
            {(status || "—").replace(/_/g, " ")}
        </span>
    );
}

import { useCallback, useMemo, useState } from "react";
import { ScanLine, RefreshCw, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { radiologyQueueApi, LABS_FRONTEND_URL } from "@/utils/api";
import { RADIOLOGY_FLOW, RADIOLOGY_STATUS, labStatusMeta } from "@/utils/labStatus";
import { fmtId } from "@/utils/idFormat";
import { timeAgo } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

const OPEN = new Set(["PENDING_SCAN", "AWAITING_REPORT", "IN_PROGRESS"]);

const FILTERS = [
    { key: "OPEN", label: "Open" },
    ...RADIOLOGY_FLOW.map((s) => ({ key: s, label: RADIOLOGY_STATUS[s].label })),
    { key: "ALL", label: "All" },
];

/**
 * Imaging worklist. Same shape as the lab queue, but reporting a scan is a
 * narrative act rather than an analyte panel, so "write report" hands off to
 * the labs UI (which owns the templates and the image viewer) instead of
 * opening a result-entry grid here.
 */
export default function RadiologyQueue() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const hospitalId = user?.hospitalId;

    const [filter, setFilter] = useState("OPEN");
    const [busyId, setBusyId] = useState(null);

    const fetcher = useCallback(
        () => radiologyQueueApi.list(hospitalId, filter === "OPEN" || filter === "ALL" ? null : filter),
        [hospitalId, filter]
    );
    const { data, loading, reload } = useAsyncResource(fetcher, {
        initialData: [],
        enabled: !!hospitalId,
        onError: () => notify("Could not load the radiology queue", "error"),
    });

    const rows = useMemo(() => {
        let list = data ?? [];
        if (filter === "OPEN") list = list.filter((o) => OPEN.has(o.status));
        return [...list].sort((a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0));
    }, [data, filter]);

    const counts = useMemo(() => {
        const c = {};
        (data ?? []).forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; });
        return c;
    }, [data]);

    const advance = useCallback(
        async (order, actionKey, actionLabel) => {
            if (actionKey === "writeReport") {
                window.open(`${LABS_FRONTEND_URL}/radiology/reports/${order.id}`, "_blank", "noopener");
                return;
            }
            setBusyId(order.id);
            try {
                await radiologyQueueApi[actionKey](order.id);
                notify(`${actionLabel} — ${order.testName ?? "study"}`, "success");
                await reload();
            } catch (err) {
                notify(err?.response?.data?.message ?? `Could not ${actionLabel.toLowerCase()}`, "error");
            } finally {
                setBusyId(null);
            }
        },
        [notify, reload]
    );

    const columns = useMemo(
        () => [
            {
                header: "Patient",
                render: (o) => (
                    <div className="hms-dash-pat-cell">
                        <div className="hms-dash-pat-cell__avatar">
                            {(o.patientName ?? "?").charAt(0)}
                        </div>
                        <div>
                            <p className="hms-dash-pat-cell__name">{o.patientName ?? "—"}</p>
                            <p className="hms-dash-pat-cell__uhid">{fmtId(o.patientUhid)}</p>
                        </div>
                    </div>
                ),
            },
            { header: "Study", render: (o) => o.testName ?? o.modality ?? "—" },
            { header: "Ordered", render: (o) => <span className="hms-dash-time">{timeAgo(o.createdAt)}</span> },
            {
                header: "Status",
                render: (o) => {
                    const meta = labStatusMeta(o.status, RADIOLOGY_STATUS);
                    return <Badge tone={meta.tone} soft>{meta.label}</Badge>;
                },
            },
            {
                header: "",
                render: (o) => {
                    const meta = labStatusMeta(o.status, RADIOLOGY_STATUS);
                    if (!meta.next) {
                        return (
                            <a
                                href={`${LABS_FRONTEND_URL}/radiology/reports/${o.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="clinic-lab-report-link"
                                onClick={(e) => e.stopPropagation()}
                            >
                                Open report <ExternalLink className="w-3 h-3" />
                            </a>
                        );
                    }
                    return (
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === o.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                advance(o, meta.next.key, meta.next.label);
                            }}
                        >
                            {busyId === o.id ? "Working…" : meta.next.label}
                        </Button>
                    );
                },
            },
        ],
        [advance, busyId]
    );

    return (
        <div className="clinic-lab-page">
            <PageHeader
                title="Radiology"
                subtitle="Imaging studies and reports"
                actions={
                    <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </Button>
                }
            />

            <div className="clinic-lab-toolbar">
                <div className="clinic-lab-filters">
                    {FILTERS.map((f) => {
                        const n =
                            f.key === "OPEN"
                                ? [...OPEN].reduce((s, k) => s + (counts[k] ?? 0), 0)
                                : f.key === "ALL"
                                    ? (data ?? []).length
                                    : counts[f.key] ?? 0;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setFilter(f.key)}
                                className={`clinic-lab-filter${filter === f.key ? " is-active" : ""}`}
                            >
                                {f.label}
                                <span className="clinic-lab-filter__count">{n}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {!loading && rows.length === 0 ? (
                <EmptyState
                    icon={<ScanLine className="w-6 h-6" />}
                    title="Nothing in the imaging queue"
                    description="Radiology orders raised during a consultation appear here."
                />
            ) : (
                <Table columns={columns} data={rows} rowKey={(o) => o.id} loading={loading} />
            )}
        </div>
    );
}

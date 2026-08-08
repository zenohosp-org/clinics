import { useCallback, useMemo, useState } from "react";
import { FlaskConical, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { labQueueApi } from "@/utils/api";
import {
    LAB_FLOW,
    LAB_STATUS,
    OPEN_LAB_STATUSES,
    labStatusMeta,
} from "@/utils/labStatus";
import { fmtId } from "@/utils/idFormat";
import { timeAgo } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import ResultEntryModal from "@/components/labs/ResultEntryModal";

const FILTERS = [
    { key: "OPEN", label: "Open" },
    ...LAB_FLOW.map((s) => ({ key: s, label: LAB_STATUS[s].label })),
    { key: "ALL", label: "All" },
];

export default function LabQueue() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const hospitalId = user?.hospitalId;

    const [filter, setFilter] = useState("OPEN");
    const [search, setSearch] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [resultOrder, setResultOrder] = useState(null);

    // "OPEN" is a client-side union of three statuses, so it can't be pushed
    // down as a status param — fetch everything and narrow below.
    const fetcher = useCallback(
        () => labQueueApi.list(hospitalId, filter === "OPEN" || filter === "ALL" ? null : filter),
        [hospitalId, filter]
    );

    const { data, loading, reload } = useAsyncResource(fetcher, {
        initialData: [],
        enabled: !!hospitalId,
        onError: () => notify("Could not load the lab queue", "error"),
    });

    const orders = useMemo(() => {
        let rows = data ?? [];
        if (filter === "OPEN") rows = rows.filter((o) => OPEN_LAB_STATUSES.has(o.status));
        const q = search.trim().toLowerCase();
        if (q) {
            rows = rows.filter((o) =>
                [o.patientName, o.testName, o.accessionNumber, o.patientUhid]
                    .filter(Boolean)
                    .some((f) => String(f).toLowerCase().includes(q))
            );
        }
        // Oldest first: the queue is a worklist, and the longest-waiting
        // sample is the one that should be picked up next.
        return [...rows].sort(
            (a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0)
        );
    }, [data, filter, search]);

    const counts = useMemo(() => {
        const c = {};
        (data ?? []).forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; });
        return c;
    }, [data]);

    /** Runs a lifecycle transition, then refetches so the row lands in its new bucket. */
    const advance = useCallback(
        async (order, actionKey, actionLabel) => {
            if (actionKey === "enterResults") {
                setResultOrder(order);
                return;
            }
            setBusyId(order.id);
            try {
                await labQueueApi[actionKey](order.id);
                notify(`${actionLabel} — ${order.testName ?? "order"}`, "success");
                await reload();
            } catch (err) {
                notify(
                    err?.response?.data?.message ?? `Could not ${actionLabel.toLowerCase()}`,
                    "error"
                );
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
            {
                header: "Test",
                render: (o) => (
                    <div>
                        <p className="clinic-lab-test">{o.testName ?? "—"}</p>
                        {o.accessionNumber && (
                            <p className="clinic-lab-accession">{o.accessionNumber}</p>
                        )}
                    </div>
                ),
            },
            {
                header: "Ordered",
                render: (o) => (
                    <span className="hms-dash-time">{timeAgo(o.createdAt)}</span>
                ),
            },
            {
                header: "Status",
                render: (o) => {
                    const meta = labStatusMeta(o.status);
                    return <Badge tone={meta.tone} soft>{meta.label}</Badge>;
                },
            },
            {
                header: "",
                render: (o) => {
                    const meta = labStatusMeta(o.status);
                    if (!meta.next) return null;
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
                title="Lab queue"
                subtitle="Samples and tests waiting on the bench"
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
                                ? [...OPEN_LAB_STATUSES].reduce((s, k) => s + (counts[k] ?? 0), 0)
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
                <div className="clinic-lab-search">
                    <Search className="w-4 h-4 clinic-lab-search__icon" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Patient, test or accession…"
                    />
                </div>
            </div>

            {!loading && orders.length === 0 ? (
                <EmptyState
                    icon={<FlaskConical className="w-6 h-6" />}
                    title={search ? "No matching orders" : "Nothing in the queue"}
                    description={
                        search
                            ? "Try a different patient name, test or accession number."
                            : "Lab orders raised during a consultation appear here."
                    }
                />
            ) : (
                <Table
                    columns={columns}
                    data={orders}
                    rowKey={(o) => o.id}
                    loading={loading}
                    emptyMessage="Nothing in the queue"
                />
            )}

            {resultOrder && (
                <ResultEntryModal
                    order={resultOrder}
                    onClose={() => setResultOrder(null)}
                    onSaved={async () => {
                        setResultOrder(null);
                        await reload();
                    }}
                />
            )}
        </div>
    );
}

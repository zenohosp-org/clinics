import { useCallback, useMemo, useState } from "react";
import { Syringe, RefreshCw, CheckCheck } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { collectionApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { timeAgo } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { CenterLoader } from "@/components/ui/Loader";

/**
 * Phlebotomy worklist, grouped by patient.
 *
 * Deliberately patient-first rather than order-first: the person drawing blood
 * works one patient at a time and draws for every pending order in a single
 * stick. A flat list of orders would make them hunt for the other tests
 * belonging to the patient in front of them, and risk a second needle.
 */
export default function CollectionQueue() {
    const { notify } = useNotification();
    const [busyPatient, setBusyPatient] = useState(null);

    const fetcher = useCallback(() => collectionApi.queue(), []);
    const { data, loading, reload } = useAsyncResource(fetcher, {
        initialData: [],
        onError: () => notify("Could not load the collection queue", "error"),
    });

    // The service may return either a flat order list or pre-grouped patients;
    // normalise to groups so the render path has one shape.
    const groups = useMemo(() => {
        const rows = Array.isArray(data) ? data : (data?.content ?? []);
        if (rows.length && rows[0]?.orders) return rows;

        const byPatient = new Map();
        rows.forEach((o) => {
            const key = o.patientId ?? o.patientUhid ?? o.patientName;
            if (!byPatient.has(key)) {
                byPatient.set(key, {
                    patientId: o.patientId,
                    patientName: o.patientName,
                    patientUhid: o.patientUhid,
                    orders: [],
                });
            }
            byPatient.get(key).orders.push(o);
        });
        return [...byPatient.values()];
    }, [data]);

    const collectAll = useCallback(
        async (group) => {
            setBusyPatient(group.patientId ?? group.patientUhid);
            try {
                await collectionApi.bulkCollect({
                    patientId: group.patientId,
                    labOrderIds: group.orders.map((o) => o.id),
                });
                notify(
                    `Collected ${group.orders.length} sample${group.orders.length > 1 ? "s" : ""} for ${group.patientName}`,
                    "success"
                );
                await reload();
            } catch (err) {
                notify(
                    err?.response?.data?.message ?? "Could not mark samples collected",
                    "error"
                );
            } finally {
                setBusyPatient(null);
            }
        },
        [notify, reload]
    );

    if (loading) return <CenterLoader text="Loading collection queue…" />;

    return (
        <div className="clinic-lab-page">
            <PageHeader
                title="Sample collection"
                subtitle="Patients with samples still to be drawn"
                actions={
                    <Button variant="secondary" size="sm" onClick={reload}>
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </Button>
                }
            />

            {groups.length === 0 ? (
                <EmptyState
                    icon={<Syringe className="w-6 h-6" />}
                    title="No samples pending"
                    description="Every ordered test has had its sample drawn."
                />
            ) : (
                <div className="clinic-collect-grid">
                    {groups.map((g) => {
                        const key = g.patientId ?? g.patientUhid;
                        return (
                            <div className="clinic-collect-card" key={key}>
                                <div className="clinic-collect-card__head">
                                    <div className="hms-dash-pat-cell">
                                        <div className="hms-dash-pat-cell__avatar">
                                            {(g.patientName ?? "?").charAt(0)}
                                        </div>
                                        <div>
                                            <p className="hms-dash-pat-cell__name">{g.patientName ?? "—"}</p>
                                            <p className="hms-dash-pat-cell__uhid">{fmtId(g.patientUhid)}</p>
                                        </div>
                                    </div>
                                    <Badge tone="warning" soft>
                                        {g.orders.length} pending
                                    </Badge>
                                </div>

                                <ul className="clinic-collect-tests">
                                    {g.orders.map((o) => (
                                        <li key={o.id}>
                                            <span>{o.testName ?? "—"}</span>
                                            <span className="clinic-collect-tests__age">
                                                {timeAgo(o.createdAt)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    full
                                    size="sm"
                                    disabled={busyPatient === key}
                                    onClick={() => collectAll(g)}
                                >
                                    <CheckCheck className="w-4 h-4" />
                                    {busyPatient === key ? "Collecting…" : "Collect all"}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

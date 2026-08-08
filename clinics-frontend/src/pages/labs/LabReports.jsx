import { useCallback, useMemo, useState } from "react";
import { FileText, ExternalLink, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { labQueueApi, LABS_FRONTEND_URL } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { fmtDateTime } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Finalised lab reports.
 *
 * Rendering the full report document is owned by the labs service (it holds the
 * per-hospital PDF template, signatory and QR verification), so "Open report"
 * deep-links there rather than reimplementing the document here. Everything a
 * clinic needs to *find* a report lives in this list.
 */
export default function LabReports() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const hospitalId = user?.hospitalId;
    const [search, setSearch] = useState("");

    const fetcher = useCallback(
        () => labQueueApi.list(hospitalId, "REPORT_GENERATED"),
        [hospitalId]
    );
    const { data, loading } = useAsyncResource(fetcher, {
        initialData: [],
        enabled: !!hospitalId,
        onError: () => notify("Could not load lab reports", "error"),
    });

    const rows = useMemo(() => {
        let list = data ?? [];
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((o) =>
                [o.patientName, o.testName, o.accessionNumber, o.patientUhid]
                    .filter(Boolean)
                    .some((f) => String(f).toLowerCase().includes(q))
            );
        }
        // Newest first — a reports archive is read most-recent-first, the
        // opposite of the queue's oldest-first worklist ordering.
        return [...list].sort(
            (a, b) => new Date(b.reportedAt ?? b.updatedAt ?? 0) - new Date(a.reportedAt ?? a.updatedAt ?? 0)
        );
    }, [data, search]);

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
            { header: "Test", render: (o) => o.testName ?? "—" },
            {
                header: "Accession",
                render: (o) => (
                    <span className="clinic-lab-accession">{o.accessionNumber ?? "—"}</span>
                ),
            },
            {
                header: "Reported",
                render: (o) => fmtDateTime(o.reportedAt ?? o.updatedAt),
            },
            {
                header: "",
                render: (o) => (
                    <a
                        href={`${LABS_FRONTEND_URL}/lab/reports/${o.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="clinic-lab-report-link"
                        onClick={(e) => e.stopPropagation()}
                    >
                        Open report <ExternalLink className="w-3 h-3" />
                    </a>
                ),
            },
        ],
        []
    );

    return (
        <div className="clinic-lab-page">
            <PageHeader title="Lab reports" subtitle="Finalised results" />

            <div className="clinic-lab-toolbar">
                <Badge tone="success" soft>{rows.length} reports</Badge>
                <div className="clinic-lab-search">
                    <Search className="w-4 h-4 clinic-lab-search__icon" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Patient, test or accession…"
                    />
                </div>
            </div>

            {!loading && rows.length === 0 ? (
                <EmptyState
                    icon={<FileText className="w-6 h-6" />}
                    title={search ? "No matching reports" : "No reports yet"}
                    description={
                        search
                            ? "Try a different search."
                            : "Reports appear here once results are entered and the order is completed."
                    }
                />
            ) : (
                <Table columns={columns} data={rows} rowKey={(o) => o.id} loading={loading} />
            )}
        </div>
    );
}

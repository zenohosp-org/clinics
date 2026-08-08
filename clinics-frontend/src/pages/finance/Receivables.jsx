import { useCallback, useMemo, useState } from "react";
import { Coins, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { invoiceApi } from "@/utils/api";
import { AGING_BUCKETS, buildReceivables, formatINR } from "@/utils/receivables";
import { fmtId } from "@/utils/idFormat";
import { fmtDate } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Outstanding patient dues, aged.
 *
 * Computed from this app's own invoices rather than fetched from the finance
 * service: finance derives its receivables from these same invoice rows, so
 * asking it would be a round-trip to read data we already hold — and would
 * make the page fail whenever the finance service is down.
 */
export default function Receivables() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const hospitalId = user?.hospitalId;

    const [search, setSearch] = useState("");
    const [bucket, setBucket] = useState("ALL");

    const fetcher = useCallback(() => invoiceApi.getByHospital(hospitalId), [hospitalId]);
    const { data, loading } = useAsyncResource(fetcher, {
        initialData: [],
        enabled: !!hospitalId,
        onError: () => notify("Could not load invoices", "error"),
    });

    const report = useMemo(() => buildReceivables(data ?? []), [data]);

    const rows = useMemo(() => {
        let list = report.rows;
        if (bucket !== "ALL") list = list.filter((r) => r.bucket === bucket);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter((r) =>
                [r.patientName, r.invoiceNumber, r.patientUhid]
                    .filter(Boolean)
                    .some((f) => String(f).toLowerCase().includes(q))
            );
        }
        return list;
    }, [report.rows, bucket, search]);

    const columns = useMemo(
        () => [
            {
                header: "Patient",
                render: (r) => (
                    <div className="hms-dash-pat-cell">
                        <div className="hms-dash-pat-cell__avatar">
                            {(r.patientName ?? "?").charAt(0)}
                        </div>
                        <div>
                            <p className="hms-dash-pat-cell__name">{r.patientName ?? "—"}</p>
                            <p className="hms-dash-pat-cell__uhid">{fmtId(r.patientUhid)}</p>
                        </div>
                    </div>
                ),
            },
            { header: "Invoice", render: (r) => r.invoiceNumber ?? "—" },
            { header: "Date", render: (r) => fmtDate(r.date) },
            {
                header: "Age",
                render: (r) => {
                    const meta = AGING_BUCKETS.find((b) => b.key === r.bucket);
                    return (
                        <Badge tone={meta?.tone ?? "neutral"} soft>
                            {r.ageDays == null ? "Undated" : `${r.ageDays}d`}
                        </Badge>
                    );
                },
            },
            {
                header: "Billed",
                render: (r) => <span className="clinic-fin-num">{formatINR(r.total)}</span>,
            },
            {
                header: "Paid",
                render: (r) => <span className="clinic-fin-num">{formatINR(r.paid)}</span>,
            },
            {
                header: "Outstanding",
                render: (r) => (
                    <span className="clinic-fin-num is-strong">{formatINR(r.outstanding)}</span>
                ),
            },
        ],
        []
    );

    return (
        <div className="clinic-fin-page">
            <PageHeader
                title="Receivables"
                subtitle="Money owed to the clinic, by age of invoice"
            />

            <div className="clinic-fin-buckets">
                <button
                    type="button"
                    onClick={() => setBucket("ALL")}
                    className={`clinic-fin-bucket${bucket === "ALL" ? " is-active" : ""}`}
                >
                    <span className="clinic-fin-bucket__label">Total outstanding</span>
                    <span className="clinic-fin-bucket__value">{formatINR(report.grandTotal)}</span>
                    <span className="clinic-fin-bucket__meta">{report.count} invoices</span>
                </button>
                {AGING_BUCKETS.map((b) => (
                    <button
                        key={b.key}
                        type="button"
                        onClick={() => setBucket(b.key)}
                        className={`clinic-fin-bucket is-${b.tone}${bucket === b.key ? " is-active" : ""}`}
                    >
                        <span className="clinic-fin-bucket__label">{b.label}</span>
                        <span className="clinic-fin-bucket__value">
                            {formatINR(report.totals[b.key])}
                        </span>
                    </button>
                ))}
            </div>

            <div className="clinic-lab-toolbar">
                <div className="clinic-lab-search">
                    <Search className="w-4 h-4 clinic-lab-search__icon" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Patient or invoice number…"
                    />
                </div>
            </div>

            {!loading && rows.length === 0 ? (
                <EmptyState
                    icon={<Coins className="w-6 h-6" />}
                    title={report.count === 0 ? "Nothing outstanding" : "No invoices in this bucket"}
                    description={
                        report.count === 0
                            ? "Every invoice has been settled in full."
                            : "Try a different age bucket or search."
                    }
                />
            ) : (
                <Table columns={columns} data={rows} rowKey={(r) => r.id} loading={loading} />
            )}
        </div>
    );
}

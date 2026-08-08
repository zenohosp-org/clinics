import { useCallback, useMemo, useState } from "react";
import { Percent } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { financeReportApi } from "@/utils/api";
import { formatINR } from "@/utils/receivables";
import { fmtDate } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import Alert from "@/components/ui/Alert";

function isoLocalDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function monthStart() {
    const d = new Date();
    return isoLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

const TABS = [
    { key: "output", label: "Output GST (sales)" },
    { key: "input", label: "Input GST (purchases)" },
];

/**
 * GST registers for the clinic.
 *
 * Two directions, deliberately kept as separate tabs rather than one merged
 * table: output GST is tax collected on patient billing (the GSTR-1 basis),
 * input GST is tax paid on purchases (the credit claim). Netting them in one
 * view is how people accidentally file the wrong number.
 *
 * Both come from the finance service, which owns the tax logic — this page
 * presents, it does not compute.
 */
export default function TaxReports() {
    const { notify } = useNotification();
    const [tab, setTab] = useState("output");
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(isoLocalDate());

    const fetcher = useCallback(
        () => (tab === "output"
            ? financeReportApi.outputGst(from, to)
            : financeReportApi.gst(from, to)),
        [tab, from, to]
    );
    const { data, loading, error } = useAsyncResource(fetcher, {
        onError: () => notify("Could not load the GST register", "error"),
    });

    const rows = useMemo(() => {
        const list = data?.rows ?? data?.entries ?? data?.lines ?? data;
        return Array.isArray(list) ? list : [];
    }, [data]);

    const totals = useMemo(() => {
        const sum = (fn) => rows.reduce((s, r) => s + Math.abs(Number(fn(r) ?? 0)), 0);
        return {
            taxable: data?.totalTaxable ?? sum((r) => r.taxableValue ?? r.taxable ?? r.netAmount),
            cgst: data?.totalCgst ?? sum((r) => r.cgst ?? r.cgstAmount),
            sgst: data?.totalSgst ?? sum((r) => r.sgst ?? r.sgstAmount),
            igst: data?.totalIgst ?? sum((r) => r.igst ?? r.igstAmount),
        };
    }, [rows, data]);

    const totalTax = totals.cgst + totals.sgst + totals.igst;

    const columns = useMemo(
        () => [
            { header: "Date", render: (r) => fmtDate(r.date ?? r.invoiceDate ?? r.transactionAt) },
            {
                header: tab === "output" ? "Invoice" : "Bill",
                render: (r) => r.invoiceNumber ?? r.billNumber ?? r.reference ?? "—",
            },
            {
                header: tab === "output" ? "Patient" : "Vendor",
                render: (r) => r.patientName ?? r.vendorName ?? r.party ?? "—",
            },
            { header: "GSTIN", render: (r) => r.gstin ?? "—" },
            {
                header: "Taxable",
                render: (r) => (
                    <span className="clinic-fin-num">
                        {formatINR(r.taxableValue ?? r.taxable ?? r.netAmount)}
                    </span>
                ),
            },
            {
                header: "CGST",
                render: (r) => <span className="clinic-fin-num">{formatINR(r.cgst ?? r.cgstAmount)}</span>,
            },
            {
                header: "SGST",
                render: (r) => <span className="clinic-fin-num">{formatINR(r.sgst ?? r.sgstAmount)}</span>,
            },
            {
                header: "IGST",
                render: (r) => <span className="clinic-fin-num">{formatINR(r.igst ?? r.igstAmount)}</span>,
            },
        ],
        [tab]
    );

    return (
        <div className="clinic-fin-page">
            <PageHeader
                title="GST reports"
                subtitle="Tax collected on billing and paid on purchases"
                actions={
                    <div className="clinic-fin-range">
                        <Input
                            type="date"
                            value={from}
                            max={to}
                            onChange={(e) => setFrom(e.target.value)}
                            aria-label="From date"
                        />
                        <span className="clinic-fin-range__sep">to</span>
                        <Input
                            type="date"
                            value={to}
                            min={from}
                            max={isoLocalDate()}
                            onChange={(e) => setTo(e.target.value)}
                            aria-label="To date"
                        />
                    </div>
                }
            />

            <Tabs
                tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
                active={tab}
                onChange={setTab}
            />

            {error ? (
                <Alert tone="danger">
                    The finance service is not reachable, so the GST register can&apos;t be
                    shown. Do not treat this as a nil return.
                </Alert>
            ) : (
                <>
                    <div className="clinic-fin-buckets">
                        <div className="clinic-fin-bucket">
                            <span className="clinic-fin-bucket__label">Taxable value</span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.taxable)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-info">
                            <span className="clinic-fin-bucket__label">CGST</span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.cgst)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-info">
                            <span className="clinic-fin-bucket__label">SGST</span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.sgst)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-warning">
                            <span className="clinic-fin-bucket__label">
                                Total {tab === "output" ? "collected" : "credit"}
                            </span>
                            <span className="clinic-fin-bucket__value">{formatINR(totalTax)}</span>
                        </div>
                    </div>

                    {!loading && rows.length === 0 ? (
                        <EmptyState
                            icon={<Percent className="w-6 h-6" />}
                            title="Nothing in this register"
                            description="No taxable entries fall in the selected period."
                        />
                    ) : (
                        <Table
                            columns={columns}
                            data={rows}
                            rowKey={(r, i) => r.id ?? i}
                            loading={loading}
                        />
                    )}
                </>
            )}
        </div>
    );
}

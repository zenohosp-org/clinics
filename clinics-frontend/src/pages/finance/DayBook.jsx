import { useCallback, useMemo, useState } from "react";
import { NotebookPen, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { financeReportApi } from "@/utils/api";
import { formatINR } from "@/utils/receivables";
import { fmtTime } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import Alert from "@/components/ui/Alert";

/** Local yyyy-MM-dd. toISOString() would shift to UTC and, after ~05:30 IST, show yesterday. */
function isoLocalDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * One day's cash movement, opening to closing.
 *
 * Served by the finance service, which is the book of record for money in and
 * out. When it is unreachable the page says so plainly rather than rendering
 * zeroes — a day book that silently shows ₹0 would be read as "no trade today".
 */
export default function DayBook() {
    const { notify } = useNotification();
    const [date, setDate] = useState(isoLocalDate());

    const fetcher = useCallback(() => financeReportApi.dayBook(date), [date]);
    const { data, loading, error } = useAsyncResource(fetcher, {
        onError: () => notify("Could not load the day book", "error"),
    });

    const entries = useMemo(() => {
        const rows = data?.entries ?? data?.transactions ?? data?.rows ?? [];
        return Array.isArray(rows) ? rows : [];
    }, [data]);

    const totals = useMemo(() => {
        let credit = 0;
        let debit = 0;
        entries.forEach((e) => {
            const amt = Number(e.amount ?? 0);
            const isCredit =
                String(e.direction ?? e.type ?? "").toUpperCase() === "CREDIT" || amt > 0;
            if (isCredit) credit += Math.abs(amt);
            else debit += Math.abs(amt);
        });
        return {
            credit: data?.totalCredit ?? credit,
            debit: data?.totalDebit ?? debit,
            opening: data?.openingBalance ?? 0,
            closing: data?.closingBalance ?? (data?.openingBalance ?? 0) + credit - debit,
        };
    }, [entries, data]);

    const columns = useMemo(
        () => [
            { header: "Time", render: (e) => fmtTime(e.transactionAt ?? e.createdAt) || "—" },
            {
                header: "Particulars",
                render: (e) => (
                    <div>
                        <p className="clinic-fin-particular">
                            {e.description ?? e.narration ?? e.particulars ?? "—"}
                        </p>
                        {e.category && <p className="clinic-fin-subtle">{e.category}</p>}
                    </div>
                ),
            },
            { header: "Account", render: (e) => e.bankAccountName ?? e.accountName ?? "—" },
            {
                header: "In",
                render: (e) => {
                    const amt = Number(e.amount ?? 0);
                    const isCredit =
                        String(e.direction ?? e.type ?? "").toUpperCase() === "CREDIT" || amt > 0;
                    return isCredit ? (
                        <span className="clinic-fin-num is-credit">{formatINR(Math.abs(amt))}</span>
                    ) : null;
                },
            },
            {
                header: "Out",
                render: (e) => {
                    const amt = Number(e.amount ?? 0);
                    const isCredit =
                        String(e.direction ?? e.type ?? "").toUpperCase() === "CREDIT" || amt > 0;
                    return isCredit ? null : (
                        <span className="clinic-fin-num is-debit">{formatINR(Math.abs(amt))}</span>
                    );
                },
            },
        ],
        []
    );

    return (
        <div className="clinic-fin-page">
            <PageHeader
                title="Day book"
                subtitle="Cash in and out for a single day"
                actions={
                    <Input
                        type="date"
                        value={date}
                        max={isoLocalDate()}
                        onChange={(e) => setDate(e.target.value)}
                        aria-label="Day book date"
                    />
                }
            />

            {error ? (
                <Alert tone="danger">
                    The finance service is not reachable, so today&apos;s cash position
                    can&apos;t be shown. Figures are deliberately hidden rather than
                    displayed as zero.
                </Alert>
            ) : (
                <>
                    <div className="clinic-fin-buckets">
                        <div className="clinic-fin-bucket">
                            <span className="clinic-fin-bucket__label">Opening</span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.opening)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-success">
                            <span className="clinic-fin-bucket__label">
                                <ArrowDownLeft className="w-3 h-3" /> Received
                            </span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.credit)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-danger">
                            <span className="clinic-fin-bucket__label">
                                <ArrowUpRight className="w-3 h-3" /> Paid out
                            </span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.debit)}</span>
                        </div>
                        <div className="clinic-fin-bucket is-info">
                            <span className="clinic-fin-bucket__label">Closing</span>
                            <span className="clinic-fin-bucket__value">{formatINR(totals.closing)}</span>
                        </div>
                    </div>

                    {!loading && entries.length === 0 ? (
                        <EmptyState
                            icon={<NotebookPen className="w-6 h-6" />}
                            title="No entries for this day"
                            description="Payments and expenses recorded on this date will appear here."
                        />
                    ) : (
                        <>
                            <div className="clinic-lab-toolbar">
                                <Badge tone="neutral" soft>{entries.length} entries</Badge>
                            </div>
                            <Table
                                columns={columns}
                                data={entries}
                                rowKey={(e, i) => e.id ?? i}
                                loading={loading}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

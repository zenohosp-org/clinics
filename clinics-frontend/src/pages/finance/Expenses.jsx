import { useCallback, useMemo, useState } from "react";
import { Wallet, Search } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { expenseApi } from "@/utils/api";
import { formatINR } from "@/utils/receivables";
import { fmtDate } from "@/utils/date";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import Alert from "@/components/ui/Alert";

/** Local yyyy-MM-dd — see the note in DayBook about toISOString drift. */
function isoLocalDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthStart() {
    const d = new Date();
    return isoLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Clinic outgoings for a date range, with a per-category breakdown.
 *
 * Read-only by design. Recording an expense requires choosing a bank account
 * and respects the finance service's period locks; doing that properly belongs
 * in the finance app rather than a half-version here that could write entries
 * into a locked period.
 */
export default function Expenses() {
    const { notify } = useNotification();
    const [from, setFrom] = useState(monthStart());
    const [to, setTo] = useState(isoLocalDate());
    const [search, setSearch] = useState("");

    const fetcher = useCallback(() => expenseApi.list({ from, to }), [from, to]);
    const { data, loading, error } = useAsyncResource(fetcher, {
        initialData: [],
        onError: () => notify("Could not load expenses", "error"),
    });

    const expenses = useMemo(() => {
        const rows = Array.isArray(data) ? data : (data?.content ?? data?.expenses ?? []);
        const q = search.trim().toLowerCase();
        const list = q
            ? rows.filter((e) =>
                [e.description, e.narration, e.category, e.vendorName]
                    .filter(Boolean)
                    .some((f) => String(f).toLowerCase().includes(q))
            )
            : rows;
        return [...list].sort(
            (a, b) => new Date(b.transactionAt ?? b.date ?? 0) - new Date(a.transactionAt ?? a.date ?? 0)
        );
    }, [data, search]);

    const { total, byCategory } = useMemo(() => {
        const cats = new Map();
        let sum = 0;
        expenses.forEach((e) => {
            const amt = Math.abs(Number(e.amount ?? 0));
            sum += amt;
            const c = e.category ?? e.categoryName ?? "Uncategorised";
            cats.set(c, (cats.get(c) ?? 0) + amt);
        });
        return {
            total: sum,
            byCategory: [...cats.entries()]
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount),
        };
    }, [expenses]);

    const columns = useMemo(
        () => [
            { header: "Date", render: (e) => fmtDate(e.transactionAt ?? e.date) },
            {
                header: "Particulars",
                render: (e) => e.description ?? e.narration ?? e.vendorName ?? "—",
            },
            {
                header: "Category",
                render: (e) => (
                    <Badge tone="neutral" soft>{e.category ?? e.categoryName ?? "Uncategorised"}</Badge>
                ),
            },
            { header: "Account", render: (e) => e.bankAccountName ?? e.accountName ?? "—" },
            {
                header: "Amount",
                render: (e) => (
                    <span className="clinic-fin-num is-debit">
                        {formatINR(Math.abs(Number(e.amount ?? 0)))}
                    </span>
                ),
            },
        ],
        []
    );

    return (
        <div className="clinic-fin-page">
            <PageHeader
                title="Expenses"
                subtitle="What the clinic spent, by period and category"
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

            {error ? (
                <Alert tone="danger">
                    The finance service is not reachable, so expenses can&apos;t be shown
                    for this period.
                </Alert>
            ) : (
                <>
                    <div className="clinic-fin-buckets">
                        <div className="clinic-fin-bucket is-danger">
                            <span className="clinic-fin-bucket__label">Total spent</span>
                            <span className="clinic-fin-bucket__value">{formatINR(total)}</span>
                            <span className="clinic-fin-bucket__meta">{expenses.length} entries</span>
                        </div>
                        {byCategory.slice(0, 4).map((c) => (
                            <div className="clinic-fin-bucket" key={c.name}>
                                <span className="clinic-fin-bucket__label">{c.name}</span>
                                <span className="clinic-fin-bucket__value">{formatINR(c.amount)}</span>
                                <span className="clinic-fin-bucket__meta">
                                    {total > 0 ? `${Math.round((c.amount / total) * 100)}%` : "—"}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="clinic-lab-toolbar">
                        <div className="clinic-lab-search">
                            <Search className="w-4 h-4 clinic-lab-search__icon" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Description, category or vendor…"
                            />
                        </div>
                    </div>

                    {!loading && expenses.length === 0 ? (
                        <EmptyState
                            icon={<Wallet className="w-6 h-6" />}
                            title="No expenses in this period"
                            description="Widen the date range, or record expenses in the finance app."
                        />
                    ) : (
                        <Table
                            columns={columns}
                            data={expenses}
                            rowKey={(e, i) => e.id ?? i}
                            loading={loading}
                        />
                    )}
                </>
            )}
        </div>
    );
}

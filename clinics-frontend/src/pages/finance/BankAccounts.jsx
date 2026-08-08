import { useCallback, useMemo, useState } from "react";
import { Landmark, Plus, Pencil, Trash2, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { useAsyncResource } from "@/hooks/useAsyncResource";
import { bankApi } from "@/utils/api";
import { formatINR } from "@/utils/receivables";
import PageHeader from "@/components/ui/PageHeader";
import Table from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import BankAccountModal from "@/components/finance/BankAccountModal";
import ConfirmDeleteModal from "@/components/finance/ConfirmDeleteModal";

/**
 * The clinic's accounts — where money is collected and paid from.
 *
 * These are the same rows the finance service reads, so an account added here
 * appears in the finance app's day book and reconciliation, and immediately
 * becomes selectable in this app's payment-collection flows (invoice payment,
 * appointment booking, IPD billing).
 */
export default function BankAccounts() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const hospitalId = user?.hospitalId;
    const canManage = user?.role === "hospital_admin" || user?.role === "super_admin";

    const [editing, setEditing] = useState(null); // account object, or {} for "new"
    const [deleting, setDeleting] = useState(null);

    const fetcher = useCallback(() => bankApi.list(hospitalId), [hospitalId]);
    const { data, loading, reload } = useAsyncResource(fetcher, {
        initialData: [],
        enabled: !!hospitalId,
        onError: () => notify("Could not load bank accounts", "error"),
    });

    const accounts = useMemo(() => {
        // Default first, then by name — the default is the one people look for.
        return [...(data ?? [])].sort((a, b) => {
            if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
            return (a.accountName ?? "").localeCompare(b.accountName ?? "");
        });
    }, [data]);

    const totals = useMemo(() => {
        const sum = (fn) => accounts.reduce((s, a) => s + Number(fn(a) ?? 0), 0);
        return {
            current: sum((a) => a.currentBalance),
            opening: sum((a) => a.openingBalance),
            count: accounts.length,
        };
    }, [accounts]);

    const handleDelete = useCallback(async () => {
        try {
            await bankApi.remove(hospitalId, deleting.id);
            notify(`Deleted ${deleting.accountName}`, "success");
            setDeleting(null);
            await reload();
        } catch (err) {
            // The backend refuses to delete an account carrying transactions;
            // surface its reason verbatim rather than a generic failure.
            notify(err?.response?.data?.message ?? "Could not delete account", "error");
        }
    }, [deleting, hospitalId, notify, reload]);

    const columns = useMemo(() => {
        const cols = [
            {
                header: "Account",
                render: (a) => (
                    <div>
                        <p className="clinic-lab-test">
                            {a.accountName}
                            {a.isDefault && (
                                <Badge tone="success" soft className="clinic-bank-default">
                                    <Star className="w-3 h-3" /> Default
                                </Badge>
                            )}
                        </p>
                        <p className="clinic-lab-accession">{a.bankName ?? "—"}</p>
                    </div>
                ),
            },
            {
                header: "Number",
                render: (a) => <span className="clinic-lab-accession">{a.accountNumber}</span>,
            },
            {
                header: "Type",
                render: (a) => <Badge tone="neutral" soft>{a.accountType ?? "—"}</Badge>,
            },
            { header: "IFSC", render: (a) => <span className="clinic-lab-accession">{a.ifscCode ?? "—"}</span> },
            {
                header: "Opening",
                render: (a) => <span className="clinic-fin-num">{formatINR(a.openingBalance)}</span>,
            },
            {
                header: "Balance",
                render: (a) => (
                    <span className="clinic-fin-num is-strong">{formatINR(a.currentBalance)}</span>
                ),
            },
        ];

        if (canManage) {
            cols.push({
                header: "",
                render: (a) => (
                    <div className="clinic-bank-actions">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(a)}>
                            <Pencil className="w-3 h-3" /> Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDeleting(a)}>
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                ),
            });
        }
        return cols;
    }, [canManage]);

    return (
        <div className="clinic-fin-page">
            <PageHeader
                title="Bank accounts"
                subtitle="Where the clinic collects and pays money"
                actions={
                    canManage && (
                        <Button onClick={() => setEditing({})}>
                            <Plus className="w-4 h-4" /> Add account
                        </Button>
                    )
                }
            />

            <div className="clinic-fin-buckets">
                <div className="clinic-fin-bucket is-info">
                    <span className="clinic-fin-bucket__label">Total balance</span>
                    <span className="clinic-fin-bucket__value">{formatINR(totals.current)}</span>
                    <span className="clinic-fin-bucket__meta">
                        across {totals.count} account{totals.count === 1 ? "" : "s"}
                    </span>
                </div>
                <div className="clinic-fin-bucket">
                    <span className="clinic-fin-bucket__label">Opening total</span>
                    <span className="clinic-fin-bucket__value">{formatINR(totals.opening)}</span>
                </div>
                <div className="clinic-fin-bucket is-success">
                    <span className="clinic-fin-bucket__label">Net movement</span>
                    <span className="clinic-fin-bucket__value">
                        {formatINR(totals.current - totals.opening)}
                    </span>
                    <span className="clinic-fin-bucket__meta">since opening</span>
                </div>
            </div>

            {!loading && accounts.length === 0 ? (
                <EmptyState
                    icon={<Landmark className="w-6 h-6" />}
                    title="No bank accounts yet"
                    description={
                        canManage
                            ? "Add the clinic's cash drawer and bank accounts so payments can be recorded against them."
                            : "Ask an administrator to add the clinic's accounts."
                    }
                    action={
                        canManage && (
                            <Button onClick={() => setEditing({})}>
                                <Plus className="w-4 h-4" /> Add account
                            </Button>
                        )
                    }
                />
            ) : (
                <Table columns={columns} data={accounts} rowKey={(a) => a.id} loading={loading} />
            )}

            {editing && (
                <BankAccountModal
                    account={editing.id ? editing : null}
                    hospitalId={hospitalId}
                    hasExistingAccounts={accounts.length > 0}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        await reload();
                    }}
                />
            )}

            {deleting && (
                <ConfirmDeleteModal
                    title="Delete bank account"
                    message={
                        <>
                            Delete <strong>{deleting.accountName}</strong> ({deleting.accountNumber})?
                            {" "}An account that already has transactions cannot be deleted.
                        </>
                    }
                    confirmLabel="Delete account"
                    onCancel={() => setDeleting(null)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

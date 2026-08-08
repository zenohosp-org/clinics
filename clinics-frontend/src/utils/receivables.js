/**
 * Accounts-receivable ageing for clinic invoices.
 *
 * Buckets and day arithmetic mirror the finance app's apAging/arAging so the
 * two read as one system — a "31–60 days" figure here means the same thing it
 * does there.
 *
 * Money is summed in **integer paise**, not rupees. Summing floating-point
 * rupees makes bucket columns fail to foot to the grand total by a few paise
 * once there are enough invoices, and a receivables report that doesn't add up
 * is worse than no report.
 */

export const AGING_BUCKETS = [
    { key: "current", label: "0–30 days", short: "0–30", tone: "success" },
    { key: "d31_60", label: "31–60 days", short: "31–60", tone: "info" },
    { key: "d61_90", label: "61–90 days", short: "61–90", tone: "warning" },
    { key: "d90p", label: "90+ days", short: "90+", tone: "danger" },
];

const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
export const toRupees = (paise) => paise / 100;

/**
 * Whole days between an invoice date and today, computed on calendar dates
 * rather than timestamps. Using raw millisecond differences makes an invoice
 * raised at 11pm age a day faster than one raised at 1am, which shows up as
 * invoices sliding between buckets depending on the hour they were created.
 */
export function ageInDays(iso, today = new Date()) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.max(0, Math.floor((b - a) / 86400000));
}

export function bucketOf(ageDays) {
    if (ageDays == null) return "undated";
    if (ageDays <= 30) return "current";
    if (ageDays <= 60) return "d31_60";
    if (ageDays <= 90) return "d61_90";
    return "d90p";
}

/**
 * Outstanding balance on an invoice, in paise. Never negative: an overpayment
 * is a refund liability, not a receivable, and letting it go negative would
 * silently offset genuine dues elsewhere in the total.
 */
export function outstandingPaise(inv) {
    const total = toPaise(inv.total ?? inv.netAmount ?? inv.grandTotal);
    const paid = toPaise(inv.paidAmount ?? inv.amountPaid);
    return Math.max(0, total - paid);
}

/**
 * Build the receivables report from this clinic's invoices.
 *
 * @returns {{ rows, totals, grandTotal, count }} where totals is keyed by
 *          bucket (in rupees) and rows carry per-invoice detail.
 */
export function buildReceivables(invoices, today = new Date()) {
    const totals = { current: 0, d31_60: 0, d61_90: 0, d90p: 0, undated: 0 };
    const rows = [];

    (invoices ?? []).forEach((inv) => {
        // A cancelled invoice is not a debt. Anything else with a balance is.
        if (String(inv.status ?? "").toUpperCase() === "CANCELLED") return;
        const paise = outstandingPaise(inv);
        if (paise <= 0) return;

        const basis = inv.invoiceDate ?? inv.createdAt ?? inv.created;
        const age = ageInDays(basis, today);
        const bucket = bucketOf(age);
        totals[bucket] += paise;

        rows.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            patientName: inv.patientName,
            patientUhid: inv.patientUhid,
            date: basis,
            ageDays: age,
            bucket,
            outstanding: toRupees(paise),
            total: Number(inv.total ?? inv.netAmount ?? 0),
            paid: Number(inv.paidAmount ?? 0),
            status: inv.status,
        });
    });

    // Oldest debt first — that's the collection worklist order.
    rows.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));

    const grandPaise = Object.values(totals).reduce((s, v) => s + v, 0);

    return {
        rows,
        totals: Object.fromEntries(
            Object.entries(totals).map(([k, v]) => [k, toRupees(v)])
        ),
        grandTotal: toRupees(grandPaise),
        count: rows.length,
    };
}

export const formatINR = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

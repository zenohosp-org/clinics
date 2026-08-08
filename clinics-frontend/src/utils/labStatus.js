/**
 * Lab and radiology order lifecycle.
 *
 * The labs service owns the state machine; this is the presentation layer's
 * mirror of it — labels, tones and which action is legal next. Keeping it in
 * one module means the queue, the reports list and the detail modal cannot
 * disagree about what "AWAITING_REPORT" looks like or what button it gets.
 *
 * Order of LAB_FLOW / RADIOLOGY_FLOW is the physical order of work, so a queue
 * grouped by it reads top-to-bottom the way the bench actually runs.
 */

export const LAB_STATUS = {
    PENDING_COLLECTION: {
        label: "Awaiting sample",
        tone: "warning",
        // The action that moves this order forward, or null if it's terminal.
        next: { key: "markCollected", label: "Mark collected" },
    },
    AWAITING_REPORT: {
        label: "Sample received",
        tone: "info",
        next: { key: "markStarted", label: "Start testing" },
    },
    IN_PROGRESS: {
        label: "In progress",
        tone: "info",
        next: { key: "enterResults", label: "Enter results" },
    },
    REPORT_GENERATED: {
        label: "Reported",
        tone: "success",
        next: null,
    },
    CANCELLED: {
        label: "Cancelled",
        tone: "danger",
        next: null,
    },
};

export const RADIOLOGY_STATUS = {
    PENDING_SCAN: {
        label: "Awaiting scan",
        tone: "warning",
        next: { key: "markScanned", label: "Mark scanned" },
    },
    AWAITING_REPORT: {
        label: "Scanned",
        tone: "info",
        next: { key: "markStarted", label: "Start reporting" },
    },
    IN_PROGRESS: {
        label: "Reporting",
        tone: "info",
        next: { key: "writeReport", label: "Write report" },
    },
    REPORT_GENERATED: { label: "Reported", tone: "success", next: null },
    CANCELLED: { label: "Cancelled", tone: "danger", next: null },
};

export const LAB_FLOW = [
    "PENDING_COLLECTION",
    "AWAITING_REPORT",
    "IN_PROGRESS",
    "REPORT_GENERATED",
];

export const RADIOLOGY_FLOW = [
    "PENDING_SCAN",
    "AWAITING_REPORT",
    "IN_PROGRESS",
    "REPORT_GENERATED",
];

/** Statuses that still need someone to act. Drives the "open work" counts. */
export const OPEN_LAB_STATUSES = new Set([
    "PENDING_COLLECTION",
    "AWAITING_REPORT",
    "IN_PROGRESS",
]);

/**
 * Never throws on an unrecognised status — the labs service may add states
 * ahead of this app, and an unknown one should render as itself rather than
 * crash the queue.
 */
export function labStatusMeta(status, map = LAB_STATUS) {
    return map[status] ?? { label: status ?? "Unknown", tone: "neutral", next: null };
}

/**
 * Flag a numeric result against its reference range.
 * Returns "high" | "low" | "normal" | null (null when it can't be judged —
 * a missing range or a non-numeric result like "Negative").
 */
export function flagResult(value, low, high) {
    const v = Number(value);
    if (value === "" || value == null || Number.isNaN(v)) return null;
    const lo = low == null || low === "" ? null : Number(low);
    const hi = high == null || high === "" ? null : Number(high);
    if (lo == null && hi == null) return null;
    if (hi != null && v > hi) return "high";
    if (lo != null && v < lo) return "low";
    return "normal";
}

export const FLAG_TONE = { high: "danger", low: "warning", normal: "success" };

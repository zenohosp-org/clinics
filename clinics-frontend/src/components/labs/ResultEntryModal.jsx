import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { labQueueApi, labResultApi } from "@/utils/api";
import { FLAG_TONE, flagResult } from "@/utils/labStatus";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import Badge from "@/components/ui/Badge";
import { CenterLoader } from "@/components/ui/Loader";

/**
 * Per-analyte result entry for one lab order.
 *
 * Loads whatever analyte rows the labs service has already scaffolded for the
 * order (it creates them from the test's panel definition when the order is
 * raised), lets the technician type a value per analyte, flags each against its
 * reference range as they type, and saves the panel in one bulk call.
 *
 * Saving results and completing the order are two steps on purpose: a partially
 * entered panel is a normal intermediate state (an analyser may report in
 * batches), so "Save" is always available and "Save & complete" only appears
 * once every analyte has a value.
 */
export default function ResultEntryModal({ order, onClose, onSaved }) {
    const { notify } = useNotification();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [observation, setObservation] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        labResultApi
            .listForOrder(order.id)
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data?.results ?? []);
                setRows(
                    list.map((r) => ({
                        id: r.id,
                        analyte: r.analyteName ?? r.analyte ?? r.name ?? "—",
                        unit: r.unit ?? "",
                        low: r.refLow ?? r.referenceLow ?? null,
                        high: r.refHigh ?? r.referenceHigh ?? null,
                        value: r.value ?? r.resultValue ?? "",
                    }))
                );
            })
            .catch(() => {
                if (!cancelled) notify("Could not load the analyte panel", "error");
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [order.id, notify]);

    const setValue = useCallback((idx, value) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value } : r)));
    }, []);

    const allEntered = useMemo(
        () => rows.length > 0 && rows.every((r) => String(r.value).trim() !== ""),
        [rows]
    );

    const abnormalCount = useMemo(
        () => rows.filter((r) => {
            const f = flagResult(r.value, r.low, r.high);
            return f === "high" || f === "low";
        }).length,
        [rows]
    );

    const save = useCallback(
        async (alsoComplete) => {
            setSaving(true);
            try {
                await labResultApi.createBulk(
                    order.id,
                    rows
                        .filter((r) => String(r.value).trim() !== "")
                        .map((r) => ({ id: r.id, analyteName: r.analyte, value: r.value, unit: r.unit }))
                );

                if (alsoComplete) {
                    // The service guards /complete on report data being present,
                    // so the narrative has to be written before completing.
                    await labQueueApi.generateReport(order.id, null, observation || null);
                    await labQueueApi.markCompleted(order.id);
                    notify("Results saved and report generated", "success");
                } else {
                    notify("Results saved", "success");
                }
                onSaved?.();
            } catch (err) {
                notify(
                    err?.response?.data?.message ?? "Could not save results",
                    "error"
                );
            } finally {
                setSaving(false);
            }
        },
        [order.id, rows, observation, notify, onSaved]
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={`Results — ${order.testName ?? "Lab order"}${order.patientName ? ` · ${order.patientName}` : ""}`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="secondary" onClick={() => save(false)} disabled={saving || loading}>
                        {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                        onClick={() => save(true)}
                        disabled={saving || loading || !allEntered}
                        title={allEntered ? undefined : "Enter every analyte before completing"}
                    >
                        Save &amp; complete
                    </Button>
                </>
            }
        >
            {loading ? (
                <CenterLoader text="Loading analytes…" />
            ) : rows.length === 0 ? (
                <p className="clinic-lab-empty-note">
                    This order has no analyte panel defined. Add reference ranges for the
                    test in Labs → Test catalog, then reopen.
                </p>
            ) : (
                <>
                    {abnormalCount > 0 && (
                        <div className="clinic-lab-abnormal-note">
                            <AlertTriangle className="w-4 h-4" />
                            {abnormalCount} value{abnormalCount > 1 ? "s" : ""} outside the
                            reference range
                        </div>
                    )}

                    <div className="clinic-lab-analytes">
                        <div className="clinic-lab-analyte is-head">
                            <span>Analyte</span>
                            <span>Result</span>
                            <span>Unit</span>
                            <span>Reference</span>
                            <span>Flag</span>
                        </div>
                        {rows.map((r, idx) => {
                            const flag = flagResult(r.value, r.low, r.high);
                            return (
                                <div className="clinic-lab-analyte" key={r.id ?? r.analyte}>
                                    <span className="clinic-lab-analyte__name">{r.analyte}</span>
                                    <Input
                                        value={r.value}
                                        onChange={(e) => setValue(idx, e.target.value)}
                                        // Not type="number": some analytes report
                                        // qualitative results ("Negative", "Trace").
                                        inputMode="decimal"
                                        aria-label={`${r.analyte} result`}
                                    />
                                    <span className="clinic-lab-analyte__unit">{r.unit || "—"}</span>
                                    <span className="clinic-lab-analyte__range">
                                        {r.low != null || r.high != null
                                            ? `${r.low ?? "–"} – ${r.high ?? "–"}`
                                            : "—"}
                                    </span>
                                    <span>
                                        {flag ? (
                                            <Badge tone={FLAG_TONE[flag]} soft>
                                                {flag === "normal" ? "Normal" : flag === "high" ? "High" : "Low"}
                                            </Badge>
                                        ) : (
                                            <span className="clinic-lab-analyte__range">—</span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <Textarea
                        value={observation}
                        onChange={(e) => setObservation(e.target.value)}
                        placeholder="Observation / interpretation (appears on the report)"
                        rows={3}
                        className="clinic-lab-observation"
                    />
                </>
            )}
        </Modal>
    );
}

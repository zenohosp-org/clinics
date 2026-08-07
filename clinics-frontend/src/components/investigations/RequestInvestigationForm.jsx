import { useState, useEffect, useMemo, useRef } from "react";
import { useNotification } from "@/context/NotificationContext";
import { labOrderApi, radiologyApi, investigationsApi } from "@/utils/api";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { X } from "lucide-react";

/**
 * Shared form for placing one OR MORE pathology/radiology investigation
 * orders in a single action.
 *
 * Used in three places (IPD Labs tab, Consultation View, Consultation modal).
 * The doctor adds tests to a queue (each carries its own `kind`), sets a
 * shared priority (+ optional sample for pathology), and submits once. Submit
 * has two modes:
 *   - BATCH_ENABLED (labs Phase 10 / V17): one atomic POST /investigations/batch
 *     → labs creates the whole queue as a single requisition (one queue card),
 *     routing each test by discipline; all-or-nothing, deduped by Idempotency-Key.
 *   - Fallback (default, until that endpoint ships): one create per queued test
 *     routed by its kind, via allSettled — a single failure doesn't drop the
 *     rest; failures stay queued for retry.
 * Either way, every test bills as its OWN invoice line — the requisition groups
 * for the queue, never for billing.
 *
 * `kind`/discipline is read from the picked catalog row, NEVER from a free-text
 * input — the contract that avoids the "MRI ordered into pathology queue" bug.
 *
 * Props:
 *   hospitalId   string  — required
 *   patientId    number  — required
 *   admissionId? string  — optional; OMIT entirely for OPD walk-ins
 *   catalog      Service[] — pre-fetched by parent; each row carries `kind`
 *                            ("LAB" | "RADIOLOGY"), name, price, gstRate, and
 *                            (labs-sourced rows) labServiceId
 *   defaultKind? "LAB" | "RADIOLOGY" | "ALL" — initial typeahead filter
 *   onCreated    (savedOrders[]) => void — fires once with the created orders
 *   onCancel?    () => void — optional close hook (modal/panel parent)
 */

const fmtMoney = (n) => `₹${Math.round((Number(n) || 0) * 100) / 100}`;

// Send the whole queue as one atomic requisition via the labs batch endpoint
// (labs Phase 10 / V17). Off until that endpoint is deployed — when off, the
// form falls back to one create per test. Either way each test bills on its own.
const BATCH_ENABLED = import.meta.env.VITE_LABS_BATCH_ORDERS === "true";

const newIdempotencyKey = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

export default function RequestInvestigationForm({
    hospitalId,
    patientId,
    admissionId,
    catalog = [],
    defaultKind = "ALL",
    onCreated,
    onCancel,
}) {
    const { notify } = useNotification();

    const [selected, setSelected]   = useState([]);          // catalog rows queued for ordering
    const [pendingId, setPendingId] = useState("");          // transient picker value (resets after add)
    const [sampleType, setSampleType] = useState("");        // shared, optional (pathology only)
    const [priority, setPriority]   = useState("ROUTINE");   // shared across the batch
    const [kindFilter, setKindFilter] = useState(defaultKind);
    const [saving, setSaving]       = useState(false);

    // Stable idempotency key for the batch submit — held across retries of the
    // SAME queue so a timeout-then-retry dedupes server-side; reset on success
    // or any queue change (a different set of tests = a different batch).
    const idemKeyRef = useRef(null);

    // Reset when the patient context changes (doctor queue-walks to the next
    // OPD patient without the parent unmounting).
    useEffect(() => {
        setSelected([]);
        setPendingId("");
        setSampleType("");
        setPriority("ROUTINE");
        setKindFilter(defaultKind);
        idemKeyRef.current = null;
    }, [patientId, defaultKind]);

    const selectedIds = useMemo(
        () => new Set(selected.map((s) => String(s.id))),
        [selected]
    );

    // Picker options — filtered by the kind pill, excluding already-queued
    // tests, grouped by discipline in the dropdown.
    const pickerOptions = useMemo(() => {
        const pool = kindFilter === "ALL" ? catalog : catalog.filter((s) => s.kind === kindFilter);
        return pool
            .filter((s) => !selectedIds.has(String(s.id)))
            .map((s) => ({
                value: s.id,
                group: s.kind === "LAB" ? "Pathology" : "Radiology",
                label: `${s.name} · ${fmtMoney(s.price)}${s.gstRate ? ` +${s.gstRate}% GST` : ""}`,
            }));
    }, [catalog, kindFilter, selectedIds]);

    const hasLab = useMemo(() => selected.some((s) => s.kind === "LAB"), [selected]);

    // Running totals across the queued tests.
    const totals = useMemo(() => {
        let subtotal = 0, gst = 0;
        selected.forEach((s) => {
            const price = Number(s.price) || 0;
            const rate = Number(s.gstRate) || 0;
            subtotal += price;
            gst += (price * rate) / 100;
        });
        subtotal = Math.round(subtotal * 100) / 100;
        gst = Math.round(gst * 100) / 100;
        return { subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100 };
    }, [selected]);

    const addTest = (id) => {
        const row = catalog.find((s) => String(s.id) === String(id));
        if (row && !selectedIds.has(String(row.id))) {
            setSelected((prev) => [...prev, row]);
        }
        setPendingId("");            // clear the picker for the next pick
        idemKeyRef.current = null;   // queue changed → new batch identity
    };

    const removeTest = (id) => {
        setSelected((prev) => prev.filter((s) => String(s.id) !== String(id)));
        idemKeyRef.current = null;   // queue changed → new batch identity
    };

    // Per-test fields shared by the batch payload + the per-order fallback.
    // labServiceId (labs V15) is set for labs-sourced rows, null on legacy /
    // free-text rows; when present labs snapshots name/sample/price/gst from the
    // catalogue, with these request values still winning when sent.
    const toTestItem = (row) => ({
        labServiceId: row.labServiceId ?? null,
        serviceName: row.name,
        specializationName: row.department?.name ?? null,
        sampleType: row.kind === "LAB" ? (sampleType.trim() || null) : null,
        price: row.price ?? null,
        gstRate: row.gstRate ?? null,
    });

    const buildPayload = (row) => ({
        hospitalId,
        patientId,
        ...(admissionId ? { admissionId } : {}),
        priority,
        ...toTestItem(row),
    });

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        if (selected.length === 0) {
            notify("Add at least one test", "warning");
            return;
        }
        if (!hospitalId || !patientId) {
            notify("Patient context missing", "error");
            return;
        }

        // Preferred path: one atomic requisition card via the labs batch endpoint
        // (labs Phase 10 / V17). Each test still bills as its own line — the
        // requisition only groups them for the queue. Gated until the endpoint
        // ships; the per-order fallback below runs otherwise.
        if (BATCH_ENABLED) {
            if (!idemKeyRef.current) idemKeyRef.current = newIdempotencyKey();
            setSaving(true);
            try {
                const res = await investigationsApi.createBatch(
                    {
                        hospitalId,
                        patientId,
                        ...(admissionId ? { admissionId } : {}),
                        priority,
                        tests: selected.map(toTestItem),
                    },
                    idemKeyRef.current
                );
                const n = (res?.labOrderIds?.length || 0) + (res?.radiologyOrderIds?.length || 0)
                    || selected.length;
                notify(
                    res?.requisitionNumber
                        ? `Requisition ${res.requisitionNumber} placed · ${n} test${n === 1 ? "" : "s"}`
                        : `${n} order${n === 1 ? "" : "s"} placed`,
                    "success"
                );
                idemKeyRef.current = null; // batch landed → next submit is a new batch
                setSelected([]);
                setPendingId("");
                onCreated?.(res);
            } catch (err) {
                // Labs rolls the whole requisition back on any invalid line — keep
                // the queue + idempotency key intact so a retry reuses the key.
                notify(err?.response?.data?.message || "Failed to place requisition", "error");
            } finally {
                setSaving(false);
            }
            return;
        }

        setSaving(true);
        // Fallback: one create per queued test, each routed by its own kind.
        // allSettled so a single rejection doesn't drop the orders that succeeded.
        const results = await Promise.allSettled(
            selected.map((row) =>
                (row.kind === "LAB" ? labOrderApi.create : radiologyApi.create)(buildPayload(row))
            )
        );
        setSaving(false);

        const savedData = [];
        const failedRows = [];
        results.forEach((r, i) => {
            if (r.status === "fulfilled") savedData.push(r.value);
            else failedRows.push(selected[i]);
        });

        // Keep only the failures queued so the doctor retries just those.
        setSelected(failedRows);
        setPendingId("");

        if (savedData.length) {
            notify(
                `${savedData.length} order${savedData.length === 1 ? "" : "s"} placed`
                + (failedRows.length
                    ? ` · ${failedRows.length} failed: ${failedRows.map((f) => f.name).join(", ")}`
                    : ""),
                failedRows.length ? "warning" : "success"
            );
            onCreated?.(savedData);
        } else {
            notify(
                `Failed to place order${failedRows.length === 1 ? "" : "s"}`,
                "error"
            );
        }
    };

    // Empty-catalog guard — doctor knows where to go fix it.
    if (catalog.length === 0) {
        return (
            <div className="lab-form">
                <p className="lab-form__hint">
                    No labs or radiology services configured. Add them under
                    Settings → Services (set department to <strong>Labs</strong>
                    {" "}or <strong>Radiology</strong>) and reload.
                </p>
                {onCancel && (
                    <div className="lab-form__actions">
                        <button
                            type="button"
                            className="lab-form__cancel-btn"
                            onClick={onCancel}
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <form className="lab-form" onSubmit={handleSubmit}>
            {/* Typeahead kind filter — only when defaultKind allows cross-kind
                selection (consult view); IPD owns this state via its own toggle. */}
            {defaultKind === "ALL" && (
                <div className="lab-kind-pills" style={{ marginBottom: 8 }}>
                    {[
                        { key: "ALL",       label: "All" },
                        { key: "LAB",       label: "Pathology" },
                        { key: "RADIOLOGY", label: "Radiology" },
                    ].map((p) => (
                        <button
                            key={p.key}
                            type="button"
                            className={`lab-kind-pill ${kindFilter === p.key ? "is-active" : ""}`}
                            onClick={() => setKindFilter(p.key)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="lab-form__fields">
                <div className="lab-form__field lab-form__field--grow">
                    <label className="lab-form__label">Add tests *</label>
                    {pickerOptions.length > 0 ? (
                        <SearchableSelect
                            value={pendingId}
                            onChange={addTest}
                            options={pickerOptions}
                            placeholder={`Add a ${
                                kindFilter === "ALL" ? "test" :
                                kindFilter === "LAB" ? "pathology test" :
                                "radiology test"
                            }…`}
                        />
                    ) : (
                        <p className="lab-form__hint">
                            {selected.length > 0
                                ? "All available tests added."
                                : <>No services tagged under{" "}
                                    {kindFilter === "RADIOLOGY" ? "Radiology" : "Labs"}{" "}
                                    yet. Add them in Settings → Services.</>}
                        </p>
                    )}
                </div>

                {/* Sample only meaningful for pathology; one shared, optional
                    value applied to all pathology tests in the batch (labs uses
                    the catalogue's specimen default when left blank). */}
                {hasLab && (
                    <div className="lab-form__field">
                        <label className="lab-form__label">Sample</label>
                        <input
                            className="lab-form__input"
                            placeholder="Blood / Urine"
                            value={sampleType}
                            onChange={(e) => setSampleType(e.target.value)}
                        />
                    </div>
                )}

                <div className="lab-form__field">
                    <label className="lab-form__label">Priority</label>
                    <select
                        className="lab-form__select"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                    >
                        <option value="ROUTINE">Routine</option>
                        <option value="URGENT">Urgent</option>
                        <option value="STAT">STAT</option>
                    </select>
                </div>
            </div>

            {/* Queued tests — compact list (one per row), styled with the lab-*
                design system. Reuses lab-kind-chip for the discipline badge and
                the card's hover-red remove pattern; scrolls past ~8 rows so the
                panel stays compact, total pinned in the footer. */}
            {selected.length > 0 && (
                <div className="lab-queue">
                    <div className="lab-queue__scroll">
                        {selected.map((s) => (
                            <div className="lab-queue__row" key={s.id}>
                                <span className={`lab-kind-chip ${s.kind === "LAB" ? "is-lab" : "is-radiology"}`}>
                                    {s.kind === "LAB" ? "Pathology" : "Radiology"}
                                </span>
                                <span className="lab-queue__name">{s.name}</span>
                                <span className="lab-queue__price">{fmtMoney(s.price)}</span>
                                <button
                                    type="button"
                                    className="lab-queue__remove"
                                    onClick={() => removeTest(s.id)}
                                    aria-label={`Remove ${s.name}`}
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {totals.subtotal > 0 && (
                        <div className="lab-queue__footer">
                            <span>{selected.length} test{selected.length === 1 ? "" : "s"}</span>
                            <span>
                                Subtotal {fmtMoney(totals.subtotal)}
                                {totals.gst > 0 && <> · GST {fmtMoney(totals.gst)}</>}
                                {" · "}
                                <strong>Total {fmtMoney(totals.total)}</strong>
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className="lab-form__actions">
                <button
                    type="submit"
                    className="lab-form__save-btn"
                    disabled={saving || selected.length === 0}
                >
                    {saving
                        ? "Placing…"
                        : selected.length > 1
                            ? `Place ${selected.length} orders`
                            : "Place order"}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        className="lab-form__cancel-btn"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}

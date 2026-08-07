import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { admissionApi, invoiceApi, claimsApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { useNotification } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import InvoiceDeductionNote from "@/components/billing/InvoiceDeductionNote";
import {
    X,
    LogOut,
    CheckCircle2,
    Calendar,
    AlertCircle,
    IndianRupee,
} from "lucide-react";
import {
    Alert,
    Button,
    FormGroup,
    Input,
    Textarea,
} from "@/components/ui";

function fmt(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/**
 * Discharge workflow modal. Fullscreen split-pane (clinical form on
 * the left, patient summary + bill status on the right). Layout pieces
 * live in admin.css under .hms-discharge-* — left/right panes, headers,
 * footers, follow-up checkbox card, stacked summary list, and the
 * 4-tone .hms-bill-card (pending / clear / partial / unpaid).
 */
export default function DischargeModal({ admission, onClose, onDischarged }) {
    const { notify } = useNotification();
    const { user } = useAuth();

    const [clinical, setClinical] = useState({
        actualDischargeDate: new Date().toISOString().slice(0, 16),
        dischargeDiagnosis: admission.primaryDiagnosis || "",
        dischargeNote: "",
        createFollowUp: false,
        followUpDate: "",
    });

    const [submitting, setSubmitting] = useState(false);
    const [billError, setBillError] = useState(false);

    // null = unknown / loading, then: 'UNPAID' | 'PARTIAL' | 'PAID' | 'SETTLED' | 'UNSETTLED'
    const [billStatus, setBillStatus] = useState(null);
    const [billTotal, setBillTotal] = useState(0);
    const [billPaid, setBillPaid] = useState(0);
    // Read-only claim context for this admission's invoice, so a settled-claim
    // deduction is surfaced beside the balance (not chased as plain patient-due).
    const [invClaim, setInvClaim] = useState(null);

    useEffect(() => {
        let cancelled = false;
        invoiceApi
            .getAdmissionInvoice(admission.id)
            .then((inv) => {
                if (!inv || cancelled) return;
                setBillStatus(inv.status);
                setBillTotal(Number(inv.total || 0));
                setBillPaid(Number(inv.paidAmount || 0));
                // One batched claims lookup (same pattern as the billing screens);
                // optional context — failures just leave the annotation off.
                if (user?.hospitalId) {
                    claimsApi
                        .list(user.hospitalId)
                        .then((data) => {
                            if (cancelled) return;
                            const claim = (data?.claims || [])
                                .find((c) => String(c.invoiceId) === String(inv.id)) || null;
                            setInvClaim(claim);
                        })
                        .catch(() => { });
                }
            })
            .catch(() => { });
        return () => { cancelled = true; };
    }, [admission.id, user?.hospitalId]);

    const billClear = billStatus === "PAID" || billStatus === "SETTLED";
    const balanceDue = Math.max(0, billTotal - billPaid);

    const handleDischarge = async () => {
        if (!clinical.actualDischargeDate) {
            notify("Discharge date is required", "error");
            return;
        }
        setSubmitting(true);
        setBillError(false);
        try {
            await admissionApi.discharge(admission.id, {
                actualDischargeDate: clinical.actualDischargeDate,
                dischargeDiagnosis: clinical.dischargeDiagnosis,
                dischargeNote: clinical.dischargeNote,
                createFollowUp: clinical.createFollowUp,
                followUpDate: clinical.followUpDate || null,
                followUpDoctorId: admission.admittingDoctorId || null,
            });
            notify("Patient discharged successfully", "success");
            window.open(`/print/admission/${admission.id}/discharge-summary`, "_blank", "noopener,noreferrer");
            onDischarged();
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || "";
            if (msg.includes("INVOICE_UNPAID")) {
                setBillError(true);
                setBillStatus((prev) =>
                    prev === "PAID" || prev === "SETTLED" ? prev : "UNSETTLED"
                );
            } else {
                notify(msg || "Discharge failed", "error");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const host =
        typeof document !== "undefined"
            ? document.getElementById("modal-root") || document.body
            : null;

    if (!host) return null;

    return createPortal(
        <div className="hms-discharge-shell" role="dialog" aria-modal="true">
            {/* Left panel — clinical form */}
            <div className="hms-discharge-left">
                <div className="hms-discharge-header">
                    <div>
                        <h2 className="hms-discharge-header__title">
                            <LogOut size={16} className="text-danger" /> Discharge patient
                        </h2>
                        <p className="hms-discharge-header__sub">
                            {admission.patientName} · {fmtId(admission.admissionNumber)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="hms-modal-close"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="hms-discharge-body">
                    {billStatus && !billClear && (
                        <Alert
                            tone="danger"
                            icon={<AlertCircle size={16} />}
                            title={
                                billStatus === "PARTIAL"
                                    ? "Partial payment — balance outstanding"
                                    : "Bill not settled"
                            }
                        >
                            {billStatus === "PARTIAL" ? (
                                <>
                                    <strong>{fmt(balanceDue)}</strong> still due. Collect the remaining
                                    balance in the <strong>Billing</strong> tab before discharging.
                                </>
                            ) : (
                                <>
                                    Finalize and settle the patient's bill in the{" "}
                                    <strong>Billing</strong> tab before discharging.
                                </>
                            )}
                        </Alert>
                    )}

                    {billError && billClear && (
                        <Alert
                            tone="danger"
                            icon={<AlertCircle size={16} />}
                            title="Bill not paid"
                        >
                            Please finalize and pay the patient's bill in the{" "}
                            <strong>Billing</strong> tab before discharging.
                        </Alert>
                    )}

                    <FormGroup label="Discharge date & time *">
                        <Input
                            type="datetime-local"
                            required
                            value={clinical.actualDischargeDate}
                            onChange={(e) =>
                                setClinical((c) => ({ ...c, actualDischargeDate: e.target.value }))
                            }
                        />
                    </FormGroup>
                    <FormGroup label="Discharge diagnosis">
                        <Input
                            placeholder="Final diagnosis on discharge"
                            value={clinical.dischargeDiagnosis}
                            onChange={(e) =>
                                setClinical((c) => ({ ...c, dischargeDiagnosis: e.target.value }))
                            }
                        />
                    </FormGroup>
                    <FormGroup label="Discharge summary / notes">
                        <Textarea
                            rows={3}
                            placeholder="Treatment summary, post-discharge instructions…"
                            value={clinical.dischargeNote}
                            onChange={(e) =>
                                setClinical((c) => ({ ...c, dischargeNote: e.target.value }))
                            }
                        />
                    </FormGroup>

                    <div className="hms-discharge-followup">
                        <label className="hms-discharge-followup__label">
                            <input
                                type="checkbox"
                                checked={clinical.createFollowUp}
                                onChange={(e) =>
                                    setClinical((c) => ({ ...c, createFollowUp: e.target.checked }))
                                }
                                className="hms-discharge-followup__checkbox"
                            />
                            <span className="hms-discharge-followup__text">
                                <Calendar size={14} className="text-gray-400" />
                                Schedule OPD follow-up
                            </span>
                        </label>
                        {clinical.createFollowUp && (
                            <div className="hms-discharge-followup__indent">
                                <FormGroup label="Follow-up date *">
                                    <Input
                                        type="date"
                                        value={clinical.followUpDate}
                                        onChange={(e) =>
                                            setClinical((c) => ({ ...c, followUpDate: e.target.value }))
                                        }
                                    />
                                </FormGroup>
                            </div>
                        )}
                    </div>
                </div>

                <div className="hms-discharge-footer">
                    <Button variant="cancel" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleDischarge}
                        disabled={
                            submitting ||
                            !clinical.actualDischargeDate ||
                            (billStatus !== null && !billClear)
                        }
                        loading={submitting}
                        title={
                            !billClear && billStatus
                                ? "Settle the outstanding bill before discharging"
                                : undefined
                        }
                    >
                        <CheckCircle2 size={14} /> Confirm discharge
                    </Button>
                </div>
            </div>

            {/* Right panel — patient summary */}
            <div className="hms-discharge-right">
                <div>
                    <p className="hms-discharge-patient__label">Patient</p>
                    <p className="hms-discharge-patient__name">{admission.patientName}</p>
                    {(admission.patientUhid || admission.uhid) && (
                        <p className="hms-discharge-patient__uhid">
                            UHID: {fmtId(admission.patientUhid || admission.uhid)}
                        </p>
                    )}
                </div>

                <div className="hms-discharge-summary">
                    {[
                        ["Admission no.", fmtId(admission.admissionNumber)],
                        ["IPD no.", admission.ipdNumber || admission.ipd_number || null],
                        [
                            "Room / ward",
                            [admission.roomNumber, admission.wardName].filter(Boolean).join(" · ") ||
                            "—",
                        ],
                        [
                            "Admitting doctor",
                            admission.admittingDoctorName || admission.doctorName || "—",
                        ],
                        [
                            "Admitted",
                            admission.admissionDate
                                ? new Date(admission.admissionDate).toLocaleString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })
                                : "—",
                        ],
                        [
                            "Discharge",
                            clinical.actualDischargeDate
                                ? new Date(clinical.actualDischargeDate).toLocaleString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                })
                                : "—",
                        ],
                        [
                            "Diagnosis",
                            clinical.dischargeDiagnosis || admission.primaryDiagnosis || "—",
                        ],
                    ]
                        .filter(([, v]) => v !== null)
                        .map(([label, value]) => (
                            <div key={label} className="hms-discharge-summary__row">
                                <span className="hms-discharge-summary__label">{label}</span>
                                <span className="hms-discharge-summary__value">{value}</span>
                            </div>
                        ))}
                </div>

                <BillingStatusCard
                    billStatus={billStatus}
                    billClear={billClear}
                    billTotal={billTotal}
                    billPaid={billPaid}
                    balanceDue={balanceDue}
                    claim={invClaim}
                />
            </div>
        </div>,
        host
    );
}

function BillingStatusCard({ billStatus, billClear, billTotal, billPaid, balanceDue, claim }) {
    const fmtLocal = (n) =>
        "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

    const mod =
        billStatus === null
            ? ""
            : billClear
                ? "is-clear"
                : billStatus === "PARTIAL"
                    ? "is-partial"
                    : "is-unpaid";

    return (
        <div className={`hms-bill-card ${mod}`}>
            <IndianRupee size={16} className="hms-bill-card__icon" />
            <div>
                {billStatus === null && (
                    <p className="hms-bill-card__title is-pending">Checking bill…</p>
                )}
                {billClear && (
                    <>
                        <p className="hms-bill-card__title">Bill fully settled</p>
                        <p className="hms-bill-card__sub">
                            {fmtLocal(billTotal)} settled — patient can be discharged.
                        </p>
                    </>
                )}
                {billStatus === "PARTIAL" && (
                    <>
                        <p className="hms-bill-card__title">Partial payment received</p>
                        <p className="hms-bill-card__sub">
                            {fmtLocal(billPaid)} paid · <strong>{fmtLocal(balanceDue)} still due</strong>.
                            Collect balance in Billing tab.
                        </p>
                    </>
                )}
                {(billStatus === "UNPAID" || billStatus === "UNSETTLED") && (
                    <>
                        <p className="hms-bill-card__title">Bill not settled</p>
                        <p className="hms-bill-card__sub">
                            Finalize and settle{" "}
                            {billTotal > 0 ? fmtLocal(billTotal) : "the bill"} in the Billing tab before
                            discharging.
                        </p>
                    </>
                )}
                {/* Beside the balance, never part of it: how a settled claim's
                    shortfall was classified (or that it's not yet classified). */}
                <InvoiceDeductionNote claim={claim} />
            </div>
        </div>
    );
}

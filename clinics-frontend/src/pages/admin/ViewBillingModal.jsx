import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useMemo } from "react";
import {
    invoiceApi,
    hospitalServiceApi,
    admissionApi,
    radiologyApi,
    patientServicesApi,
} from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { Receipt, BedDouble, ScanLine, Stethoscope, Pill, FlaskConical, Wrench, AlertCircle,  } from "lucide-react";
import { Alert, Button, Modal } from "@/components/ui";

/** Item-type → label, icon, and the .hms-bill-type modifier that flips
 *  the chip's bg + colour in admin.css. */
const TYPE_META = {
    ROOM_CHARGE:  { label: "Room",         icon: BedDouble,    mod: "is-room" },
    CONSULTATION: { label: "Consultation", icon: Stethoscope,  mod: "is-consultation" },
    RADIOLOGY:    { label: "Radiology",    icon: ScanLine,     mod: "is-radiology" },
    LAB_TEST:     { label: "Lab test",     icon: FlaskConical, mod: "is-lab" },
    MEDICINE:     { label: "Medicine",     icon: Pill,         mod: "is-medicine" },
    CUSTOM:       { label: "Custom",       icon: Wrench,       mod: "is-custom" },
};

const GST_RATE = 0.18;

function countMealSlots(admitDate, dischargeDate, chargeTime) {
    if (!chargeTime) return 0;
    const [h, m] = chargeTime.split(":").map(Number);
    const admit = new Date(admitDate);
    const discharge = new Date(dischargeDate);
    let count = 0;
    const day = new Date(admit);
    day.setHours(0, 0, 0, 0);
    while (day <= discharge) {
        const slot = new Date(day);
        slot.setHours(h, m, 0, 0);
        if (slot >= admit && slot <= discharge) count++;
        day.setDate(day.getDate() + 1);
    }
    return count;
}

function fmt(n) {
    return (
        "₹" +
        Number(n || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}

/**
 * Read-only billing preview for an admission. Auto-detects pending
 * charges (room, consultations, radiology, patient-services) by
 * combining the smart-suggestions endpoint with the hospital service
 * catalogue and the patient-services config. Layout lives in admin.css
 * under .hms-bill-* (table, type pills, totals block).
 */
export default function ViewBillingModal({ admission, onClose }) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);

    useEffect(() => {
        if (!user?.hospitalId || !admission.patientId) return;
        setLoading(true);

        const admitMs = new Date(admission.admissionDate).getTime();
        const elapsedMs = Date.now() - admitMs;
        const roomDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

        Promise.all([
            invoiceApi.getSmartSuggestions(admission.patientId, admission.id).catch(() => ({})),
            hospitalServiceApi.list(user.hospitalId).catch(() => []),
            admissionApi.get(admission.id).catch(() => null),
            radiologyApi.getByAdmission(admission.id).catch(() => []),
            patientServicesApi.list(user.hospitalId).catch(() => []),
        ])
            .then(([suggestions, services, fullAdmission, radiologyOrders, patientServices]) => {
                let key = 0;
                const auto = [];

                const roomNumber = admission.roomNumber || fullAdmission?.roomNumber;
                if (roomNumber && roomDays > 0) {
                    const pricePerDay =
                        suggestions.roomCharge?.pricePerDay ||
                        fullAdmission?.roomPricePerDay ||
                        fullAdmission?.room?.pricePerDay ||
                        fullAdmission?.room?.dailyCharge ||
                        fullAdmission?.ward?.dailyCharge ||
                        0;
                    const roomType = admission.roomType || fullAdmission?.roomType;
                    const roomLabel = roomType
                        ? `Room ${roomNumber} (${roomType.replace(/_/g, " ")})`
                        : `Room ${roomNumber}`;
                    auto.push({
                        key: key++,
                        itemType: "ROOM_CHARGE",
                        description: `${roomLabel} — ${roomDays} day${roomDays !== 1 ? "s" : ""}`,
                        quantity: roomDays,
                        unitPrice: pricePerDay,
                        totalPrice: roomDays * pricePerDay,
                    });
                }

                suggestions.appointments?.forEach((a) => {
                    auto.push({
                        key: key++,
                        itemType: "CONSULTATION",
                        description: `Consultation — Dr. ${a.doctorName}${a.specialization ? ` (${a.specialization})` : ""}`,
                        quantity: 1,
                        unitPrice: a.consultationFee,
                        totalPrice: a.consultationFee,
                    });
                });

                const EXCLUDED_STATUSES = ["CANCELLED", "BILLED"];
                const pending = Array.isArray(radiologyOrders)
                    ? radiologyOrders.filter((r) => !EXCLUDED_STATUSES.includes(r.status))
                    : [];
                pending.forEach((r) => {
                    const name = r.serviceName || r.investigationName || r.testName || "Radiology";
                    const match = services.find((s) => s.name.toLowerCase() === name.toLowerCase());
                    const price = match?.price ?? 0;
                    auto.push({
                        key: key++,
                        itemType: "RADIOLOGY",
                        description: name,
                        quantity: 1,
                        unitPrice: price,
                        totalPrice: price,
                    });
                });

                const enabledServices = Array.isArray(patientServices)
                    ? patientServices.filter((s) => s.isActive)
                    : [];
                const nowIso = new Date().toISOString();
                enabledServices.forEach((s) => {
                    if (s.type === "FOOD") {
                        const price = s.pricePerMeal || 0;
                        const quantity = s.chargeTime
                            ? countMealSlots(admission.admissionDate, nowIso, s.chargeTime)
                            : roomDays * 3;
                        auto.push({
                            key: key++,
                            itemType: "CUSTOM",
                            description: `${s.name} (${quantity} meal${quantity !== 1 ? "s" : ""})`,
                            quantity,
                            unitPrice: price,
                            totalPrice: quantity * price,
                        });
                    } else if (s.type === "REGISTRATION" && s.oneTimeCharge) {
                        const price = s.pricePerDay || 0;
                        auto.push({
                            key: key++,
                            itemType: "CUSTOM",
                            description: s.name,
                            quantity: 1,
                            unitPrice: price,
                            totalPrice: price,
                        });
                    } else {
                        const price = s.pricePerDay || 0;
                        const qty = s.chargeTime
                            ? countMealSlots(admission.admissionDate, nowIso, s.chargeTime)
                            : roomDays;
                        auto.push({
                            key: key++,
                            itemType: "CUSTOM",
                            description: `${s.name} (${qty} day${qty !== 1 ? "s" : ""})`,
                            quantity: qty,
                            unitPrice: price,
                            totalPrice: qty * price,
                        });
                    }
                });

                setItems(auto);
            })
            .catch(() => notify("Could not load billing details", "error"))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admission.id, user?.hospitalId]);

    const subtotal = useMemo(
        () => items.reduce((s, i) => s + (i.totalPrice || 0), 0),
        [items]
    );
    const medicineSubtotal = useMemo(
        () =>
            items
                .filter((i) => i.itemType === "MEDICINE")
                .reduce((s, i) => s + (i.totalPrice || 0), 0),
        [items]
    );
    const gst = medicineSubtotal * GST_RATE;
    const grandTotal = subtotal + gst;
    const hasZeroPrice = items.some(
        (i) => Number(i.unitPrice) === 0 && i.itemType !== "CUSTOM"
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="lg"
            title={
                <div className="hms-modal-title-row">
                    <Receipt size={16} className="text-info" />
                    <div className="hms-modal-title-row__body">
                        <p className="hms-modal-title-row__title text-14">Billing details</p>
                        <p className="hms-modal-title-row__subtitle">
                            {admission.patientName} · {fmtId(admission.admissionNumber)}
                        </p>
                    </div>
                </div>
            }
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            }
        >
            {loading ? (
                <CenterLoader />
            ) : (
                <div className="flex flex-col gap-5">
                    <div>
                        <p className="hms-section-label">Pending charges</p>
                        <p className="text-11 text-gray-400 mb-3 mt-0.5">
                            All charges auto-detected based on services used during this admission
                        </p>

                        {items.length === 0 ? (
                            <div className="hms-bill-empty">
                                <p className="hms-bill-empty__title">No charges detected</p>
                                <p className="hms-bill-empty__sub">
                                    Charges will appear here once services are recorded
                                </p>
                            </div>
                        ) : (
                            <div className="hms-bill-table">
                                <div className="hms-bill-table__head">
                                    <div className="hms-bill-table__head-cell">Type</div>
                                    <div className="hms-bill-table__head-cell">Description</div>
                                    <div className="hms-bill-table__head-cell is-center">Qty</div>
                                    <div className="hms-bill-table__head-cell is-right">Unit ₹</div>
                                    <div className="hms-bill-table__head-cell is-right">Total</div>
                                </div>

                                {items.map((item) => {
                                    const meta = TYPE_META[item.itemType] ?? TYPE_META.CUSTOM;
                                    const Icon = meta.icon;
                                    return (
                                        <div key={item.key} className="hms-bill-table__row">
                                            <div>
                                                <span className={`hms-bill-type ${meta.mod}`}>
                                                    <Icon size={11} />
                                                    {meta.label}
                                                </span>
                                            </div>
                                            <div className="hms-bill-table__desc" title={item.description}>
                                                {item.description}
                                            </div>
                                            <div className="hms-bill-table__cell is-center">
                                                {item.quantity}
                                            </div>
                                            <div className="hms-bill-table__cell is-right">
                                                {fmt(item.unitPrice)}
                                            </div>
                                            <div className="hms-bill-table__total">
                                                {fmt(item.totalPrice)}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Totals */}
                                <div className="hms-bill-totals">
                                    <div className="hms-bill-totals__inner">
                                        <div className="hms-bill-totals__row is-subtotal">
                                            <span>Subtotal</span>
                                            <span>{fmt(subtotal)}</span>
                                        </div>
                                        {medicineSubtotal > 0 && (
                                            <div className="hms-bill-totals__row">
                                                <span>GST on medicines (18%)</span>
                                                <span>{fmt(gst)}</span>
                                            </div>
                                        )}
                                        <div className="hms-bill-totals__row is-grand">
                                            <span>Estimated total</span>
                                            <span>{fmt(grandTotal)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {hasZeroPrice && (
                        <Alert tone="warning" icon={<AlertCircle size={16} />}>
                            Some items have ₹0 — prices are auto-looked up from the service catalog.
                            Add the service in Settings → Packages if missing.
                        </Alert>
                    )}

                    <p className="hms-bill-disclaimer">
                        This is an estimated bill based on services used so far. Final amount may
                        vary at discharge.
                    </p>
                </div>
            )}
        </Modal>
    );
}

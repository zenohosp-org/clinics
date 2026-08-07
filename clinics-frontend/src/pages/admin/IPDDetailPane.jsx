import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { X, BedDouble, Stethoscope, Clock, Calendar, LogOut, Scissors, Activity, Package, Receipt, Phone, User, ExternalLink, RotateCcw, ScanLine, Pill, FlaskConical, Wrench, AlertTriangle, CheckCircle2, ShieldAlert, Plus, FileText, Printer, Ban, Sparkles,  } from "lucide-react";
import { fmtDateTime, fmtDateMed } from "@/utils/date";
import {
    roomLogsApi,
    radiologyApi,
    labOrderApi,
    ambulanceApi,
    assetApi,
    invoiceApi,
    hospitalServiceApi,
    patientServicesApi,
    admissionApi,
    recordApi,
    allergyApi,
    gstRateApi,
} from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import Barcode from "@/components/ui/Barcode";
import axios from "axios";
import SSOCookieManager from "@/utils/ssoManager";
import WritePrescriptionModal from "@/components/modals/WritePrescriptionModal";
import AddMedicalRecordModal from "@/components/modals/AddMedicalRecordModal";
import PastRecordDetailModal from "@/components/modals/PastRecordDetailModal";
import IpdVitalsTab from "@/pages/admin/IpdVitalsTab";
import IpdMarTab from "@/pages/admin/IpdMarTab";
import IpdIoTab from "@/pages/admin/IpdIoTab";
import IpdLabTab from "@/pages/admin/IpdLabTab";
import IpdNursingTab from "@/pages/admin/IpdNursingTab";
import IpdReferralTab from "@/pages/admin/IpdReferralTab";
import IpdZemaAiModal from "@/pages/admin/IpdZemaAiModal";
import { useNotification } from "@/context/NotificationContext";
import {
    Alert,
    Badge,
    Tabs,
} from "@/components/ui";

const otApi = axios.create({
    baseURL: "https://api-ot.zenohosp.com",
    withCredentials: true,
});
otApi.interceptors.request.use((config) => {
    const token = SSOCookieManager.getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

const pharmacyApi = axios.create({
    baseURL: "https://api-pharmacy.zenohosp.com",
    withCredentials: true,
});
pharmacyApi.interceptors.request.use((config) => {
    const token = SSOCookieManager.getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

const TABS = [
    { id: "IPD Log",            label: "IPD log"  },
    { id: "Vitals",             label: "Vitals"   },
    { id: "Meds",               label: "Meds"     },
    { id: "I/O",                label: "I/O"      },
    { id: "Investigations",     label: "Investigations" },
    { id: "Tasks",              label: "Tasks"     },
    { id: "Referrals",          label: "Referrals" },
    { id: "Attendor Details",   label: "Attender"  },
    { id: "Room Mapped Assets", label: "Assets"   },
    { id: "IPD Billing",        label: "Billing"  },
];

/** Timeline event tone — modifier class for .hms-ipd-event-tag */
const EVENT_TONE_CLASS = {
    ADMITTED: "is-admitted",
    ALLOCATED: "is-allocated",
    DEALLOCATED: "is-deallocated",
    ATTENDER_ASSIGNED: "",
    ATTENDER_UPDATED: "",
    RADIOLOGY: "is-radiology",
    AMBULANCE: "is-ambulance",
    OT: "is-ot",
    DISCHARGED: "is-discharged",
    RECORD: "is-record",
};
const EVENT_LABEL = {
    ADMITTED: "Admitted",
    ALLOCATED: "Room Assigned",
    DEALLOCATED: "Room Vacated",
    ATTENDER_ASSIGNED: "Attender Assigned",
    ATTENDER_UPDATED: "Attender Updated",
    RADIOLOGY: "Radiology",
    AMBULANCE: "Ambulance",
    OT: "OT Procedure",
    DISCHARGED: "Discharged",
    RECORD: "Medical Record",
};

/** Billing item-type → icon + tone-modifier-class pair. */
const BILL_TYPE_META = {
    ROOM_CHARGE:  { label: "Room",     Icon: BedDouble,    cls: "is-room" },
    CONSULTATION: { label: "Consult",  Icon: Stethoscope,  cls: "is-consultation" },
    RADIOLOGY:    { label: "Radiology", Icon: ScanLine,    cls: "is-radiology" },
    LAB_TEST:     { label: "Lab",      Icon: FlaskConical, cls: "is-lab" },
    MEDICINE:     { label: "Medicine", Icon: Pill,         cls: "is-medicine" },
    OT:           { label: "OT",       Icon: Scissors,     cls: "is-ot" },
    CUSTOM:       { label: "Custom",   Icon: Wrench,       cls: "is-custom" },
};

const fmt = fmtDateTime;
const fmtDate = fmtDateMed;
function fmtMoney(n) {
    return (
        "₹" +
        Number(n || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}
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

/**
 * IPDDetailPane — right-edge slide-in drawer for an in-patient
 * admission. Four lazy-loaded tabs (IPD log timeline · Attender ·
 * Room-mapped assets · IPD billing). Phase 8d migration: data layer
 * untouched (every API surface listed in the original file's imports
 * still drives the pane — admissionApi/recordApi/roomLogsApi/
 * radiologyApi/ambulanceApi/assetApi/invoiceApi/hospitalServiceApi/
 * patientServicesApi + the external otApi + pharmacyApi instances).
 *
 * The polled 30s refresh on the IPD Log tab, the Bug-1 OT/pharmacy
 * retry UI, the optimistic record-insert, and the multi-stage
 * discharge guard (no-invoice / unpaid → blocks parent's onDischarge)
 * are all preserved byte-for-byte.
 *
 * Tabs are extracted as inline subcomponents so the parent stays
 * readable — same approach used for DoctorDetails in Phase 7.
 */
export default function IPDDetailPane({
    admission,
    onClose,
    onDischarge,
    onMoveToOT,
    onReturnToWard,
}) {
    const { user } = useAuth();
    const { notify } = useNotification();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("IPD Log");

    const [logs, setLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);

    const [assets, setAssets] = useState([]);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [assetsFetched, setAssetsFetched] = useState(false);

    const [billingItems, setBillingItems] = useState([]);
    const [finalInvoice, setFinalInvoice] = useState(null);
    const [otInvoices, setOtInvoices] = useState([]);
    const [otInvoicesError, setOtInvoicesError] = useState(false);
    const [pharmacyBills, setPharmacyBills] = useState([]);
    const [pharmacyBillsError, setPharmacyBillsError] = useState(false);
    const [loadingBilling, setLoadingBilling] = useState(false);
    const [billingFetched, setBillingFetched] = useState(false);
    const [gstRatePercent, setGstRatePercent] = useState(18);

    const [showAddRecord, setShowAddRecord] = useState(false);
    const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
    const [showZemaModal, setShowZemaModal] = useState(false);
    const [viewRecord, setViewRecord] = useState(null);

    const [allergies, setAllergies] = useState([]);
    const [showAllergyPanel, setShowAllergyPanel] = useState(false);

    const [checkingDischarge, setCheckingDischarge] = useState(false);
    const [dischargeBlock, setDischargeBlock] = useState(null);

    /* Billing totals (estimation view) */
    const subtotal = useMemo(
        () => billingItems.reduce((s, i) => s + (i.totalPrice || 0), 0),
        [billingItems]
    );
    const gst = useMemo(
        () =>
            billingItems
                .filter((i) => i.itemType === "MEDICINE")
                .reduce((s, i) => s + (i.totalPrice || 0), 0) * (gstRatePercent / 100),
        [billingItems, gstRatePercent]
    );
    const grandTotal = subtotal + gst;
    const hasZeroPrice = billingItems.some(
        (i) => Number(i.unitPrice) === 0 && i.itemType !== "CUSTOM"
    );

    const handleDischargeClick = useCallback(async () => {
        setCheckingDischarge(true);
        setDischargeBlock(null);
        try {
            const invoices = await invoiceApi.getPatientInvoices(admission.patientId);
            const admissionInvoices = (invoices || []).filter(
                (inv) => String(inv.admissionId) === String(admission.id)
            );
            if (admissionInvoices.length === 0) {
                setDischargeBlock({ reason: "no_invoice", amount: null });
                return;
            }
            const unpaid = admissionInvoices.find(
                (inv) => inv.status !== "PAID" && inv.status !== "SETTLED"
            );
            if (unpaid) {
                setDischargeBlock({ reason: "unpaid", amount: Number(unpaid.total || 0) });
                return;
            }
            onDischarge();
        } catch {
            onDischarge();
        } finally {
            setCheckingDischarge(false);
        }
    }, [admission?.id, admission?.patientId, onDischarge]);

    const retryOtInvoices = useCallback(async () => {
        setOtInvoicesError(false);
        try {
            const res = await otApi.get("/api/ot/invoices", {
                params: { admissionId: admission.id },
            });
            setOtInvoices(Array.isArray(res.data) ? res.data : res.data?.content ?? []);
        } catch {
            setOtInvoicesError(true);
        }
    }, [admission?.id]);

    const retryPharmacyBills = useCallback(async () => {
        setPharmacyBillsError(false);
        try {
            const res = await pharmacyApi.get("/api/pharmacy/bills", {
                params: { admissionId: admission.id, unbilled: true },
            });
            setPharmacyBills(
                Array.isArray(res.data) ? res.data : res.data?.content ?? []
            );
        } catch {
            setPharmacyBillsError(true);
        }
    }, [admission?.id]);

    const fetchLogs = useCallback(
        async (silent = false) => {
            if (!admission) return;
            if (!silent) setLoadingLogs(true);
            const events = [];
            const admitStart = new Date(admission.admissionDate).getTime();
            const admitEnd = admission.actualDischargeDate
                ? new Date(admission.actualDischargeDate).getTime()
                : Date.now();

            events.push({
                id: "admitted",
                type: "ADMITTED",
                title: "Patient admitted",
                subtitle: admission.admittingDoctorName
                    ? `Under the care of Dr. ${admission.admittingDoctorName}`
                    : admission.chiefComplaint || "",
                timestamp: new Date(admission.admissionDate),
            });

            if (admission.actualDischargeDate) {
                events.push({
                    id: "discharged",
                    type: "DISCHARGED",
                    title: "Patient discharged",
                    subtitle: [
                        admission.dischargeDiagnosis
                            ? `Diagnosis: ${admission.dischargeDiagnosis}`
                            : null,
                        admission.dischargeNote || null,
                    ]
                        .filter(Boolean)
                        .join(" · "),
                    timestamp: new Date(admission.actualDischargeDate),
                });
            }

            await Promise.allSettled([
                admission.roomId
                    ? roomLogsApi.getRoomLogs(admission.roomId, user.hospitalId).then((data) =>
                        data
                            .filter((l) => {
                                if (
                                    l.patientUhid &&
                                    l.patientUhid !== admission.patientUhid
                                )
                                    return false;
                                const t = new Date(l.createdAt).getTime();
                                return t >= admitStart && t <= admitEnd;
                            })
                            .forEach((l) => {
                                let title, subtitle;
                                if (l.event === "ALLOCATED") {
                                    title = `Admitted to Room ${l.roomNumber}`;
                                    subtitle = l.performedBy ? `Allocated by ${l.performedBy}` : "";
                                } else if (l.event === "DEALLOCATED") {
                                    title = `Released from Room ${l.roomNumber}`;
                                    subtitle = l.performedBy ? `Processed by ${l.performedBy}` : "";
                                } else if (l.event === "ATTENDER_ASSIGNED") {
                                    title = l.attenderName
                                        ? `Attendor "${l.attenderName}" Registered`
                                        : "Attendor Added to Record";
                                    subtitle = l.performedBy ? `Added by ${l.performedBy}` : "";
                                } else if (l.event === "ATTENDER_UPDATED") {
                                    title = l.attenderName
                                        ? `Attendor Details Updated — ${l.attenderName}`
                                        : "Attendor Information Updated";
                                    subtitle = l.performedBy ? `Updated by ${l.performedBy}` : "";
                                } else {
                                    title = l.event.replace(/_/g, " ");
                                    subtitle = [
                                        `Room ${l.roomNumber}`,
                                        l.performedBy ? `by ${l.performedBy}` : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ");
                                }
                                events.push({
                                    id: `room-${l.id}`,
                                    type: l.event,
                                    title,
                                    subtitle,
                                    timestamp: new Date(l.createdAt),
                                });
                            })
                    )
                    : Promise.resolve(),

                radiologyApi.getByAdmission(admission.id).then((data) =>
                    data.forEach((r) => {
                        const statusLabel =
                            r.status === "REPORT_GENERATED"
                                ? "Report Ready"
                                : r.status === "SCANNED"
                                    ? "Scan Completed"
                                    : r.status === "PENDING"
                                        ? "Awaiting Scan"
                                        : (r.status || "").replace(/_/g, " ");
                        events.push({
                            id: `rad-${r.id}`,
                            type: "RADIOLOGY",
                            title: `${r.serviceName || "Radiology"} — ${statusLabel}`,
                            subtitle: [
                                r.technicianName ? `Performed by ${r.technicianName}` : null,
                                r.referredByName ? `Referred by Dr. ${r.referredByName}` : null,
                            ]
                                .filter(Boolean)
                                .join(" · "),
                            timestamp: new Date(r.reportedAt || r.scannedAt || r.createdAt),
                            badge: statusLabel,
                        });
                    })
                ).catch(() => {}),

                ambulanceApi.getBookings(user.hospitalId).then((data) =>
                    data
                        .filter((b) => {
                            if (String(b.patient?.id) !== String(admission.patientId))
                                return false;
                            const t = new Date(b.createdAt).getTime();
                            return t >= admitStart && t <= admitEnd;
                        })
                        .forEach((b) =>
                            events.push({
                                id: `amb-${b.id}`,
                                type: "AMBULANCE",
                                title: b.ambulanceType?.name
                                    ? `${b.ambulanceType.name} Ambulance Dispatched`
                                    : "Ambulance Dispatched",
                                subtitle: [
                                    b.pickupAddress ? `From: ${b.pickupAddress}` : null,
                                    b.driverName ? `Driver: ${b.driverName}` : null,
                                    b.vehicleNumber ? `Vehicle: ${b.vehicleNumber}` : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · "),
                                timestamp: new Date(b.createdAt),
                                badge: b.status,
                            })
                        )
                ),

                recordApi
                    .list(admission.patientId, user.hospitalId)
                    .then((records) => {
                        records
                            .filter(
                                (r) =>
                                    r.admissionId &&
                                    String(r.admissionId) === String(admission.id)
                            )
                            .forEach((r) => {
                                const creator = r.createdBy
                                    ? `${r.createdBy.firstName} ${r.createdBy.lastName}`
                                    : "";
                                const attendingName = r.attendingDoctorName
                                    ? `Dr. ${r.attendingDoctorName}`
                                    : null;
                                events.push({
                                    id: `rec-${r.id}`,
                                    type: "RECORD",
                                    historyType: r.historyType || "OTHER",
                                    title: (r.historyType || "OTHER")
                                        .replace(/_/g, " ")
                                        .toLowerCase()
                                        .replace(/\b\w/g, c => c.toUpperCase()),
                                    subtitle: [r.mrn, attendingName ?? creator].filter(Boolean).join(" · "),
                                    description: r.description || r.notes || "",
                                    soapSubjective: r.soapSubjective || "",
                                    soapObjective: r.soapObjective || "",
                                    soapAssessment: r.soapAssessment || "",
                                    soapPlan: r.soapPlan || "",
                                    prescriptionItems: Array.isArray(r.prescriptionItems) ? r.prescriptionItems : [],
                                    rawRecord: r,
                                    timestamp: new Date(r.createdAt),
                                });
                            });
                    })
                    .catch(() => { }),

                otApi
                    .get("/api/ot/bookings")
                    .then((res) => {
                        const bookings = Array.isArray(res.data)
                            ? res.data
                            : res.data?.content ?? [];
                        bookings
                            .filter((ob) => {
                                if (ob.admissionId)
                                    return String(ob.admissionId) === String(admission.id);
                                if (
                                    admission.otBookingId &&
                                    String(ob.id) === String(admission.otBookingId)
                                )
                                    return true;
                                if (String(ob.patientId) === String(admission.patientId)) {
                                    const t = new Date(
                                        ob.scheduledDate || ob.bookingDate || ob.createdAt
                                    ).getTime();
                                    return t >= admitStart && t <= admitEnd;
                                }
                                return false;
                            })
                            .forEach((ob) => {
                                const procedure =
                                    ob.procedureName ||
                                    ob.surgeryType ||
                                    ob.procedure ||
                                    "Surgical Procedure";
                                const surgeon = ob.surgeonName || ob.surgeon;
                                events.push({
                                    id: `ot-${ob.id}`,
                                    type: "OT",
                                    title: `${procedure} — Scheduled in OT`,
                                    subtitle: [
                                        surgeon ? `Surgeon: Dr. ${surgeon}` : null,
                                        ob.status
                                            ? `Status: ${ob.status.replace(/_/g, " ")}`
                                            : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · "),
                                    timestamp: new Date(
                                        ob.scheduledDate || ob.bookingDate || ob.createdAt
                                    ),
                                    badge: ob.status?.replace(/_/g, " "),
                                });
                            });
                    })
                    .catch(() => { }),
            ]);

            events.sort((a, b) => b.timestamp - a.timestamp);
            setLogs(events);
            if (!silent) setLoadingLogs(false);
        },
        [admission?.id, user?.hospitalId]
    );

    const fetchBilling = useCallback(async () => {
        setLoadingBilling(true);
        const isDischarged = !!admission.actualDischargeDate;
        const admitMs = new Date(admission.admissionDate).getTime();
        const endMs = isDischarged
            ? new Date(admission.actualDischargeDate).getTime()
            : Date.now();
        const roomDays = Math.floor((endMs - admitMs) / (1000 * 60 * 60 * 24));

        if (isDischarged) {
            try {
                const allInvoices = await invoiceApi.getPatientInvoices(admission.patientId);
                const match = (allInvoices || []).find(
                    (inv) => String(inv.admissionId) === String(admission.id)
                );
                if (match) {
                    setFinalInvoice(match);
                    try {
                        const res = await otApi.get("/api/ot/invoices", {
                            params: { admissionId: admission.id },
                        });
                        setOtInvoices(
                            Array.isArray(res.data) ? res.data : res.data?.content ?? []
                        );
                        setOtInvoicesError(false);
                    } catch (e) {
                        console.error("[IPDBilling] discharged OT invoice fetch failed:", e);
                        setOtInvoicesError(true);
                    }
                    try {
                        const res = await pharmacyApi.get("/api/pharmacy/bills", {
                            params: { admissionId: admission.id, unbilled: true },
                        });
                        setPharmacyBills(
                            Array.isArray(res.data) ? res.data : res.data?.content ?? []
                        );
                        setPharmacyBillsError(false);
                    } catch (e) {
                        console.error("[IPDBilling] discharged pharmacy fetch failed:", e);
                        setPharmacyBillsError(true);
                    }
                    setBillingFetched(true);
                    setLoadingBilling(false);
                    return;
                }
            } catch (e) {
                // Fall through to live estimation. Logged so we can tell if
                // the discharged-invoice path bombed for a legit reason vs.
                // simply not finding a match.
                console.error("[IPDBilling] discharged-invoice path failed, falling back to estimation:", e);
            }
        }

        let key = 0;
        const items = [];
        try {
            const [suggestions, services, fullAdmission, radiologyOrders, labOrders, patientServices, allPatientInvoices, gstRates] =
                await Promise.all([
                    invoiceApi
                        .getSmartSuggestions(admission.patientId, admission.id)
                        .catch(() => ({})),
                    hospitalServiceApi.list(user.hospitalId).catch(() => []),
                    admissionApi.get(admission.id).catch(() => null),
                    radiologyApi.getByAdmission(admission.id).catch(() => []),
                    labOrderApi.getByAdmission(admission.id).catch(() => []),
                    patientServicesApi.list(user.hospitalId).catch(() => []),
                    invoiceApi.getPatientInvoices(admission.patientId).catch(() => []),
                    gstRateApi.list(user.hospitalId, true).catch(() => []),
                ]);

            const defaultGstRate = (gstRates || []).find((r) => r.isDefault);
            if (defaultGstRate) setGstRatePercent(Number(defaultGstRate.ratePercent));

            const isFirstAdmission =
                (allPatientInvoices || []).filter(
                    (inv) =>
                        inv.admissionId &&
                        String(inv.admissionId) !== String(admission.id)
                ).length === 0;

            const roomNumber = admission.roomNumber || fullAdmission?.roomNumber;
            if (roomNumber) {
                // Always emit the room line when a room is assigned. Floor to
                // 1 day so same-day admits still owe a day, and so a malformed
                // admissionDate (would leave roomDays as NaN) can't silently
                // hide the row. A 0-price room shows as "₹0" and trips the
                // existing hasZeroPrice notice — that's a useful data signal
                // (operator needs to set pricePerDay on this room) rather
                // than a mysterious absence.
                const safeDays = Number.isFinite(roomDays) && roomDays > 0 ? roomDays : 1;
                const pricePerDay =
                    Number(suggestions.roomCharge?.pricePerDay) ||
                    Number(fullAdmission?.roomPricePerDay) ||
                    0;
                items.push({
                    key: key++,
                    itemType: "ROOM_CHARGE",
                    description: `Room ${roomNumber} (${safeDays} day${safeDays !== 1 ? "s" : ""})`,
                    quantity: safeDays,
                    unitPrice: pricePerDay,
                    totalPrice: safeDays * pricePerDay,
                });
            }

            const consults = Array.isArray(suggestions.appointments)
                ? suggestions.appointments
                : [];
            consults.forEach((a) => {
                const price = a.consultationFee || 0;
                items.push({
                    key: key++,
                    itemType: "CONSULTATION",
                    description: a.doctorName
                        ? `Consultation - Dr. ${a.doctorName}`
                        : "Consultation",
                    quantity: 1,
                    unitPrice: price,
                    totalPrice: price,
                });
            });

            const EXCLUDED = ["CANCELLED", "BILLED"];
            (Array.isArray(radiologyOrders) ? radiologyOrders : [])
                .filter((r) => !EXCLUDED.includes(r.status))
                .forEach((r) => {
                    const name = r.serviceName || r.investigationName || "Radiology";
                    const match = (Array.isArray(services) ? services : []).find(
                        (s) => s.name?.toLowerCase() === name.toLowerCase()
                    );
                    const price = match?.price ?? 0;
                    items.push({
                        key: key++,
                        itemType: "RADIOLOGY",
                        description: name,
                        quantity: 1,
                        unitPrice: price,
                        totalPrice: price,
                    });
                });

            // Mirror block for lab orders — same EXCLUDED filter, same shape.
            // Labs auto-bills on report generation as item_type='LAB_TEST'; this
            // block surfaces the same line pre-discharge so the estimate matches
            // what the final invoice will be.
            (Array.isArray(labOrders) ? labOrders : [])
                .filter((l) => !EXCLUDED.includes(l.status))
                .forEach((l) => {
                    const name = l.serviceName || "Lab Test";
                    const match = (Array.isArray(services) ? services : []).find(
                        (s) => s.name?.toLowerCase() === name.toLowerCase()
                    );
                    const price = match?.price ?? l.price ?? 0;
                    items.push({
                        key: key++,
                        itemType: "LAB_TEST",
                        description: name,
                        quantity: 1,
                        unitPrice: price,
                        totalPrice: price,
                    });
                });

            const meds = Array.isArray(suggestions.medicines) ? suggestions.medicines : [];
            meds.forEach((m) => {
                const price = m.totalPrice || m.price || 0;
                items.push({
                    key: key++,
                    itemType: "MEDICINE",
                    description: m.name || "Medicine",
                    quantity: m.quantity || 1,
                    unitPrice: m.unitPrice || price,
                    totalPrice: price,
                });
            });

            const enabledServices = (Array.isArray(patientServices) ? patientServices : [])
                .filter((s) => s.isActive);
            const svcEndDate = isDischarged
                ? admission.actualDischargeDate
                : new Date().toISOString();
            enabledServices.forEach((s) => {
                if (s.type === "FOOD") {
                    const qty = s.chargeTime
                        ? countMealSlots(admission.admissionDate, svcEndDate, s.chargeTime)
                        : roomDays * 3;
                    items.push({
                        key: key++,
                        itemType: "CUSTOM",
                        description: `${s.name} (${qty} meal${qty !== 1 ? "s" : ""})`,
                        quantity: qty,
                        unitPrice: s.pricePerMeal || 0,
                        totalPrice: qty * (s.pricePerMeal || 0),
                    });
                } else if (s.type === "REGISTRATION" && s.oneTimeCharge) {
                    if (isFirstAdmission) {
                        items.push({
                            key: key++,
                            itemType: "CUSTOM",
                            description: s.name,
                            quantity: 1,
                            unitPrice: s.pricePerDay || 0,
                            totalPrice: s.pricePerDay || 0,
                        });
                    }
                } else if (s.oneTimeCharge) {
                    items.push({
                        key: key++,
                        itemType: "CUSTOM",
                        description: s.name,
                        quantity: 1,
                        unitPrice: s.pricePerDay || 0,
                        totalPrice: s.pricePerDay || 0,
                    });
                } else {
                    const qty = s.chargeTime
                        ? countMealSlots(admission.admissionDate, svcEndDate, s.chargeTime)
                        : roomDays;
                    items.push({
                        key: key++,
                        itemType: "CUSTOM",
                        description: `${s.name} (${qty}d)`,
                        quantity: qty,
                        unitPrice: s.pricePerDay || 0,
                        totalPrice: qty * (s.pricePerDay || 0),
                    });
                }
            });
        } catch (e) {
            // Estimation continues with partial data — OT / pharmacy blocks
            // below still run. But log so a runtime crash here (typo on an
            // api wrapper, malformed suggestion shape, etc.) doesn't drop
            // half the bill silently — past incident: labOrderApi.getByAdmission
            // was missing, killed room/consult/labs lines for everyone.
            console.error("[IPDBilling] estimation block failed:", e);
        }

        try {
            const res = await otApi.get("/api/ot/invoices", {
                params: { admissionId: admission.id },
            });
            const otInvs = Array.isArray(res.data) ? res.data : res.data?.content ?? [];
            setOtInvoices(otInvs);
            setOtInvoicesError(false);
            otInvs.forEach((inv) => {
                (Array.isArray(inv.items) ? inv.items : []).forEach((item) => {
                    items.push({
                        key: key++,
                        itemType: "OT",
                        description: item.description || item.name || "OT Procedure",
                        quantity: item.quantity ?? 1,
                        unitPrice: item.unitPrice ?? 0,
                        totalPrice: item.totalPrice ?? item.amount ?? 0,
                    });
                });
            });
        } catch (e) {
            console.error("[IPDBilling] OT invoice fetch failed:", e);
            setOtInvoicesError(true);
        }

        try {
            const res = await pharmacyApi.get("/api/pharmacy/bills", {
                params: { admissionId: admission.id, unbilled: true },
            });
            const pharma = Array.isArray(res.data) ? res.data : res.data?.content ?? [];
            setPharmacyBills(pharma);
            setPharmacyBillsError(false);
            pharma.forEach((bill) => {
                const lines = Array.isArray(bill.items) ? bill.items : [];
                const preGstSum = lines.reduce((s, l) => {
                    const q = Number(l.quantity ?? 1) || 1;
                    const u = Number(l.unitPrice ?? 0) || 0;
                    return s + (Number(l.totalPrice ?? u * q) || 0);
                }, 0);
                const billTotal = Number(bill.totalAmount ?? 0) || 0;
                const factor = preGstSum > 0 ? billTotal / preGstSum : 1;
                const billNo = bill.billNumber ? ` · ${bill.billNumber}` : "";
                lines.forEach((line) => {
                    const qty = Number(line.quantity ?? 1) || 1;
                    const unit = Number(line.unitPrice ?? 0) || 0;
                    const preGst = Number(line.totalPrice ?? unit * qty) || 0;
                    const inclusive = preGst * factor;
                    items.push({
                        key: key++,
                        itemType: "MEDICINE",
                        description: `${line.drugName || "Medicine"}${billNo}`,
                        quantity: qty,
                        unitPrice: qty > 0 ? inclusive / qty : 0,
                        totalPrice: inclusive,
                    });
                });
            });
        } catch (e) {
            console.error("[IPDBilling] pharmacy bill fetch failed:", e);
            setPharmacyBillsError(true);
        }

        setBillingItems(
            items.filter(
                (i) => Number(i.quantity) > 0 || Number(i.totalPrice) > 0
            )
        );

        const estimatedTotal = items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
        if (estimatedTotal > 0) {
            invoiceApi
                .getAdmissionInvoice(admission.id)
                .then((inv) => {
                    if (
                        inv?.id &&
                        inv.status !== "PAID" &&
                        inv.status !== "SETTLED"
                    )
                        invoiceApi.updateEstimate(inv.id, estimatedTotal);
                })
                .catch(() => { });
        }

        setBillingFetched(true);
        setLoadingBilling(false);
    }, [admission?.id, user?.hospitalId]);

    const refreshBilling = useCallback(() => {
        setFinalInvoice(null);
        setBillingItems([]);
        setOtInvoices([]);
        setOtInvoicesError(false);
        setBillingFetched(false);
        fetchBilling();
    }, [fetchBilling]);

    const handleRecordSaved = (saved, { historyType, description, soap }) => {
        const creatorName =
            user?.name ||
            [user?.firstName, user?.lastName].filter(Boolean).join(" ");
        const optimisticEvent = {
            id: `rec-${saved?.id ?? Date.now()}`,
            type: "RECORD",
            historyType,
            title: historyType.replace("_", " "),
            subtitle: [saved?.mrn, creatorName].filter(Boolean).join(" · "),
            description,
            soapSubjective: soap?.subjective || "",
            soapObjective: soap?.objective || "",
            soapAssessment: soap?.assessment || "",
            soapPlan: soap?.plan || "",
            timestamp: new Date(),
        };
        setLogs((prev) => [optimisticEvent, ...prev]);
        setShowAddRecord(false);
        fetchLogs(true);
    };

    const fetchLogsRef = useRef(fetchLogs);
    useEffect(() => {
        fetchLogsRef.current = fetchLogs;
    }, [fetchLogs]);

    useEffect(() => {
        if (activeTab !== "IPD Log") return;
        const id = setInterval(() => fetchLogsRef.current(true), 30_000);
        return () => clearInterval(id);
    }, [activeTab]);

    useEffect(() => {
        if (!admission?.patientId || !user?.hospitalId) return;
        allergyApi
            .list(admission.patientId, user.hospitalId)
            .then((data) => setAllergies(Array.isArray(data) ? data : []))
            .catch(() => setAllergies([]));
    }, [admission?.patientId, user?.hospitalId]);

    useEffect(() => {
        setActiveTab("IPD Log");
        setLogs([]);
        setAssets([]);
        setBillingItems([]);
        setFinalInvoice(null);
        setOtInvoices([]);
        setOtInvoicesError(false);
        setAssetsFetched(false);
        setBillingFetched(false);
        setDischargeBlock(null);
        setShowAddRecord(false);
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [admission?.id]);

    useEffect(() => {
        if (
            activeTab === "Room Mapped Assets" &&
            !assetsFetched &&
            admission?.roomId
        ) {
            setLoadingAssets(true);
            assetApi
                .getByRoom(user.hospitalId, admission.roomId)
                .then((data) => {
                    setAssets(data);
                    setAssetsFetched(true);
                })
                .catch(() => setAssetsFetched(true))
                .finally(() => setLoadingAssets(false));
        }
        if (activeTab === "IPD Billing" && !billingFetched) {
            fetchBilling();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    if (!admission) return null;

    const isAdmitted = admission.status === "ADMITTED";
    const isDischarged = admission.status === "DISCHARGED";
    const canMoveOT = isAdmitted && !admission.inOt && admission.roomType !== "POST_OT";
    const canReturnWard = isAdmitted && !!admission.previousRoomId;

    return (
        <div className="hms-ipd-pane">
            <div className="hms-ipd-pane__scrim" onClick={onClose} />

            <div className="hms-ipd-pane__panel">
                {/* Header */}
                <div className="hms-ipd-header">
                    <div className="hms-ipd-header__top">
                        <div className="hms-ipd-header__identity">
                            <div className="hms-ipd-header__badges">
                                <Badge tone={admission.status === "ADMITTED" ? "success" : "neutral"} soft>
                                    {admission.status}
                                </Badge>
                                {admission.inOt && (
                                    <Badge tone="violet" soft>
                                        <Scissors size={10} /> In OT
                                    </Badge>
                                )}
                            </div>
                            <h2 className="hms-ipd-header__name">
                                {admission.patientName}
                            </h2>
                            <p className="hms-ipd-header__uhid">
                                UHID: {fmtId(admission.patientUhid)}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="hms-modal-close shrink-0"
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="hms-ipd-header__meta">
                        <div className="hms-ipd-header__meta-row">
                            <span className="hms-ipd-header__meta-item">
                                <BedDouble size={12} />
                                {admission.roomNumber
                                    ? `Room ${admission.roomNumber} · ${admission.roomType}`
                                    : "No room assigned"}
                            </span>
                            <span className="hms-ipd-header__meta-item">
                                <Clock size={12} />
                                {fmtDate(admission.admissionDate)}
                            </span>
                        </div>
                        {(admission.admittingDoctorName || admission.approxDischargeDate) && (
                            <div className="hms-ipd-header__meta-row">
                                {admission.admittingDoctorName && (
                                    <span className="hms-ipd-header__meta-item">
                                        <Stethoscope size={12} />
                                        Dr. {admission.admittingDoctorName}
                                    </span>
                                )}
                                {admission.approxDischargeDate && (
                                    <span className="hms-ipd-header__meta-item">
                                        <Calendar size={12} />
                                        Est. {fmtDate(admission.approxDischargeDate)}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ID + action row */}
                    <div className="hms-ipd-header__id-row">
                        <div className="hms-ipd-header__id-group">
                            {admission.ipdId && (
                                <span className="hms-ipd-id-pill">
                                    {fmtId(admission.ipdId)}
                                </span>
                            )}
                            <span className="hms-ipd-id-pill is-outline">
                                {fmtId(admission.admissionNumber)}
                            </span>
                        </div>
                        <div className="hms-ipd-header__actions">
                            <button
                                type="button"
                                className="hms-ipd-chip-btn is-zema"
                                onClick={() => setShowZemaModal(true)}
                            >
                                <Sparkles size={11} /> Analyze with Zema AI
                            </button>
                            <button
                                type="button"
                                className={`hms-ipd-chip-btn${allergies.length > 0 ? " is-allergy" : ""}`}
                                onClick={() => setShowAllergyPanel((v) => !v)}
                            >
                                <AlertTriangle size={11} />
                                {allergies.length > 0
                                    ? `${allergies.length} Allerg${allergies.length === 1 ? "y" : "ies"}`
                                    : "Allergies"}
                            </button>
                            <button
                                type="button"
                                className="hms-ipd-chip-btn"
                                onClick={() => navigate(`/patients/${admission.patientId}`)}
                            >
                                <User size={11} /> Patient
                                <ExternalLink size={9} className="opacity-40" />
                            </button>
                            <button
                                type="button"
                                className="hms-ipd-chip-btn"
                                onClick={() => window.print()}
                            >
                                <Printer size={11} /> Wristband
                            </button>
                            {isDischarged && (
                                <button
                                    type="button"
                                    className="hms-ipd-chip-btn"
                                    onClick={() => window.open(`/print/admission/${admission.id}/discharge-summary`, "_blank", "noopener,noreferrer")}
                                >
                                    <FileText size={11} /> Discharge Summary
                                </button>
                            )}
                            {isAdmitted && (
                                <button
                                    type="button"
                                    className="hms-ipd-chip-btn is-danger"
                                    onClick={handleDischargeClick}
                                    disabled={checkingDischarge}
                                >
                                    {checkingDischarge ? (
                                        <Spinner size={11} className="zu-spinner" />
                                    ) : (
                                        <LogOut size={11} />
                                    )}
                                    Discharge
                                </button>
                            )}
                            {canMoveOT && (
                                <button
                                    type="button"
                                    className="hms-ipd-chip-btn is-violet"
                                    onClick={onMoveToOT}
                                >
                                    <Scissors size={11} /> OT
                                </button>
                            )}
                            {canReturnWard && (
                                <button
                                    type="button"
                                    className="hms-ipd-chip-btn is-success"
                                    onClick={onReturnToWard}
                                >
                                    <RotateCcw size={11} /> Ward
                                </button>
                            )}
                        </div>
                    </div>

                    {dischargeBlock && (
                        <div className="hms-ipd-discharge-block">
                            <ShieldAlert size={14} className="hms-ipd-discharge-block__icon" />
                            <div className="hms-ipd-discharge-block__body">
                                <p className="hms-ipd-discharge-block__title">
                                    {dischargeBlock.reason === "no_invoice"
                                        ? "No invoice generated for this admission"
                                        : `Pending payment of ${fmtMoney(dischargeBlock.amount)}`}
                                </p>
                                <p className="hms-ipd-discharge-block__sub">
                                    {dischargeBlock.reason === "no_invoice"
                                        ? "Generate and clear the invoice in IPD Billing before discharging."
                                        : "Clear the outstanding invoice in IPD Billing before discharging."}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDischargeBlock(null)}
                                className="hms-ipd-discharge-block__dismiss"
                                aria-label="Dismiss"
                            >
                                <X size={11} />
                            </button>
                        </div>
                    )}
                </div>

                {showAllergyPanel && (
                    <AllergyPanel
                        patientId={admission.patientId}
                        hospitalId={user.hospitalId}
                        allergies={allergies}
                        setAllergies={setAllergies}
                        notify={notify}
                        isDischarged={!!admission.actualDischargeDate}
                    />
                )}

                {/* Wristband — printed via the "Wristband" button; hidden on screen,
                    rendered full-page only inside @media print */}
                <div className="hms-ipd-wristband-print">
                    <p className="hms-ipd-wristband-print__hosp">{user?.hospitalName}</p>
                    <p className="hms-ipd-wristband-print__name">{admission.patientName}</p>
                    <div className="hms-ipd-wristband-print__row">
                        <span>UHID: {fmtId(admission.patientUhid)}</span>
                        <span>{fmtId(admission.admissionNumber || admission.ipdId)}</span>
                    </div>
                    {admission.roomNumber && (
                        <p className="hms-ipd-wristband-print__room">
                            Room {admission.roomNumber} · {admission.roomType}
                        </p>
                    )}
                    <Barcode
                        value={admission.patientUhid}
                        height={48}
                        className="hms-ipd-wristband-print__barcode"
                    />
                </div>

                {/* Tabs */}
                <div className="hms-ipd-tabs-bar">
                    <Tabs
                        type="underline"
                        active={activeTab}
                        onChange={setActiveTab}
                        tabs={TABS}
                    />
                </div>

                {/* Tab content */}
                <div className="hms-ipd-tabs-content">
                    {activeTab === "IPD Log" && (
                        <LogTab
                            loadingLogs={loadingLogs}
                            logs={logs}
                            showAddRecord={showAddRecord}
                            setShowAddRecord={setShowAddRecord}
                            setShowPrescriptionModal={setShowPrescriptionModal}
                            setViewRecord={setViewRecord}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Vitals" && (
                        <IpdVitalsTab
                            admissionId={admission.id}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Meds" && (
                        <IpdMarTab
                            admissionId={admission.id}
                            isDischarged={!!admission.actualDischargeDate}
                            allergies={allergies}
                        />
                    )}
                    {activeTab === "I/O" && (
                        <IpdIoTab
                            admissionId={admission.id}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Investigations" && (
                        <IpdLabTab
                            admissionId={admission.id}
                            patientId={admission.patientId}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Tasks" && (
                        <IpdNursingTab
                            admissionId={admission.id}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Referrals" && (
                        <IpdReferralTab
                            admissionId={admission.id}
                            isDischarged={!!admission.actualDischargeDate}
                        />
                    )}
                    {activeTab === "Attendor Details" && <AttenderTab admission={admission} />}
                    {activeTab === "Room Mapped Assets" && (
                        <AssetsTab
                            loadingAssets={loadingAssets}
                            assets={assets}
                            hasRoom={!!admission.roomId}
                        />
                    )}
                    {activeTab === "IPD Billing" && (
                        <BillingTab
                            loadingBilling={loadingBilling}
                            finalInvoice={finalInvoice}
                            billingItems={billingItems}
                            otInvoices={otInvoices}
                            pharmacyBills={pharmacyBills}
                            otInvoicesError={otInvoicesError}
                            pharmacyBillsError={pharmacyBillsError}
                            retryOtInvoices={retryOtInvoices}
                            retryPharmacyBills={retryPharmacyBills}
                            subtotal={subtotal}
                            gst={gst}
                            gstRatePercent={gstRatePercent}
                            grandTotal={grandTotal}
                            hasZeroPrice={hasZeroPrice}
                            isDischarged={!!admission.actualDischargeDate}
                            refreshBilling={refreshBilling}
                        />
                    )}
                </div>
            </div>

            {viewRecord && (
                <PastRecordDetailModal
                    record={viewRecord}
                    onClose={() => setViewRecord(null)}
                />
            )}

            {showZemaModal && (
                <IpdZemaAiModal
                    admission={admission}
                    onClose={() => setShowZemaModal(false)}
                />
            )}

            {(showPrescriptionModal || showAddRecord) && (() => {
                const parts = (admission.patientName || "").trim().split(/\s+/);
                const patient = {
                    id: admission.patientId,
                    firstName: parts[0] || "",
                    lastName: parts.slice(1).join(" "),
                    uhid: admission.patientUhid,
                };
                const admissionNumber = admission.admissionNumber || admission.ipdId;
                return (
                    <>
                        {showPrescriptionModal && (
                            <WritePrescriptionModal
                                patient={patient}
                                admissionId={admission.id}
                                admissionNumber={admissionNumber}
                                allergies={allergies}
                                onClose={() => setShowPrescriptionModal(false)}
                                onSaved={() => {
                                    setShowPrescriptionModal(false);
                                    fetchLogs(true);
                                }}
                            />
                        )}
                        {showAddRecord && (
                            <AddMedicalRecordModal
                                patient={patient}
                                admissionId={admission.id}
                                admissionNumber={admissionNumber}
                                onClose={() => setShowAddRecord(false)}
                                onSaved={handleRecordSaved}
                                onSwitchToPrescription={() => {
                                    setShowAddRecord(false);
                                    setShowPrescriptionModal(true);
                                }}
                            />
                        )}
                    </>
                );
            })()}
        </div>
    );
}

/* ───────────────── Allergy panel ───────────────── */

const SEVERITY_ORDER = { SEVERE: 0, MODERATE: 1, MILD: 2, UNKNOWN: 3 };

function AllergyPanel({ patientId, hospitalId, allergies, setAllergies, notify, isDischarged }) {
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ allergen: "", reaction: "", severity: "UNKNOWN" });

    const sorted = [...allergies].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
    );

    const handleAdd = async () => {
        if (!form.allergen.trim()) { notify("Allergen name is required", "warning"); return; }
        setSaving(true);
        try {
            const saved = await allergyApi.add(patientId, { ...form, hospitalId });
            setAllergies((prev) => [...prev, saved]);
            setForm({ allergen: "", reaction: "", severity: "UNKNOWN" });
            setAdding(false);
            notify("Allergy recorded", "success");
        } catch {
            notify("Failed to save allergy", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (id) => {
        try {
            await allergyApi.remove(patientId, id);
            setAllergies((prev) => prev.filter((a) => a.id !== id));
        } catch {
            notify("Failed to remove allergy", "error");
        }
    };

    return (
        <div className="hms-allergy-panel">
            <div className="hms-allergy-panel__head">
                <AlertTriangle size={13} className="hms-allergy-panel__icon" />
                <span className="hms-allergy-panel__title">Known Allergies</span>
                {!isDischarged && (
                    <button
                        type="button"
                        className="hms-allergy-panel__add-btn"
                        onClick={() => setAdding((v) => !v)}
                    >
                        <Plus size={11} /> Add
                    </button>
                )}
            </div>

            {sorted.length === 0 && !adding && (
                <p className="hms-allergy-panel__empty">No known allergies recorded.</p>
            )}

            {sorted.length > 0 && (
                <div className="hms-allergy-chip-row">
                    {sorted.map((a) => (
                        <div
                            key={a.id}
                            className={`hms-allergy-chip is-${(a.severity || "UNKNOWN").toLowerCase()}`}
                            title={[a.reaction, a.recordedByName ? `Recorded by ${a.recordedByName}` : null].filter(Boolean).join(" · ")}
                        >
                            <span className="hms-allergy-chip__name">{a.allergen}</span>
                            {a.reaction && (
                                <span className="hms-allergy-chip__reaction">· {a.reaction}</span>
                            )}
                            <span className="hms-allergy-chip__sev">{a.severity}</span>
                            {!isDischarged && (
                                <button
                                    type="button"
                                    className="hms-allergy-chip__del"
                                    onClick={() => handleRemove(a.id)}
                                    aria-label="Remove allergy"
                                >
                                    <X size={9} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {adding && (
                <div className="hms-allergy-form">
                    <input
                        className="hms-allergy-form__input"
                        placeholder="Allergen (e.g. Penicillin)"
                        value={form.allergen}
                        onChange={(e) => setForm((f) => ({ ...f, allergen: e.target.value }))}
                    />
                    <input
                        className="hms-allergy-form__input"
                        placeholder="Reaction (optional)"
                        value={form.reaction}
                        onChange={(e) => setForm((f) => ({ ...f, reaction: e.target.value }))}
                    />
                    <select
                        className="hms-allergy-form__select"
                        value={form.severity}
                        onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                    >
                        <option value="UNKNOWN">Unknown severity</option>
                        <option value="MILD">Mild</option>
                        <option value="MODERATE">Moderate</option>
                        <option value="SEVERE">Severe</option>
                    </select>
                    <div className="hms-allergy-form__actions">
                        <button
                            type="button"
                            className="hms-allergy-form__save-btn"
                            onClick={handleAdd}
                            disabled={saving}
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                            type="button"
                            className="hms-allergy-form__cancel-btn"
                            onClick={() => { setAdding(false); setForm({ allergen: "", reaction: "", severity: "UNKNOWN" }); }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ───────────────── Record detail (inline in timeline) ───────────────── */

function RecordDetail({ ev }) {
    const type  = ev.historyType;
    const items = ev.prescriptionItems ?? [];

    if (type === "PRESCRIPTION") {
        if (items.length === 0) {
            return ev.description
                ? <p className="hms-ipd-timeline__desc">{ev.description}</p>
                : null;
        }
        const visible = items.slice(0, 4);
        const overflow = items.length - visible.length;
        return (
            <div className="hms-rec-drugs">
                {visible.map((d, i) => {
                    const signa = [d.dose, d.frequency].filter(Boolean).join(" · ");
                    const isStopped = d.status === "STOPPED";
                    const isDispensed = d.dispenseStatus === "DISPENSED";
                    const isPartial = d.dispenseStatus === "PARTIAL";
                    return (
                        <div key={i} className={`hms-rec-drug-chip${isStopped ? " is-stopped" : ""}`}>
                            <Pill size={10} className="hms-rec-drug-chip__icon" />
                            <span className="hms-rec-drug-chip__name">{d.drugName}</span>
                            {signa && <span className="hms-rec-drug-chip__signa">{signa}</span>}
                            {isDispensed && (
                                <span className="hms-rec-drug-chip__dispense-badge is-dispensed" title="Dispensed by pharmacy">
                                    <CheckCircle2 size={9} /> Dispensed
                                </span>
                            )}
                            {isPartial && (
                                <span className="hms-rec-drug-chip__dispense-badge is-partial" title={`${d.dispensedQty ?? 0} of ${d.quantity ?? "?"} dispensed`}>
                                    <CheckCircle2 size={9} /> Partial {d.dispensedQty != null && d.quantity != null ? `· ${d.dispensedQty}/${d.quantity}` : ""}
                                </span>
                            )}
                            {d.allergyOverrideReason && (
                                <span className="hms-rec-drug-chip__allergy-badge" title={`Prescribed despite recorded allergy — ${d.allergyOverrideReason}`}>
                                    <AlertTriangle size={9} /> Allergy override
                                </span>
                            )}
                            {isStopped && (
                                <span className="hms-rec-drug-chip__stopped-badge" title={d.stopReason || "Order stopped"}>
                                    <Ban size={9} /> Stopped
                                    {d.stoppedAt && ` · ${fmtDateMed(d.stoppedAt)}`}
                                </span>
                            )}
                        </div>
                    );
                })}
                {overflow > 0 && (
                    <span className="hms-rec-drugs__more">+{overflow} more</span>
                )}
                {ev.description && (
                    <p className="hms-ipd-timeline__desc">{ev.description}</p>
                )}
            </div>
        );
    }

    if (type === "PROGRESS_NOTE" &&
        (ev.soapSubjective || ev.soapObjective || ev.soapAssessment || ev.soapPlan)) {
        return (
            <div className="hms-soap-note">
                {ev.soapSubjective && (
                    <div className="hms-soap-note__section">
                        <span className="hms-soap-note__label">S</span>
                        <p className="hms-soap-note__text">{ev.soapSubjective}</p>
                    </div>
                )}
                {ev.soapObjective && (
                    <div className="hms-soap-note__section">
                        <span className="hms-soap-note__label">O</span>
                        <p className="hms-soap-note__text">{ev.soapObjective}</p>
                    </div>
                )}
                {ev.soapAssessment && (
                    <div className="hms-soap-note__section">
                        <span className="hms-soap-note__label">A</span>
                        <p className="hms-soap-note__text">{ev.soapAssessment}</p>
                    </div>
                )}
                {ev.soapPlan && (
                    <div className="hms-soap-note__section">
                        <span className="hms-soap-note__label">P</span>
                        <p className="hms-soap-note__text">{ev.soapPlan}</p>
                    </div>
                )}
                {ev.description && (
                    <p className="hms-ipd-timeline__desc">{ev.description}</p>
                )}
            </div>
        );
    }

    // All other record types — show description if present
    return ev.description
        ? <p className="hms-ipd-timeline__desc">{ev.description}</p>
        : null;
}

/* ───────────────── IPD Log tab ───────────────── */
function LogTab({
    loadingLogs,
    logs,
    showAddRecord,
    setShowAddRecord,
    setShowPrescriptionModal,
    setViewRecord,
    isDischarged,
}) {
    return (
        <div className="hms-ipd-tab-body">
            <div className="hms-ipd-log-head">
                <div className="hms-ipd-log-head__row">
                    <p className="hms-ipd-log-head__label">Timeline</p>
                    {!isDischarged && (
                        <div className="hms-ipd-log-head__actions">
                            <button
                                type="button"
                                onClick={() => setShowPrescriptionModal(true)}
                                className="hms-ipd-chip-btn is-success-solid"
                            >
                                <Pill size={11} /> Write prescription
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAddRecord(true)}
                                className="hms-ipd-chip-btn"
                                disabled={showAddRecord}
                            >
                                <Plus size={11} /> Add record
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {loadingLogs ? (
                <CenterLoader text="Loading timeline…" />
            ) : logs.length === 0 ? (
                <CenterEmpty icon={<Activity size={32} />} text="No log entries" />
            ) : (
                <div className="hms-ipd-timeline">
                    {logs.map((ev, idx) => {
                        const toneClass = EVENT_TONE_CLASS[ev.type] || "";
                        const isLast = idx === logs.length - 1;
                        return (
                            <div key={ev.id} className="hms-ipd-timeline__entry">
                                <div className="hms-ipd-timeline__rail">
                                    <div className="hms-ipd-timeline__dot" />
                                    {!isLast && <div className="hms-ipd-timeline__line" />}
                                </div>
                                <div className="hms-ipd-timeline__card">
                                    <div className="hms-ipd-timeline__head">
                                        <span className={`hms-ipd-event-tag ${toneClass}`}>
                                            {EVENT_LABEL[ev.type] || ev.type}
                                        </span>
                                        <div className="hms-ipd-timeline__stamp">
                                            <Clock size={11} />
                                            {fmt(ev.timestamp)}
                                        </div>
                                    </div>
                                    <p className="hms-ipd-timeline__title">{ev.title}</p>
                                    {ev.subtitle && (
                                        <p className="hms-ipd-timeline__sub">{ev.subtitle}</p>
                                    )}
                                    {ev.type === "RECORD" ? (
                                        <>
                                            <RecordDetail ev={ev} />
                                            <button
                                                type="button"
                                                className="hms-ipd-view-btn"
                                                onClick={() => setViewRecord(ev.rawRecord)}
                                            >
                                                View in detail
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {ev.description && (
                                                <p className="hms-ipd-timeline__desc">{ev.description}</p>
                                            )}
                                            {ev.badge && ev.badge !== ev.subtitle && (
                                                <p className="hms-ipd-timeline__badge">{ev.badge}</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ───────────────── Attender tab ───────────────── */
function AttenderTab({ admission }) {
    if (!admission.attenderName) {
        return (
            <CenterEmpty
                icon={<User size={32} />}
                text="No attendor on record"
                sub="Update via Room Allocation"
            />
        );
    }
    const rows = [
        { icon: User, label: "Name", value: admission.attenderName },
        admission.attenderPhone && {
            icon: Phone,
            label: "Phone",
            value: (
                <a href={`tel:${admission.attenderPhone}`}>
                    {admission.attenderPhone}
                </a>
            ),
        },
        admission.attenderRelationship && {
            icon: User,
            label: "Relationship",
            value: admission.attenderRelationship,
            capitalize: true,
        },
    ].filter(Boolean);

    return (
        <div className="hms-ipd-tab-body">
            <div className="hms-ipd-list">
                <div className="hms-ipd-list__head">
                    <p className="hms-ipd-list__head-label">Attendor on record</p>
                </div>
                {rows.map((r, idx) => (
                    <div key={idx} className="hms-ipd-list-row">
                        <div className="hms-ipd-list-row__icon">
                            <r.icon size={14} />
                        </div>
                        <div>
                            <p className="hms-ipd-list-row__label">{r.label}</p>
                            <p
                                className={
                                    "hms-ipd-list-row__value" +
                                    (r.capitalize ? " is-capitalize" : "")
                                }
                            >
                                {r.value}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ───────────────── Room mapped assets tab ───────────────── */
function AssetsTab({ loadingAssets, assets, hasRoom }) {
    if (loadingAssets) return <CenterLoader text="Loading assets…" />;
    if (!hasRoom) return <CenterEmpty icon={<Package size={32} />} text="No room assigned" />;
    if (assets.length === 0)
        return <CenterEmpty icon={<Package size={32} />} text="No assets mapped to this room" />;

    return (
        <div className="hms-ipd-tab-body">
            <div className="hms-ipd-list">
                {assets.map((asset) => {
                    const active =
                        asset.status === "AVAILABLE" || asset.status === "IN_USE";
                    return (
                        <div key={asset.id} className="hms-ipd-list-row is-asset">
                            <div className="hms-ipd-list-row__icon">
                                <Package size={14} />
                            </div>
                            <div className="hms-ipd-list-row__body">
                                <p className="hms-ipd-list-row__title">
                                    {asset.name || asset.assetName}
                                </p>
                                <p className="hms-ipd-list-row__sub">
                                    {asset.category || asset.assetCategory || "—"}
                                </p>
                            </div>
                            <Badge tone={active ? "success" : "warning"} soft>
                                {(asset.status || "—").replace(/_/g, " ")}
                            </Badge>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ───────────────── Billing tab ───────────────── */
function BillingTab({
    loadingBilling,
    finalInvoice,
    billingItems,
    otInvoices,
    pharmacyBills,
    otInvoicesError,
    pharmacyBillsError,
    retryOtInvoices,
    retryPharmacyBills,
    subtotal,
    gst,
    gstRatePercent,
    grandTotal,
    hasZeroPrice,
    isDischarged,
    refreshBilling,
}) {
    return (
        <div className="hms-ipd-tab-body is-col">
            {!loadingBilling && (
                <div className="hms-ipd-bill-refresh">
                    <button
                        type="button"
                        onClick={refreshBilling}
                        className="hms-ipd-chip-btn is-ghost"
                    >
                        <RotateCcw size={11} /> Refresh
                    </button>
                </div>
            )}

            {loadingBilling ? (
                <CenterLoader text="Loading billing…" />
            ) : finalInvoice ? (
                <FinalInvoiceView
                    finalInvoice={finalInvoice}
                    otInvoices={otInvoices}
                    pharmacyBills={pharmacyBills}
                />
            ) : billingItems.length === 0 ? (
                <CenterEmpty
                    icon={<Receipt size={32} />}
                    text="No charges detected"
                    sub="Charges appear once services are recorded"
                />
            ) : (
                <EstimatedBillView
                    billingItems={billingItems}
                    subtotal={subtotal}
                    gst={gst}
                    grandTotal={grandTotal}
                    hasZeroPrice={hasZeroPrice}
                    isDischarged={isDischarged}
                />
            )}

            {otInvoicesError && (
                <RetryRow
                    text="Could not load OT charges"
                    onRetry={retryOtInvoices}
                    toneClass="is-violet"
                />
            )}
            {pharmacyBillsError && (
                <RetryRow
                    text="Could not load pharmacy bills"
                    onRetry={retryPharmacyBills}
                    toneClass="is-success"
                />
            )}
        </div>
    );
}

function RetryRow({ text, onRetry, toneClass }) {
    return (
        <div className="hms-ipd-retry-row">
            <div className="hms-ipd-retry-row__body">
                <AlertTriangle size={14} className="hms-ipd-retry-row__icon" />
                <p className="hms-ipd-retry-row__text">{text}</p>
            </div>
            <button
                type="button"
                onClick={onRetry}
                className={`hms-ipd-retry-row__btn ${toneClass}`}
            >
                <RotateCcw size={11} /> Retry
            </button>
        </div>
    );
}

function BillingItemRow({ meta, description, quantity, total }) {
    return (
        <div className="hms-ipd-bill-row">
            <div>
                <span className={`hms-ipd-bill-row__type ${meta.cls}`}>
                    <meta.Icon size={11} /> {meta.label}
                </span>
            </div>
            <div className="hms-ipd-bill-row__desc" title={description}>
                {description}
            </div>
            <div className="hms-ipd-bill-row__qty">{quantity}</div>
            <div className="hms-ipd-bill-row__total">{fmtMoney(total)}</div>
        </div>
    );
}

function BillingHeaderRow() {
    return (
        <div className="hms-ipd-bill-head">
            <div className="hms-ipd-bill-head__cell">Type</div>
            <div className="hms-ipd-bill-head__cell">Description</div>
            <div className="hms-ipd-bill-head__cell is-center">Qty</div>
            <div className="hms-ipd-bill-head__cell is-right">Total</div>
        </div>
    );
}

function FinalInvoiceView({ finalInvoice, otInvoices, pharmacyBills }) {
    const settled =
        finalInvoice.status === "PAID" || finalInvoice.status === "SETTLED";
    return (
        <>
            <div className="hms-ipd-bill-fi-head">
                <div>
                    <p className="hms-ipd-bill-fi-head__label">Final invoice</p>
                    <p className="hms-ipd-bill-fi-head__sub">
                        {fmtId(finalInvoice.invoiceNumber)} · {fmtDate(finalInvoice.createdAt)}
                    </p>
                </div>
                <Badge tone={settled ? "success" : "warning"} soft>
                    {settled ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}{" "}
                    {settled ? "SETTLED" : "UNSETTLED"}
                </Badge>
            </div>

            <div className="hms-ipd-bill-section">
                <BillingHeaderRow />

                {(finalInvoice.items || []).map((item, i) => {
                    const meta = BILL_TYPE_META[item.itemType] ?? BILL_TYPE_META.CUSTOM;
                    return (
                        <BillingItemRow
                            key={i}
                            meta={meta}
                            description={item.description}
                            quantity={item.quantity}
                            total={item.totalPrice}
                        />
                    );
                })}

                {otInvoices.length > 0 &&
                    otInvoices.flatMap((inv) =>
                        (Array.isArray(inv.items) ? inv.items : []).map((item, i) => (
                            <BillingItemRow
                                key={`ot-${inv.id}-${i}`}
                                meta={BILL_TYPE_META.OT}
                                description={item.description || item.name || "—"}
                                quantity={item.quantity ?? 1}
                                total={item.totalPrice ?? item.amount ?? 0}
                            />
                        ))
                    )}

                {pharmacyBills.length > 0 &&
                    pharmacyBills.flatMap((bill) => {
                        const lines = Array.isArray(bill.items) ? bill.items : [];
                        const preGstSum = lines.reduce((s, l) => {
                            const q = Number(l.quantity ?? 1) || 1;
                            const u = Number(l.unitPrice ?? 0) || 0;
                            return s + (Number(l.totalPrice ?? u * q) || 0);
                        }, 0);
                        const billTotal = Number(bill.totalAmount ?? 0) || 0;
                        const factor = preGstSum > 0 ? billTotal / preGstSum : 1;
                        return lines.map((line, i) => {
                            const q = Number(line.quantity ?? 1) || 1;
                            const u = Number(line.unitPrice ?? 0) || 0;
                            const preGst = Number(line.totalPrice ?? u * q) || 0;
                            const inclusive = preGst * factor;
                            return (
                                <BillingItemRow
                                    key={`rx-${bill.id}-${i}`}
                                    meta={BILL_TYPE_META.MEDICINE}
                                    description={`${line.drugName || "Medicine"}${bill.billNumber ? ` · ${bill.billNumber}` : ""
                                        }`}
                                    quantity={q}
                                    total={inclusive}
                                />
                            );
                        });
                    })}

                <FinalInvoiceTotals
                    finalInvoice={finalInvoice}
                    otInvoices={otInvoices}
                    pharmacyBills={pharmacyBills}
                />
            </div>
        </>
    );
}

function FinalInvoiceTotals({ finalInvoice, otInvoices, pharmacyBills }) {
    const otSum = otInvoices.reduce(
        (s, inv) => s + Number(inv.totalAmount ?? inv.total ?? 0),
        0
    );
    const rxSum = pharmacyBills.reduce(
        (s, b) => s + Number(b.totalAmount ?? 0),
        0
    );
    return (
        <div className="hms-ipd-bill-totals">
            <TotalRow label="Admission subtotal" value={fmtMoney(finalInvoice.subtotal)} />
            {Number(finalInvoice.tax) > 0 && (
                <TotalRow label="Tax" value={fmtMoney(finalInvoice.tax)} />
            )}
            {Number(finalInvoice.discount) > 0 && (
                <TotalRow
                    label="Discount"
                    value={`−${fmtMoney(finalInvoice.discount)}`}
                    isSuccess
                />
            )}
            {otInvoices.length > 0 && (
                <TotalRow label="OT charges" value={fmtMoney(otSum)} />
            )}
            {pharmacyBills.length > 0 && (
                <TotalRow label="Pharmacy charges" value={fmtMoney(rxSum)} />
            )}
            <div className="hms-ipd-bill-totals__grand">
                <span>Grand total</span>
                <span>
                    {fmtMoney(Number(finalInvoice.total || 0) + otSum + rxSum)}
                </span>
            </div>
        </div>
    );
}

function TotalRow({ label, value, isSuccess }) {
    return (
        <div className={"hms-ipd-bill-totals__row" + (isSuccess ? " is-success" : "")}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}

function EstimatedBillView({
    billingItems,
    subtotal,
    gst,
    gstRatePercent,
    grandTotal,
    hasZeroPrice,
    isDischarged,
}) {
    return (
        <>
            <div>
                <p className="hms-ipd-bill-est-head__title">
                    {isDischarged ? "Admission summary" : "Pending charges"}
                </p>
                <p className="hms-ipd-bill-est-head__sub">
                    {isDischarged
                        ? "Estimated charges for this admission — no invoice generated yet"
                        : "Auto-detected from services used during this admission"}
                </p>
            </div>

            <div className="hms-ipd-bill-section">
                <BillingHeaderRow />
                {billingItems.map((item) => {
                    const meta = BILL_TYPE_META[item.itemType] ?? BILL_TYPE_META.CUSTOM;
                    return (
                        <BillingItemRow
                            key={item.key}
                            meta={meta}
                            description={item.description}
                            quantity={item.quantity}
                            total={item.totalPrice}
                        />
                    );
                })}
                <div className="hms-ipd-bill-totals">
                    <TotalRow label="Subtotal" value={fmtMoney(subtotal)} />
                    {gst > 0 && (
                        <TotalRow
                            label={`GST on medicines (${gstRatePercent}%)`}
                            value={fmtMoney(gst)}
                        />
                    )}
                    <div className="hms-ipd-bill-totals__grand">
                        <span>Estimated total</span>
                        <span>{fmtMoney(grandTotal)}</span>
                    </div>
                </div>
            </div>

            {hasZeroPrice && (
                <Alert tone="warning" icon={<AlertTriangle size={14} />}>
                    Some items show ₹0 — add them in Settings → Packages.
                </Alert>
            )}

            <p className="hms-ipd-bill-est-foot">
                Estimated bill based on services used so far. Final amount may vary.
            </p>
        </>
    );
}

/* ───────────────── Shared empty / loader ───────────────── */


function CenterEmpty({ icon, text, sub }) {
    return (
        <div className="hms-ipd-center-empty">
            <div className="hms-ipd-center-empty__icon">{icon}</div>
            <p className="hms-ipd-center-empty__text">{text}</p>
            {sub && <p className="hms-ipd-center-empty__sub">{sub}</p>}
        </div>
    );
}

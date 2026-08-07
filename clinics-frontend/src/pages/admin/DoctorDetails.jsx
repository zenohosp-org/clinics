import { Spinner, CenterLoader } from "@/components/ui/Loader";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { appointmentsApi, doctorsApi } from "@/utils/api";
import { useNotification } from "@/context/NotificationContext";
import { useAuth } from "@/context/AuthContext";
import DoctorFormModal from "@/components/modals/DoctorFormModal";
import { ChevronLeft, Mail, Phone, BookOpen, Stethoscope, User, CheckCircle, Edit2, Calendar, Clock, Banknote, Building2, CalendarIcon, AlertCircle, Users, Save, CalendarDays,  } from "lucide-react";
import {
    Badge,
    Button,
    Card,
    Input,
    Tabs,
} from "@/components/ui";

const DAYS = [
    { label: "Monday",    short: "MON", bit: 1,  idx: 0 },
    { label: "Tuesday",   short: "TUE", bit: 2,  idx: 1 },
    { label: "Wednesday", short: "WED", bit: 4,  idx: 2 },
    { label: "Thursday",  short: "THU", bit: 8,  idx: 3 },
    { label: "Friday",    short: "FRI", bit: 16, idx: 4 },
    { label: "Saturday",  short: "SAT", bit: 32, idx: 5 },
    { label: "Sunday",    short: "SUN", bit: 64, idx: 6 },
];

/** Status → Badge tone — also used for the .hms-appt-card__stripe
 *  modifier (is-success / is-danger / is-warning / is-info). */
const STATUS_TONE = {
    COMPLETED: "success",
    CANCELLED: "danger",
    NO_SHOW: "danger",
    EXPIRED: "danger",
    IN_PROGRESS: "warning",
};
const statusTone = (s) => STATUS_TONE[s] || "info";

const getDisplayStatus = (appt) => {
    if (appt.status === "SCHEDULED") {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localNow = new Date(now.getTime() - offset * 60 * 1000);
        const todayStr = localNow.toISOString().split("T")[0];
        const timeStr = localNow.toISOString().split("T")[1].substring(0, 5);
        if (appt.apptDate < todayStr || (appt.apptDate === todayStr && appt.apptTime < timeStr)) {
            return "EXPIRED";
        }
    }
    return appt.status;
};

/** Sidebar key/value row with leading icon. */
function SideInfoRow({ icon: Icon, label, value }) {
    return (
        <div className="hms-side-info">
            <div className="hms-side-info__icon">
                <Icon size={14} />
            </div>
            <div>
                <p className="hms-side-info__label">{label}</p>
                <p className="hms-side-info__value">{value || "—"}</p>
            </div>
        </div>
    );
}

function SectionHead({ icon: Icon, title }) {
    return (
        <div className="hms-side-section__head">
            <Icon size={14} className="text-gray-500" />
            <h3 className="hms-side-section__title">{title}</h3>
        </div>
    );
}

/**
 * Doctor profile + schedule editor.
 *
 * Split-pane page (sidebar + tabbed main area). Data layer unchanged —
 * three API surfaces still drive the page (doctorsApi.get,
 * appointmentsApi.getByHospital, doctorsApi.getAvailability /
 * saveAvailability), and the RBAC check (canEdit = hospital_admin OR
 * own user id) is preserved byte-for-byte. Layout pieces live in
 * admin.css under .hms-detail-* (page shell, aside, content) and
 * .hms-doctor-* / .hms-fee-* / .hms-schedule-* / .hms-appt-card*.
 */
function DoctorDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { notify } = useNotification();
    const { user } = useAuth();

    const [doctor, setDoctor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [tab, setTab] = useState("overview");

    const [doctorAppointments, setDoctorAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);

    const [scheduleSlots, setScheduleSlots] = useState({});
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleSaving, setScheduleSaving] = useState(false);

    const doctorPatients = useMemo(() => {
        const pMap = new Map();
        doctorAppointments.forEach((appt) => {
            if (!pMap.has(appt.patientId)) {
                pMap.set(appt.patientId, {
                    id: appt.patientId,
                    name: appt.patientName,
                    visits: 1,
                    lastVisit: appt.apptDate.substring(0, 10),
                });
            } else {
                const existing = pMap.get(appt.patientId);
                existing.visits += 1;
                if (appt.apptDate > existing.lastVisit)
                    existing.lastVisit = appt.apptDate.substring(0, 10);
                pMap.set(appt.patientId, existing);
            }
        });
        return Array.from(pMap.values()).sort((a, b) =>
            b.lastVisit.localeCompare(a.lastVisit)
        );
    }, [doctorAppointments]);

    const nextAppointment = useMemo(() => {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const localNow = new Date(now.getTime() - offset * 60 * 1000);
        const todayStr = localNow.toISOString().split("T")[0];
        const timeStr = localNow.toISOString().split("T")[1].substring(0, 5);
        return (
            doctorAppointments
                .filter((a) => {
                    if (!["SCHEDULED", "CONFIRMED"].includes(a.status)) return false;
                    if (a.apptDate < todayStr) return false;
                    if (a.apptDate === todayStr && a.apptTime < timeStr) return false;
                    return true;
                })
                .sort((a, b) => {
                    const d = a.apptDate.localeCompare(b.apptDate);
                    return d !== 0 ? d : a.apptTime.localeCompare(b.apptTime);
                })[0] ?? null
        );
    }, [doctorAppointments]);

    const completedCount = doctorAppointments.filter(
        (a) => a.status === "COMPLETED"
    ).length;
    const scheduledCount = doctorAppointments.filter((a) =>
        ["SCHEDULED", "CONFIRMED"].includes(a.status)
    ).length;

    const loadData = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const docData = await doctorsApi.get(id);
            setDoctor(docData);
            setLoadingAppointments(true);
            try {
                const appts = await appointmentsApi.getByHospital(docData.hospitalId);
                const docAppts = appts.filter((a) => a.doctorId === docData.id);
                docAppts.sort(
                    (a, b) =>
                        new Date(`${b.apptDate}T${b.apptTime}`).getTime() -
                        new Date(`${a.apptDate}T${a.apptTime}`).getTime()
                );
                setDoctorAppointments(docAppts);
            } catch {
                // appointments optional
            } finally {
                setLoadingAppointments(false);
            }
        } catch {
            notify("Failed to load doctor details", "error");
        } finally {
            setLoading(false);
        }
    };

    const loadAvailability = useCallback(
        async (doc) => {
            if (!doc) return;
            setScheduleLoading(true);
            try {
                const slots = await doctorsApi.getAvailability(doc.id);
                const map = {};
                slots.forEach((s) => {
                    map[s.dayOfWeek] = { ...s };
                });
                DAYS.forEach(({ bit, idx }) => {
                    if ((doc.availableDaysMask ?? 0) & bit) {
                        if (!map[idx]) {
                            map[idx] = {
                                dayOfWeek: idx,
                                startTime: "09:00",
                                endTime: "17:00",
                                slotDurationMins: doc.slotDurationMin || 15,
                                maxDailySlots: doc.maxDailySlots || 40,
                                isActive: true,
                            };
                        }
                    }
                });
                setScheduleSlots(map);
            } catch {
                notify("Failed to load schedule", "error");
            } finally {
                setScheduleLoading(false);
            }
        },
        [notify]
    );

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        if (tab === "schedule" && doctor) loadAvailability(doctor);
    }, [tab, doctor, loadAvailability]);

    const updateSlot = (dayIdx, field, value) => {
        setScheduleSlots((prev) => ({
            ...prev,
            [dayIdx]: { ...prev[dayIdx], [field]: value },
        }));
    };

    const saveSchedule = async () => {
        setScheduleSaving(true);
        try {
            const activeDays = Object.values(scheduleSlots).filter(
                (s) => s.startTime && s.endTime
            );
            await Promise.all(
                activeDays.map((s) =>
                    doctorsApi.saveAvailability(doctor.id, {
                        dayOfWeek: s.dayOfWeek,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        slotDurationMins: s.slotDurationMins,
                        maxDailySlots: s.maxDailySlots,
                        isActive: s.isActive !== false,
                    })
                )
            );
            notify("Schedule saved successfully", "success");
            await loadAvailability(doctor);
        } catch {
            notify("Failed to save schedule", "error");
        } finally {
            setScheduleSaving(false);
        }
    };

    if (loading) {
        return (
            <CenterLoader />
        );
    }
    if (!doctor) {
        return (
            <div className="hms-detail-notfound">
                <AlertCircle size={40} className="text-gray-300" />
                <p className="text-gray-500">Doctor not found.</p>
                <Button variant="secondary" onClick={() => navigate(-1)}>
                    Go back
                </Button>
            </div>
        );
    }

    const canEdit =
        user?.role === "hospital_admin" || user?.userId === doctor.userId;
    const initials = `${doctor.firstName[0]}${doctor.lastName?.[0] ?? ""}`.toUpperCase();

    const TAB_DEFS = [
        { id: "overview", label: "Overview" },
        {
            id: "appointments",
            label: "Appointments",
            count: loadingAppointments ? undefined : doctorAppointments.length,
        },
        {
            id: "patients",
            label: "Patients",
            count: loadingAppointments ? undefined : doctorPatients.length,
        },
        { id: "schedule", label: "Schedule" },
    ];

    return (
        <div className="hms-detail-page">
            {/* LEFT PANE */}
            <aside className="hms-detail-page__aside">
                <div className="hms-detail-aside__topbar">
                    <button
                        type="button"
                        onClick={() => navigate("/doctors")}
                        className="hms-detail-aside__back"
                    >
                        <ChevronLeft size={14} /> Back to doctors
                    </button>
                    {canEdit && (
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="zu-btn-icon"
                            aria-label="Edit doctor"
                        >
                            <Edit2 size={14} />
                        </button>
                    )}
                </div>

                <div className="hms-detail-aside__hero">
                    <span className="hms-avatar is-2xl is-info hms-detail-aside__hero-avatar">
                        {initials}
                    </span>
                    <h2 className="hms-detail-aside__name">
                        Dr. {doctor.firstName} {doctor.lastName}
                    </h2>
                    <p className="hms-detail-aside__subtitle">
                        {doctor.specialization || "General practitioner"}
                    </p>
                    <div className="mt-3">
                        <Badge tone={doctor.userIsActive ? "success" : "danger"} soft>
                            {doctor.userIsActive && (
                                <span className="hms-status-dot is-success" />
                            )}
                            {doctor.userIsActive ? "Active" : "Inactive"}
                        </Badge>
                    </div>
                    {doctor.medicalRegistrationNumber && (
                        <p className="hms-detail-aside__reg">
                            {doctor.medicalRegistrationNumber}
                        </p>
                    )}
                </div>

                <div className="hms-detail-aside__sections">
                    <div>
                        <SectionHead icon={User} title="Contact info" />
                        <div className="hms-side-section__list">
                            <SideInfoRow icon={Mail} label="Email" value={doctor.email} />
                            <SideInfoRow icon={Phone} label="Phone" value={doctor.phone} />
                            <SideInfoRow
                                icon={BookOpen}
                                label="Qualification"
                                value={doctor.qualification}
                            />
                        </div>
                    </div>
                    <div>
                        <SectionHead icon={Stethoscope} title="Practice info" />
                        <div className="hms-side-section__list">
                            <SideInfoRow
                                icon={Banknote}
                                label="Consultation fee"
                                value={
                                    doctor.consultationFee != null
                                        ? `₹${doctor.consultationFee.toFixed(2)}`
                                        : null
                                }
                            />
                            <SideInfoRow
                                icon={Clock}
                                label="Slot duration"
                                value={
                                    doctor.slotDurationMin
                                        ? `${doctor.slotDurationMin} mins`
                                        : null
                                }
                            />
                            <SideInfoRow
                                icon={Calendar}
                                label="Max daily slots"
                                value={
                                    doctor.maxDailySlots != null
                                        ? String(doctor.maxDailySlots)
                                        : null
                                }
                            />
                        </div>
                    </div>
                </div>
            </aside>

            {/* RIGHT PANE */}
            <div className="hms-detail-page__main">
                <div className="hms-detail-tabs">
                    <Tabs
                        type="underline"
                        active={tab}
                        onChange={setTab}
                        tabs={TAB_DEFS}
                    />
                </div>

                <div className="hms-detail-content">
                    {tab === "overview" && (
                        <OverviewTab
                            doctor={doctor}
                            loadingAppointments={loadingAppointments}
                            nextAppointment={nextAppointment}
                            completedCount={completedCount}
                            scheduledCount={scheduledCount}
                            doctorPatients={doctorPatients}
                            setTab={setTab}
                        />
                    )}
                    {tab === "appointments" && (
                        <AppointmentsTab
                            doctor={doctor}
                            loading={loadingAppointments}
                            appointments={doctorAppointments}
                        />
                    )}
                    {tab === "patients" && (
                        <PatientsTab
                            loading={loadingAppointments}
                            patients={doctorPatients}
                            navigate={navigate}
                        />
                    )}
                    {tab === "schedule" && (
                        <ScheduleTab
                            doctor={doctor}
                            canEdit={canEdit}
                            scheduleSlots={scheduleSlots}
                            scheduleLoading={scheduleLoading}
                            scheduleSaving={scheduleSaving}
                            updateSlot={updateSlot}
                            saveSchedule={saveSchedule}
                            openEdit={() => setEditing(true)}
                        />
                    )}
                </div>
            </div>

            {editing && (
                <DoctorFormModal
                    editDoctor={doctor}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        loadData();
                    }}
                />
            )}
        </div>
    );
}

/* ─────────────────────────── OVERVIEW TAB ─────────────────────────── */
function OverviewTab({
    doctor,
    loadingAppointments,
    nextAppointment,
    completedCount,
    scheduledCount,
    doctorPatients,
    setTab,
}) {
    return (
        <div className="flex flex-col gap-5 max-w-5xl">
            {/* 3 stat cards */}
            <div className="hms-doctor-stats">
                <Card>
                    <div className="hms-doctor-stat__head">
                        <Calendar size={14} /> Next appointment
                    </div>
                    {loadingAppointments ? (
                        <p className="m-0 text-13 text-gray-500">Loading…</p>
                    ) : nextAppointment ? (
                        <>
                            <p className="zu-stat-card-value">
                                {nextAppointment.apptDate.substring(0, 10)},{" "}
                                {nextAppointment.apptTime.substring(0, 5)}
                            </p>
                            <p className="zu-stat-card-sub font-semibold">
                                {nextAppointment.type}
                            </p>
                            <p className="zu-stat-card-sub mt-0.5">
                                {nextAppointment.patientName}
                            </p>
                        </>
                    ) : (
                        <p className="m-0 text-13 text-gray-500">No upcoming appointment</p>
                    )}
                </Card>
                <Card>
                    <div className="hms-doctor-stat__head">
                        <CheckCircle size={14} /> Completed
                    </div>
                    <p className="zu-stat-card-value">
                        {loadingAppointments ? "…" : completedCount} appointments
                    </p>
                    {!loadingAppointments && scheduledCount > 0 && (
                        <p className="zu-stat-card-sub">
                            {scheduledCount} upcoming scheduled
                        </p>
                    )}
                    {!loadingAppointments && completedCount === 0 && (
                        <p className="zu-stat-card-sub">None yet</p>
                    )}
                </Card>
                <Card>
                    <div className="hms-doctor-stat__head">
                        <Users size={14} /> Patients
                    </div>
                    <p className="zu-stat-card-value">
                        {loadingAppointments ? "…" : doctorPatients.length} unique patients
                    </p>
                    {!loadingAppointments && doctorPatients.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setTab("patients")}
                            className="hms-link-btn is-info"
                        >
                            View all →
                        </button>
                    )}
                    {!loadingAppointments && doctorPatients.length === 0 && (
                        <p className="zu-stat-card-sub">None yet</p>
                    )}
                </Card>
            </div>

            {/* Billing & Schedule */}
            <Card className="hms-detail-section">
                <div className="hms-detail-section__head">
                    <span className="hms-detail-section__icon is-success">
                        <Banknote size={14} />
                    </span>
                    <h3 className="hms-detail-section__title">Billing & schedule</h3>
                </div>
                <div className="hms-detail-section__body">
                    <div className="hms-fee-grid">
                        <FeeTile
                            label="Consultation fee"
                            value={`₹${doctor.consultationFee?.toFixed(2) || "0.00"}`}
                            tone="success"
                        />
                        <FeeTile
                            label="Follow-up fee"
                            value={`₹${doctor.followUpFee?.toFixed(2) || "0.00"}`}
                            tone="success"
                        />
                        <FeeTile
                            label="Slot duration"
                            value={`${doctor.slotDurationMin || 0} mins`}
                            icon={<Clock size={14} />}
                        />
                        <FeeTile
                            label="Max daily slots"
                            value={String(doctor.maxDailySlots || 0)}
                        />
                    </div>
                    <div>
                        <p className="hms-available-label">Available days</p>
                        <div className="flex flex-wrap gap-1.5">
                            {DAYS.map(({ short, bit }) => {
                                const isOn = !!((doctor.availableDaysMask ?? 0) & bit);
                                return (
                                    <div key={bit} className={`hms-day-chip ${isOn ? "is-on" : ""}`}>
                                        {isOn && <CheckCircle size={12} />}
                                        {short}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Medical Registration */}
            <Card className="hms-detail-section">
                <div className="hms-detail-section__head">
                    <span className="hms-detail-section__icon is-info">
                        <Stethoscope size={14} />
                    </span>
                    <h3 className="hms-detail-section__title">Medical registration</h3>
                </div>
                <div className="hms-detail-section__body is-2col">
                    <KV
                        label="Registration number"
                        value={doctor.medicalRegistrationNumber || "Not specified"}
                    />
                    <KV
                        label="Registration council"
                        value={doctor.registrationCouncil || "Not specified"}
                    />
                </div>
            </Card>
        </div>
    );
}

function FeeTile({ label, value, tone, icon }) {
    const isAccent = tone === "success";
    return (
        <div className={`hms-fee-tile ${isAccent ? "is-accent" : ""}`}>
            <p className="hms-fee-tile__label">{label}</p>
            <div className="hms-fee-tile__row">
                {icon && <span>{icon}</span>}
                <p className="hms-fee-tile__value">{value}</p>
            </div>
        </div>
    );
}

function KV({ label, value }) {
    return (
        <div>
            <p className="hms-kv__label">{label}</p>
            <p className="hms-kv__value">{value}</p>
        </div>
    );
}

/* ─────────────────────────── APPOINTMENTS TAB ─────────────────────────── */
function AppointmentsTab({ doctor, loading, appointments }) {
    return (
        <div className="max-w-5xl">
            <div className="hms-tab-head">
                <h3 className="hms-tab-head__title">Appointments</h3>
                <p className="hms-tab-head__sub">
                    {appointments.length} appointment{appointments.length !== 1 ? "s" : ""} for Dr.{" "}
                    {doctor.firstName}
                </p>
            </div>
            {loading ? (
                <div className="flex justify-center py-16">
                    <Spinner size={28} className="text-info zu-spinner" />
                </div>
            ) : appointments.length === 0 ? (
                <CenterEmpty
                    icon={<CalendarIcon size={36} />}
                    title="No appointments"
                    description="This doctor has no recorded appointments yet."
                />
            ) : (
                <div className="hms-detail-card-grid">
                    {appointments.slice(0, 50).map((appt) => {
                        const dispStatus = getDisplayStatus(appt);
                        const tone = statusTone(dispStatus);
                        return (
                            <Card key={appt.id} className="hms-appt-card">
                                <span className={`hms-appt-card__stripe is-${tone}`} />
                                <div className="hms-appt-card__head">
                                    <div>
                                        <p className="hms-appt-card__date">
                                            {appt.apptDate.substring(0, 10)}
                                        </p>
                                        <p className="hms-appt-card__time">
                                            <Clock size={14} /> {appt.apptTime.substring(0, 5)}
                                        </p>
                                    </div>
                                    <Badge tone={tone} soft>
                                        {dispStatus.replace(/_/g, " ")}
                                    </Badge>
                                </div>
                                <div className="hms-appt-card__patient">
                                    <div>
                                        <p className="hms-appt-card__name">{appt.patientName}</p>
                                        <p className="hms-appt-card__type">{appt.type}</p>
                                    </div>
                                </div>
                                {appt.chiefComplaint && (
                                    <div className="hms-appt-reason">
                                        <p className="hms-appt-reason__label">Reason for visit</p>
                                        <p className="hms-appt-reason__quote">
                                            "{appt.chiefComplaint}"
                                        </p>
                                    </div>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────── PATIENTS TAB ─────────────────────────── */
function PatientsTab({ loading, patients, navigate }) {
    return (
        <div className="max-w-5xl">
            <div className="hms-tab-head">
                <h3 className="hms-tab-head__title">Associated patients</h3>
                <p className="hms-tab-head__sub">
                    {patients.length} patient{patients.length !== 1 ? "s" : ""} have visited
                </p>
            </div>
            {loading ? (
                <div className="flex justify-center py-16">
                    <Spinner size={28} className="zu-spinner" />
                </div>
            ) : patients.length === 0 ? (
                <CenterEmpty
                    icon={<Building2 size={36} />}
                    title="No patients found"
                    description="There are no patients associated with this doctor yet."
                />
            ) : (
                <div className="hms-detail-card-grid">
                    {patients.slice(0, 50).map((patient, idx) => (
                        <Card
                            key={idx}
                            interactive
                            onClick={() => navigate(`/patients/${patient.id}`)}
                            className="hms-patient-card"
                        >
                            <div className="min-w-0">
                                <p className="hms-patient-card__name">{patient.name}</p>
                                <p className="hms-patient-card__sub">
                                    Visits: {patient.visits} · Last: {patient.lastVisit}
                                </p>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────── SCHEDULE TAB ─────────────────────────── */
function ScheduleTab({
    doctor,
    canEdit,
    scheduleSlots,
    scheduleLoading,
    scheduleSaving,
    updateSlot,
    saveSchedule,
    openEdit,
}) {
    return (
        <div className="max-w-3xl">
            <div className="hms-schedule-head">
                <div>
                    <h3 className="hms-tab-head__title">Availability schedule</h3>
                    <p className="hms-tab-head__sub">
                        Configure working hours and slot settings for each day.
                    </p>
                </div>
                {canEdit && (
                    <Button
                        variant="primary"
                        onClick={saveSchedule}
                        disabled={scheduleSaving || scheduleLoading}
                        loading={scheduleSaving}
                    >
                        <Save size={14} /> Save schedule
                    </Button>
                )}
            </div>

            {scheduleLoading ? (
                <div className="flex justify-center py-16">
                    <Spinner size={28} className="text-info zu-spinner" />
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {DAYS.map(({ label, bit, idx }) => {
                        const isEnabled = !!((doctor.availableDaysMask ?? 0) & bit);
                        const slot = scheduleSlots[idx];
                        return (
                            <div
                                key={idx}
                                className={`hms-schedule-day ${isEnabled ? "is-on" : "is-off"}`}
                            >
                                <div className="hms-schedule-day__row">
                                    <div className="hms-schedule-day__name-col">
                                        <div className="hms-schedule-day__name-row">
                                            <span className="hms-schedule-day__dot" />
                                            <span className="hms-schedule-day__name">{label}</span>
                                        </div>
                                        {!isEnabled && (
                                            <p className="hms-schedule-day__off">Not available</p>
                                        )}
                                    </div>

                                    {isEnabled && slot ? (
                                        <div className="hms-schedule-day__inputs">
                                            <SlotField
                                                label="Start time"
                                                control={
                                                    <Input
                                                        type="time"
                                                        value={slot.startTime || "09:00"}
                                                        onChange={(e) =>
                                                            updateSlot(idx, "startTime", e.target.value)
                                                        }
                                                        disabled={!canEdit}
                                                    />
                                                }
                                            />
                                            <SlotField
                                                label="End time"
                                                control={
                                                    <Input
                                                        type="time"
                                                        value={slot.endTime || "17:00"}
                                                        onChange={(e) =>
                                                            updateSlot(idx, "endTime", e.target.value)
                                                        }
                                                        disabled={!canEdit}
                                                    />
                                                }
                                            />
                                            <SlotField
                                                label="Slot (min)"
                                                control={
                                                    <Input
                                                        type="number"
                                                        min="5"
                                                        step="5"
                                                        value={slot.slotDurationMins || ""}
                                                        onChange={(e) =>
                                                            updateSlot(
                                                                idx,
                                                                "slotDurationMins",
                                                                parseInt(e.target.value) || 0
                                                            )
                                                        }
                                                        disabled={!canEdit}
                                                    />
                                                }
                                            />
                                            <SlotField
                                                label="Max slots"
                                                control={
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={slot.maxDailySlots || ""}
                                                        onChange={(e) =>
                                                            updateSlot(
                                                                idx,
                                                                "maxDailySlots",
                                                                parseInt(e.target.value) || 0
                                                            )
                                                        }
                                                        disabled={!canEdit}
                                                    />
                                                }
                                            />
                                        </div>
                                    ) : isEnabled ? (
                                        <p className="hms-schedule-day__hint">Loading…</p>
                                    ) : (
                                        <p className="hms-schedule-day__hint">
                                            Enable this day from{" "}
                                            <button
                                                type="button"
                                                onClick={openEdit}
                                                className="hms-link-btn"
                                            >
                                                Edit doctor
                                            </button>
                                        </p>
                                    )}
                                </div>

                                {isEnabled && slot?.startTime && slot?.endTime && slot?.slotDurationMins > 0 && (
                                    <SchedulePreview slot={slot} />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {!scheduleLoading && Object.keys(scheduleSlots).length === 0 && (
                <CenterEmpty
                    icon={<Clock size={36} />}
                    title="No days enabled"
                    description={
                        <>
                            Use{" "}
                            <button
                                type="button"
                                onClick={openEdit}
                                className="hms-link-btn"
                            >
                                Edit doctor
                            </button>{" "}
                            to enable available days first.
                        </>
                    }
                />
            )}
        </div>
    );
}

function SlotField({ label, control }) {
    return (
        <div>
            <p className="hms-slot-field__label">{label}</p>
            {control}
        </div>
    );
}

function SchedulePreview({ slot }) {
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const totalMins = eh * 60 + em - (sh * 60 + sm);
    let summary;
    if (totalMins <= 0) {
        summary = "Invalid time range";
    } else {
        const possible = Math.floor(totalMins / slot.slotDurationMins);
        const actual = Math.min(possible, slot.maxDailySlots || possible);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        summary = `${hrs > 0 ? `${hrs}h ` : ""}${mins > 0 ? `${mins}m` : ""} window · ${possible} possible slots · ${actual} capped`;
    }
    return (
        <div className="hms-schedule-bar">
            <div className="hms-schedule-bar__inner">
                <CalendarDays size={14} className="shrink-0" />
                <span>{summary}</span>
            </div>
        </div>
    );
}

function CenterEmpty({ icon, title, description }) {
    return (
        <div className="hms-center-empty">
            <div className="hms-center-empty__icon">{icon}</div>
            <p className="hms-center-empty__title">{title}</p>
            <p className="hms-center-empty__desc">{description}</p>
        </div>
    );
}

export { DoctorDetails as default };

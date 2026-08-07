import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { staffApi, doctorsApi, directoryApi, peopleApi } from "@/utils/api";
import StaffFormModal from "@/components/modals/StaffFormModal";
import {
    UserPlus,
    Mail,
    Phone,
    Calendar,
    Users,
    Stethoscope,
    ShieldCheck,
    User,
    MoreVertical,
    Pencil,
    XCircle,
    CheckCircle,
    LogIn,
    LogOut,
    CalendarOff,
    Clock,
} from "lucide-react";
import {
    Badge,
    Button,
    Card,
    Menu,
    PageHeader,
    SearchBar,
    Tabs,
} from "@/components/ui";

const ROLE_TABS = [
    { id: "all", label: "All" },
    { id: "doctor", label: "Doctors" },
    { id: "admin", label: "Admin" },
    { id: "staff", label: "Staff" },
];

/** Per-role visual mapping for avatar + role badge. */
const ROLE_TONE = {
    doctor: { tone: "info", avatarMod: "is-info", icon: Stethoscope },
    hospital_admin: { tone: "rose", avatarMod: "is-rose", icon: ShieldCheck },
    staff: { tone: "neutral", avatarMod: "", icon: User },
};

const getRoleTone = (role) => ROLE_TONE[role] || ROLE_TONE.staff;

/**
 * Today's presence badge. Attendance and leave live in the People/HR service,
 * keyed by the same users.id HMS holds — anyone People doesn't mention simply
 * hasn't been marked, which reads as "yet to check in".
 */
const PRESENCE_TONE = {
    CHECKED_IN: { tone: "success", label: "Checked in", icon: LogIn },
    CHECKED_OUT: { tone: "neutral", label: "Checked out", icon: LogOut },
    LEAVE: { tone: "warning", label: "On leave", icon: CalendarOff },
    NOT_CHECKED_IN: { tone: "neutral", label: "Yet to check in", icon: Clock },
};

const formatPunch = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

// Directory names these checkInAt/checkOutAt, People checkIn/checkOut.
const presenceTooltip = (p) => {
    const inAt = formatPunch(p?.checkInAt ?? p?.checkIn);
    const outAt = formatPunch(p?.checkOutAt ?? p?.checkOut);
    if (inAt && outAt) return `In ${inAt} · Out ${outAt}`;
    if (inAt) return `Checked in at ${inAt}`;
    return undefined;
};

function toMemberCard(u) {
    return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        roleDisplay: u.roleDisplay,
        // email/phone come back null unless the viewer is an admin or this is
        // their own record; workEmail is the hospital-wide one.
        email: u.email,
        workEmail: u.workEmail,
        phone: u.phone,
        employeeCode: u.employeeCode,
        designation: u.designationName || u.designation,
        designationId: u.designationId,
        departmentId: u.departmentId,
        departmentName: u.departmentName,
        departmentType: u.departmentType,
        dateOfJoining: u.dateOfJoining,
        isActive: u.isActive,
    };
}

function doctorToMemberCard(d) {
    return {
        id: d.userId,
        firstName: d.firstName,
        lastName: d.lastName,
        role: "doctor",
        roleDisplay: "Doctor",
        // Doctors carry their own work/personal split; the personal ones come
        // back null unless the viewer is an admin or the doctor themselves.
        email: d.email,
        workEmail: d.workEmail,
        phone: d.workPhone || d.phone,
        isActive: d.userIsActive,
        consultationFee: d.consultationFee,
        specialization: d.specialization,
    };
}

/**
 * Staff directory — multi-role roster shown as a responsive card grid.
 * Layout pieces live in admin.css (.hms-stat-grid, .hms-member-grid,
 * .hms-stat-tile__*, .hms-member-card__*) so this component is pure
 * composition over the shared design tokens.
 */
function StaffsList() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [showModal, setShowModal] = useState(false);
    const [editStaff, setEditStaff] = useState(undefined);
    // userId/email -> { presence, checkInAt, checkOutAt } from Directory.
    const [presence, setPresence] = useState({});
    // userId/email -> leave row from People, when that app is part of the deal.
    const [onLeave, setOnLeave] = useState({});
    // Only true once People answered — without it we can't tell "nobody marked
    // yet" (badge everyone as Yet to check in) from "People is unavailable"
    // (badge nobody).
    const [presenceReady, setPresenceReady] = useState(false);

    const load = async () => {
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            const [allUsers, doctors] = await Promise.all([
                staffApi.list(user.hospitalId),
                doctorsApi.list(user.hospitalId),
            ]);
            const doctorUserIds = new Set(doctors.map((d) => d.userId));
            const nonDoctors = allUsers.filter(
                (u) => !doctorUserIds.has(u.id) && u.role !== "super_admin"
            );
            const doctorCards = doctors.map(doctorToMemberCard);
            const staffCards = nonDoctors.map(toMemberCard);
            setMembers([...doctorCards, ...staffCards]);
        } catch {
            notify("Failed to load directory", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    // Presence is a separate, non-blocking fetch so a slow sibling service never
    // holds up the directory. Two independent sources, by design:
    //   Directory — check-in state. Present in every deployment, so this is the
    //               baseline and its failure means no badges at all.
    //   People    — leave. An optional purchase; failure here just drops the
    //               leave badge and leaves check-in state intact.
    useEffect(() => {
        if (!user?.hospitalId) return;
        let cancelled = false;

        const byKey = (rows) => {
            const map = {};
            for (const r of rows ?? []) {
                if (r.userId) map[r.userId] = r;
                if (r.email) map[r.email.toLowerCase()] = r;
            }
            return map;
        };

        // Kept as separate state rather than merged on arrival: whichever call
        // lands second must not clobber the other's result.
        directoryApi
            .presence()
            .then(({ enabled, rows }) => {
                if (cancelled) return;
                setPresence(byKey(rows));
                // No People/HR app means no biometric device and no attendance
                // to report — badge nobody rather than badging everyone "yet to
                // check in", which would read as broken.
                setPresenceReady(enabled);
            })
            .catch(() => {
                if (cancelled) return;
                setPresence({});
                setPresenceReady(false);
            });

        peopleApi
            .onLeaveToday(user.hospitalId)
            .then((rows) => {
                if (!cancelled) setOnLeave(byKey(rows));
            })
            .catch(() => {
                // No People app, no People account, or it's down — hospitals
                // without HR have no leave workflow, so no badge is correct.
                if (!cancelled) setOnLeave({});
            });

        return () => {
            cancelled = true;
        };
    }, [user?.hospitalId]);

    const filtered = useMemo(() => {
        let list = members;
        if (roleFilter === "doctor") list = list.filter((m) => m.role === "doctor");
        else if (roleFilter === "admin")
            list = list.filter((m) => m.role === "hospital_admin");
        else if (roleFilter === "staff")
            list = list.filter(
                (m) => m.role !== "doctor" && m.role !== "hospital_admin"
            );
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (m) =>
                    `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
                    // Both are now optional: a colleague's personal email is
                    // withheld by the API, so this can't assume a string.
                    m.email?.toLowerCase().includes(q) ||
                    m.workEmail?.toLowerCase().includes(q) ||
                    m.employeeCode?.toLowerCase().includes(q) ||
                    m.designation?.toLowerCase().includes(q) ||
                    m.specialization?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [members, roleFilter, search]);

    const stats = useMemo(
        () => ({
            total: members.length,
            active: members.filter((m) => m.isActive).length,
            doctors: members.filter((m) => m.role === "doctor").length,
            admins: members.filter((m) => m.role === "hospital_admin").length,
        }),
        [members]
    );

    const handleDeactivate = async (id) => {
        if (!confirm("Deactivate this account? They will lose system access.")) return;
        try {
            await staffApi.deactivate(id);
            notify("Account deactivated", "info");
            load();
        } catch {
            notify("Action failed", "error");
        }
    };

    const handleActivate = async (id) => {
        try {
            await staffApi.activate(id);
            notify("Account activated", "success");
            load();
        } catch {
            notify("Action failed", "error");
        }
    };

    const openEdit = (m) => {
        setEditStaff({
            id: m.id,
            email: m.email,
            workEmail: m.workEmail,
            firstName: m.firstName,
            lastName: m.lastName,
            role: m.role,
            roleDisplay: m.roleDisplay,
            isActive: m.isActive,
            phone: m.phone,
            employeeCode: m.employeeCode,
            designation: m.designation,
            dateOfJoining: m.dateOfJoining,
            specialization: m.specialization ?? undefined,
            department: null,
        });
        setShowModal(true);
    };

    const statCards = [
        { label: "Total staff", value: stats.total, icon: Users, valueClass: "text-gray-600", iconClass: "text-gray-600" },
        { label: "Active", value: stats.active, icon: UserPlus, valueClass: "text-success", iconClass: "text-success" },
        { label: "Doctors", value: stats.doctors, icon: Stethoscope, valueClass: "text-info", iconClass: "text-info" },
        { label: "Admin", value: stats.admins, icon: ShieldCheck, valueClass: "text-rose", iconClass: "text-rose" },
    ];

    return (
        <div className="zu-page">
            <PageHeader
                title="Staff directory"
                subtitle={`${stats.total} members · ${stats.active} active`}
                actions={
                    <Button
                        variant="primary"
                        onClick={() => {
                            setEditStaff(undefined);
                            setShowModal(true);
                        }}
                    >
                        <UserPlus size={14} strokeWidth={2.4} /> Add member
                    </Button>
                }
            />

            <div className="zu-page-content">
                {/* Stat cards */}
                <div className="hms-stat-grid">
                    {statCards.map(({ label, value, icon: Icon, valueClass, iconClass }) => (
                        <Card key={label}>
                            <div className="hms-stat-tile__head">
                                <p className="hms-stat-tile__label">{label}</p>
                                <Icon size={16} className={iconClass} />
                            </div>
                            <p className={`hms-stat-tile__value ${valueClass}`}>{value}</p>
                        </Card>
                    ))}
                </div>

                {/* Filter + search row */}
                <Card>
                    <div className="flex gap-3 flex-wrap items-center">
                        <Tabs
                            type="pill"
                            active={roleFilter}
                            onChange={setRoleFilter}
                            tabs={ROLE_TABS}
                        />
                        <div className="flex-1 min-w-56">
                            <SearchBar
                                value={search}
                                onChange={setSearch}
                                placeholder="Search by name, email, code, designation…"
                            />
                        </div>
                    </div>
                </Card>

                {/* Cards grid */}
                {loading ? (
                    <div className="hms-member-grid">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <Card key={i}>
                                <div className="flex items-center gap-3 opacity-50">
                                    <div className="hms-skel is-circle w-12 h-12" />
                                    <div className="flex-1 flex flex-col gap-1.5">
                                        <div className="hms-skel h-3 w-3/4" />
                                        <div className="hms-skel h-2.5 w-1/2" />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <Card>
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <Users size={32} />
                            </span>
                            <div className="hms-cell-empty__text">No members found</div>
                            {search && (
                                <div className="text-11 text-gray-400 mt-1">
                                    Try clearing your search
                                </div>
                            )}
                        </div>
                    </Card>
                ) : (
                    <div className="hms-member-grid">
                        {filtered.map((m) => {
                            const initials = `${m.firstName[0]}${m.lastName?.[0] ?? ""}`.toUpperCase();
                            const { tone, avatarMod, icon: RoleIcon } = getRoleTone(m.role);
                            // Leave outranks check-in state: it's decided ahead of
                            // time, and someone marked on leave who forgot to check
                            // out shouldn't read as at work.
                            const key = m.email?.toLowerCase();
                            const today =
                                onLeave[m.id] ?? onLeave[key] ?? presence[m.id] ?? presence[key];
                            const {
                                tone: presenceToneName,
                                label: presenceLabel,
                                icon: PresenceIcon,
                            } = PRESENCE_TONE[today?.presence] ?? PRESENCE_TONE.NOT_CHECKED_IN;
                            return (
                                <Card key={m.id} className="hms-member-card">
                                    <div className="hms-member-card__head">
                                        <div className="hms-member-card__identity">
                                            <span className={`hms-avatar is-lg ${avatarMod}`}>
                                                {initials}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="hms-member-card__name">
                                                    {m.firstName} {m.lastName}
                                                </p>
                                                {m.employeeCode && (
                                                    <p className="hms-member-card__code">
                                                        #{m.employeeCode}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <Menu
                                            triggerIcon={<MoreVertical size={16} />}
                                            triggerLabel="Member actions"
                                            align="right"
                                            items={[
                                                {
                                                    label: "Edit",
                                                    icon: <Pencil size={14} />,
                                                    onClick: () => openEdit(m),
                                                },
                                                m.isActive
                                                    ? {
                                                        label: "Deactivate",
                                                        icon: <XCircle size={14} />,
                                                        tone: "danger",
                                                        onClick: () => handleDeactivate(m.id),
                                                    }
                                                    : {
                                                        label: "Activate",
                                                        icon: <CheckCircle size={14} />,
                                                        onClick: () => handleActivate(m.id),
                                                    },
                                            ]}
                                        />
                                    </div>

                                    <div className="hms-member-card__badges">
                                        <Badge tone={tone} soft>
                                            <RoleIcon size={10} /> {m.roleDisplay}
                                        </Badge>
                                        {presenceReady && m.isActive && (
                                            <Badge
                                                tone={presenceToneName}
                                                soft
                                                title={presenceTooltip(today)}
                                            >
                                                <PresenceIcon size={10} /> {presenceLabel}
                                            </Badge>
                                        )}
                                        {m.specialization && (
                                            <Badge tone="neutral" soft>
                                                {m.specialization}
                                            </Badge>
                                        )}
                                        {!m.isActive && (
                                            <Badge tone="danger" soft>
                                                Inactive
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="hms-member-card__details">
                                        {m.designation && (
                                            <p className="hms-member-card__designation">
                                                {m.designation}
                                            </p>
                                        )}
                                        {m.departmentName && (
                                            <p className="hms-member-card__department">
                                                {m.departmentName}
                                            </p>
                                        )}
                                        {(m.workEmail || m.email) && (
                                            <div className="hms-member-card__line is-truncate">
                                                <Mail size={12} className="shrink-0" />
                                                <span>{m.workEmail || m.email}</span>
                                            </div>
                                        )}
                                        {m.phone && (
                                            <div className="hms-member-card__line">
                                                <Phone size={12} className="shrink-0" />
                                                <span>{m.phone}</span>
                                            </div>
                                        )}
                                        {m.dateOfJoining && (
                                            <div className="hms-member-card__line">
                                                <Calendar size={12} className="shrink-0" />
                                                <span>Joined {m.dateOfJoining}</span>
                                            </div>
                                        )}
                                        {m.consultationFee != null && (
                                            <p className="hms-member-card__fee">
                                                ₹{m.consultationFee.toLocaleString("en-IN")} / consult
                                            </p>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            

            {showModal && (
                <StaffFormModal
                    editStaff={editStaff}
                    onClose={() => setShowModal(false)}
                    onSaved={() => {
                        setShowModal(false);
                        load();
                    }}
                />
            )}
                    </div>
        </div>
    );
}

export { StaffsList as default };

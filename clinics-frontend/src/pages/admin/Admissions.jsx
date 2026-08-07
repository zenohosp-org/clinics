import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { admissionApi, infrastructureApi } from "@/utils/api";
import AdmitPatientModal from "./AdmitPatientModal";
import DischargeModal from "./DischargeModal";
import MoveToOTModal from "./MoveToOTModal";
import ViewBillingModal from "./ViewBillingModal";
import IPDDetailPane from "./IPDDetailPane";
import {
    BedDouble,
    Plus,
    User,
    Building2,
    Stethoscope,
    Clock,
    CheckCircle2,
    List,
    LayoutGrid,
    AlertCircle,
    Scissors,
    Search,
} from "lucide-react";
import { timeAgo, fmtDateTime } from "@/utils/date";
import { fmtId } from "@/utils/idFormat";
import {
    Badge,
    Button,
    Card,
    PageHeader,
    Pagination,
    SearchBar,
    Select,
    Tabs,
} from "@/components/ui";
import TableSkeleton from "@/components/ui/TableSkeleton";

/** Status → Badge tone. ADMITTED green, DISCHARGED neutral,
 *  TRANSFERRED warning, ABSCONDED danger. */
const STATUS_TONE = {
    ADMITTED: "success",
    DISCHARGED: "neutral",
    TRANSFERRED: "warning",
    ABSCONDED: "danger",
};

/** Stat card icon palette — page-local; not part of the design-system
 *  tone set. Each entry sets a background, an icon color, and the value
 *  color through a single .is-* modifier on .zu-stat-card-icon. */
const STAT_ICON_MOD = {
    admitted: "is-admitted",
    ot:       "is-ot",
    today:    "is-today",
    overdue:  "is-overdue",
};

/** Admission type pill — rendered above the status badge. */
function TypePill({ type }) {
    if (type === "EMERGENCY") {
        return <span className="hms-emergency-pill">EMERGENCY</span>;
    }
    if (type === "OPD_REFERRAL") {
        return <Badge tone="info" soft>OPD referral</Badge>;
    }
    return <Badge tone="neutral" soft>Direct</Badge>;
}

/**
 * IPD Admissions — paginated, filterable list of in-patient admissions
 * with grid/list view toggle, four stat cards, and a modal cascade
 * (admit → discharge / move-to-OT / view-billing / detail pane).
 * Layout pieces live in admin.css under .hms-admit-*. Status accents
 * (overdue / inOt) flip a .is-overdue / .is-ot modifier on the card.
 */
export default function Admissions() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [admissions, setAdmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ADMITTED");
    const [viewMode, setViewMode] = useState("grid");
    const [showAdmitModal, setShowAdmitModal] = useState(false);
    const [dischargeTarget, setDischargeTarget] = useState(null);
    const [otTarget, setOtTarget] = useState(null);
    const [billingTarget, setBillingTarget] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [returningToWard, setReturningToWard] = useState(null);
    const [selectedAdmission, setSelectedAdmission] = useState(null);

    // Infrastructure Filters
    const [infrastructure, setInfrastructure] = useState([]);
    const [selectedBlock, setSelectedBlock] = useState("");
    const [selectedFloor, setSelectedFloor] = useState("");
    const [selectedWard, setSelectedWard] = useState("");

    // Pagination
    const [page, setPage] = useState(0);
    const [size, setSize] = useState(30);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    // Stats counts (server-side)
    const [serverCounts, setServerCounts] = useState({
        ADMITTED: 0,
        inOt: 0,
        dischargedToday: 0,
        overdueDischarge: 0,
    });

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [search]);

    const loadInfrastructure = async () => {
        if (!user?.hospitalId) return;
        try {
            const data = await infrastructureApi.get(user.hospitalId);
            setInfrastructure(data || []);
            if (data?.length === 1) {
                setSelectedBlock(data[0].name);
            }
        } catch (err) {
            console.error("Failed to load infrastructure", err);
        }
    };

    useEffect(() => {
        loadInfrastructure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const load = async () => {
        if (!user?.hospitalId) return;
        try {
            setLoading(true);
            const res = await admissionApi.listPaginated(
                user.hospitalId,
                statusFilter,
                debouncedSearch,
                page,
                size,
                { block: selectedBlock, floor: selectedFloor, ward: selectedWard }
            );
            if (res) {
                setAdmissions(res.page?.content || []);
                setTotalPages(res.page?.totalPages || 0);
                setTotalElements(res.page?.totalElements || 0);
                setServerCounts({
                    ADMITTED: res.totalAdmitted || 0,
                    inOt: res.totalInOt || 0,
                    dischargedToday: res.dischargedToday || 0,
                    overdueDischarge: res.overdueDischarge || 0,
                });
            }
        } catch (err) {
            notify(err?.response?.data?.message || "Failed to load admissions", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId, statusFilter, debouncedSearch, page, size, selectedBlock, selectedFloor, selectedWard]);

    const blocks = useMemo(() => infrastructure, [infrastructure]);
    
    const floors = useMemo(() => {
        if (!selectedBlock) return [];
        const block = infrastructure.find(b => b.name === selectedBlock);
        return block?.floors || [];
    }, [infrastructure, selectedBlock]);

    const wards = useMemo(() => {
        if (!selectedFloor) return [];
        const floor = floors.find(f => f.name === selectedFloor);
        return floor?.wards || [];
    }, [floors, selectedFloor]);

    const handleBlockChange = (block) => {
        setSelectedBlock(block);
        setSelectedFloor("");
        setSelectedWard("");
        setPage(0);
    };

    const handleFloorChange = (floor) => {
        setSelectedFloor(floor);
        setSelectedWard("");
        setPage(0);
    };

    const handleWardChange = (ward) => {
        setSelectedWard(ward);
        setPage(0);
    };

    const counts = useMemo(
        () => ({
            ADMITTED: serverCounts.ADMITTED,
            inOt: serverCounts.inOt,
            dischargedToday: serverCounts.dischargedToday,
            overdueDischarge: serverCounts.overdueDischarge,
        }),
        [serverCounts]
    );

    const isOverdue = (a) => {
        if (!a.approxDischargeDate || a.status !== "ADMITTED") return false;
        return new Date(a.approxDischargeDate) < new Date();
    };

    const roomLabel = (a) => {
        if (!a.roomNumber) return "Room not assigned";
        return `Room ${a.roomNumber} · ${a.roomType}`;
    };

    const statCards = [
        { label: "Active admissions", value: counts.ADMITTED,         icon: BedDouble,   mod: STAT_ICON_MOD.admitted },
        { label: "In OT now",         value: counts.inOt,              icon: Scissors,    mod: STAT_ICON_MOD.ot },
        { label: "Discharged today",  value: counts.dischargedToday,   icon: CheckCircle2, mod: STAT_ICON_MOD.today },
        { label: "Overdue discharge", value: counts.overdueDischarge,  icon: AlertCircle, mod: STAT_ICON_MOD.overdue },
    ];

    return (
        <div className="zu-page">
            <PageHeader
                title="IPD Admissions"
                subtitle="In-patient department — active admissions and discharge management"
                actions={
                    <Button variant="primary" onClick={() => setShowAdmitModal(true)}>
                        <Plus size={14} strokeWidth={2.4} /> Admit patient
                    </Button>
                }
            />

            <div className="zu-page-content">
                {/* Stat cards */}
                <div className="zu-stat-card-grid">
                    {statCards.map(({ label, value, icon: Icon, mod }) => (
                        <Card key={label} className="is-stat">
                            <div className={`zu-stat-card-icon ${mod}`}>
                                <Icon size={20} />
                            </div>
                            <div className="zu-stat-card-body">
                                <p className="zu-stat-card-label">{label}</p>
                                <p className="zu-stat-card-value">{value}</p>
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Filter row */}
                <div className="zu-filter-bar" style={{ flexWrap: "wrap", gap: 12 }}>
                    <div className="zu-filter-bar__search" style={{ flex: 1, minWidth: 280 }}>
                        <Search className="zu-filter-bar__search-icon" />
                        <input
                            type="text"
                            className="zu-filter-bar__search-input"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by patient, admission no., department, room…"
                        />
                    </div>
                    
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {blocks.length > 1 && (
                            <Select
                                style={{ width: 140, height: 36, fontSize: 13 }}
                                value={selectedBlock}
                                onChange={(e) => handleBlockChange(e.target.value)}
                            >
                                <option value="">All Blocks</option>
                                {blocks.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
                            </Select>
                        )}
                        <Select
                            style={{ width: 140, height: 36, fontSize: 13 }}
                            value={selectedFloor}
                            onChange={(e) => handleFloorChange(e.target.value)}
                            disabled={!selectedBlock && blocks.length > 1}
                        >
                            <option value="">All Floors</option>
                            {floors.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                        </Select>
                        <Select
                            style={{ width: 140, height: 36, fontSize: 13 }}
                            value={selectedWard}
                            onChange={(e) => handleWardChange(e.target.value)}
                            disabled={!selectedFloor}
                        >
                            <option value="">All Wards</option>
                            {wards.map(w => <option key={w.name} value={w.name}>{w.name}</option>)}
                        </Select>
                    </div>
                    <div className="zu-filter-bar__controls">
                        <Tabs
                            type="pill"
                            active={statusFilter}
                            onChange={(id) => {
                                setStatusFilter(id);
                                setPage(0);
                            }}
                            tabs={[
                                {
                                    id: "ADMITTED",
                                    label: "Admitted",
                                    count: counts.ADMITTED > 0 ? counts.ADMITTED : undefined,
                                },
                                { id: "DISCHARGED", label: "Discharged" },
                                { id: "ALL", label: "All" },
                            ]}
                        />
                        <div className="hms-view-toggle">
                            {[
                                ["grid", LayoutGrid],
                                ["list", List],
                            ].map(([mode, Icon]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setViewMode(mode)}
                                    className={`hms-view-toggle__btn ${viewMode === mode ? "is-active" : ""}`}
                                    aria-pressed={viewMode === mode}
                                    aria-label={`${mode} view`}
                                >
                                    <Icon size={16} />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="hms-admit-state">
                      <TableSkeleton rows={6} columns={5} />
                    </div>
                ) : admissions.length === 0 ? (
                    <div className="hms-admit-state is-empty">
                        <BedDouble size={48} className="opacity-30" />
                        <p className="m-0 text-13">No admissions found</p>
                        <button
                            type="button"
                            onClick={() => setShowAdmitModal(true)}
                            className="hms-admit-state__cta"
                        >
                            Admit a patient →
                        </button>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="hms-admit-card-grid">
                        {admissions.map((a) => {
                            const overdue = isOverdue(a);
                            const cardMod = overdue ? "is-overdue" : a.inOt ? "is-ot" : "";
                            return (
                                <Card
                                    key={a.id}
                                    interactive
                                    onClick={() => setSelectedAdmission(a)}
                                    className={`hms-admit-card ${cardMod}`}
                                >
                                    <div className="hms-admit-card__head">
                                        <div className="hms-admit-card__patient">
                                            <span className="hms-admit-card__avatar">
                                                <User size={18} />
                                            </span>
                                            <div>
                                                <p className="hms-admit-card__name">
                                                    {a.patientName}
                                                </p>
                                                <p className="hms-admit-card__uhid">
                                                    UHID: {fmtId(a.patientUhid)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="hms-admit-card__pills">
                                            <TypePill type={a.admissionType} />
                                            {a.inOt && (
                                                <Badge tone="violet" soft>
                                                    <Scissors size={10} /> In OT
                                                </Badge>
                                            )}
                                            {a.roomType === "POST_OT" && (
                                                <Badge tone="amber" soft>Recovery</Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hms-admit-card__body">
                                        <div className="hms-admit-card__row">
                                            <Building2 size={14} className="shrink-0" />
                                            <span>{a.departmentName || "No department"}</span>
                                        </div>
                                        <div className="hms-admit-card__row">
                                            <BedDouble size={14} className="shrink-0" />
                                            <span>{a.roomNumber ? roomLabel(a) : "Room not assigned"}</span>
                                        </div>
                                        <div className="hms-admit-card__row">
                                            <Stethoscope size={14} className="shrink-0" />
                                            <span>
                                                {a.admittingDoctorName
                                                    ? `Dr. ${a.admittingDoctorName}`
                                                    : "No doctor assigned"}
                                            </span>
                                        </div>
                                        <div className="hms-admit-card__row">
                                            <Clock size={14} className="shrink-0" />
                                            <span>{timeAgo(a.admissionDate)}</span>
                                            {overdue && (
                                                <span className="hms-admit-overdue-text">· Overdue</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hms-admit-card__footer">
                                        <Badge tone={STATUS_TONE[a.status] || "neutral"} soft>
                                            {a.status}
                                        </Badge>
                                        <div className="hms-admit-card__ids">
                                            {a.ipdId && (
                                                <p className="hms-admit-card__ipd">{fmtId(a.ipdId)}</p>
                                            )}
                                            <p className="hms-admit-card__no">{fmtId(a.admissionNumber)}</p>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="hms-admit-table-card">
                        <div className="hms-admit-table-wrap">
                            <table className="hms-admit-table">
                                <thead>
                                    <tr>
                                        {[
                                            "Adm. no.",
                                            "Patient",
                                            "Department",
                                            "Room",
                                            "Doctor",
                                            "Admitted",
                                            "Status",
                                        ].map((h) => (
                                            <th key={h}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {admissions.map((a) => {
                                        const overdue = isOverdue(a);
                                        const rowMod = overdue ? "is-overdue" : a.inOt ? "is-ot" : "";
                                        return (
                                            <tr
                                                key={a.id}
                                                onClick={() => setSelectedAdmission(a)}
                                                className={rowMod}
                                            >
                                                <td>
                                                    {a.ipdId && (
                                                        <p className="hms-admit-table__id-primary">
                                                            {fmtId(a.ipdId)}
                                                        </p>
                                                    )}
                                                    <p className="hms-admit-table__id-secondary">
                                                        {fmtId(a.admissionNumber)}
                                                    </p>
                                                </td>
                                                <td>
                                                    <p className="hms-admit-table__name">{a.patientName}</p>
                                                    <p className="hms-admit-table__sub">
                                                        {fmtId(a.patientUhid)}
                                                    </p>
                                                </td>
                                                <td className="hms-admit-table__text">
                                                    {a.departmentName || "—"}
                                                </td>
                                                <td>
                                                    <p className="hms-admit-table__text m-0">
                                                        {a.roomNumber || (
                                                            <span className="hms-admit-no-room">
                                                                Not assigned
                                                            </span>
                                                        )}
                                                    </p>
                                                    {a.inOt && (
                                                        <span className="hms-admit-ot-text">
                                                            <Scissors size={12} /> In OT
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="hms-admit-table__text">
                                                    {a.admittingDoctorName ? `Dr. ${a.admittingDoctorName}` : "—"}
                                                </td>
                                                <td
                                                    className="hms-admit-table__text-sm"
                                                    title={fmtDateTime(a.admissionDate)}
                                                >
                                                    {timeAgo(a.admissionDate)}
                                                </td>
                                                <td>
                                                    <Badge tone={STATUS_TONE[a.status] || "neutral"} soft>
                                                        {a.status}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {!loading && totalElements > 0 && totalPages > 1 && (
                    <Pagination
                        currentPage={page + 1}
                        totalPages={totalPages}
                        totalItems={totalElements}
                        pageSize={size}
                        onPageChange={(p) => setPage(p - 1)}
                    />
                )}
            

            {showAdmitModal && (
                <AdmitPatientModal
                    onClose={() => setShowAdmitModal(false)}
                    onAdmitted={() => {
                        setShowAdmitModal(false);
                        notify("Patient admitted successfully", "success");
                        load();
                    }}
                />
            )}
            {dischargeTarget && (
                <DischargeModal
                    admission={dischargeTarget}
                    onClose={() => setDischargeTarget(null)}
                    onDischarged={() => {
                        setDischargeTarget(null);
                        notify("Patient discharged", "success");
                        load();
                    }}
                />
            )}
            {otTarget && (
                <MoveToOTModal
                    admission={otTarget}
                    onClose={() => setOtTarget(null)}
                    onMoved={() => {
                        setOtTarget(null);
                        notify(`${otTarget.patientName} moved to OT`, "success");
                        load();
                    }}
                />
            )}
            {billingTarget && (
                <ViewBillingModal
                    admission={billingTarget}
                    onClose={() => setBillingTarget(null)}
                />
            )}

            {selectedAdmission && (
                <IPDDetailPane
                    admission={selectedAdmission}
                    onClose={() => setSelectedAdmission(null)}
                    onDischarge={() => {
                        setDischargeTarget(selectedAdmission);
                        setSelectedAdmission(null);
                    }}
                    onMoveToOT={() => {
                        setOtTarget(selectedAdmission);
                        setSelectedAdmission(null);
                    }}
                    onReturnToWard={async () => {
                        const a = selectedAdmission;
                        setSelectedAdmission(null);
                        setReturningToWard(a.id);
                        try {
                            await admissionApi.returnToWard(a.id);
                            notify(`${a.patientName} returned to ward`, "success");
                            load();
                        } catch (err) {
                            notify(
                                err?.response?.data?.message || "Failed to return to ward",
                                "error"
                            );
                        } finally {
                            setReturningToWard(null);
                        }
                    }}
                />
            )}
                    </div>
        </div>
    );
}

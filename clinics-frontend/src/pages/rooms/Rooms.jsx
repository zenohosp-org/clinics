import { CenterLoader } from "@/components/ui/Loader";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import api, { infrastructureApi } from "@/utils/api";
import {
    Bed,
    CalendarClock,
    MoreHorizontal,
    ScrollText,
    Building2,
    Layers,
    LayoutGrid,
    ChevronDown,
    ChevronRight,
    Stethoscope,
    AlertCircle,
    User,
    X,
    ChevronsUpDown,
    Link2Off,
} from "lucide-react";
import { formatDateTime } from "@/utils/validators";
import { fmtId } from "@/utils/idFormat";
import AssignAttenderModal from "./AssignAttenderModal";
import RoomDetailPanel from "./RoomDetailPanel";
import {
    Badge,
    Button,
    Card,
    Menu,
    SearchBar,
} from "@/components/ui";

const TYPE_TONE = {
    ICU: "rose",
    OT: "amber",
};

const normalizeKey = (v) => v?.toString()?.trim()?.toLowerCase() || "";

const isPartiallyOccupied = (room) =>
    (room?.bedsTotal ?? 0) > 1
        && (room?.bedsOccupied ?? 0) > 0
        && !room?.occupied;

const statusTone = (room) => {
    if (room?.underMaintenance) return "is-neutral";
    if (room?.occupied) return "is-occupied";
    if (isPartiallyOccupied(room)) return "is-partial";
    return "is-available";
};

const chipStatusClass = (room) => {
    if (room?.underMaintenance) return "hms-status-chip is-neutral";
    if (room?.occupied) return "hms-status-chip is-info";
    if (isPartiallyOccupied(room)) return "hms-status-chip is-warning";
    return "hms-status-chip is-success";
};

/** Compact dot+label status chip used in card headers. */
function StatusChip({ room }) {
    const label = room?.underMaintenance
        ? "Maintenance"
        : room?.occupied
            ? "Occupied"
            : isPartiallyOccupied(room)
                ? `${room.bedsOccupied}/${room.bedsTotal} occupied`
                : "Available";
    return (
        <span className={chipStatusClass(room)}>
            {label}
        </span>
    );
}

/** Occupancy fill bar — green / amber / red by percentage. */
function OccupancyBar({ occupied, total, size = "md" }) {
    const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const fillCls =
        pct >= 85
            ? "is-high"
            : pct >= 60
                ? "is-medium"
                : pct > 0
                    ? "is-low"
                    : "is-empty";
    const sizeCls = size === "sm" ? " is-sm" : size === "lg" ? " is-lg" : "";
    return (
        <div className={"hms-room-occ" + sizeCls}>
            <div className="hms-room-occ__track">
                <div
                    className={"hms-room-occ__fill " + fillCls}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="hms-room-occ__text">
                {occupied}/{total}
            </span>
        </div>
    );
}

function RoomMenu({ room, onView, onAttender }) {
    // The rooms-list payload has bedsTotal (authoritative) but no `beds` array,
    // so the old check always evaluated to false and every "View details"
    // option silently picked the wrong label.
    const isMultiBed = (room?.bedsTotal ?? 0) > 1;
    const items = [
        {
            label: isMultiBed ? "View beds" : "View details",
            icon: <ChevronsUpDown size={14} />,
            onClick: () => onView(room),
        },
    ];
    if (room.occupied && !isMultiBed) {
        items.push({
            label: room.attenderName ? "Edit attender" : "Assign attender",
            icon: <User size={14} />,
            onClick: () => onAttender(room),
        });
    }
    return (
        <div>
            <Menu
                triggerIcon={<MoreHorizontal size={16} />}
                triggerLabel="Room actions"
                align="right"
                items={items}
            />
        </div>
    );
}

/** Room card used inside the infrastructure tree. */
function InfrastructureRoomCard({ roomInfo, roomData, isSelected, onSelect, onView, onAttender }) {
    // Multi-bed detection now uses the authoritative bedsTotal from the backend
    // instead of the previous `roomData.beds?.length` — `beds` was always
    // undefined on the rooms-list payload, so the badge had been silently
    // wrong (every room rendered as single-bed).
    const bedsTotal    = roomData?.bedsTotal ?? 0;
    const bedsOccupied = roomData?.bedsOccupied ?? 0;
    const bedsFree     = Math.max(0, bedsTotal - bedsOccupied);
    const isMultiBed   = bedsTotal > 1;
    const isOccupied   = roomData?.occupied;
    const isPartial    = isMultiBed && bedsOccupied > 0 && !isOccupied;
    const isUnderMaintenance = roomData?.underMaintenance;
    const roomType = roomData?.roomType ?? roomInfo.roomType ?? "GENERAL";
    const accentTone = roomData ? statusTone(roomData) : "";

    return (
        <div
            onClick={() => roomData && onSelect(roomData)}
            className={
                "hms-room-cell" +
                (!roomData ? " is-empty" : "") +
                (isSelected ? " is-selected" : "") +
                (isOccupied ? " is-occupied" : "")
            }
        >
            <div className={"hms-room-cell__accent " + accentTone} />
            <div className="hms-room-cell__head">
                <div className="hms-room-cell__body">
                    <div className="hms-room-cell__title-row">
                        <p className="hms-room-cell__title">
                            {roomInfo.name}
                        </p>
                        {roomData?.roomCode && (
                            <span className="hms-room-cell__code">
                                {fmtId(roomData.roomCode)}
                            </span>
                        )}
                        {roomData && <div className={"hms-room-cell__status-dot " + accentTone} />}
                    </div>
                    <div className="hms-room-cell__tags">
                        <Badge tone={TYPE_TONE[roomType] || "neutral"} soft>
                            {roomType}
                        </Badge>
                        {isMultiBed && (
                            <Badge tone={isOccupied ? "danger" : isPartial ? "warning" : "violet"} soft>
                                {bedsOccupied}/{bedsTotal} occupied
                            </Badge>
                        )}
                        {!isMultiBed && bedsTotal === 1 && isOccupied && (
                            <Badge tone="info" soft>
                                Occupied
                            </Badge>
                        )}
                    </div>
                </div>
                {roomData && (
                    <div onClick={(e) => e.stopPropagation()}>
                        <RoomMenu room={roomData} onView={onView} onAttender={onAttender} />
                    </div>
                )}
            </div>

            {roomData && isOccupied && roomData.currentPatient && !isMultiBed && (
                <div className="hms-room-cell__patient">
                    <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                            {roomData.currentPatient.firstName?.[0] || ""}{roomData.currentPatient.lastName?.[0] || ""}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <p className="hms-room-cell__patient-name">
                                {roomData.currentPatient.firstName} {roomData.currentPatient.lastName}
                            </p>
                            <p className="hms-room-cell__patient-uhid">
                                {fmtId(roomData.currentPatient.uhid)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
            
            {roomData && isMultiBed && (isOccupied || isPartial) && (
                <div className="hms-room-cell__patient">
                    <p className={
                        "hms-room-cell__patient-name " +
                        (isOccupied ? "text-[#b91c1c]" : "text-[#b45309]")
                    }>
                        {isOccupied
                            ? `All ${bedsTotal} beds occupied`
                            : `${bedsFree} of ${bedsTotal} bed${bedsFree === 1 ? "" : "s"} free`}
                    </p>
                    <p className="hms-room-cell__patient-uhid">
                        Click panel to view per-bed details
                    </p>
                </div>
            )}

            {!roomData && (
                <p className="hms-room-cell__footer-hint">
                    Not provisioned
                </p>
            )}
        </div>
    );
}

function SectionLabel({ icon: Icon, label, count, onDark }) {
    const parts = label ? label.split(' / ') : [];
    return (
        <div className={"hms-room-section-label" + (onDark ? " is-on-dark" : "")}>
            <Icon size={12} />
            <span className="hms-room-section-label__text flex items-center">
                {parts.map((part, i) => (
                    <span key={i} className="flex items-center">
                        {part}
                        {i < parts.length - 1 && (
                            <span className="hms-room-section-label__sep">/</span>
                        )}
                    </span>
                ))}
            </span>
            {count != null && (
                <span className="hms-room-section-label__count">
                    {count}
                </span>
            )}
        </div>
    );
}

function StatCell({ label, value, dotTone, sub }) {
    return (
        <div className="hms-rooms-stats__cell">
            <div className="hms-rooms-stats__head">
                {dotTone && (
                    <span className={"hms-rooms-stats__dot " + dotTone} />
                )}
                <p className="hms-rooms-stats__label">
                    {label}
                </p>
            </div>
            <p className="hms-rooms-stats__value">
                {value}
            </p>
            {sub && (
                <p className="hms-rooms-stats__sub">
                    {sub}
                </p>
            )}
        </div>
    );
}

/**
 * Rooms allocation — building → floor → ward → room infrastructure tree
 * with selection-driven RoomDetailPanel sidebar. Phase 9 migration:
 * data layer untouched (api.get('/rooms'), infrastructureApi.get),
 * collapsed-floor / collapsed-ward state preserved, action menu now
 * uses the design-system Menu primitive.
 */
function Rooms() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("ALL");
    const [search, setSearch] = useState("");
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [showAttenderModal, setShowAttenderModal] = useState({ open: false, room: null });
    const [infrastructure, setInfrastructure] = useState([]);


    const fetchRooms = async () => {
        try {
            const { data } = await api.get(`/rooms?hospitalId=${user?.hospitalId}`);
            setRooms(data);
        } catch (e) {
            console.error("Failed to fetch rooms", e);
        }
    };

    const fetchInfrastructure = async () => {
        try {
            const data = await infrastructureApi.get(user.hospitalId);
            setInfrastructure(data || []);
        } catch {
            setInfrastructure([]);
        }
    };

    useEffect(() => {
        if (!user?.hospitalId) return;
        const load = async () => {
            setLoading(true);
            await Promise.all([fetchRooms(), fetchInfrastructure()]);
            setLoading(false);
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    useEffect(() => {
        if (selectedRoom) {
            const updated = rooms.find((r) => r.id === selectedRoom.id);
            if (updated) setSelectedRoom(updated);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rooms]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && search) setSearch("");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [search]);

    const roomMap = useMemo(
        () => new Map(rooms.map((r) => [normalizeKey(r.roomNumber), r])),
        [rooms]
    );

    const infrastructureRoomKeys = useMemo(() => {
        const keys = new Set();
        infrastructure.forEach((b) =>
            (b.floors || []).forEach((f) =>
                (f.wards || []).forEach((w) =>
                    (w.rooms || []).forEach((r) => keys.add(normalizeKey(r.name)))
                )
            )
        );
        return keys;
    }, [infrastructure]);

    const matchesSearch = (room, q) => {
        if (!q) return true;
        if (room?.roomNumber?.toLowerCase().includes(q)) return true;
        if (room?.currentPatient)
            return [
                room.currentPatient.firstName,
                room.currentPatient.lastName,
                room.currentPatient.uhid,
            ].some((v) => v?.toLowerCase().includes(q));
        return false;
    };

    const filteredRooms = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rooms
            .filter((r) => {
                if (filter === "AVAILABLE" && (r.occupied || r.underMaintenance)) return false;
                if (filter === "OCCUPIED" && !r.occupied) return false;
                return matchesSearch(r, q);
            })
            .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
    }, [rooms, filter, search]);

    const filteredInfrastructure = useMemo(() => {
        const q = search.trim().toLowerCase();
        return infrastructure
            .map((building) => ({
                ...building,
                floors: (building.floors || [])
                    .map((floor) => ({
                        ...floor,
                        wards: (floor.wards || [])
                            .map((ward) => ({
                                ...ward,
                                rooms: (ward.rooms || [])
                                    .map((room) => ({
                                        ...room,
                                        roomData: roomMap.get(normalizeKey(room.name)),
                                    }))
                                    .filter((room) => {
                                        if (
                                            filter === "AVAILABLE" &&
                                            (room.roomData?.occupied || room.roomData?.underMaintenance)
                                        )
                                            return false;
                                        if (
                                            filter === "OCCUPIED" &&
                                            !room.roomData?.occupied
                                        )
                                            return false;
                                        return (
                                            !q ||
                                            room.name?.toLowerCase().includes(q) ||
                                            matchesSearch(room.roomData, q)
                                        );
                                    }),
                            }))
                            .filter((w) => w.rooms.length > 0),
                    }))
                    .filter((f) => f.wards.length > 0),
            }))
            .filter((b) => b.floors.length > 0);
    }, [infrastructure, roomMap, filter, search]);

    const unmappedRooms = useMemo(
        () =>
            filteredRooms.filter(
                (r) => !infrastructureRoomKeys.has(normalizeKey(r.roomNumber))
            ),
        [filteredRooms, infrastructureRoomKeys]
    );

    const showInfrastructureView = infrastructure.length > 0;

    // The KPI strip now counts BED capacity for bedded rooms (a 3-bed room
    // contributes 3 to total), and falls back to room-count for non-bedded
    // rooms (consultation, OT, STORE — where bedsTotal=0). This is what the
    // user actually wants to see: "two free slots in Room 104" reads as +2
    // available, not "the whole room is occupied / 0 available".
    const slotsOf = (r) => (r.bedsTotal > 0 ? r.bedsTotal : 1);
    const occupiedSlotsOf = (r) =>
        r.bedsTotal > 0
            ? Math.min(r.bedsOccupied ?? 0, r.bedsTotal)
            : r.occupied ? 1 : 0;
    const availableCount = rooms.reduce((sum, r) => {
        if (r.underMaintenance) return sum;
        return sum + (slotsOf(r) - occupiedSlotsOf(r));
    }, 0);
    const occupiedCount = rooms.reduce((sum, r) => sum + occupiedSlotsOf(r), 0);
    const icuAvailable = rooms.reduce((sum, r) => {
        if (r.roomType !== "ICU" || r.underMaintenance) return sum;
        return sum + (slotsOf(r) - occupiedSlotsOf(r));
    }, 0);
    const icuOccupied = rooms.reduce(
        (sum, r) => (r.roomType === "ICU" ? sum + occupiedSlotsOf(r) : sum),
        0,
    );
    const otAvailable = rooms.reduce((sum, r) => {
        if (r.roomType !== "OT" || r.underMaintenance) return sum;
        return sum + (slotsOf(r) - occupiedSlotsOf(r));
    }, 0);
    const otOccupied = rooms.reduce(
        (sum, r) => (r.roomType === "OT" ? sum + occupiedSlotsOf(r) : sum),
        0,
    );

    const totalBuildings = infrastructure.length;
    const totalFloors = infrastructure.reduce((s, b) => s + (b.floors?.length || 0), 0);

    const cardProps = (roomData) => ({
        isSelected: selectedRoom?.id === roomData?.id,
        onSelect: (r) => setSelectedRoom((prev) => (prev?.id === r.id ? null : r)),
        onView: (r) => setSelectedRoom(r),
        onAttender: (r) => setShowAttenderModal({ open: true, room: r }),
    });

    return (
        <div className="zu-page">
            {/* Header — banner card */}
            <Card className="hms-rooms-banner">
                <div className="hms-rooms-banner__inner">
                    <div className="hms-rooms-banner__lead">
                        <div className="hms-rooms-banner__icon">
                            <Stethoscope size={20} />
                        </div>
                        <div>
                            <div className="hms-rooms-banner__title-row">
                                <h1 className="hms-rooms-banner__title">
                                    Room allocation
                                </h1>
                                <span className="hms-rooms-banner__eyebrow">
                                    Infrastructure
                                </span>
                            </div>
                            <p className="hms-rooms-banner__meta">
                                <span className="hms-rooms-banner__meta-num">
                                    {rooms.length}
                                </span>
                                <span>rooms</span>
                                {showInfrastructureView && (
                                    <>
                                        <span className="hms-rooms-banner__meta-sep">·</span>
                                        <span className="hms-rooms-banner__meta-num">
                                            {totalBuildings}
                                        </span>
                                        <span>
                                            {totalBuildings === 1 ? "building" : "buildings"}
                                        </span>
                                        <span className="hms-rooms-banner__meta-sep">·</span>
                                        <span className="hms-rooms-banner__meta-num">
                                            {totalFloors}
                                        </span>
                                        <span>{totalFloors === 1 ? "floor" : "floors"}</span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <Button variant="secondary" onClick={() => navigate("/rooms/logs")}>
                        <ScrollText size={14} /> Logs
                    </Button>
                </div>
            </Card>

            <div className="zu-page-content">
            {/* Stats strip */}
            <Card className="hms-rooms-stats">
                <div className="hms-rooms-stats__grid">
                    {[
                        { label: "Total rooms", value: rooms.length },
                        { label: "Available", value: availableCount, dotTone: "is-success" },
                        { label: "Occupied", value: occupiedCount, dotTone: "is-info" },
                        {
                            label: "ICU",
                            value: icuOccupied + icuAvailable,
                            sub: `${icuOccupied} in use · ${icuAvailable} free`,
                        },
                        {
                            label: "OT",
                            value: otOccupied + otAvailable,
                            sub: `${otOccupied} in use · ${otAvailable} free`,
                        },
                    ].map((s) => (
                        <StatCell key={s.label} {...s} />
                    ))}
                </div>
            </Card>

            {/* Controls */}
            <div className="hms-rooms-controls flex items-center justify-between mb-4 mt-6">
                <div className="zu-pill-group hms-rooms-filter-pills">
                    {["ALL", "AVAILABLE", "OCCUPIED"].map((f) => {
                        const active = filter === f;
                        return (
                            <button
                                key={f}
                                type="button"
                                onClick={() => setFilter(f)}
                                className={"hms-rooms-filter-pill" + (active ? " is-active" : "")}
                            >
                                {f === "ALL" ? "All" : f}
                            </button>
                        );
                    })}
                </div>
                <div className="flex-1 max-w-md ml-4">
                    <SearchBar
                        placeholder="Search rooms, patients, UHID..."
                        value={search}
                        onChange={setSearch}
                    />
                </div>
            </div>

            {/* Content */}
            <div className="hms-rooms-body">
                <div className="hms-rooms-body__list">
                    {loading ? (
                        <CenterLoader text="Loading infrastructure" />
                    ) : showInfrastructureView ? (
                        <div className="hms-rooms-tree">
                            {filteredInfrastructure.flatMap((building, bIdx) =>
                                building.floors.flatMap((floor, fIdx) =>
                                    floor.wards.map((ward, wIdx) => {
                                        const wRooms = ward.rooms.map((r) => r.roomData).filter(Boolean);
                                        const wOcc = wRooms.filter((r) => r.occupied).length;
                                        const bName = building.name || `Building ${bIdx + 1}`;
                                        const fName = floor.name || `Floor ${fIdx + 1}`;
                                        const wName = ward.name || `Ward ${wIdx + 1}`;

                                        return (
                                            <div key={ward.id ?? `${bIdx}-${fIdx}-${wIdx}`} className="hms-room-section">
                                                <div className="hms-room-section__head">
                                                    <h3 className="hms-room-section__title">
                                                        {bName} <span className="hms-room-section__sep">/</span> {fName} <span className="hms-room-section__sep">/</span> {wName}
                                                    </h3>
                                                    <div className="hms-room-section__occupancy">
                                                        <OccupancyBar occupied={wOcc} total={wRooms.length} size="sm" />
                                                    </div>
                                                </div>
                                                <div className="hms-room-grid">
                                                    {ward.rooms.map((room) => (
                                                        <InfrastructureRoomCard
                                                            key={room.name}
                                                            roomInfo={room}
                                                            roomData={room.roomData}
                                                            {...cardProps(room.roomData)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )
                            )}

                            {unmappedRooms.length > 0 && (
                                <div className="hms-rooms-unmapped">
                                    <div className="hms-rooms-unmapped__accent" />
                                    <div className="hms-rooms-unmapped__head">
                                        <div className="hms-rooms-unmapped__lead">
                                            <div className="hms-rooms-unmapped__icon">
                                                <Link2Off size={16} />
                                            </div>
                                            <div>
                                                <div className="hms-rooms-unmapped__title-row">
                                                    <p className="hms-rooms-unmapped__title">
                                                        Unmapped rooms
                                                    </p>
                                                    <Badge tone="warning" soft>
                                                        {unmappedRooms.length}
                                                    </Badge>
                                                </div>
                                                <p className="hms-rooms-unmapped__desc">
                                                    Exist in room allocation but not linked to the
                                                    infrastructure tree
                                                </p>
                                            </div>
                                        </div>
                                        <div className="hms-rooms-unmapped__badge">
                                            <AlertCircle size={12} />
                                            <span>Data quality</span>
                                        </div>
                                    </div>
                                    <div className="hms-room-grid is-padded">
                                        {unmappedRooms.map((room) => (
                                            <InfrastructureRoomCard
                                                key={room.id}
                                                roomInfo={{
                                                    name: room.roomNumber,
                                                    roomType: room.roomType,
                                                }}
                                                roomData={room}
                                                {...cardProps(room)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredInfrastructure.length === 0 && unmappedRooms.length === 0 && (
                                <Card className="hms-rooms-empty">
                                    <div className="hms-rooms-empty__icon">
                                        <Bed size={28} />
                                    </div>
                                    <p className="hms-rooms-empty__title">
                                        No rooms match the current filter
                                    </p>
                                    <p className="hms-rooms-empty__desc">
                                        Try clearing the search or switching filters above.
                                    </p>
                                </Card>
                            )}
                        </div>
                    ) : filteredRooms.length === 0 ? (
                        <Card className="hms-rooms-empty">
                            <div className="hms-rooms-empty__icon">
                                <Bed size={28} />
                            </div>
                            <p className="hms-rooms-empty__title">
                                No rooms found matching criteria
                            </p>
                            <p className="hms-rooms-empty__desc">
                                Adjust the filter or search above.
                            </p>
                        </Card>
                    ) : (
                        <FlatRoomList
                            rooms={filteredRooms}
                            selectedRoom={selectedRoom}
                            onSelect={(r) =>
                                setSelectedRoom((prev) => (prev?.id === r.id ? null : r))
                            }
                            onView={(r) => setSelectedRoom(r)}
                            onAttender={(r) =>
                                setShowAttenderModal({ open: true, room: r })
                            }
                        />
                    )}
                </div>

                {selectedRoom && (
                    <RoomDetailPanel
                        room={selectedRoom}
                        onClose={() => setSelectedRoom(null)}
                        onViewLogs={() =>
                            navigate(
                                `/rooms/logs?roomId=${selectedRoom.id}&roomNumber=${selectedRoom.roomNumber}`
                            )
                        }
                    />
                )}
            </div>
            </div>

            {showAttenderModal.open && showAttenderModal.room && (
                <AssignAttenderModal
                    admissionId={showAttenderModal.room.admissionId}
                    label={`Room ${showAttenderModal.room.roomNumber}`}
                    existing={{
                        name: showAttenderModal.room.attenderName,
                        phone: showAttenderModal.room.attenderPhone,
                        relationship: showAttenderModal.room.attenderRelationship,
                    }}
                    onClose={() => setShowAttenderModal({ open: false, room: null })}
                    onSuccess={() => {
                        setShowAttenderModal({ open: false, room: null });
                        fetchRooms();
                    }}
                />
            )}
        </div>
    );
}

function FlatRoomList({ rooms, selectedRoom, onSelect, onView, onAttender }) {
    return (
        <>
            {rooms.map((room) => {
                const bedsTotal    = room.bedsTotal ?? 0;
                const bedsOccupied = room.bedsOccupied ?? 0;
                const isMultiBed   = bedsTotal > 1;
                const isSelected = selectedRoom?.id === room.id;
                const accentCls = statusTone(room);
                const iconCls = statusTone(room);
                return (
                    <div
                        key={room.id}
                        onClick={() => onSelect(room)}
                        className={
                            "hms-room-row" + (isSelected ? " is-selected" : "")
                        }
                    >
                        <div className={"hms-room-cell__accent " + accentCls} />
                        <div className="hms-room-row__lead">
                            <div className={"hms-room-row__icon " + iconCls}>
                                <Bed size={20} />
                            </div>
                            <div>
                                <div className="hms-room-row__title-row">
                                    <p className="hms-room-row__title">
                                        {room.roomNumber}
                                    </p>
                                    {room.roomCode && (
                                        <span className="hms-room-row__code">
                                            {fmtId(room.roomCode)}
                                        </span>
                                    )}
                                    <Badge tone={TYPE_TONE[room.roomType] || "neutral"} soft>
                                        {room.roomType}
                                    </Badge>
                                    {isMultiBed && (
                                        <Badge
                                            tone={room.occupied ? "danger" : (bedsOccupied > 0 ? "warning" : "neutral")}
                                            soft
                                        >
                                            {bedsOccupied}/{bedsTotal} occupied
                                        </Badge>
                                    )}
                                </div>
                                <div className="mt-1">
                                    <StatusChip room={room} />
                                </div>
                            </div>
                        </div>

                        {isMultiBed ? (
                            <div className="hms-room-row__main">
                                <p className="hms-room-row__hint">
                                    Open panel to view beds →
                                </p>
                            </div>
                        ) : room.occupied && room.currentPatient ? (
                            <div className="hms-room-row__main is-block">
                                <div className="hms-room-row__split">
                                    <div className="hms-room-row__patient">
                                        <div>
                                            <p className="hms-room-kv-label">
                                                Patient
                                            </p>
                                            <div className="hms-room-row__name-row">
                                                <User size={14} className="text-gray-400" />
                                                <p className="hms-room-row__name">
                                                    {room.currentPatient.firstName}{" "}
                                                    {room.currentPatient.lastName}
                                                </p>
                                            </div>
                                            <p className="hms-room-row__uhid">
                                                {fmtId(room.currentPatient.uhid)}
                                            </p>
                                        </div>
                                        {room.attenderName ? (
                                            <div>
                                                <p className="hms-room-kv-label">
                                                    Attender
                                                </p>
                                                <p className="hms-room-row__att-name">
                                                    {room.attenderName}
                                                    {room.attenderRelationship && (
                                                        <span className="hms-room-row__att-rel">
                                                            ({room.attenderRelationship})
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="hms-room-row__no-att">
                                                No attender assigned
                                            </p>
                                        )}
                                    </div>
                                    <div className="hms-room-row__aside">
                                        {room.approxDischargeTime && (
                                            <div>
                                                <div className="hms-room-row__discharge">
                                                    <CalendarClock size={12} /> Est. discharge
                                                </div>
                                                <p className="hms-room-row__discharge-time">
                                                    {formatDateTime(room.approxDischargeTime)}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="hms-room-row__main">
                                <p className="hms-room-row__hint is-success">
                                    Ready for allocation
                                </p>
                            </div>
                        )}

                        <div onClick={(e) => e.stopPropagation()}>
                            <RoomMenu
                                room={room}
                                onView={onView}
                                onAttender={onAttender}
                            />
                        </div>
                    </div>
                );
            })}
        </>
    );
}

export default Rooms;

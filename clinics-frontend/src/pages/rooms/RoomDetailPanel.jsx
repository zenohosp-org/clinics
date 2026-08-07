import { Spinner } from "@/components/ui/Loader";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { assetApi, bedApi } from "@/utils/api";
import { X, User, Phone, Users, Package, CalendarClock, ScrollText, Search, Plus, ArrowUpRight, Tag, BedDouble, Pencil,  } from "lucide-react";
import { formatDateTime } from "@/utils/validators";
import { fmtId } from "@/utils/idFormat";
import AssignAttenderModal from "./AssignAttenderModal";
import { Badge, Button } from "@/components/ui";

/** Asset status → Badge tone. */
const ASSET_TONE = {
    ACTIVE: "success",
    IN_USE: "info",
    MAINTENANCE: "warning",
    DISPOSED: "danger",
};
function AssetStatusBadge({ status }) {
    return (
        <Badge tone={ASSET_TONE[status] || "neutral"} soft>
            {status ?? "—"}
        </Badge>
    );
}

/**
 * Inline searchable asset picker. Lists available assets at the hospital
 * level (assetApi.getAvailable) and assigns one to the room on click.
 * Closes on outside click and on successful assign.
 */
function AssignAssetDropdown({ hospitalId, roomId, onAssigned }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [assigning, setAssigning] = useState(null);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const fetchAvailable = useCallback(
        async (q) => {
            setLoading(true);
            try {
                const data = await assetApi.getAvailable(hospitalId, q || undefined);
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        },
        [hospitalId]
    );

    const onFocus = () => {
        setOpen(true);
        fetchAvailable(query);
    };

    const onChange = (val) => {
        setQuery(val);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchAvailable(val), 300);
    };

    const assign = async (asset) => {
        setAssigning(asset.assetId);
        try {
            await assetApi.assignToRoom(asset.assetId, roomId, hospitalId);
            onAssigned();
            setQuery("");
            setOpen(false);
        } finally {
            setAssigning(null);
        }
    };

    return (
        <div ref={ref} className="relative">
            <div className="hms-room-asset-search">
                <Search size={14} className="hms-room-asset-search__icon" />
                <input
                    value={query}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={onFocus}
                    placeholder="Search available assets…"
                    className="hms-room-asset-search__input"
                />
            </div>

            {open && (
                <div className="hms-room-asset-dropdown">
                    {loading ? (
                        <div className="hms-room-asset-dropdown__loading">
                            <Spinner size={14} className="zu-spinner" /> Searching…
                        </div>
                    ) : results.length === 0 ? (
                        <div className="hms-room-asset-dropdown__empty">
                            No available assets found
                        </div>
                    ) : (
                        results.map((a) => (
                            <button
                                key={a.assetId}
                                disabled={!!assigning}
                                onClick={() => assign(a)}
                                className="hms-room-asset-dropdown__item"
                            >
                                <div className="hms-room-asset-dropdown__item-row">
                                    <div className="min-w-0">
                                        <p className="hms-room-asset-dropdown__name">
                                            {a.assetName}
                                        </p>
                                        <p className="hms-room-asset-dropdown__sub">
                                            {a.assetCode}
                                            {a.make ? ` · ${a.make}` : ""}
                                            {a.model ? ` ${a.model}` : ""}
                                        </p>
                                    </div>
                                    <div className="hms-room-asset-dropdown__tail">
                                        <AssetStatusBadge status={a.status} />
                                        {assigning === a.assetId ? (
                                            <Spinner
                                                size={12}
                                                className="zu-spinner text-gray-700"
                                            />
                                        ) : (
                                            <Plus size={12} className="text-success" />
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

/** Multi-bed rooms get an inline beds list with per-bed attender control. */
function BedsSection({ room, hospitalId }) {
    const [beds, setBeds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingAttender, setEditingAttender] = useState(null);

    const loadBeds = useCallback(async () => {
        if (!room?.id || !hospitalId) return;
        setLoading(true);
        try {
            const data = await bedApi.getByRoom(room.id, hospitalId);
            setBeds(data);
        } catch {
            setBeds([]);
        } finally {
            setLoading(false);
        }
    }, [room?.id, hospitalId]);

    useEffect(() => {
        loadBeds();
    }, [loadBeds]);

    if (loading) {
        return (
            <div className="hms-room-inline-loader">
                <Spinner size={16} className="zu-spinner" />
                <span className="hms-room-inline-loader__text">Loading beds…</span>
            </div>
        );
    }

    if (beds.length === 0) return null;

    // A bed reads as occupied if EITHER an admission has bed_id=this.id
    // OR the bed's room is held by a bed-less admission (roomLocked). The
    // earlier `b.occupied` alone missed the room-level lock — a 3-bed room
    // held by a legacy "admit to whole room" flow rendered as 0/3 here.
    const occupiedCount = beds.filter((b) => b.occupied || b.roomLocked).length;
    const occupancyTone =
        occupiedCount === beds.length ? "danger" : occupiedCount > 0 ? "warning" : "success";

    return (
        <div>
            <div className="hms-room-panel-section-row">
                <div className="flex items-center gap-2">
                    <BedDouble size={14} className="text-gray-400" />
                    <p className="hms-room-panel-section-head__label">
                        Beds
                    </p>
                    <Badge tone={occupancyTone} soft>
                        {occupiedCount}/{beds.length} occupied
                    </Badge>
                </div>
            </div>

            <div className="hms-room-bed-list">
                {beds.map((bed) => {
                    const occupied = bed.occupied;
                    // roomLocked means the bed's room is held by a bed-less
                    // admission. The bed has no patient name on it (the lock
                    // doesn't specify which bed), but the bed is NOT freely
                    // assignable — so render it as "held by room admission"
                    // with the muted visual treatment of an occupied bed.
                    const heldByRoomLock = !occupied && bed.roomLocked;
                    return (
                        <div
                            key={bed.id}
                            className={`hms-room-bed${occupied || heldByRoomLock ? " is-occupied" : ""}`}
                        >
                            <div className="hms-room-bed__row">
                                <div className="hms-room-bed__lead">
                                    <div
                                        className={`hms-room-bed__dot${occupied || heldByRoomLock ? " is-occupied" : ""}`}
                                    />
                                    <div className="min-w-0">
                                        <p className="hms-room-bed__number">
                                            {bed.bedNumber}
                                        </p>
                                        {bed.patientName ? (
                                            <p className="hms-room-bed__name">
                                                {bed.patientName}
                                            </p>
                                        ) : heldByRoomLock ? (
                                            <p className="hms-room-bed__name" title="The whole room is held by an admission without a specific bed assignment">
                                                Held by room admission
                                            </p>
                                        ) : (
                                            <p className="hms-room-bed__name is-available">
                                                Available
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {occupied && bed.admissionId && (
                                    <button
                                        type="button"
                                        onClick={() => setEditingAttender(bed)}
                                        className="hms-room-bed__btn"
                                        title={bed.attenderName ? "Edit attender" : "Assign attender"}
                                    >
                                        <Pencil size={12} />
                                        {bed.attenderName ? "Edit attender" : "Add attender"}
                                    </button>
                                )}
                            </div>
                            {occupied && bed.attenderName && (
                                <div className="hms-room-bed__attender">
                                    <Users size={12} className="text-gray-400" />
                                    <span className="hms-room-bed__attender-name">
                                        {bed.attenderName}
                                    </span>
                                    {bed.attenderRelationship && (
                                        <Badge tone="neutral" soft>
                                            {bed.attenderRelationship}
                                        </Badge>
                                    )}
                                    {bed.attenderPhone && (
                                        <span className="hms-room-bed__attender-phone">
                                            <Phone size={12} />
                                            {bed.attenderPhone}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {editingAttender && (
                <AssignAttenderModal
                    admissionId={editingAttender.admissionId}
                    label={`Bed ${editingAttender.bedNumber} · Room ${room.roomNumber}`}
                    existing={{
                        name: editingAttender.attenderName,
                        phone: editingAttender.attenderPhone,
                        relationship: editingAttender.attenderRelationship,
                    }}
                    onClose={() => setEditingAttender(null)}
                    onSuccess={() => {
                        setEditingAttender(null);
                        loadBeds();
                    }}
                />
            )}
        </div>
    );
}

/**
 * Right-edge detail panel for a single room. Used by /rooms/allocation —
 * the parent owns the open state and passes the selected room object.
 * Phase 9 migration: data layer untouched (assetApi.getByRoom/getAvailable/
 * assignToRoom/unassignFromRoom, bedApi.getByRoom). Sticky positioning and
 * scroll behaviour preserved.
 */
function RoomDetailPanel({ room, onClose, onViewLogs }) {
    const { user } = useAuth();
    const hospitalId = user?.hospitalId;

    const [assets, setAssets] = useState([]);
    const [assetsLoading, setAssetsLoading] = useState(false);
    const [removingId, setRemovingId] = useState(null);
    const [showAssign, setShowAssign] = useState(false);
    const [showAssets, setShowAssets] = useState(false);

    const loadAssets = useCallback(async () => {
        if (!room?.id || !hospitalId) return;
        setAssetsLoading(true);
        try {
            const data = await assetApi.getByRoom(hospitalId, room.id);
            setAssets(data);
        } catch {
            setAssets([]);
        } finally {
            setAssetsLoading(false);
        }
    }, [room?.id, hospitalId]);

    useEffect(() => {
        loadAssets();
    }, [loadAssets]);

    const handleUnassign = async (assetId) => {
        setRemovingId(assetId);
        try {
            await assetApi.unassignFromRoom(assetId);
            await loadAssets();
        } finally {
            setRemovingId(null);
        }
    };

    // The list endpoint doesn't ship the `beds` array on RoomDto — multi-bed
    // detection must use the new bedsTotal field. Fallback to the old check
    // covers any caller that hands a fully-hydrated room (e.g. RoomDetailPanel
    // standalone use).
    const bedsTotal    = room.bedsTotal ?? (room.beds?.length ?? 0);
    const bedsOccupied = room.bedsOccupied ?? 0;
    const isMultiBed   = bedsTotal > 1;
    const isPartial    = isMultiBed && bedsOccupied > 0 && !room.occupied;

    const sectionLabel = (Icon, label, suffix) => (
        <div className="hms-room-panel-section-head">
            <Icon size={14} className="text-gray-400" />
            <p className="hms-room-panel-section-head__label">
                {label}
                {suffix}
            </p>
        </div>
    );

    return (
        <div className="hms-room-panel">
            {/* Header */}
            <div className="hms-room-panel__head">
                <div>
                    <p className="hms-room-panel__eyebrow">
                        {room.roomNumber}
                    </p>
                    <div className="hms-room-panel__badges">
                        <Badge tone={room.roomType === "ICU" ? "danger" : "neutral"} soft>
                            {room.roomType}
                        </Badge>
                        <Badge
                            tone={room.occupied ? "info" : isPartial ? "warning" : "success"}
                            soft
                        >
                            {room.underMaintenance
                                ? "Maintenance"
                                : room.occupied
                                    ? "Occupied"
                                    : isPartial
                                        ? `${bedsOccupied}/${bedsTotal} occupied`
                                        : "Available"}
                        </Badge>
                        {isMultiBed && (
                            <Badge tone="neutral" soft>
                                {bedsTotal} beds
                            </Badge>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="hms-modal-close"
                    aria-label="Close"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="hms-room-panel__body">
                {/* allocation token removed */}

                {!isMultiBed && room.approxDischargeTime && (
                    <div className="hms-room-panel-chip is-warning">
                        <div className="hms-room-panel-chip__label is-warning">
                            <CalendarClock size={14} /> Est. discharge
                        </div>
                        <p className="hms-room-panel-chip__value is-warning">
                            {formatDateTime(room.approxDischargeTime)}
                        </p>
                    </div>
                )}

                {isMultiBed && <BedsSection room={room} hospitalId={hospitalId} />}

                {!isMultiBed && (
                    <div>
                        {sectionLabel(User, "Patient", "")}
                        {room.currentPatient ? (
                            <div className="hms-room-panel-patient">
                                <p className="hms-room-panel-patient__name">
                                    {room.currentPatient.firstName} {room.currentPatient.lastName}
                                </p>
                                <p className="hms-room-panel-patient__uhid">
                                    {fmtId(room.currentPatient.uhid)}
                                </p>
                            </div>
                        ) : (
                            <p className="hms-room-panel-empty">
                                No patient assigned
                            </p>
                        )}
                    </div>
                )}

                <div className="hms-room-panel__divider" />

                {!isMultiBed && (
                    <div>
                        {sectionLabel(Users, "Attender", "")}
                        {room.attenderName ? (
                            <div className="hms-room-panel-attender">
                                <div className="hms-room-panel-attender__row">
                                    <p className="hms-room-panel-attender__name">
                                        {room.attenderName}
                                    </p>
                                    {room.attenderRelationship && (
                                        <Badge tone="neutral" soft>
                                            {room.attenderRelationship}
                                        </Badge>
                                    )}
                                </div>
                                {room.attenderPhone && (
                                    <div className="hms-room-panel-attender__phone">
                                        <Phone size={12} />
                                        {room.attenderPhone}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="hms-room-panel-empty is-warning">
                                No attender assigned
                            </p>
                        )}
                    </div>
                )}

                <div className="hms-room-panel__divider" />

                {/* Assets */}
                <div>
                    <div 
                        className="hms-room-panel-section-row"
                        onClick={() => setShowAssets(!showAssets)}
                        style={{ cursor: "pointer", opacity: 0.8 }}
                    >
                        <div className="flex items-center gap-2">
                            <Package size={14} className="text-gray-400" />
                            <p className="hms-room-panel-section-head__label">
                                Assets in room {showAssets ? "(hide)" : "(show)"}
                            </p>
                            {assets.length > 0 && (
                                <Badge tone="neutral" soft>
                                    {assets.length}
                                </Badge>
                            )}
                        </div>
                    </div>

                    {showAssets && (
                        <div className="mt-2">
                            {assetsLoading ? (
                                <div className="hms-room-inline-loader">
                                    <Spinner size={16} className="zu-spinner" />
                                    <span className="hms-room-inline-loader__text">Loading assets…</span>
                                </div>
                            ) : assets.length === 0 ? (
                                <div className="hms-room-asset-empty">
                                    <Package size={24} className="text-gray-300 mb-1.5" />
                                    <p className="hms-room-asset-empty__text">
                                        No assets assigned yet
                                    </p>
                                </div>
                            ) : (
                                <div className="hms-room-asset-list">
                                    {assets.map((a) => (
                                        <div key={a.assetId} className="hms-room-asset">
                                            <div className="hms-room-asset__icon">
                                                <Package size={14} />
                                            </div>
                                            <div className="hms-room-asset__body">
                                                <div className="hms-room-asset__title-row">
                                                    <p className="hms-room-asset__title">
                                                        {a.assetName}
                                                    </p>
                                                </div>
                                                <div className="hms-room-asset__meta">
                                                    {a.assetCode && (
                                                        <span className="hms-room-asset__meta-item">
                                                            <Tag size={10} />
                                                            {a.assetCode}
                                                        </span>
                                                    )}
                                                    {(a.make || a.model) && (
                                                        <span className="hms-room-asset__meta-item">
                                                            {[a.make, a.model].filter(Boolean).join(" ")}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="hms-room-asset__foot">
                                                    <AssetStatusBadge status={a.status} />
                                                    <a
                                                        href={`https://asset.zenohosp.com/assets/${a.assetId}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hms-room-asset__link"
                                                        title="View in Assets app"
                                                    >
                                                        Details <ArrowUpRight size={10} />
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="hms-room-panel__footer">
                <Button variant="secondary" full onClick={onViewLogs}>
                    <ScrollText size={14} /> View room logs
                </Button>
            </div>
        </div>
    );
}

export default RoomDetailPanel;

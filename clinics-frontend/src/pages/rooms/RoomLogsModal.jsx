import { useState, useEffect, useCallback } from "react";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { useAuth } from "@/context/AuthContext";
import { roomLogsApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { Bed, User, Users, CalendarClock, PlusCircle, LogOut, UserCheck, UserCog,  } from "lucide-react";
import { timeAgo, fmtDateTime } from "@/utils/date";
import { Badge, Button, Modal, SearchBar } from "@/components/ui";

const EVENT_META = {
    ROOM_CREATED: { label: "Room created", tone: "warning", icon: PlusCircle },
    ALLOCATED: { label: "Allocated", tone: "success", icon: Bed },
    DEALLOCATED: { label: "Deallocated", tone: "neutral", icon: LogOut },
    ATTENDER_ASSIGNED: { label: "Attender assigned", tone: "info", icon: UserCheck },
    ATTENDER_UPDATED: { label: "Attender updated", tone: "neutral", icon: UserCog },
};

const formatRelative = timeAgo;
const formatFull = fmtDateTime;

/**
 * Room logs modal — read-only event timeline for a single room (when
 * roomId is provided) or hospital-wide (no roomId). Phase 9 migration:
 * data layer untouched (roomLogsApi.getRoomLogs / getHospitalLogs),
 * debounced search, same scoping rule that filters client-side when a
 * roomId is provided.
 */
function RoomLogsModal({ onClose, roomId, roomNumber }) {
    const { user } = useAuth();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    const fetchLogs = useCallback(async () => {
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            const data = roomId
                ? await roomLogsApi.getRoomLogs(roomId, user.hospitalId)
                : await roomLogsApi.getHospitalLogs(
                    user.hospitalId,
                    debouncedSearch || undefined
                );
            setLogs(data);
        } catch {
            setLogs([]);
        } finally {
            setLoading(false);
        }
    }, [user?.hospitalId, roomId, debouncedSearch]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const filteredLogs =
        roomId && debouncedSearch
            ? logs.filter((l) => {
                const s = debouncedSearch.toLowerCase();
                return (
                    l.roomNumber?.toLowerCase().includes(s) ||
                    l.patientName?.toLowerCase().includes(s) ||
                    l.patientUhid?.toLowerCase().includes(s) ||
                    l.attenderName?.toLowerCase().includes(s) ||
                    l.performedBy?.toLowerCase().includes(s)
                );
            })
            : logs;

    const title = roomId ? `Logs · Room ${roomNumber}` : "Room logs";

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="xl"
            title={
                <div>
                    <p className="hms-rooms-modal-title">
                        {title}
                    </p>
                    <p className="hms-rooms-modal-sub">
                        {loading
                            ? "Loading…"
                            : `${filteredLogs.length} event${filteredLogs.length !== 1 ? "s" : ""}`}
                    </p>
                </div>
            }
            footer={
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            }
        >
            <div className="hms-rooms-form">
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by room, patient, UHID, attender or performed by…"
                />

                {loading ? (
                    <div className="hms-rooms-log-modal-loader">
                        <TableSkeleton rows={6} columns={5} />
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="hms-rooms-log-modal-empty">
                        <CalendarClock size={32} className="opacity-40" />
                        <p className="m-0 text-13">No logs found</p>
                    </div>
                ) : (
                    <div className="hms-rooms-log-modal-list">
                        {filteredLogs.map((log) => {
                            const meta = EVENT_META[log.event] || {
                                label: log.event,
                                tone: "neutral",
                                icon: Bed,
                            };
                            const Icon = meta.icon;
                            return (
                                <div key={log.id} className="hms-rooms-log-modal-row">
                                    <div className="hms-rooms-log-modal-row__icon">
                                        <Icon size={14} />
                                    </div>
                                    <div className="hms-rooms-log-modal-row__body">
                                        <div className="hms-rooms-log-modal-row__head">
                                            <Badge tone={meta.tone} soft>
                                                {meta.label}
                                            </Badge>
                                            <span className="hms-rooms-log-modal-row__room">
                                                {log.roomNumber}
                                            </span>
                                            {log.allocationToken && (
                                                <span className="hms-rooms-log-modal-row__token">
                                                    {log.allocationToken}
                                                </span>
                                            )}
                                        </div>
                                        <div className="hms-rooms-log-modal-row__meta">
                                            {log.patientName && (
                                                <div className="hms-rooms-log-modal-row__chip">
                                                    <User size={12} className="text-gray-500 shrink-0" />
                                                    <span className="font-medium">
                                                        {log.patientName}
                                                    </span>
                                                    {log.patientUhid && (
                                                        <span className="text-gray-500">
                                                            · {fmtId(log.patientUhid)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {log.attenderName && (
                                                <div className="hms-rooms-log-modal-row__chip">
                                                    <Users size={12} className="text-gray-500 shrink-0" />
                                                    <span>{log.attenderName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="hms-rooms-log-modal-row__aside">
                                        {log.performedBy && (
                                            <p className="hms-rooms-log-modal-row__performer">
                                                {log.performedBy}
                                            </p>
                                        )}
                                        <p
                                            className="hms-rooms-log-modal-row__time-ago"
                                            title={formatFull(log.createdAt)}
                                        >
                                            {formatRelative(log.createdAt)}
                                        </p>
                                        <p className="hms-rooms-log-modal-row__time-full">
                                            {formatFull(log.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Modal>
    );
}

export { RoomLogsModal as default };

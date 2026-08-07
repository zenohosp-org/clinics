import { useState, useEffect, useCallback } from "react";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { roomLogsApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import { Bed, User, Users, PlusCircle, LogOut, UserCheck, UserCog, CalendarClock,  } from "lucide-react";
import { timeAgo, fmtDateTime } from "@/utils/date";
import {
    Badge,
    Card,
    PageHeader,
    Pagination,
    SearchBar,
} from "@/components/ui";

const PAGE_SIZE = 30;

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
 * Room activity log — paginated event timeline, optionally scoped to
 * a single room via ?roomId=&roomNumber= query params. Phase 9
 * migration: data layer untouched (roomLogsApi.getRoomLogs/
 * getHospitalLogs), debounced search, 30-row pagination.
 */
function RoomLogsPage() {
    const [searchParams] = useSearchParams();
    const { user } = useAuth();

    const roomId = searchParams.get("roomId")
        ? Number(searchParams.get("roomId"))
        : undefined;
    const roomNumber = searchParams.get("roomNumber") ?? undefined;

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 300);
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

    const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);

    return (
        <div className="zu-page">
            <PageHeader
                title={
                    roomNumber
                        ? `Room ${roomNumber} — activity log`
                        : "Room activity log"
                }
                subtitle={
                    loading
                        ? "Loading…"
                        : `${filteredLogs.length} event${filteredLogs.length !== 1 ? "s" : ""}`
                }
            />

            <div className="zu-page-content">
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by room, patient, UHID, attender or performed by…"
                />

                <Card className="hms-rooms-log-table">
                    <div className="hms-rooms-log-table__head">
                        {["Event", "Patient", "Attender", "Performed by", "Time"].map((h, i) => (
                            <p
                                key={h}
                                className={
                                    "hms-rooms-log-table__head-cell" +
                                    (i === 4 ? " is-right" : "")
                                }
                            >
                                {h}
                            </p>
                        ))}
                    </div>

                    {loading ? (
                        <TableSkeleton rows={8} columns={5} />
                    ) : filteredLogs.length === 0 ? (
                        <div className="hms-rooms-log-empty">
                            <CalendarClock size={40} className="opacity-30" />
                            <p className="hms-rooms-log-empty__text">No log entries found</p>
                            {search && (
                                <p className="hms-rooms-log-empty__hint">
                                    Try clearing the search filter
                                </p>
                            )}
                        </div>
                    ) : (
                        <div>
                            {paginatedLogs.map((log) => {
                                const meta = EVENT_META[log.event] || {
                                    label: log.event,
                                    tone: "neutral",
                                    icon: Bed,
                                };
                                const Icon = meta.icon;
                                return (
                                    <div key={log.id} className="hms-rooms-log-row">
                                        <div className="hms-rooms-log-row__event">
                                            <div>
                                                <Badge tone={meta.tone} soft>
                                                    {meta.label}
                                                </Badge>
                                                <p className="hms-rooms-log-row__room">
                                                    {log.roomNumber}
                                                    {log.allocationToken && (
                                                        <span className="hms-rooms-log-row__token">
                                                            #{log.allocationToken}
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div>
                                            {log.patientName ? (
                                                <div className="flex items-start gap-1.5">
                                                    <div>
                                                        <p className="hms-rooms-log-row__pat-name">
                                                            {log.patientName}
                                                        </p>
                                                        {log.patientUhid && (
                                                            <p className="hms-rooms-log-row__pat-uhid">
                                                                {fmtId(log.patientUhid)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="hms-rooms-log-row__dash">—</p>
                                            )}
                                        </div>

                                        <div>
                                            {log.attenderName ? (
                                                <div className="flex items-center gap-1.5">
                                                    <p className="hms-rooms-log-row__att-name">
                                                        {log.attenderName}
                                                    </p>
                                                </div>
                                            ) : (
                                                <p className="hms-rooms-log-row__dash">—</p>
                                            )}
                                        </div>

                                        <div>
                                            {log.performedBy ? (
                                                <p className="hms-rooms-log-row__performer">
                                                    {log.performedBy}
                                                </p>
                                            ) : (
                                                <p className="hms-rooms-log-row__dash">—</p>
                                            )}
                                        </div>

                                        <div className="hms-rooms-log-row__time">
                                            <p
                                                className="hms-rooms-log-row__time-ago"
                                                title={formatFull(log.createdAt)}
                                            >
                                                {formatRelative(log.createdAt)}
                                            </p>
                                            <p className="hms-rooms-log-row__time-full">
                                                {formatFull(log.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!loading && filteredLogs.length > 0 && totalPages > 1 && (
                        <div className="hms-rooms-log-pagination">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={filteredLogs.length}
                                pageSize={PAGE_SIZE}
                                onPageChange={setPage}
                            />
                        </div>
                    )}
                </Card>
            
                    </div>
        </div>
    );
}

export { RoomLogsPage as default };

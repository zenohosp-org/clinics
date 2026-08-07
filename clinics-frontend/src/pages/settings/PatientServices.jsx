import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { patientServicesApi } from "@/utils/api";
import PatientServiceFormModal from "@/components/modals/PatientServiceFormModal";
import {
    MoreHorizontal,
    Trash2,
    Pencil,
    ToggleLeft,
    ToggleRight,
    ConciergeBell,
} from "lucide-react";
import {
    Badge,
    Button,
    Menu,
    PageHeader,
    Pagination,
    SearchBar,
    Table,
} from "@/components/ui";

const PAGE_SIZE = 30;

const TYPE_LABEL = {
    FOOD: "Food",
    ROOM_SERVICE: "Room service",
    CONVENIENCE: "Convenience",
    CUSTOM: "Custom",
    REGISTRATION: "Registration",
};

/** Service type → Badge tone. */
const TYPE_TONE = {
    FOOD: "warning",
    ROOM_SERVICE: "info",
    CONVENIENCE: "violet",
    CUSTOM: "neutral",
    REGISTRATION: "info",
};

function priceLabel(service) {
    if (service.type === "FOOD") return `₹${service.pricePerMeal ?? 0}/meal`;
    if (service.type === "REGISTRATION" && service.oneTimeCharge)
        return `₹${service.pricePerDay ?? 0} one-time`;
    return `₹${service.pricePerDay ?? 0}/day`;
}

function mealTimeLabel(mealTime) {
    if (!mealTime) return "—";
    return mealTime.charAt(0) + mealTime.slice(1).toLowerCase();
}

/**
 * Patient services catalogue — food / room-service / convenience /
 * custom / registration fees that get auto-billed during admissions.
 */
export default function PatientServices() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [editService, setEditService] = useState(null);

    const load = async () => {
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            const data = await patientServicesApi.list(user.hospitalId);
            setServices(data || []);
        } catch {
            notify("Failed to load patient services", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const handleDelete = async (service) => {
        if (!confirm(`Remove "${service.name}"? This cannot be undone.`)) return;
        try {
            await patientServicesApi.delete(service.id);
            notify("Service removed", "success");
            load();
        } catch {
            notify("Failed to remove service", "error");
        }
    };

    const handleToggle = async (service) => {
        try {
            await patientServicesApi.toggleStatus(service.id);
            notify(`Service ${service.isActive ? "disabled" : "enabled"}`, "success");
            load();
        } catch {
            notify("Failed to update service status", "error");
        }
    };

    const filtered = services.filter((s) => {
        const q = search.toLowerCase();
        return (
            s.name.toLowerCase().includes(q) ||
            TYPE_LABEL[s.type]?.toLowerCase().includes(q) ||
            (s.mealTime ?? "").toLowerCase().includes(q)
        );
    });

    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    const openEdit = (s) => {
        setEditService(s);
        setShowModal(true);
    };

    const columns = [
        {
            header: "Service",
            width: "32%",
            render: (s) => (
                <div className="flex items-center gap-3">
                    <span className="hms-icon-tile is-md">
                        <ConciergeBell size={16} />
                    </span>
                    <p className="m-0 font-semibold text-gray-900 text-14">{s.name}</p>
                </div>
            ),
        },
        {
            header: "Type",
            width: "16%",
            render: (s) => (
                <Badge tone={TYPE_TONE[s.type] || "neutral"} soft>
                    {TYPE_LABEL[s.type] ?? s.type}
                </Badge>
            ),
        },
        {
            header: "Meal time",
            width: "14%",
            render: (s) => (
                <span className="text-13 text-gray-600">{mealTimeLabel(s.mealTime)}</span>
            ),
        },
        {
            header: "Price",
            width: "16%",
            render: (s) => (
                <span className="text-13 font-semibold text-gray-700">{priceLabel(s)}</span>
            ),
        },
        {
            header: "Status",
            width: "12%",
            render: (s) => (
                <Badge tone={s.isActive ? "success" : "danger"} soft>
                    {s.isActive ? "Active" : "Inactive"}
                </Badge>
            ),
        },
        {
            header: "",
            width: "10%",
            align: "right",
            render: (s) => (
                <Menu
                    triggerIcon={<MoreHorizontal size={18} />}
                    triggerLabel="Row actions"
                    align="right"
                    items={[
                        {
                            label: "Edit service",
                            icon: <Pencil size={14} />,
                            onClick: () => openEdit(s),
                        },
                        {
                            label: s.isActive ? "Disable" : "Enable",
                            icon: s.isActive ? (
                                <ToggleLeft size={14} className="text-warning" />
                            ) : (
                                <ToggleRight size={14} className="text-success" />
                            ),
                            onClick: () => handleToggle(s),
                        },
                        { divider: true },
                        {
                            label: "Remove",
                            icon: <Trash2 size={14} />,
                            tone: "danger",
                            onClick: () => handleDelete(s),
                        },
                    ]}
                />
            ),
        },
    ];

    const titleNode = (
        <span className="inline-flex items-center gap-3">
            Patient services
            <Badge tone="success">{services.length} total</Badge>
        </span>
    );

    return (
        <div className="zu-page">
            <PageHeader
                title={titleNode}
                actions={
                    <Button
                        variant="primary"
                        onClick={() => {
                            setEditService(null);
                            setShowModal(true);
                        }}
                    >
                        + Add service
                    </Button>
                }
            />

            <div className="zu-page-content">
                <SearchBar
                    value={search}
                    onChange={(v) => {
                        setSearch(v);
                        setPage(1);
                    }}
                    placeholder="Search by name or type…"
                />

                <Table
                    columns={columns}
                    data={paginated}
                    loading={loading}
                    emptyMessage={
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <ConciergeBell size={22} />
                            </span>
                            <div className="hms-cell-empty__text">
                                {search
                                    ? "No services match your search."
                                    : "No patient services configured yet."}
                            </div>
                            {!search && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        setEditService(null);
                                        setShowModal(true);
                                    }}
                                >
                                    + Add first service
                                </Button>
                            )}
                        </div>
                    }
                    onRowClick={(row) => openEdit(row)}
                />

                {!loading && filtered.length > 0 && totalPages > 1 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={filtered.length}
                        pageSize={PAGE_SIZE}
                        onPageChange={setPage}
                    />
                )}
            

            <PatientServiceFormModal
                isOpen={showModal}
                onClose={() => {
                    setShowModal(false);
                    setEditService(null);
                }}
                service={editService}
                hospitalId={user?.hospitalId}
                onSuccess={load}
            />
                    </div>
        </div>
    );
}

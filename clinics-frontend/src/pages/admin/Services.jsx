import { useState, useEffect, useMemo } from "react";
import {
    Plus,
    Filter,
    MoreHorizontal,
    Edit2,
    Trash2,
    Power,
    AlertTriangle,
    Settings2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { hospitalServiceApi, departmentApi } from "@/utils/api";
import {
    Alert,
    Badge,
    Button,
    Menu,
    Modal,
    PageHeader,
    Pagination,
    SearchBar,
    Table,
} from "@/components/ui";
import AddServiceModal from "@/components/modals/AddServiceModal";
import ServiceFilters from "@/components/specializations/ServiceFilters";

const PAGE_SIZE = 30;

/**
 * Services — admin metadata list (catalogue + per-hospital pricing).
 * Data layer, RBAC gate, filter behaviour, pagination math, status-
 * toggle, and delete pipeline preserved byte-for-byte.
 */
function Services() {
    const { user } = useAuth();
    const { notify } = useNotification();

    const [services, setServices] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [modal, setModal] = useState({ open: false, service: null });
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({
        departments: [],
        amountRange: "",
        statuses: [],
    });

    const loadData = async () => {
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            const [svcData, deptData] = await Promise.all([
                hospitalServiceApi.list(user.hospitalId),
                departmentApi.list(user.hospitalId),
            ]);
            setServices(svcData);
            setDepartments(deptData);
        } catch {
            notify("Failed to load services", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const getDeptName = (id) =>
        departments.find((d) => d.id === id)?.name || "—";

    // Only active departments are offered when creating/editing a service, but
    // the full list still backs getDeptName() above so a service already tied
    // to a since-deactivated department keeps showing its name in the table.
    const activeDepartments = useMemo(
        () => departments.filter((d) => d.isActive),
        [departments]
    );

    const filteredServices = useMemo(() => {
        return services.filter((s) => {
            const deptName = getDeptName(s.departmentId);
            const q = search.toLowerCase();
            const matchesSearch =
                s.name.toLowerCase().includes(q) || deptName.toLowerCase().includes(q);
            const matchesDept =
                activeFilters.departments.length === 0 ||
                activeFilters.departments.includes(deptName);
            const matchesStatus =
                activeFilters.statuses.length === 0 ||
                (activeFilters.statuses.includes("Active") && s.isActive) ||
                (activeFilters.statuses.includes("Inactive") && !s.isActive);
            let matchesPrice = true;
            if (activeFilters.amountRange) {
                const price = s.price;
                if (activeFilters.amountRange === "0-100") matchesPrice = price <= 100;
                else if (activeFilters.amountRange === "101-200")
                    matchesPrice = price > 100 && price <= 200;
                else if (activeFilters.amountRange === "201-500")
                    matchesPrice = price > 200 && price <= 500;
                else if (activeFilters.amountRange === "501+") matchesPrice = price > 500;
            }
            return matchesSearch && matchesDept && matchesStatus && matchesPrice;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [services, search, activeFilters, departments]);

    const paginated = filteredServices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(filteredServices.length / PAGE_SIZE);

    const handleToggleStatus = async (id) => {
        try {
            await hospitalServiceApi.toggleStatus(id);
            setServices((prev) =>
                prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
            );
            notify("Status updated", "success");
        } catch {
            notify("Failed to toggle status", "error");
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) return;
        try {
            await hospitalServiceApi.delete(confirmDelete.id);
            setServices((prev) => prev.filter((s) => s.id !== confirmDelete.id));
            notify("Service deleted", "success");
        } catch {
            notify("Failed to delete service", "error");
        } finally {
            setConfirmDelete(null);
        }
    };

    const hasActiveFilters =
        activeFilters.departments.length > 0 ||
        !!activeFilters.amountRange ||
        activeFilters.statuses.length > 0;

    const columns = [
        {
            header: "Service name",
            width: "28%",
            render: (s) => (
                <span className="font-bold text-gray-900 text-14">{s.name}</span>
            ),
        },
        {
            header: "Department",
            width: "22%",
            render: (s) => (
                <Badge tone="neutral" soft>
                    {getDeptName(s.departmentId)}
                </Badge>
            ),
        },
        {
            header: "Price",
            width: "14%",
            render: (s) => (
                <span className="font-bold text-gray-900">₹{s.price}</span>
            ),
        },
        {
            header: "GST %",
            width: "12%",
            render: (s) =>
                Number(s.gstRate || 0) > 0 ? (
                    <Badge tone="info" soft>
                        {Number(s.gstRate)}%
                    </Badge>
                ) : (
                    <span className="text-gray-300">—</span>
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
            width: "12%",
            align: "right",
            render: (s) => (
                <Menu
                    triggerIcon={<MoreHorizontal size={18} />}
                    triggerLabel="Row actions"
                    align="right"
                    items={[
                        {
                            label: "Edit service",
                            icon: <Edit2 size={14} />,
                            onClick: () => setModal({ open: true, service: s }),
                        },
                        {
                            label: s.isActive ? "Deactivate" : "Activate",
                            icon: <Power size={14} />,
                            onClick: () => handleToggleStatus(s.id),
                        },
                        { divider: true },
                        {
                            label: "Delete service",
                            icon: <Trash2 size={14} />,
                            tone: "danger",
                            onClick: () => setConfirmDelete(s),
                        },
                    ]}
                />
            ),
        },
    ];

    const titleNode = (
        <span className="inline-flex items-center gap-3">
            Services
            <Badge tone="info">{services.length} total</Badge>
        </span>
    );

    return (
        <div className="zu-page">
            <PageHeader
                title={titleNode}
                actions={
                    <Button
                        variant="primary"
                        onClick={() => setModal({ open: true, service: null })}
                    >
                        <Plus size={14} strokeWidth={2.4} /> New service
                    </Button>
                }
            />

            <div className="zu-page-content">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <SearchBar
                            value={search}
                            onChange={(v) => {
                                setSearch(v);
                                setPage(1);
                            }}
                            placeholder="Search by service name or department…"
                        />
                    </div>
                    <div className="relative">
                        <Button
                            variant="secondary"
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            aria-pressed={hasActiveFilters}
                            className={hasActiveFilters ? "active" : ""}
                        >
                            <Filter size={14} /> Filters
                            {hasActiveFilters && (
                                <span
                                    aria-hidden="true"
                                    className="inline-block w-1.5 h-1.5 rounded-full bg-info ml-1"
                                />
                            )}
                        </Button>
                        <ServiceFilters
                            isOpen={isFilterOpen}
                            onClose={() => setIsFilterOpen(false)}
                            onFilter={(f) => {
                                setActiveFilters(f);
                                setPage(1);
                            }}
                            departments={departments}
                        />
                    </div>
                </div>

                <Table
                    columns={columns}
                    data={paginated}
                    loading={loading}
                    emptyMessage={
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <Settings2 size={22} />
                            </span>
                            <div className="hms-cell-empty__text">
                                {search || hasActiveFilters
                                    ? "No services match your search."
                                    : "No services added yet."}
                            </div>
                        </div>
                    }
                />

                {!loading && filteredServices.length > 0 && totalPages > 1 && (
                    <div className="pt-1">
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={filteredServices.length}
                            pageSize={PAGE_SIZE}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            

            {modal.open && (
                <AddServiceModal
                    isOpen={modal.open}
                    onClose={() => setModal({ open: false, service: null })}
                    service={modal.service}
                    departments={activeDepartments}
                    onSuccess={loadData}
                />
            )}

            <Modal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                size="sm"
                title="Delete service"
                footer={
                    <>
                        <Button variant="cancel" onClick={() => setConfirmDelete(null)}>
                            Keep service
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Delete service
                        </Button>
                    </>
                }
            >
                <Alert tone="danger" icon={<AlertTriangle size={16} />}>
                    This will permanently remove the service. Existing invoices referencing it
                    will not be affected.
                </Alert>
                {confirmDelete && (
                    <div className="hms-confirm-summary">
                        <span className="hms-icon-tile is-sm">
                            <Settings2 size={16} />
                        </span>
                        <div className="min-w-0">
                            <div className="hms-confirm-summary__title">
                                {confirmDelete.name}
                            </div>
                            <div className="hms-confirm-summary__sub">
                                ₹{confirmDelete.price}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
                    </div>
        </div>
    );
}

export { Services as default };

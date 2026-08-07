import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { doctorsApi, staffApi } from "@/utils/api";
import DoctorFormModal from "@/components/modals/DoctorFormModal";
import {
    MoreHorizontal,
    CheckCircle,
    XCircle,
    Trash2,
    Stethoscope,
    Pencil,
    AlertTriangle,
    ExternalLink,
} from "lucide-react";
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
    TableSkeleton,
} from "@/components/ui";

const PAGE_SIZE = 30;

/**
 * Doctors — hospital staff roster scoped to role=DOCTOR. Same data
 * layer, auth gates and kebab-menu options as the pre-migration page.
 */
function DoctorsList() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const navigate = useNavigate();
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editDoctor, setEditDoctor] = useState(null);
    const [confirmRemove, setConfirmRemove] = useState(null);
    const [page, setPage] = useState(1);

    const load = () => {
        if (!user?.hospitalId) return;
        doctorsApi
            .list(user.hospitalId)
            .then(setDoctors)
            .catch(() => notify("Failed to load doctors", "error"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const handleDelete = async () => {
        if (!confirmRemove) return;
        try {
            await doctorsApi.delete(confirmRemove.id);
            notify("Doctor profile removed", "success");
            load();
        } catch {
            notify("Failed to remove doctor profile", "error");
        } finally {
            setConfirmRemove(null);
        }
    };

    const handleDeactivate = async (userId) => {
        await staffApi.deactivate(userId);
        notify("Account deactivated", "info");
        load();
    };

    const handleActivate = async (userId) => {
        await staffApi.activate(userId);
        notify("Account activated", "success");
        load();
    };

    const filtered = doctors.filter((d) => {
        const q = search.toLowerCase();
        return (
            d.firstName.toLowerCase().includes(q) ||
            (d.lastName ?? "").toLowerCase().includes(q) ||
            (d.email ?? "").toLowerCase().includes(q) ||
            (d.specialization ?? "").toLowerCase().includes(q)
        );
    });

    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    const renderInitials = (firstName, lastName) => {
        const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
        return <span className="hms-avatar is-md is-info">{initials}</span>;
    };

    const columns = [
        {
            header: "Doctor",
            width: "28%",
            render: (d) => (
                <div className="hms-entity-row">
                    {renderInitials(d.firstName, d.lastName)}
                    <div className="hms-entity-row__body">
                        <div className="hms-entity-row__title">
                            Dr. {d.firstName} {d.lastName}
                        </div>
                        <div className="hms-entity-row__sub">
                            {d.qualification || "N/A"}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            header: "Specialization",
            width: "16%",
            render: (d) => (
                <span className="text-13 text-gray-600">
                    {d.specialization || "General"}
                </span>
            ),
        },
        {
            header: "Contact",
            width: "24%",
            render: (d) => (
                <div>
                    <div className="text-13 text-gray-600">{d.email}</div>
                    <div className="text-12 text-gray-500 mt-1">{d.phone}</div>
                </div>
            ),
        },
        {
            header: "Status",
            width: "12%",
            render: (d) => (
                <Badge tone={d.userIsActive ? "success" : "danger"} soft>
                    {d.userIsActive ? "Active" : "Inactive"}
                </Badge>
            ),
        },
        {
            header: "",
            width: "8%",
            align: "right",
            render: (d) => (
                <Menu
                    triggerIcon={<MoreHorizontal size={18} />}
                    triggerLabel="Row actions"
                    align="right"
                    items={[
                        {
                            label: "Edit profile",
                            icon: <Pencil size={14} />,
                            onClick: () => setEditDoctor(d),
                        },
                        {
                            label: "View profile",
                            icon: <ExternalLink size={14} />,
                            onClick: () => navigate(`/doctors/${d.id}`),
                        },
                        { divider: true },
                        d.userIsActive
                            ? {
                                label: "Deactivate login",
                                icon: <XCircle size={14} />,
                                onClick: () => handleDeactivate(d.userId),
                            }
                            : {
                                label: "Activate login",
                                icon: <CheckCircle size={14} />,
                                onClick: () => handleActivate(d.userId),
                            },
                        { divider: true },
                        {
                            label: "Remove profile",
                            icon: <Trash2 size={14} />,
                            tone: "danger",
                            onClick: () => setConfirmRemove(d),
                        },
                    ]}
                />
            ),
        },
    ];

    return (
        <div className="zu-page">
            <PageHeader
                title={
                    <span className="inline-flex items-center gap-3">
                        Doctors
                        <Badge tone="info">{doctors.length} total</Badge>
                    </span>
                }
                actions={
                    <Button variant="primary" onClick={() => setShowModal(true)}>
                        + Add doctor
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
                    placeholder="Search by name, email or specialization…"
                />

                <Table
                    columns={columns}
                    data={paginated}
                    loading={loading}
                    emptyMessage={
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <Stethoscope size={22} />
                            </span>
                            <div className="hms-cell-empty__text">
                                {search
                                    ? "No doctors match your search."
                                    : "No doctors linked to this hospital."}
                            </div>
                        </div>
                    }
                />

                {!loading && filtered.length > 0 && totalPages > 1 && (
                    <div className="pt-1">
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={filtered.length}
                            pageSize={PAGE_SIZE}
                            onPageChange={setPage}
                        />
                    </div>
                )}
            

            {showModal && (
                <DoctorFormModal
                    onClose={() => setShowModal(false)}
                    onSaved={() => {
                        setShowModal(false);
                        load();
                    }}
                />
            )}

            {editDoctor && (
                <DoctorFormModal
                    editDoctor={editDoctor}
                    onClose={() => setEditDoctor(null)}
                    onSaved={() => {
                        setEditDoctor(null);
                        load();
                    }}
                />
            )}

            <Modal
                isOpen={!!confirmRemove}
                onClose={() => setConfirmRemove(null)}
                size="sm"
                title="Remove doctor profile"
                footer={
                    <>
                        <Button variant="cancel" onClick={() => setConfirmRemove(null)}>
                            Keep profile
                        </Button>
                        <Button variant="danger" onClick={handleDelete}>
                            Remove profile
                        </Button>
                    </>
                }
            >
                <Alert tone="danger" icon={<AlertTriangle size={16} />}>
                    This unlinks the doctor from this hospital. The login account and all
                    clinical records remain intact.
                </Alert>
                {confirmRemove && (
                    <div className="hms-confirm-summary">
                        {renderInitials(confirmRemove.firstName, confirmRemove.lastName)}
                        <div className="min-w-0">
                            <div className="hms-confirm-summary__title">
                                Dr. {confirmRemove.firstName} {confirmRemove.lastName}
                            </div>
                            <div className="hms-confirm-summary__sub">
                                {confirmRemove.specialization || "General"}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
                    </div>
        </div>
    );
}

export { DoctorsList as default };

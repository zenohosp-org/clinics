import { useState, useEffect, useMemo } from "react";
import { Plus, MoreHorizontal, Edit, Trash2, Stethoscope } from "lucide-react";
import { format, parseISO } from "date-fns";
import { specializationApi } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import {
    Badge,
    Button,
    Menu,
    PageHeader,
    SearchBar,
    Table,
} from "@/components/ui";
import AddSpecializationModal from "@/components/modals/AddSpecializationModal";

/**
 * Specializations — admin metadata list. Data layer, RBAC contract,
 * API surface and modal hand-off are byte-for-byte identical to the
 * pre-migration page; only the presentation has changed.
 */
function Specializations() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [specializations, setSpecializations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSpec, setEditingSpec] = useState(null);

    const loadData = async () => {
        if (!user?.hospitalId) return;
        setIsLoading(true);
        try {
            const data = await specializationApi.list(user.hospitalId);
            setSpecializations(data);
        } catch {
            notify("Failed to load specializations", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const filteredSpecs = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return specializations.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description?.toLowerCase().includes(q)
        );
    }, [specializations, searchQuery]);

    const handleDelete = async (id) => {
        if (!confirm("Are you sure you want to delete this specialization?")) return;
        try {
            await specializationApi.delete(id);
            notify("Specialization deleted", "success");
            loadData();
        } catch {
            notify("Failed to delete specialization", "error");
        }
    };

    const openAdd = () => {
        setEditingSpec(null);
        setIsModalOpen(true);
    };

    const openEdit = (spec) => {
        setEditingSpec(spec);
        setIsModalOpen(true);
    };

    const columns = [
        {
            header: "Specialization",
            width: "40%",
            render: (spec) => (
                <div className="hms-entity-row">
                    <span className="hms-avatar is-md">
                        <Stethoscope size={18} strokeWidth={2} />
                    </span>
                    <div className="hms-entity-row__body">
                        <div className="hms-entity-row__title">{spec.name}</div>
                        {spec.description && (
                            <div className="hms-entity-row__sub" title={spec.description}>
                                {spec.description}
                            </div>
                        )}
                    </div>
                </div>
            ),
        },
        {
            header: "Created date",
            width: "22%",
            render: (spec) => format(parseISO(spec.createdAt), "dd MMM yyyy"),
        },
        {
            header: "No. of doctors",
            width: "20%",
            align: "right",
            render: (spec) => (
                <span className="font-bold text-gray-700">{spec.noOfDoctor}</span>
            ),
        },
        {
            header: "",
            width: "18%",
            align: "right",
            render: (spec) => (
                <Menu
                    triggerIcon={<MoreHorizontal size={18} />}
                    triggerLabel="Row actions"
                    align="right"
                    items={[
                        {
                            label: "Edit details",
                            icon: <Edit size={14} />,
                            onClick: () => openEdit(spec),
                        },
                        { divider: true },
                        {
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            tone: "danger",
                            onClick: () => handleDelete(spec.id),
                        },
                    ]}
                />
            ),
        },
    ];

    const titleNode = (
        <span className="inline-flex items-center gap-3">
            Specializations
            <Badge tone="success">Total: {specializations.length}</Badge>
        </span>
    );

    return (
        <div className="zu-page">
            <PageHeader
                title={titleNode}
                actions={
                    <Button variant="primary" onClick={openAdd}>
                        <Plus size={14} strokeWidth={2.4} />
                        Add new specialization
                    </Button>
                }
            />

            <div className="zu-page-content">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search by name or description…"
                />

                <Table
                    columns={columns}
                    data={filteredSpecs}
                    loading={isLoading}
                    emptyMessage={
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <Stethoscope size={22} />
                            </span>
                            <div className="hms-cell-empty__text">
                                {searchQuery
                                    ? "No specializations match your search."
                                    : "No specializations yet. Add the first one to get started."}
                            </div>
                        </div>
                    }
                />
            

            <AddSpecializationModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingSpec(null);
                }}
                onSuccess={loadData}
                initialData={editingSpec}
            />
                    </div>
        </div>
    );
}

export { Specializations as default };

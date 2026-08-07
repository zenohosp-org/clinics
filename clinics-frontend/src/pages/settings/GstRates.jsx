import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { gstRateApi } from "@/utils/api";
import GstRateFormModal from "@/components/modals/GstRateFormModal";
import {
    MoreHorizontal,
    Trash2,
    Pencil,
    ToggleLeft,
    ToggleRight,
    Star,
    Percent,
} from "lucide-react";
import {
    Badge,
    Button,
    Menu,
    PageHeader,
    SearchBar,
    Table,
} from "@/components/ui";

function pct(value) {
    const n = Number(value || 0);
    return `${n}%`;
}

/**
 * Per-hospital GST rate presets — the tax slabs (CGST/SGST/IGST/CESS)
 * available when invoicing services and medicines.
 */
export default function GstRates() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const [rates, setRates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [editRate, setEditRate] = useState(null);

    const load = async () => {
        if (!user?.hospitalId) return;
        setLoading(true);
        try {
            const data = await gstRateApi.list(user.hospitalId);
            setRates(data || []);
        } catch {
            notify("Failed to load GST rates", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.hospitalId]);

    const handleDelete = async (rate) => {
        if (!confirm(`Remove "${rate.name}"? This cannot be undone.`)) return;
        try {
            await gstRateApi.delete(rate.id);
            notify("GST rate removed", "success");
            load();
        } catch {
            notify("Failed to remove GST rate", "error");
        }
    };

    const handleToggle = async (rate) => {
        try {
            await gstRateApi.toggle(rate.id);
            notify(`GST rate ${rate.isActive ? "disabled" : "enabled"}`, "success");
            load();
        } catch {
            notify("Failed to update GST rate status", "error");
        }
    };

    const handleSetDefault = async (rate) => {
        try {
            await gstRateApi.setDefault(rate.id);
            notify(`"${rate.name}" set as default`, "success");
            load();
        } catch {
            notify("Failed to set default GST rate", "error");
        }
    };

    const filtered = rates.filter((r) =>
        r.name.toLowerCase().includes(search.toLowerCase())
    );

    const openEdit = (r) => {
        setEditRate(r);
        setShowModal(true);
    };

    const columns = [
        {
            header: "Name",
            width: "26%",
            render: (r) => (
                <div className="flex items-center gap-3">
                    <span className="hms-icon-tile is-md">
                        <Percent size={16} />
                    </span>
                    <p className="m-0 font-semibold text-gray-900 text-14">{r.name}</p>
                </div>
            ),
        },
        {
            header: "Rate",
            width: "12%",
            render: (r) => (
                <Badge tone="info" soft>{pct(r.ratePercent)}</Badge>
            ),
        },
        {
            header: "CGST",
            width: "10%",
            render: (r) => <span className="text-13 text-gray-600">{pct(r.cgstPercent)}</span>,
        },
        {
            header: "SGST",
            width: "10%",
            render: (r) => <span className="text-13 text-gray-600">{pct(r.sgstPercent)}</span>,
        },
        {
            header: "IGST",
            width: "10%",
            render: (r) => <span className="text-13 text-gray-600">{pct(r.igstPercent)}</span>,
        },
        {
            header: "Cess",
            width: "10%",
            render: (r) => <span className="text-13 text-gray-600">{pct(r.cessPercent)}</span>,
        },
        {
            header: "Status",
            width: "12%",
            render: (r) => (
                <div className="flex items-center gap-2">
                    {r.isDefault && (
                        <Badge tone="warning" soft>
                            <Star size={12} className="mr-1 inline" />
                            Default
                        </Badge>
                    )}
                    <Badge tone={r.isActive ? "success" : "danger"} soft>
                        {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                </div>
            ),
        },
        {
            header: "",
            width: "10%",
            align: "right",
            render: (r) => (
                <Menu
                    triggerIcon={<MoreHorizontal size={18} />}
                    triggerLabel="Row actions"
                    align="right"
                    items={[
                        {
                            label: "Edit rate",
                            icon: <Pencil size={14} />,
                            onClick: () => openEdit(r),
                        },
                        ...(!r.isDefault
                            ? [{
                                label: "Set as default",
                                icon: <Star size={14} />,
                                onClick: () => handleSetDefault(r),
                            }]
                            : []),
                        {
                            label: r.isActive ? "Disable" : "Enable",
                            icon: r.isActive ? (
                                <ToggleLeft size={14} className="text-warning" />
                            ) : (
                                <ToggleRight size={14} className="text-success" />
                            ),
                            onClick: () => handleToggle(r),
                        },
                        { divider: true },
                        {
                            label: "Remove",
                            icon: <Trash2 size={14} />,
                            tone: "danger",
                            onClick: () => handleDelete(r),
                        },
                    ]}
                />
            ),
        },
    ];

    const titleNode = (
        <span className="inline-flex items-center gap-3">
            GST rates
            <Badge tone="success">{rates.length} total</Badge>
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
                            setEditRate(null);
                            setShowModal(true);
                        }}
                    >
                        + Add GST rate
                    </Button>
                }
            />

            <div className="zu-page-content">
                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search by name…"
                />

                <Table
                    columns={columns}
                    data={filtered}
                    loading={loading}
                    emptyMessage={
                        <div className="hms-cell-empty">
                            <span className="hms-cell-empty__icon">
                                <Percent size={22} />
                            </span>
                            <div className="hms-cell-empty__text">
                                {search
                                    ? "No GST rates match your search."
                                    : "No GST rate presets configured yet."}
                            </div>
                            {!search && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => {
                                        setEditRate(null);
                                        setShowModal(true);
                                    }}
                                >
                                    + Add first GST rate
                                </Button>
                            )}
                        </div>
                    }
                    onRowClick={(row) => openEdit(row)}
                />

                <GstRateFormModal
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setEditRate(null);
                    }}
                    rate={editRate}
                    hospitalId={user?.hospitalId}
                    onSuccess={load}
                />
            </div>
        </div>
    );
}

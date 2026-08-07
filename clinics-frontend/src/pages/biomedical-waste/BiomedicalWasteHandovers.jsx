import { useEffect, useMemo, useState } from "react";
import { Truck, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { bioMedicalWasteApi } from "@/utils/api";
import { PageHeader, Button, Table } from "@/components/ui";
import RecordHandoverModal from "@/components/modals/RecordHandoverModal";

function parseMetadata(metadata) {
  if (!metadata) return {};
  try {
    return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  } catch {
    return {};
  }
}

const fmtKg = (v) => `${Number(v ?? 0).toFixed(2)} kg`;
const fmtCurrency = (v) => `₹${Number(v ?? 0).toFixed(2)}`;

export default function BiomedicalWasteHandovers() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const hospitalId = user?.hospitalId;

  const [handovers, setHandovers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);

  const reload = async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const [h, cats] = await Promise.all([
        bioMedicalWasteApi.listHandovers(hospitalId, {
          from: dateFrom || undefined,
          to: dateTo || undefined,
        }),
        bioMedicalWasteApi.listLookups(hospitalId, "WASTE_CATEGORY").catch(() => []),
      ]);
      setHandovers(h);
      setCategories(cats);
    } catch {
      notify("Failed to load handovers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, dateFrom, dateTo]);

  const categoryMeta = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.code] = { label: c.label, color: parseMetadata(c.metadata).color };
    });
    return map;
  }, [categories]);

  const columns = [
    {
      header: "Date",
      width: "9%",
      render: (h) => <span className="text-sm text-gray-700">{h.handoverDate}</span>,
    },
    {
      header: "Vendor / CTF",
      width: "16%",
      render: (h) => <span className="font-semibold text-gray-900">{h.vendorName}</span>,
    },
    {
      header: "Manifest #",
      width: "8%",
      render: (h) => (
        <div className="flex flex-col">
          <span className="text-sm text-gray-700">{h.manifestNumber || "—"}</span>
          {h.invoiceNumber && <span className="text-xs text-gray-400">Inv: {h.invoiceNumber}</span>}
        </div>
      ),
    },
    {
      header: "Vehicle #",
      width: "8%",
      render: (h) => <span className="text-sm text-gray-700">{h.vehicleNumber || "—"}</span>,
    },
    {
      header: "Total",
      width: "9%",
      align: "right",
      render: (h) => <span className="text-sm text-gray-900 tabular-nums font-semibold">{fmtKg(h.totalWeightKg)}</span>,
    },
    {
      header: "Cost",
      width: "8%",
      align: "right",
      render: (h) => <span className="text-sm text-gray-900 tabular-nums">{h.costAmount != null ? fmtCurrency(h.costAmount) : "—"}</span>,
    },
    {
      header: "Category breakdown",
      width: "18%",
      render: (h) => (
        <div className="hms-bmw-breakdown">
          {Object.entries(h.categoryBreakdown || {}).map(([code, kg]) => (
            <span key={code} className="hms-bmw-breakdown-chip" style={{ "--chip-color": categoryMeta[code]?.color }}>
              <span className="hms-bmw-breakdown-chip__dot" />
              {categoryMeta[code]?.label || code}: {fmtKg(kg)}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: "Received by",
      width: "9%",
      render: (h) => <span className="text-sm text-gray-700">{h.receivedByName || "—"}</span>,
    },
    {
      header: "Recorded by",
      width: "13%",
      render: (h) => (
        <span className="text-sm text-gray-700">
          {h.logCount} entr{h.logCount === 1 ? "y" : "ies"} · {h.createdByUserName || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="zu-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Truck size={20} className="text-emerald-600" />
            Biomedical Waste — Handovers
          </span>
        }
        actions={
          <Button variant="primary" onClick={() => setRecordOpen(true)}>
            <Plus size={14} /> Record handover
          </Button>
        }
      />

      <div className="zu-page-content">
        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <input type="date" className="zu-filter-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className="zu-filter-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          </div>
        </div>

        <Table
          columns={columns}
          data={handovers}
          loading={loading}
          rowKey={(h) => h.id}
          emptyMessage={
            <div className="hms-cell-empty">
              <span className="hms-cell-empty__icon"><Truck size={22} /></span>
              <div className="hms-cell-empty__text">
                {dateFrom || dateTo
                  ? "No handovers match your filters."
                  : "No handovers recorded yet. Record one from pending waste log entries."}
              </div>
            </div>
          }
        />
      </div>

      <RecordHandoverModal
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        hospitalId={hospitalId}
        onSuccess={reload}
      />
    </div>
  );
}

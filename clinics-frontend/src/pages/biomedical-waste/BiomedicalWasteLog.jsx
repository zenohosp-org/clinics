import { useEffect, useMemo, useState } from "react";
import { Trash2, Plus, MoreHorizontal, Calendar, CalendarDays, Clock, Hourglass } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { bioMedicalWasteApi } from "@/utils/api";
import { Badge, Button, Menu, PageHeader, Table } from "@/components/ui";
import AddWasteLogModal from "@/components/modals/AddWasteLogModal";

function parseMetadata(metadata) {
  if (!metadata) return {};
  try {
    return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  } catch {
    return {};
  }
}

const fmtKg = (v) => `${Number(v ?? 0).toFixed(2)} kg`;

export default function BiomedicalWasteLog() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const hospitalId = user?.hospitalId;

  const [logs, setLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [points, setPoints] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [pointFilter, setPointFilter] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [editLog, setEditLog] = useState(null);

  const reload = async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const [l, cats, pts, s] = await Promise.all([
        bioMedicalWasteApi.listLogs(hospitalId, {
          from: dateFrom || undefined,
          to: dateTo || undefined,
          categoryCode: categoryFilter || undefined,
          generationPointCode: pointFilter || undefined,
        }),
        bioMedicalWasteApi.listLookups(hospitalId, "WASTE_CATEGORY").catch(() => []),
        bioMedicalWasteApi.listLookups(hospitalId, "GENERATION_POINT").catch(() => []),
        bioMedicalWasteApi.getStats(hospitalId).catch(() => null),
      ]);
      setLogs(l);
      setCategories(cats);
      setPoints(pts);
      setStats(s);
    } catch {
      notify("Failed to load biomedical waste data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, dateFrom, dateTo, categoryFilter, pointFilter]);

  const categoryMeta = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.code] = { label: c.label, color: parseMetadata(c.metadata).color };
    });
    return map;
  }, [categories]);

  const handleDelete = async (entry) => {
    if (!window.confirm(`Delete the ${fmtKg(entry.weightKg)} ${entry.categoryLabel} entry from ${entry.logDate}?`)) return;
    try {
      await bioMedicalWasteApi.deleteLog(entry.id, hospitalId);
      notify("Entry deleted", "success");
      reload();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to delete entry", "error");
    }
  };

  const columns = [
    {
      header: "Date",
      width: "10%",
      render: (l) => <span className="text-sm text-gray-700">{l.logDate}</span>,
    },
    {
      header: "Category",
      width: "20%",
      render: (l) => {
        const meta = categoryMeta[l.categoryCode];
        return (
          <span className="hms-bmw-category-badge" style={{ "--chip-color": meta?.color }}>
            <span className="hms-bmw-category-badge__dot" />
            {l.categoryLabel}
          </span>
        );
      },
    },
    {
      header: "Generation point",
      width: "18%",
      render: (l) => <span className="text-sm text-gray-700">{l.generationPointLabel}</span>,
    },
    {
      header: "Weight",
      width: "10%",
      align: "right",
      render: (l) => <span className="text-sm text-gray-900 tabular-nums">{fmtKg(l.weightKg)}</span>,
    },
    {
      header: "Bags",
      width: "8%",
      align: "right",
      render: (l) => <span className="text-sm text-gray-700 tabular-nums">{l.bagCount ?? "—"}</span>,
    },
    {
      header: "Collected by",
      width: "16%",
      render: (l) => <span className="text-sm text-gray-700">{l.collectedByUserName || "—"}</span>,
    },
    {
      header: "Status",
      width: "12%",
      render: (l) => (
        <span className={`hms-bmw-status ${l.status === "PENDING" ? "is-pending" : "is-handed-over"}`}>
          {l.status === "PENDING" ? "Pending" : "Handed over"}
        </span>
      ),
    },
    {
      header: "",
      width: "6%",
      align: "right",
      render: (l) => {
        const items = l.status === "PENDING"
          ? [
              { label: "Edit", onClick: () => setEditLog(l) },
              { label: "Delete", onClick: () => handleDelete(l), tone: "danger" },
            ]
          : [{ label: "No actions available", disabled: true }];
        return <Menu triggerIcon={<MoreHorizontal size={18} />} triggerLabel="Row actions" align="right" items={items} />;
      },
    },
  ];

  return (
    <div className="zu-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Trash2 size={20} className="text-emerald-600" />
            Biomedical Waste — Daily Log
            <Badge tone="warning">{fmtKg(stats?.pendingKg)} pending</Badge>
          </span>
        }
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add entry
          </Button>
        }
      />

      <div className="zu-page-content">
        <div className="hms-bmw-stats">
          <div className="hms-bmw-stat">
            <div className="hms-bmw-stat__label">
              <span className="inline-flex items-center gap-1"><Clock size={12} /> Today</span>
            </div>
            <div className="hms-bmw-stat__value">{fmtKg(stats?.todayKg)}</div>
            <div className="hms-bmw-stat__hint">Collected today</div>
          </div>
          <div className="hms-bmw-stat">
            <div className="hms-bmw-stat__label">
              <span className="inline-flex items-center gap-1"><Calendar size={12} /> This week</span>
            </div>
            <div className="hms-bmw-stat__value">{fmtKg(stats?.weekKg)}</div>
            <div className="hms-bmw-stat__hint">Since Monday</div>
          </div>
          <div className="hms-bmw-stat">
            <div className="hms-bmw-stat__label">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> This month</span>
            </div>
            <div className="hms-bmw-stat__value">{fmtKg(stats?.monthKg)}</div>
            <div className="hms-bmw-stat__hint">Month-to-date</div>
          </div>
          <div className="hms-bmw-stat is-warn">
            <div className="hms-bmw-stat__label">
              <span className="inline-flex items-center gap-1"><Hourglass size={12} /> Pending handover</span>
            </div>
            <div className="hms-bmw-stat__value">{fmtKg(stats?.pendingKg)}</div>
            <div className="hms-bmw-stat__hint">Awaiting vendor pickup</div>
          </div>
        </div>

        <div className="hms-bmw-category-strip">
          {categories.map((c) => {
            const meta = parseMetadata(c.metadata);
            const pending = stats?.pendingByCategory?.[c.code] ?? 0;
            const isActive = categoryFilter === c.code;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => setCategoryFilter(isActive ? "" : c.code)}
                className={`hms-bmw-category-chip ${isActive ? "is-active" : ""}`}
                style={{ "--chip-color": meta.color }}
              >
                <div className="hms-bmw-category-chip__label">{c.label}</div>
                <div className="hms-bmw-category-chip__meta" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <span className="hms-bmw-category-chip__value">{fmtKg(pending)}</span>
                  <span className="hms-bmw-category-chip__hint">pending</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <input type="date" className="zu-filter-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className="zu-filter-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
          </div>
          <div className="zu-filter-bar__controls" style={{ marginLeft: "auto" }}>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="zu-filter-select">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <select value={pointFilter} onChange={(e) => setPointFilter(e.target.value)} className="zu-filter-select">
              <option value="">All generation points</option>
              {points.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Table
          columns={columns}
          data={logs}
          loading={loading}
          rowKey={(l) => l.id}
          emptyMessage={
            <div className="hms-cell-empty">
              <span className="hms-cell-empty__icon"><Trash2 size={22} /></span>
              <div className="hms-cell-empty__text">
                {dateFrom || dateTo || categoryFilter || pointFilter
                  ? "No entries match your filters."
                  : "No waste logged yet. Add the first entry to get started."}
              </div>
            </div>
          }
        />
      </div>

      <AddWasteLogModal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        hospitalId={hospitalId}
        onSuccess={reload}
      />
      <AddWasteLogModal
        isOpen={!!editLog}
        onClose={() => setEditLog(null)}
        hospitalId={hospitalId}
        log={editLog}
        onSuccess={reload}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Droplet,
  Plus,
  MoreHorizontal,
  AlertTriangle,
  FlaskConical,
  History,
  Activity,
  Calendar,
  CalendarDays,
  Search,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { bloodBankApi } from "@/utils/api";
import {
  Badge,
  Button,
  Menu,
  PageHeader,
  Table,
} from "@/components/ui";
import RegisterBloodUnitModal from "@/components/modals/RegisterBloodUnitModal";
import IssueBloodUnitModal from "@/components/modals/IssueBloodUnitModal";

function tonePillClass(meta) {
  if (!meta) return "hms-bb-status is-neutral";
  try {
    const m = typeof meta === "string" ? JSON.parse(meta) : meta;
    return `hms-bb-status is-${m.tone || "neutral"}`;
  } catch {
    return "hms-bb-status is-neutral";
  }
}

const groupLabel = (code) =>
  code ? code.replace("_POS", "+").replace("_NEG", "−") : "";

// Default availability threshold below which a blood group chip is
// flagged "low"; 0 units is always flagged "critical".
const LOW_STOCK_THRESHOLD = 5;

/**
 * Blood Bank — two-view dashboard (Stock / Issue Blood).
 *
 * Layout:
 *   • zu-filter-bar holds the view tabs (pill-group, left), search
 *     (centre, grows) and filter selects (right-aligned).
 *   • Stat strip varies per tab.
 *   • Stock tab adds a horizontal "by group" availability chip strip
 *     — clicking a chip filters the bag table by that blood group.
 *   • Bag table below.
 */
export default function BloodBankStock() {
  const { user } = useAuth();
  const { notify } = useNotification();

  const [tab, setTab] = useState("stock");

  const [stats, setStats] = useState(null);
  const [units, setUnits] = useState([]);
  const [groups, setGroups] = useState([]);
  const [components, setComponents] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [componentFilter, setComponentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [issueUnit, setIssueUnit] = useState(null);

  const hospitalId = user?.hospitalId;

  const reload = async () => {
    if (!hospitalId) return;
    setLoading(true);
    try {
      const [s, u, g, c, st] = await Promise.all([
        bloodBankApi.getStats(hospitalId),
        bloodBankApi.listUnits(hospitalId, {
          groupCode: groupFilter || undefined,
          componentCode: componentFilter || undefined,
          statusCode: statusFilter || undefined,
        }),
        bloodBankApi.listLookups(hospitalId, "BLOOD_GROUP").catch(() => []),
        bloodBankApi.listLookups(hospitalId, "COMPONENT").catch(() => []),
        bloodBankApi.listLookups(hospitalId, "UNIT_STATUS").catch(() => []),
      ]);
      setStats(s);
      setUnits(u);
      setGroups(g);
      setComponents(c);
      setStatuses(st);
    } catch {
      notify("Failed to load blood bank data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId, groupFilter, componentFilter, statusFilter]);

  useEffect(() => {
    setSearch("");
    setGroupFilter("");
    setComponentFilter("");
    setStatusFilter("");
  }, [tab]);

  const statusByCode = useMemo(() => {
    const m = {};
    statuses.forEach((s) => { m[s.code] = s; });
    return m;
  }, [statuses]);

  const visibleUnits = useMemo(() => {
    if (tab === "issue") return units.filter((u) => u.statusCode === "ISSUED");
    return units.filter((u) => u.statusCode !== "ISSUED");
  }, [units, tab]);

  const filteredUnits = useMemo(() => {
    if (!search) return visibleUnits;
    const q = search.toLowerCase();
    return visibleUnits.filter(
      (u) =>
        u.bagNumber?.toLowerCase().includes(q) ||
        u.bloodGroupCode?.toLowerCase().includes(q) ||
        u.componentCode?.toLowerCase().includes(q) ||
        u.donorName?.toLowerCase().includes(q) ||
        u.issuedToPatientName?.toLowerCase().includes(q) ||
        u.issuedToAdmissionNumber?.toLowerCase().includes(q) ||
        u.issuedDoctorName?.toLowerCase().includes(q)
    );
  }, [visibleUnits, search]);

  const issuanceMetrics = useMemo(() => {
    const issued = units.filter((u) => u.statusCode === "ISSUED" && u.issuedAt);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let today = 0, week = 0, month = 0;
    issued.forEach((u) => {
      const t = new Date(u.issuedAt);
      if (t >= startOfToday) today += 1;
      if (t >= startOfWeek) week += 1;
      if (t >= startOfMonth) month += 1;
    });
    return { today, week, month, total: issued.length };
  }, [units]);

  const handleStatusChange = async (unit, newStatus) => {
    try {
      await bloodBankApi.updateStatus(unit.id, hospitalId, newStatus);
      notify(`Marked as ${newStatus.toLowerCase()}`, "success");
      reload();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to update status", "error");
    }
  };

  const handleRecordReplacement = async (unit) => {
    try {
      await bloodBankApi.recordReplacement(unit.id, hospitalId);
      notify("Replacement donation recorded", "success");
      reload();
    } catch (err) {
      notify(err?.response?.data?.message || "Failed to record replacement", "error");
    }
  };

  const stockColumns = [
    {
      header: "Bag",
      width: "18%",
      render: (u) => (
        <div>
          <div className="font-semibold text-gray-900">{u.bagNumber}</div>
          <div className="text-xs text-gray-500">{u.storageLocation || "—"}</div>
        </div>
      ),
    },
    {
      header: "Group / Component",
      width: "22%",
      render: (u) => (
        <div className="flex items-center gap-2">
          <span className="hms-bb-group">{groupLabel(u.bloodGroupCode)}</span>
          <span className="text-sm text-gray-700">{u.componentCode}</span>
        </div>
      ),
    },
    {
      header: "Status",
      width: "12%",
      render: (u) => {
        const s = statusByCode[u.statusCode];
        return <span className={tonePillClass(s?.metadata)}>{s?.label || u.statusCode}</span>;
      },
    },
    {
      header: "Expiry",
      width: "12%",
      render: (u) => (
        <span className={u.expiringSoon ? "hms-bb-expiry" : "text-gray-700"}>
          {u.expiryDate || "—"}
        </span>
      ),
    },
    {
      header: "Donor / Source",
      width: "24%",
      render: (u) => (
        <div className="text-sm">
          <div className="text-gray-900">{u.donorName || (u.sourceCode === "EXTERNAL_PURCHASE" ? "External" : "—")}</div>
          <div className="text-xs text-gray-500">{u.donorPhone || ""}</div>
        </div>
      ),
    },
    {
      header: "",
      width: "6%",
      align: "right",
      render: (u) => {
        const items = [];
        if (u.statusCode === "AVAILABLE" || u.statusCode === "RESERVED") {
          items.push({ label: "Issue to patient", onClick: () => setIssueUnit(u) });
        }
        if (u.statusCode === "QUARANTINE") {
          items.push({ label: "Mark AVAILABLE", onClick: () => handleStatusChange(u, "AVAILABLE") });
          items.push({ label: "Mark DISCARDED", onClick: () => handleStatusChange(u, "DISCARDED"), tone: "danger" });
        }
        if (u.statusCode === "AVAILABLE") {
          items.push({ label: "Reserve", onClick: () => handleStatusChange(u, "RESERVED") });
          items.push({ divider: true });
          items.push({ label: "Mark EXPIRED", onClick: () => handleStatusChange(u, "EXPIRED"), tone: "danger" });
          items.push({ label: "Discard", onClick: () => handleStatusChange(u, "DISCARDED"), tone: "danger" });
        }
        if (u.statusCode === "RESERVED") {
          items.push({ label: "Release (back to AVAILABLE)", onClick: () => handleStatusChange(u, "AVAILABLE") });
        }
        if (items.length === 0) {
          items.push({ label: "No actions available", disabled: true });
        }
        return (
          <Menu
            triggerIcon={<MoreHorizontal size={18} />}
            triggerLabel="Row actions"
            align="right"
            items={items}
          />
        );
      },
    },
  ];

  const issueColumns = [
    {
      header: "Bag",
      width: "14%",
      render: (u) => (
        <div className="font-semibold text-gray-900">{u.bagNumber}</div>
      ),
    },
    {
      header: "Group / Component",
      width: "16%",
      render: (u) => (
        <div className="flex items-center gap-2">
          <span className="hms-bb-group">{groupLabel(u.bloodGroupCode)}</span>
          <span className="text-sm text-gray-700">{u.componentCode}</span>
        </div>
      ),
    },
    {
      header: "Patient",
      width: "20%",
      render: (u) => (
        <div className="text-sm">
          <div className="text-gray-900">{u.issuedToPatientName || "—"}</div>
          {u.issuedToAdmissionNumber && (
            <div className="text-xs text-gray-500">Adm. {u.issuedToAdmissionNumber}</div>
          )}
        </div>
      ),
    },
    {
      header: "Prescribing doctor",
      width: "15%",
      render: (u) => (
        <span className="text-sm text-gray-700">{u.issuedDoctorName || "—"}</span>
      ),
    },
    {
      header: "Issued",
      width: "13%",
      render: (u) => (
        <span className="text-sm text-gray-700">
          {u.issuedAt ? u.issuedAt.slice(0, 16).replace("T", " ") : "—"}
        </span>
      ),
    },
    {
      header: "Replacements",
      width: "10%",
      align: "right",
      render: (u) => {
        const pledged = u.replacementsPledged ?? 0;
        const received = u.replacementsReceived ?? 0;
        return (
          <div className="inline-flex items-center justify-end gap-2">
            <span className="text-sm text-gray-700 tabular-nums">{received} / {pledged}</span>
            {pledged > 0 && received < pledged && (
              <button
                type="button"
                title="Record a replacement donation"
                onClick={() => handleRecordReplacement(u)}
                className="hms-bb-replacement-btn"
              >
                <Plus size={12} />
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: "Issued by",
      width: "12%",
      render: (u) => (
        <span className="text-sm text-gray-700">{u.issuedByUserName || "—"}</span>
      ),
    },
  ];

  const renderStockStats = () => (
    <div className="hms-bb-stats">
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">Total units</div>
        <div className="hms-bb-stat__value">{stats?.totalUnits ?? "—"}</div>
        <div className="hms-bb-stat__hint">Across all statuses</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">Available</div>
        <div className="hms-bb-stat__value">{stats?.availableUnits ?? "—"}</div>
        <div className="hms-bb-stat__hint">Ready to issue</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">Quarantine</div>
        <div className="hms-bb-stat__value">{stats?.quarantineUnits ?? "—"}</div>
        <div className="hms-bb-stat__hint">Awaiting TTI clearance</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">Reserved</div>
        <div className="hms-bb-stat__value">{stats?.reservedUnits ?? "—"}</div>
        <div className="hms-bb-stat__hint">Tagged for patients</div>
      </div>
      <div className="hms-bb-stat is-warn">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={12} /> Expiring soon
          </span>
        </div>
        <div className="hms-bb-stat__value">{stats?.expiringSoonUnits ?? "—"}</div>
        <div className="hms-bb-stat__hint">Within 7 days</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <FlaskConical size={12} /> Donors
          </span>
        </div>
        <div className="hms-bb-stat__value">{stats?.totalDonors ?? "—"}</div>
        <div className="hms-bb-stat__hint">Active registry</div>
      </div>
    </div>
  );

  const renderIssueStats = () => (
    <div className="hms-bb-stats">
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <Activity size={12} /> Today
          </span>
        </div>
        <div className="hms-bb-stat__value">{issuanceMetrics.today}</div>
        <div className="hms-bb-stat__hint">Bags issued</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} /> This week
          </span>
        </div>
        <div className="hms-bb-stat__value">{issuanceMetrics.week}</div>
        <div className="hms-bb-stat__hint">Since Sunday</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} /> This month
          </span>
        </div>
        <div className="hms-bb-stat__value">{issuanceMetrics.month}</div>
        <div className="hms-bb-stat__hint">Month-to-date</div>
      </div>
      <div className="hms-bb-stat">
        <div className="hms-bb-stat__label">
          <span className="inline-flex items-center gap-1">
            <History size={12} /> All-time
          </span>
        </div>
        <div className="hms-bb-stat__value">{issuanceMetrics.total}</div>
        <div className="hms-bb-stat__hint">Total issuances</div>
      </div>
    </div>
  );

  // Horizontal chip strip — one per blood group with available count.
  // Click toggles group filter (and pins status to AVAILABLE).
  // Stock-level colouring (default thresholds): 0 = critical, <5 = low.
  const renderGroupStrip = () => {
    if (!groups.length) return null;
    const matrix = stats?.stockMatrix || {};
    return (
      <div className="hms-bb-groupstrip">
        {groups.map((g) => {
          const count = Object.values(matrix[g.code] || {}).reduce((a, b) => a + b, 0);
          const isActive = groupFilter === g.code;
          const stockLevel = count === 0 ? "is-critical" : count < LOW_STOCK_THRESHOLD ? "is-low" : "";
          return (
            <button
              key={g.code}
              type="button"
              onClick={() => {
                if (isActive) {
                  setGroupFilter("");
                } else {
                  setGroupFilter(g.code);
                  setStatusFilter("AVAILABLE");
                }
              }}
              className={`hms-bb-groupstrip__chip ${isActive ? "is-active" : ""} ${stockLevel}`}
            >
              <span className="hms-bb-group">{groupLabel(g.code)}</span>
              <div className="hms-bb-groupstrip__meta">
                <span className="hms-bb-groupstrip__count">
                  {stockLevel === "is-critical" && <AlertTriangle size={12} />}
                  {count}
                </span>
                <span className="hms-bb-groupstrip__hint">{stockLevel === "is-critical" ? "critical" : stockLevel === "is-low" ? "low" : "avail"}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const titleBadge = tab === "stock"
    ? <Badge tone="info">{stats?.availableUnits ?? 0} available</Badge>
    : <Badge tone="violet">{issuanceMetrics.total} issued</Badge>;

  return (
    <div className="zu-page">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Droplet size={20} className="text-rose-500" />
            Blood Bank
            {titleBadge}
          </span>
        }
        actions={
          tab === "stock" && (
            <Button variant="primary" onClick={() => setRegisterOpen(true)}>
              <Plus size={14} /> Register bag
            </Button>
          )
        }
      />

      <div className="zu-page-content">
        {/* Unified filter bar: tabs (left) · search (centre, grows) · selects (right) */}
        <div className="zu-filter-bar">
          <div className="zu-filter-bar__controls">
            <div className="zu-pill-group">
              <button
                type="button"
                onClick={() => setTab("stock")}
                className={`zu-pill-group__btn ${tab === "stock" ? "is-active" : ""}`}
              >
                <Droplet size={13} /> Stock
                <span className="zu-pill-group__btn-count">{stats?.availableUnits ?? 0}</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("issue")}
                className={`zu-pill-group__btn ${tab === "issue" ? "is-active" : ""}`}
              >
                <History size={13} /> Issue Blood
                <span className="zu-pill-group__btn-count">{issuanceMetrics.total}</span>
              </button>
            </div>
          </div>

          <div className="zu-filter-bar__search">
            <Search className="zu-filter-bar__search-icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "stock"
                  ? "Search bag / group / donor…"
                  : "Search bag / patient / admission / doctor…"
              }
              className="zu-filter-bar__search-input"
            />
          </div>

          <div className="zu-filter-bar__controls">
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="zu-filter-select"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.code} value={g.code}>{g.label}</option>
              ))}
            </select>
            <select
              value={componentFilter}
              onChange={(e) => setComponentFilter(e.target.value)}
              className="zu-filter-select"
            >
              <option value="">All components</option>
              {components.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            {tab === "stock" && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="zu-filter-select"
              >
                <option value="">All statuses</option>
                {statuses.filter((s) => s.code !== "ISSUED").map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {tab === "stock" ? renderStockStats() : renderIssueStats()}
        {tab === "stock" && renderGroupStrip()}

        <Table
          columns={tab === "stock" ? stockColumns : issueColumns}
          data={filteredUnits}
          loading={loading}
          loadingMessage={
            <span className="text-gray-500">
              Loading {tab === "stock" ? "inventory" : "issuance history"}…
            </span>
          }
          rowClassName={(u) => tab === "stock" && u.expiringSoon ? "hms-bb-row is-expiring" : ""}
          emptyMessage={
            <div className="hms-cell-empty">
              <span className="hms-cell-empty__icon">
                {tab === "stock" ? <Droplet size={22} /> : <History size={22} />}
              </span>
              <div className="hms-cell-empty__text">
                {tab === "stock"
                  ? (search || groupFilter || componentFilter || statusFilter
                    ? "No bags match your filters."
                    : "No bags registered yet. Register the first bag to get started.")
                  : (search || groupFilter || componentFilter
                    ? "No issuances match your filters."
                    : "No bags have been issued yet. Bags issued from the Stock view will appear here.")}
              </div>
            </div>
          }
        />
      </div>

      <RegisterBloodUnitModal
        isOpen={registerOpen}
        onClose={() => setRegisterOpen(false)}
        hospitalId={hospitalId}
        onSuccess={reload}
      />
      <IssueBloodUnitModal
        isOpen={!!issueUnit}
        onClose={() => setIssueUnit(null)}
        hospitalId={hospitalId}
        unit={issueUnit}
        onSuccess={reload}
      />
    </div>
  );
}

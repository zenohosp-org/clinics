import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { ambulanceApi } from "@/utils/api";
import { fmtId } from "@/utils/idFormat";
import {
  Ambulance, Search, CheckCircle2, Clock3, XCircle,
  Truck, Activity, MapPin, Car, Phone, User
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

const STATUS_CONFIG = {
  PENDING:    { label: "Pending",    cls: "is-pending",    icon: Clock3 },
  DISPATCHED: { label: "Dispatched", cls: "is-dispatched", icon: Truck },
  EN_ROUTE:   { label: "En Route",   cls: "is-enroute",    icon: Activity },
  COMPLETED:  { label: "Completed",  cls: "is-completed",  icon: CheckCircle2 },
  CANCELLED:  { label: "Cancelled",  cls: "is-cancelled",  icon: XCircle },
};

const NEXT_STATUS = { PENDING: "DISPATCHED", DISPATCHED: "EN_ROUTE", EN_ROUTE: "COMPLETED" };
const NEXT_LABEL  = { PENDING: "Dispatch",   DISPATCHED: "En Route",  EN_ROUTE: "Complete" };
const NEXT_BTN_CLS = { PENDING: "is-blue",   DISPATCHED: "is-slate",  EN_ROUTE: "is-emerald" };

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`hms-amb-status-chip ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function StatusSelect({ current, bookingId, onUpdate }) {
  const [loading, setLoading] = useState(false);

  const advance = async () => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    setLoading(true);
    try { await ambulanceApi.updateStatus(bookingId, { status: next }); onUpdate(); }
    finally { setLoading(false); }
  };

  const cancel = async () => {
    setLoading(true);
    try { await ambulanceApi.updateStatus(bookingId, { status: "CANCELLED" }); onUpdate(); }
    finally { setLoading(false); }
  };

  if (current === "CANCELLED" || current === "COMPLETED") return <StatusPill status={current} />;

  return (
    <div className="hms-amb-status-ctrl">
      <StatusPill status={current} />
      {NEXT_STATUS[current] && (
        <button
          onClick={advance}
          disabled={loading}
          className={`hms-amb-next-btn ${NEXT_BTN_CLS[current]}`}
        >
          → {NEXT_LABEL[current]}
        </button>
      )}
      <button onClick={cancel} disabled={loading} className="hms-amb-cancel-btn">
        Cancel
      </button>
    </div>
  );
}

export default function AmbulanceStatus() {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterDate, setFilterDate] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { if (hospitalId) load(); }, [hospitalId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await ambulanceApi.getBookings(hospitalId);
      setBookings(data);
    } finally { setLoading(false); }
  };

  const filtered = bookings.filter(b => {
    if (filterStatus !== "ALL" && b.status !== filterStatus) return false;
    if (filterDate && b.bookingDate !== filterDate) return false;
    if (search) {
      const q = search.toLowerCase();
      const patientName = b.patient ? `${b.patient.firstName} ${b.patient.lastName}`.toLowerCase() : "";
      const uhid = b.patient?.uhid?.toLowerCase() || "";
      if (!patientName.includes(q) && !uhid.includes(q) && !(b.vehicleNumber || "").toLowerCase().includes(q) && !(b.driverName || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = Object.keys(STATUS_CONFIG).reduce((acc, s) => {
    acc[s] = bookings.filter(b => b.status === s).length;
    return acc;
  }, {});

  return (
    <div className="zu-page">
      <PageHeader 
        title="Ambulance Status"
        subtitle="Live dispatch tracking and status updates"
      />

      <div className="zu-page-content">
      {/* Status filter pills */}
      <div className="zu-filter-bar">
        <div className="zu-filter-bar__controls">
          <div className="zu-pill-group">
            <button 
              onClick={() => setFilterStatus("ALL")}
              className={`zu-pill-group__btn ${filterStatus === "ALL" ? "is-active" : ""}`}
            >
              All
            </button>
            {Object.entries(STATUS_CONFIG).map(([s, cfg]) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`zu-pill-group__btn ${filterStatus === s ? "is-active" : ""}`}
              >
                {counts[s] > 0 && (
                  <span className="zu-pill-group__btn-count">{counts[s]}</span>
                )}
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="zu-filter-bar">
        <div className="zu-filter-bar__search">
          <Search className="zu-filter-bar__search-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patient, driver, vehicle…"
            className="zu-filter-bar__search-input"
          />
        </div>
        <div className="zu-filter-bar__controls">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="zu-filter-date"
          />
          {filterDate && (
            <button onClick={() => setFilterDate("")} className="hms-amb-filter-date-clear">
              Clear date
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="hms-amb-status-grid">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="hms-amb-dispatch-skeleton">
              <div className="hms-amb-dispatch-skeleton__line is-title" />
              <div className="hms-amb-dispatch-skeleton__line is-sub1" />
              <div className="hms-amb-dispatch-skeleton__line is-sub2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="hms-amb-dispatch-empty">
          <div className="hms-amb-dispatch-empty__icon">
            <Ambulance className="w-12 h-10" />
          </div>
          <p className="hms-amb-dispatch-empty__title">No bookings match the filter</p>
          <p className="hms-amb-dispatch-empty__sub">Try adjusting your search or status filter</p>
        </div>
      ) : (
        <div className="hms-amb-status-grid">
          {filtered.map(b => {
            const cfg = STATUS_CONFIG[b.status];
            return (
              <div key={b.id} className="hms-amb-status-card">
                <div className={`hms-amb-status-card__stripe ${cfg.cls}`} />

                {/* Head: date + ref */}
                <div className="hms-amb-status-card__head">
                  <div>
                    <p className="hms-amb-status-card__ref">{b.bookingDate}</p>
                    <p className="hms-amb-status-card__time">{b.bookingTime}</p>
                  </div>
                  <span className="hms-amb-status-card__time">#{b.id}</span>
                </div>

                {/* Patient */}
                <div className="hms-amb-status-card__pat-block">
                  <div className="hms-amb-status-card__avatar">
                    <User className="w-3 h-3" />
                  </div>
                  {b.patient ? (
                    <div>
                      <p className="hms-amb-status-card__pat">
                        {b.patient.firstName} {b.patient.lastName}
                      </p>
                      <p className="hms-amb-status-card__time">{fmtId(b.patient.uhid)}</p>
                    </div>
                  ) : (
                    <p className="hms-amb-status-card__time">Walk-in / No patient</p>
                  )}
                </div>

                {/* Route */}
                {(b.pickupAddress || b.destinationAddress) && (
                  <div className="hms-amb-status-card__route">
                    {b.pickupAddress && (
                      <div className="hms-amb-status-card__route-row">
                        <MapPin className="w-3 h-3" />
                        <span>{b.pickupAddress}</span>
                      </div>
                    )}
                    {b.destinationAddress && (
                      <div className="hms-amb-status-card__route-row">
                        <MapPin className="w-3 h-3" />
                        <span>{b.destinationAddress}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Meta details: Type, Charge, Driver, Vehicle */}
                <div className="hms-amb-status-card__meta-grid">
                  <div className="hms-amb-status-card__meta-item">
                    <span className="hms-amb-status-card__meta-label">Type & Charge</span>
                    <span className="hms-amb-status-card__meta-value">
                      {b.ambulanceType?.name || "Standard"}
                      {b.charge && <span className="hms-amb-status-card__charge"> · ₹{b.charge}</span>}
                    </span>
                  </div>
                  
                  {(b.driverName || b.vehicleNumber) && (
                    <div className="hms-amb-status-card__meta-item">
                      <span className="hms-amb-status-card__meta-label">Driver & Vehicle</span>
                      <span className="hms-amb-status-card__meta-value">
                        {b.driverName && (
                          <span className="hms-amb-status-card__driver-item">
                            <Phone className="w-3 h-3" />
                            {b.driverName}
                          </span>
                        )}
                        {b.vehicleNumber && (
                          <span className="hms-amb-status-card__driver-item">
                            <Car className="w-3 h-3 ml-1" />
                            {b.vehicleNumber}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Status control */}
                <StatusSelect current={b.status} bookingId={b.id} onUpdate={load} />
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

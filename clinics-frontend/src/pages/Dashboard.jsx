import { CenterLoader } from "@/components/ui/Loader";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { patientApi, appointmentsApi, dashboardApi } from "@/utils/api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Calendar, ReceiptText, ChevronRight, Stethoscope, Clock,
  UserPlus, CheckCircle2, XCircle, AlertCircle, ArrowRight, IndianRupee,
  FlaskConical, LogIn, Activity,
} from "lucide-react";
import { format, subDays, parseISO, isToday as fnsIsToday } from "date-fns";
import { fmtId } from "@/utils/idFormat";

/**
 * Clinics dashboard.
 *
 * Deliberately one dashboard for every role, unlike HMS which forks into a
 * separate AdminDashboard. A clinic is an outpatient-first, single-site
 * operation — the receptionist, the doctor and the owner all care about the
 * same thing: who is in the waiting room right now. Role only changes whether
 * the money tile is visible.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Appointments carry `apptDate` (yyyy-MM-dd) + `apptTime` (HH:mm:ss) as two
 * separate columns — there is no combined timestamp field. Everything that
 * needs to sort or bucket an appointment in time goes through here.
 */
function apptDateTime(appt) {
  if (!appt?.apptDate) return null;
  try {
    return parseISO(`${appt.apptDate}T${appt.apptTime || "00:00:00"}`);
  } catch {
    return null;
  }
}

function isApptToday(appt) {
  const d = apptDateTime(appt);
  return d ? fnsIsToday(d) : false;
}

function fmtTime(appt) {
  const d = apptDateTime(appt);
  return d ? format(d, "h:mm a") : "—";
}

function buildLast14Days(items, toDate) {
  const counts = {};
  for (let i = 13; i >= 0; i--) {
    counts[format(subDays(new Date(), i), "MMM d")] = 0;
  }
  items.forEach((item) => {
    const d = toDate(item);
    if (!d) return;
    const key = format(d, "MMM d");
    if (key in counts) counts[key]++;
  });
  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Order matters — this is the clinic day as it actually unfolds, so the
// queue panel reads top-to-bottom in the order the front desk works it.
const STATUS_META = {
  SCHEDULED:   { icon: Clock,        mod: "is-info",    label: "Scheduled",   bar: "is-scheduled" },
  CHECKED_IN:  { icon: LogIn,        mod: "is-amber",   label: "Checked in",  bar: "is-scheduled" },
  IN_PROGRESS: { icon: Stethoscope,  mod: "is-neutral", label: "In consult",  bar: "is-scheduled" },
  COMPLETED:   { icon: CheckCircle2, mod: "is-emerald", label: "Completed",   bar: "is-completed" },
  CANCELLED:   { icon: XCircle,      mod: "is-rose",    label: "Cancelled",   bar: "is-cancelled" },
  NO_SHOW:     { icon: AlertCircle,  mod: "is-amber",   label: "No show",     bar: "is-no-show" },
};

const STATUS_ORDER = [
  "CHECKED_IN", "IN_PROGRESS", "SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED",
];

// Statuses that mean "this patient is physically in the clinic, unseen".
const WAITING_STATUSES = new Set(["CHECKED_IN", "IN_PROGRESS"]);

// ── Sub-components ─────────────────────────────────────────────────────────

function StatPill({ label, value, sub, icon, accent }) {
  return (
    <div className="zu-card is-stat">
      <div className={`zu-stat-card-icon ${accent}`}>{icon}</div>
      <div className="zu-stat-card-body">
        <p className="zu-stat-card-label">{label}</p>
        <p className="zu-stat-card-value">{value}</p>
        {sub && <p className="zu-stat-card-sub">{sub}</p>}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, actionLabel, actionFn }) {
  return (
    <div className="hms-dash-section-card">
      <div className="hms-dash-section-card__head">
        <div>
          <p className="hms-dash-section-card__title">{title}</p>
          {subtitle && <p className="hms-dash-section-card__sub">{subtitle}</p>}
        </div>
        {actionFn && (
          <button onClick={actionFn} className="hms-dash-section-card__action">
            {actionLabel} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusRow({ status, count, total }) {
  const meta = STATUS_META[status] ?? {
    icon: Clock, mod: "is-slate", label: status, bar: "is-default",
  };
  const Icon = meta.icon;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="hms-dash-status-row">
      <div className={`hms-dash-status-row__icon ${meta.mod}`}>
        <Icon className="w-3 h-3" />
      </div>
      <div className="hms-dash-status-row__body">
        <div className="hms-dash-status-row__head">
          <span className="hms-dash-status-row__label">{meta.label}</span>
          <span className="hms-dash-status-row__count">{count}</span>
        </div>
        <div className="hms-dash-status-row__bar">
          <div className={`hms-dash-status-row__fill ${meta.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="hms-dash-status-row__pct">{pct}%</span>
    </div>
  );
}

function QueueRow({ appt, onOpen }) {
  const meta = STATUS_META[appt.status] ?? { mod: "is-slate", label: appt.status };
  const name =
    appt.patientName ||
    [appt.patientFirstName, appt.patientLastName].filter(Boolean).join(" ") ||
    "—";
  const initials =
    (appt.patientFirstName?.[0] ?? name[0] ?? "?") +
    (appt.patientLastName?.[0] ?? "");

  return (
    <tr onClick={() => onOpen(appt)}>
      <td>
        <span className="clinic-dash-token">{appt.tokenNumber ?? "—"}</span>
      </td>
      <td>
        <div className="hms-dash-pat-cell">
          <div className="hms-dash-pat-cell__avatar">{initials}</div>
          <div>
            <p className="hms-dash-pat-cell__name">{name}</p>
            <p className="hms-dash-pat-cell__uhid">{fmtId(appt.patientUhid)}</p>
          </div>
        </div>
      </td>
      <td>
        <span className="hms-dash-time">
          <Clock className="w-3 h-3" />{fmtTime(appt)}
        </span>
      </td>
      <td>{appt.doctorName ?? "—"}</td>
      <td className="clinic-dash-complaint">{appt.chiefComplaint || "—"}</td>
      <td>
        <span className={`hms-dash-status-row__icon ${meta.mod} clinic-dash-status-chip`}>
          {meta.label}
        </span>
      </td>
    </tr>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const isDoctor = user?.role === "doctor";
  const canSeeMoney = user?.role === "hospital_admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!user?.hospitalId) return;
    let cancelled = false;

    Promise.all([
      patientApi.list(user.hospitalId).catch(() => []),
      appointmentsApi.getByHospital(user.hospitalId).catch(() => []),
      // Money tiles are admin-only, so don't even fetch the summary for a
      // doctor/staff session — it keeps one fewer request off the critical path.
      canSeeMoney ? dashboardApi.getSummary(user.hospitalId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([p, a, s]) => {
        if (cancelled) return;
        setPatients(Array.isArray(p) ? p : []);
        setAppointments(Array.isArray(a) ? a : []);
        setSummary(s);
      })
      .catch(() => {
        if (!cancelled) notify("Failed to load dashboard", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.hospitalId, canSeeMoney, notify]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const todayAppts = useMemo(
    () => appointments.filter(isApptToday),
    [appointments]
  );

  // The live queue: everyone who has physically arrived and not yet been seen,
  // earliest slot first. This is the panel the front desk actually watches.
  const queue = useMemo(
    () => todayAppts
      .filter((a) => WAITING_STATUSES.has(a.status))
      .sort((a, b) => (apptDateTime(a) ?? 0) - (apptDateTime(b) ?? 0)),
    [todayAppts]
  );

  const todayStatusCounts = useMemo(() => {
    const counts = {};
    todayAppts.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1; });
    return counts;
  }, [todayAppts]);

  const seenToday = todayStatusCounts.COMPLETED ?? 0;

  const newPatientsToday = useMemo(
    () => patients.filter((p) => {
      try { return p.createdAt && fnsIsToday(parseISO(p.createdAt)); }
      catch { return false; }
    }).length,
    [patients]
  );

  // Footfall = appointments per day, which is the number a clinic owner reads
  // as "how busy were we", rather than new-patient registrations.
  const footfall = useMemo(
    () => buildLast14Days(appointments, apptDateTime),
    [appointments]
  );

  const openAppt = useCallback((appt) => {
    navigate(appt.patientId ? `/patients/${appt.patientId}` : "/appointments");
  }, [navigate]);

  const dateStr = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) return <CenterLoader />;

  return (
    <div className="hms-dash-doctor">

      {/* ── Header ── */}
      <div className="hms-dash-doctor__header">
        <div>
          <h1 className="hms-dash-doctor__greeting">
            {greeting}, {isDoctor ? "Dr." : ""} {user?.firstName}
          </h1>
          <p className="hms-dash-doctor__subtitle">
            {user?.hospitalName} · {dateStr}
          </p>
        </div>
        <div className="clinic-dash-header-actions">
          <button onClick={() => navigate("/appointments")} className="zu-btn-secondary">
            <Calendar className="w-4 h-4" /> Book Appointment
          </button>
          <button onClick={() => navigate("/patients")} className="zu-btn-primary">
            <UserPlus className="w-4 h-4" /> Register Patient
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="hms-dash-doctor__kpis">
        <StatPill
          label="Waiting now"
          value={queue.length}
          sub={queue.length ? `Next: ${fmtTime(queue[0])}` : "Queue is clear"}
          icon={<Users className="w-4 h-4" />}
          accent={queue.length ? "is-warning" : "is-info"}
        />
        <StatPill
          label="Today's appointments"
          value={todayAppts.length}
          sub={`${seenToday} completed`}
          icon={<Calendar className="w-4 h-4" />}
          accent="is-neutral"
        />
        <StatPill
          label="New patients today"
          value={newPatientsToday}
          sub={`${patients.length.toLocaleString("en-IN")} total`}
          icon={<UserPlus className="w-4 h-4" />}
          accent="is-neutral"
        />
        {canSeeMoney ? (
          <StatPill
            label="Revenue collected"
            value={money(summary?.totalRevenueCollected)}
            sub={`${money(summary?.totalOutstandingRevenue)} outstanding`}
            icon={<IndianRupee className="w-4 h-4" />}
            accent="is-info"
          />
        ) : (
          <StatPill
            label="Patients seen"
            value={seenToday}
            sub="Completed today"
            icon={<Stethoscope className="w-4 h-4" />}
            accent="is-info"
          />
        )}
      </div>

      {/* ── Row 2: footfall trend + today's status breakdown ── */}
      <div className="hms-dash-doctor__row-2col">
        <SectionCard
          title="Clinic footfall"
          subtitle="Appointments per day — last 14 days"
          actionLabel="Appointments"
          actionFn={() => navigate("/appointments")}
        >
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={footfall} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="clinicFootfall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="hms-dash-tooltip">
                      <p className="hms-dash-tooltip__title">{label}</p>
                      <p className="hms-dash-tooltip__line">{payload[0].value} appointments</p>
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2}
                fill="url(#clinicFootfall)" dot={false}
                activeDot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard
          title="Today's schedule"
          subtitle="Where every appointment stands right now"
          actionLabel="View all"
          actionFn={() => navigate("/appointments")}
        >
          {todayAppts.length > 0 ? (
            <>
              <div className="hms-dash-status-list">
                {STATUS_ORDER
                  .filter((s) => todayStatusCounts[s])
                  .map((s) => (
                    <StatusRow
                      key={s}
                      status={s}
                      count={todayStatusCounts[s]}
                      total={todayAppts.length}
                    />
                  ))}
              </div>
              <div className="hms-dash-status-foot">
                <div className="hms-dash-status-foot__row">
                  <span>Booked today</span>
                  <span className="hms-dash-status-foot__row-strong">{todayAppts.length}</span>
                </div>
                <div className="hms-dash-status-foot__row">
                  <span>Seen so far</span>
                  <span className="hms-dash-status-foot__row-strong is-dark">
                    {Math.round((seenToday / todayAppts.length) * 100)}%
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="hms-dash-empty-chart">
              <Calendar className="w-5 h-5" />
              <p className="hms-dash-empty-chart__text">Nothing booked today</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Row 3: live waiting queue ── */}
      <div className="hms-dash-today">
        <div className="hms-dash-today__head">
          <div className="hms-dash-today__head-left">
            <Activity className="w-4 h-4 hms-dash-today__head-icon" />
            <p className="hms-dash-today__head-title">Waiting room</p>
            {queue.length > 0 && (
              <span className="hms-dash-today__head-count">{queue.length}</span>
            )}
          </div>
          <button onClick={() => navigate("/appointments")} className="hms-dash-today__head-link">
            Full schedule <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {queue.length === 0 ? (
          <div className="hms-dash-today__empty">
            <div className="hms-dash-today__empty-icon">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="hms-dash-today__empty-title">No one is waiting</p>
              <p className="hms-dash-today__empty-sub">
                Patients appear here the moment the front desk checks them in.
              </p>
            </div>
            <button onClick={() => navigate("/appointments")} className="zu-btn-primary is-sm">
              Open schedule
            </button>
          </div>
        ) : (
          <div className="hms-dash-today__table-wrap">
            <table className="hms-dash-today__table">
              <thead>
                <tr>
                  {["Token", "Patient", "Slot", "Doctor", "Complaint", "Status"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.slice(0, 10).map((a) => (
                  <QueueRow key={a.id} appt={a} onOpen={openAppt} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="hms-dash-doctor__quick-row">
        {[
          { label: "Patients", sub: "Register or find a patient", to: "/patients", icon: <Users className="w-5 h-5" />, color: "is-info" },
          { label: "Appointments", sub: "Today's schedule and booking", to: "/appointments", icon: <Calendar className="w-5 h-5" />, color: "is-neutral" },
          { label: "Investigations", sub: "Lab and radiology orders", to: "/checkups/bookings", icon: <FlaskConical className="w-5 h-5" />, color: "is-neutral" },
          { label: "Billing", sub: "Generate a patient bill", to: "/billing/opd", icon: <ReceiptText className="w-5 h-5" />, color: "is-neutral" },
        ].map((item) => (
          <button key={item.to} onClick={() => navigate(item.to)} className="hms-dash-quick">
            <div className={`hms-dash-quick__icon ${item.color}`}>{item.icon}</div>
            <div className="hms-dash-quick__body">
              <p className="hms-dash-quick__label">{item.label}</p>
              <p className="hms-dash-quick__sub">{item.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 hms-dash-quick__chev" />
          </button>
        ))}
      </div>

    </div>
  );
}

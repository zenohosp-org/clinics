import { Spinner } from "@/components/ui/Loader";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useNotification } from "@/context/NotificationContext";
import { dashboardApi } from "@/utils/api";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { Users, Stethoscope, BedDouble, TrendingUp, TrendingDown, ArrowRight, Calendar, ReceiptText, Plus, UserCheck,  } from "lucide-react";
import { Button, Card } from "@/components/ui";

/** KPI tile — icon avatar + bold number + label + optional MoM trend.
 *  The icon tile + trend pill use `.hms-kpi-card__icon` and `.hms-kpi-card__trend`
 *  modifier classes for colour tones (no inline styles). */
function KpiCard({ label, value, sub, icon, iconTone = "neutral", trend, trendLabel }) {
    const isUp = trend === "up";
    return (
        <Card className="hms-kpi-card">
            <div className="hms-kpi-card__head">
                <div className={`hms-kpi-card__icon is-${iconTone}`}>{icon}</div>
                {trendLabel && (
                    <span className={`hms-kpi-card__trend ${isUp ? "is-up" : "is-down"}`}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {trendLabel}
                    </span>
                )}
            </div>
            <div>
                <p className="hms-kpi-card__value">{value}</p>
                <p className="hms-kpi-card__label">{label}</p>
                {sub && <p className="hms-kpi-card__sub">{sub}</p>}
            </div>
        </Card>
    );
}

/** Chart container — bold title + optional subtitle + optional right-aligned
 *  action link → recharts content underneath. */
function ChartCard({ title, subtitle, children, action, actionLabel }) {
    const navigate = useNavigate();
    return (
        <Card className="hms-chart-card">
            <div className="hms-chart-card__head">
                <div>
                    <p className="hms-chart-card__title">{title}</p>
                    {subtitle && <p className="hms-chart-card__subtitle">{subtitle}</p>}
                </div>
                {action && (
                    <button
                        type="button"
                        onClick={() => navigate(action)}
                        className="hms-chart-card__action"
                    >
                        {actionLabel} <ArrowRight size={12} />
                    </button>
                )}
            </div>
            {children}
        </Card>
    );
}

function PatientTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="hms-tooltip">
            <p className="hms-tooltip__title">{label}</p>
            <p className="hms-tooltip__line text-success">
                {payload[0].value} new patients
            </p>
        </div>
    );
}

function RevenueTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="hms-tooltip">
            <p className="hms-tooltip__title mb-2">{label}</p>
            {payload.map((p) => (
                <p
                    key={p.name}
                    className={`hms-tooltip__line ${p.name === "paid" ? "is-paid" : "is-outstanding"}`}
                >
                    {p.name === "paid" ? "Paid" : "Outstanding"}: ₹
                    {Number(p.value).toLocaleString("en-IN")}
                </p>
            ))}
        </div>
    );
}

const STATUS_COLORS = {
    SCHEDULED: "#6366f1",
    COMPLETED: "#10b981",
    CANCELLED: "#f43f5e",
    NO_SHOW: "#f59e0b",
};
const ROLE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#f43f5e", "#3b82f6"];

function DonutChart({ data, colors, centerLabel, centerValue }) {
    return (
        <div className="hms-donut-wrap">
            <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                    >
                        {data.map((_, i) => (
                            <Cell key={i} fill={colors[i % colors.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        content={({ active, payload }) =>
                            active && payload?.length ? (
                                <div className="hms-tooltip">
                                    <p className="hms-tooltip__title">
                                        {payload[0].name}
                                    </p>
                                    <p
                                        className="hms-tooltip__line"
                                        style={{ color: payload[0].payload.fill ?? colors[0] }}
                                    >
                                        {payload[0].value} (
                                        {(
                                            (payload[0].value /
                                                data.reduce((s, d) => s + d.value, 0)) *
                                            100
                                        ).toFixed(1)}
                                        %)
                                    </p>
                                </div>
                            ) : null
                        }
                    />
                </PieChart>
            </ResponsiveContainer>
            {centerLabel && (
                <div className="hms-donut-center">
                    <p className="hms-donut-center__value">{centerValue}</p>
                    <p className="hms-donut-center__label">{centerLabel}</p>
                </div>
            )}
        </div>
    );
}

function LegendDot({ color, label, value, total }) {
    const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
    return (
        <div className="hms-legend-row">
            <div className="hms-legend-row__left">
                <span className="hms-legend-row__dot" style={{ background: color }} />
                <span className="hms-legend-row__label">{label}</span>
            </div>
            <div className="hms-legend-row__right">
                <span className="hms-legend-row__value">{value}</span>
                <span className="hms-legend-row__pct">{pct}%</span>
            </div>
        </div>
    );
}

/**
 * AdminDashboard — KPIs, trend charts, donuts, and quick-action launcher.
 * Rendered conditionally by pages/Dashboard.jsx when the logged-in user
 * has role hospital_admin or super_admin.
 *
 * Data layer untouched (dashboardApi.getSummary). Chart data shapes and
 * recharts configuration kept exactly the same; wrappers, tooltips, and
 * KPI / quick-action tiles use admin.css patterns (.hms-kpi-* /
 * .hms-chart-card* / .hms-tooltip* / .hms-donut-* / .hms-quick-*).
 */
export default function AdminDashboard() {
    const { user } = useAuth();
    const { notify } = useNotification();
    const navigate = useNavigate();

    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.hospitalId) return;
        setLoading(true);
        dashboardApi
            .getSummary(user.hospitalId)
            .then((data) => setSummary({
                // Normalise the whole response shape up-front so every
                // downstream access has a sensible default. Defensive
                // against a partial backend response or a fresh hospital
                // with no rows: scalars → 0 so .toLocaleString() works,
                // arrays → [] so .map/.reduce/.length work.
                totalPatients:              data?.totalPatients              ?? 0,
                todaysNewPatients:          data?.todaysNewPatients          ?? 0,
                patientMoMGrowthPercent:    data?.patientMoMGrowthPercent    ?? 0,
                totalDoctors:               data?.totalDoctors               ?? 0,
                totalActiveStaff:           data?.totalActiveStaff           ?? 0,
                totalRevenueCollected:      data?.totalRevenueCollected      ?? 0,
                totalOutstandingRevenue:    data?.totalOutstandingRevenue    ?? 0,
                activeAdmissions:           data?.activeAdmissions           ?? 0,
                appointmentsBreakdown:      data?.appointmentsBreakdown      || [],
                patientAgeGroups:           data?.patientAgeGroups           || [],
                staffByRole:                data?.staffByRole                || [],
                patientRegistrationsTrend:  data?.patientRegistrationsTrend  || [],
                revenueOverview:            data?.revenueOverview            || [],
            }))
            .catch(() => notify("Failed to load dashboard statistics", "error"))
            .finally(() => setLoading(false));
    }, [user?.hospitalId, notify]);

    const dateStr = new Date().toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    if (loading || !summary) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spinner size={32} className="text-gray-700 zu-spinner" />
            </div>
        );
    }

    const apptTotal = (summary.appointmentsBreakdown || []).reduce((sum, d) => sum + (d?.value || 0), 0);

    const quickActions = [
        { label: "Add doctor",       sub: "Register a new doctor",   to: "/doctors",           icon: <Stethoscope size={16} />, iconTone: "success" },
        { label: "Add staff",        sub: "Onboard a team member",   to: "/staffs/directory",  icon: <UserCheck size={16} />,   iconTone: "neutral" },
        { label: "Register patient", sub: "New patient registration", to: "/patients",         icon: <Users size={16} />,       iconTone: "info" },
        { label: "Create invoice",   sub: "Bill a patient visit",    to: "/billing/opd",       icon: <ReceiptText size={16} />, iconTone: "warning" },
        { label: "IPD admission",    sub: "Admit a patient",         to: "/admissions",        icon: <BedDouble size={16} />,   iconTone: "rose" },
    ];

    return (
        <div className="hms-dash">
            {/* Header */}
            <div className="hms-dash__header">
                <div>
                    <h1 className="hms-dash__greeting">
                        Good {greeting}, {user?.firstName}
                    </h1>
                    <p className="hms-dash__subtitle">
                        {user?.hospitalName} · {dateStr}
                    </p>
                </div>
                <Button variant="primary" onClick={() => navigate("/patients")}>
                    <Plus size={14} strokeWidth={2.4} /> New patient
                </Button>
            </div>

            {/* KPI row */}
            <div className="hms-kpi-grid">
                <KpiCard
                    label="Total patients"
                    value={summary.totalPatients.toLocaleString()}
                    sub={`${summary.todaysNewPatients} registered today`}
                    icon={<Users size={20} />}
                    iconTone="info"
                    trend={summary.patientMoMGrowthPercent >= 0 ? "up" : "down"}
                    trendLabel={
                        summary.patientMoMGrowthPercent !== 0.0
                            ? `${Math.abs(summary.patientMoMGrowthPercent)}% MoM`
                            : null
                    }
                />
                <KpiCard
                    label="Doctors"
                    value={summary.totalDoctors}
                    sub={`${summary.totalActiveStaff} active staff`}
                    icon={<Stethoscope size={20} />}
                    iconTone="success"
                />
                <KpiCard
                    label="Revenue collected"
                    value={`₹${(summary.totalRevenueCollected / 1000).toFixed(1)}k`}
                    sub={`₹${(summary.totalOutstandingRevenue / 1000).toFixed(1)}k outstanding`}
                    icon={<ReceiptText size={20} />}
                    iconTone="neutral"
                    trend={
                        summary.totalOutstandingRevenue > summary.totalRevenueCollected
                            ? "down"
                            : "up"
                    }
                    trendLabel={`${(
                        (summary.totalRevenueCollected /
                            (summary.totalRevenueCollected +
                                summary.totalOutstandingRevenue || 1)) *
                        100
                    ).toFixed(0)}% paid`}
                />
                <KpiCard
                    label="IPD admissions"
                    value={summary.activeAdmissions}
                    sub="Currently admitted in wards"
                    icon={<BedDouble size={20} />}
                    iconTone="warning"
                />
            </div>

            {/* Row 2 — patient trend */}
            <ChartCard
                title="Patient registrations"
                subtitle="Daily new registrations — last 30 days"
                action="/patients"
                actionLabel="All patients"
            >
                <ResponsiveContainer width="100%" height={220}>
                    <AreaChart
                        data={summary.patientRegistrationsTrend}
                        margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(148, 163, 184, 0.1)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                            interval={4}
                        />
                        <YAxis
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip content={<PatientTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#patGrad)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* Row 3 — revenue + appointments */}
            <div className="hms-dash-row is-3-2">
                <ChartCard
                    title="Revenue overview"
                    subtitle="Paid vs outstanding — last 6 months"
                    action="/billing/opd"
                    actionLabel="Billing"
                >
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                            data={summary.revenueOverview}
                            margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                            barGap={3}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(148, 163, 184, 0.1)"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 10, fill: "#94a3b8" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: "#94a3b8" }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                content={<RevenueTooltip />}
                                cursor={{ fill: "rgba(148, 163, 184, 0.05)" }}
                            />
                            <Bar dataKey="paid" name="paid" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={20} />
                            <Bar
                                dataKey="outstanding"
                                name="outstanding"
                                fill="#f43f5e"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={20}
                                opacity={0.7}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="hms-rev-legend">
                        <span className="hms-rev-legend__item">
                            <span className="hms-rev-legend__sq is-paid" />
                            Paid
                        </span>
                        <span className="hms-rev-legend__item">
                            <span className="hms-rev-legend__sq is-outstanding" />
                            Outstanding
                        </span>
                    </div>
                </ChartCard>

                <ChartCard
                    title="Appointments"
                    subtitle="By status — all time"
                    action="/appointments"
                    actionLabel="View all"
                >
                    {summary.appointmentsBreakdown.length > 0 ? (
                        <>
                            <DonutChart
                                data={summary.appointmentsBreakdown}
                                colors={summary.appointmentsBreakdown.map(
                                    (d) => STATUS_COLORS[d.name] ?? "var(--hms-gray-400)"
                                )}
                                centerLabel="total"
                                centerValue={apptTotal}
                            />
                            <div className="hms-legend-list">
                                {summary.appointmentsBreakdown.map((d) => (
                                    <LegendDot
                                        key={d.name}
                                        color={STATUS_COLORS[d.name] ?? "var(--hms-gray-400)"}
                                        label={d.name.charAt(0) + d.name.slice(1).toLowerCase().replace("_", " ")}
                                        value={d.value}
                                        total={apptTotal}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="hms-empty-chart">
                            <Calendar size={32} />
                            <p className="m-0 text-11">No appointment data yet</p>
                        </div>
                    )}
                </ChartCard>
            </div>

            {/* Row 4 — age + roles + quick actions */}
            <div className="hms-dash-row is-3col">
                <ChartCard title="Patient age groups" subtitle="Distribution across all patients">
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart
                            data={summary.patientAgeGroups}
                            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                        >
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="rgba(148, 163, 184, 0.1)"
                                vertical={false}
                            />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 10, fill: "#94a3b8" }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: "#94a3b8" }}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                            />
                            <Tooltip
                                content={({ active, payload }) =>
                                    active && payload?.length ? (
                                        <div className="hms-tooltip">
                                            <p className="hms-tooltip__title">
                                                Age {payload[0].payload.name}
                                            </p>
                                            <p className="hms-tooltip__line text-info">
                                                {payload[0].value} patients
                                            </p>
                                        </div>
                                    ) : null
                                }
                            />
                            <Bar dataKey="value" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Staff by role" subtitle="Headcount distribution">
                    {summary.staffByRole.length > 0 ? (
                        <>
                            <DonutChart
                                data={summary.staffByRole}
                                colors={ROLE_COLORS}
                                centerLabel="staff"
                                centerValue={summary.totalActiveStaff}
                            />
                            <div className="hms-legend-list">
                                {summary.staffByRole.map((d, i) => (
                                    <LegendDot
                                        key={d.name}
                                        color={ROLE_COLORS[i % ROLE_COLORS.length]}
                                        label={d.name}
                                        value={d.value}
                                        total={summary.totalActiveStaff}
                                    />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="hms-empty-chart">
                            <Users size={32} />
                            <p className="m-0 text-11">No staff data yet</p>
                        </div>
                    )}
                </ChartCard>

                <Card className="hms-chart-card">
                    <div className="hms-card-head">
                        <p className="hms-card-head__title">Quick actions</p>
                        <p className="hms-card-head__sub">Jump to common tasks</p>
                    </div>
                    <div className="hms-quick-actions">
                        {quickActions.map((item) => (
                            <button
                                key={item.to}
                                type="button"
                                onClick={() => navigate(item.to)}
                                className="hms-quick-action"
                            >
                                <span className={`hms-quick-action__icon is-${item.iconTone}`}>
                                    {item.icon}
                                </span>
                                <div className="hms-quick-action__body">
                                    <p className="hms-quick-action__label">{item.label}</p>
                                    <p className="hms-quick-action__sub">{item.sub}</p>
                                </div>
                                <ArrowRight size={14} className="text-gray-400 shrink-0" />
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
}

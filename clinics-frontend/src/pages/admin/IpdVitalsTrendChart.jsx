import { useState, useMemo, useEffect } from "react";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Sparkles } from "lucide-react";
import { fmtDateTimeShort } from "@/utils/date";

// ── Selectable trend views — grouped so related vitals (e.g. BP) share an axis ──

const TREND_METRICS = [
    {
        key: "bp", label: "Blood Pressure", unit: "mmHg",
        lines: [
            { dataKey: "bpSystolic", name: "Systolic", color: "#ef4444" },
            { dataKey: "bpDiastolic", name: "Diastolic", color: "#3b82f6" },
        ],
    },
    { key: "heartRate", label: "Heart Rate", unit: "bpm",
      lines: [{ dataKey: "heartRate", name: "Heart Rate", color: "#8b5cf6" }] },
    { key: "spo2", label: "SpO₂", unit: "%",
      lines: [{ dataKey: "spo2", name: "SpO₂", color: "#10b981" }] },
    { key: "respiratoryRate", label: "Resp. Rate", unit: "br/min",
      lines: [{ dataKey: "respiratoryRate", name: "Resp. Rate", color: "#0ea5e9" }] },
    { key: "temperature", label: "Temperature", unit: "°F",
      lines: [{ dataKey: "temperature", name: "Temperature", color: "#f59e0b" }] },
    { key: "bloodGlucose", label: "Blood Glucose", unit: "mg/dL",
      lines: [{ dataKey: "bloodGlucose", name: "Glucose", color: "#ec4899" }] },
    { key: "painScore", label: "Pain Score", unit: "/10",
      lines: [{ dataKey: "painScore", name: "Pain Score", color: "#f43f5e" }] },
    { key: "weightKg", label: "Weight", unit: "kg",
      lines: [{ dataKey: "weightKg", name: "Weight", color: "#6366f1" }] },
];

function hasValue(point, key) {
    return point[key] !== null && point[key] !== undefined;
}

function TrendTooltip({ active, payload, label, unit }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="hms-tooltip">
            <p className="hms-tooltip__title">{label}</p>
            {payload.map((p) => (
                <p key={p.dataKey} className="hms-tooltip__line" style={{ color: p.color }}>
                    {p.name}: {p.value ?? "—"} {unit}
                </p>
            ))}
        </div>
    );
}

/**
 * Zema AI — vitals trend chart for an IPD admission.
 * Renders nothing until at least one vital has 2+ recorded readings to plot.
 */
export default function IpdVitalsTrendChart({ readings }) {
    const chartData = useMemo(() => {
        return [...readings]
            .filter((r) => r.recordedAt)
            .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
            .map((r) => ({
                time: fmtDateTimeShort(r.recordedAt),
                bpSystolic: r.bpSystolic ?? null,
                bpDiastolic: r.bpDiastolic ?? null,
                heartRate: r.heartRate ?? null,
                respiratoryRate: r.respiratoryRate ?? null,
                temperature: r.temperature ?? null,
                spo2: r.spo2 ?? null,
                painScore: r.painScore ?? null,
                bloodGlucose: r.bloodGlucose ?? null,
                weightKg: r.weightKg ?? null,
            }));
    }, [readings]);

    const availableMetrics = useMemo(() => {
        return TREND_METRICS.filter((m) => {
            const points = chartData.filter((d) => m.lines.some((l) => hasValue(d, l.dataKey)));
            return points.length >= 2;
        });
    }, [chartData]);

    const [activeMetric, setActiveMetric] = useState(null);

    useEffect(() => {
        if (availableMetrics.length === 0) {
            if (activeMetric !== null) setActiveMetric(null);
            return;
        }
        if (!availableMetrics.some((m) => m.key === activeMetric)) {
            setActiveMetric(availableMetrics[0].key);
        }
    }, [availableMetrics, activeMetric]);

    if (availableMetrics.length === 0) return null;

    const metric = availableMetrics.find((m) => m.key === activeMetric) ?? availableMetrics[0];

    return (
        <div className="zema-panel hms-vitals-trend-panel">
            <div className="zema-panel__header">
                <p className="zema-panel__title">
                    <Sparkles size={15} className="zema-badge-sparkle" />
                    Zema AI — Vitals Trend
                </p>
                <span className="zema-badge"><Sparkles size={10} /> AI</span>
            </div>

            <div className="zema-suggest-group hms-vitals-trend-chips">
                {availableMetrics.map((m) => (
                    <button
                        key={m.key}
                        type="button"
                        className={`zema-suggest-chip${m.key === metric.key ? " is-active" : ""}`}
                        onClick={() => setActiveMetric(m.key)}
                    >
                        {m.label}
                    </button>
                ))}
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" vertical={false} />
                    <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={24}
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        tickLine={false}
                        axisLine={false}
                        domain={["auto", "auto"]}
                    />
                    <Tooltip content={<TrendTooltip unit={metric.unit} />} />
                    {metric.lines.map((line) => (
                        <Line
                            key={line.dataKey}
                            type="monotone"
                            dataKey={line.dataKey}
                            name={line.name}
                            stroke={line.color}
                            strokeWidth={2}
                            dot={{ r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>

            {metric.lines.length > 1 && (
                <div className="hms-vitals-trend-legend">
                    {metric.lines.map((line) => (
                        <span key={line.dataKey} className="hms-vitals-trend-legend__item">
                            <span className="hms-vitals-trend-legend__dot" style={{ background: line.color }} />
                            {line.name}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

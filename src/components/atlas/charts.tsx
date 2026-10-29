"use client";

// Recharts wrappers — restrained, scientific styling.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { stroke: "#a8a29e", fontSize: 11 } as const;
const GRID = "#e7e5e4";

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #e7e5e4",
  fontSize: 12,
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  background: "#fff",
};

export function HotDaysChart({
  data,
  thresholdC,
}: {
  data: { year: number; hotDays: number }[];
  thresholdC: number;
}) {
  const mean = data.length ? data.reduce((s, r) => s + r.hotDays, 0) / data.length : 0;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`${v} days`, `Tmax ≥ ${thresholdC} °C`]} />
        <ReferenceLine y={mean} stroke="#78716c" strokeDasharray="4 4" label={{ value: "period mean", fontSize: 10, fill: "#78716c", position: "insideTopRight" }} />
        <Line type="monotone" dataKey="hotDays" stroke="#dc2626" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ClimatologyChart({ data }: { data: { month: string; meanTmaxC: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="°" width={54} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`${v} °C`, "mean daily max"]} />
        <Bar dataKey="meanTmaxC" fill="#ea580c" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuakesPerYearChart({ data }: { data: { year: number; count: number; maxMag: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, name) => (name === "count" ? [`${v} events`, "M ≥ 4.5"] : [String(v), "max M"])} />
        <Bar dataKey="count" fill="#d97706" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PM25Chart({
  data,
  whoGuideline = 15,
}: {
  data: { time: string; pm25: number | null }[];
  whoGuideline?: number;
}) {
  const series = data.map((d) => ({
    ...d,
    pm25: d.pm25 ?? 0,
    label: d.time.slice(5, 16).replace("T", " "),
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [`${v} µg/m³`, "PM2.5"]} />
        <ReferenceLine y={whoGuideline} stroke="#ca8a04" strokeDasharray="4 4" label={{ value: "WHO 24h guideline", fontSize: 10, fill: "#ca8a04", position: "insideTopRight" }} />
        <Area type="monotone" dataKey="pm25" stroke="#4d7c0f" fill="#4d7c0f" fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

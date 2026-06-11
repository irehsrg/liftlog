"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface VolumeChartProps {
  data: { date: string; volume: number }[];
}

// Least-squares linear regression over the volume series (x = index).
// Returns the data with a `trend` value on each point, or the data
// unchanged when there aren't enough points to fit a line.
function withTrend(
  data: { date: string; volume: number }[]
): { date: string; volume: number; trend?: number }[] {
  const n = data.length;
  if (n < 2) return data.map((d) => ({ ...d, trend: undefined }));

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const y = data[i].volume;
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return data.map((d) => ({ ...d, trend: undefined }));

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return data.map((d, i) => ({
    ...d,
    trend: Math.max(0, intercept + slope * i),
  }));
}

export default function VolumeChart({ data }: VolumeChartProps) {
  const chartData = withTrend(data);

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">
        Volume Trend
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip
            contentStyle={{
              background: "#111",
              border: "1px solid #333",
              borderRadius: 8,
              fontSize: 12,
              color: "#e5e7eb",
            }}
            formatter={(value, name) => [
              `${Math.round(Number(value ?? 0)).toLocaleString()} lb`,
              name === "trend" ? "Trend" : "Volume",
            ]}
            cursor={{ stroke: "#444", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="#c084fc"
            strokeWidth={2}
            fill="#c084fc"
            fillOpacity={0.15}
            dot={{ fill: "#c084fc", r: 3, strokeWidth: 0 }}
            activeDot={{ fill: "#c084fc", r: 4, strokeWidth: 0 }}
          />
          <Line
            type="linear"
            dataKey="trend"
            stroke="#f0abfc"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

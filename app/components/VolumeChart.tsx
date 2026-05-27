"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface VolumeChartProps {
  data: { date: string; volume: number }[];
}

export default function VolumeChart({ data }: VolumeChartProps) {
  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">
        Volume Trend
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            formatter={(value) => [
              `${Math.round(Number(value ?? 0)).toLocaleString()} lb`,
              "Volume",
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
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";

type DataPoint = { date: string; weight: number; e1rm: number; volume: number };

export default function ExerciseCharts({ data }: { data: DataPoint[] }) {
  const [tab, setTab] = useState<"weight" | "e1rm">("weight");

  if (data.length < 2) return null;

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-4 space-y-3">
      <div className="flex gap-2">
        {(["weight", "e1rm"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              tab === t
                ? "bg-purple-400 text-white"
                : "bg-[#1a1a1a] text-gray-400 hover:text-gray-200"
            }`}
          >
            {t === "weight" ? "Working Weight" : "Est. 1RM"}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
          <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
          <Tooltip
            contentStyle={{ background: "#111", border: "1px solid #333", borderRadius: 8 }}
            labelStyle={{ color: "#9ca3af" }}
            itemStyle={{ color: "#c084fc" }}
          />
          <Line
            type="monotone"
            dataKey={tab}
            stroke="#c084fc"
            strokeWidth={2}
            dot={{ fill: "#c084fc", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

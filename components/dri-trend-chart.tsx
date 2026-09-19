"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  date: string;
  score: number;
}

export function DRITrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        A tendência aparece a partir do segundo cálculo. O cron roda 1x/dia.
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine y={55} stroke="#fb923c" strokeDasharray="4 4" />
          <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
            }}
            labelStyle={{ color: "#64748b" }}
            formatter={(v: number) => [v.toFixed(1), "DRI"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 2, fill: "#2563eb" }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

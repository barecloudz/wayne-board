"use client";

import Link from "next/link";
import { Truck, ArrowRight } from "lucide-react";
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from "recharts";

const data = [
  { vehicle: "VH-01", health: 92 },
  { vehicle: "VH-02", health: 85 },
  { vehicle: "VH-03", health: 58 },
  { vehicle: "VH-04", health: 97 },
  { vehicle: "VH-05", health: 71 },
  { vehicle: "VH-06", health: 89 },
  { vehicle: "VH-07", health: 74 },
  { vehicle: "VH-08", health: 95 },
];

function getColor(h: number) {
  if (h >= 85) return "#6366f1";
  if (h >= 70) return "#f59e0b";
  return "#ef4444";
}

export default function FleetCard() {
  return (
    <Link
      href="/reports/fleet"
      className="group bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col gap-5 cursor-pointer overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)]
        hover:shadow-[0_8px_36px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-1 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Truck className="w-5 h-5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 leading-none">Fleet & Maintenance</p>
            <p className="text-[11px] text-slate-400 mt-1">Monthly PM compliance</p>
          </div>
        </div>
        <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          3 Due
        </span>
      </div>

      {/* Big number */}
      <div>
        <p className="text-[42px] font-extrabold text-slate-900 leading-none tracking-tight">12</p>
        <p className="text-[12px] text-slate-400 mt-1 font-medium">Active vehicles · 12/12 inspections passed</p>
      </div>

      {/* Bar chart */}
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={14} barGap={3}>
            <Tooltip
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="bg-slate-900 text-white text-[11px] px-2 py-1 rounded-lg shadow-xl">
                    {payload[0].payload.vehicle}: {payload[0].value}% health
                  </div>
                ) : null
              }
            />
            <Bar dataKey="health" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={getColor(d.health)} opacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">Last report: Nov 1, 2025</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

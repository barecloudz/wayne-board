"use client";

import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

const data = [
  { day: "Mon", stops: 102 },
  { day: "Tue", stops: 115 },
  { day: "Wed", stops: 108 },
  { day: "Thu", stops: 121 },
  { day: "Fri", stops: 118 },
  { day: "Sat", stops: 94 },
  { day: "Sun", stops: 98 },
];

export default function PayrollCard() {
  return (
    <Link
      href="/reports/payroll"
      className="group bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col gap-5 cursor-pointer overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)]
        hover:shadow-[0_8px_36px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-1 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm">
            <DollarSign className="w-5 h-5 text-slate-900" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 leading-none">Payroll</p>
            <p className="text-[11px] text-slate-400 mt-1">Nov 18–24 · 12 drivers</p>
          </div>
        </div>
        <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          ↑ 2.1%
        </span>
      </div>

      {/* Big number */}
      <div>
        <p className="text-[42px] font-extrabold text-slate-900 leading-none tracking-tight">$14,280</p>
        <p className="text-[12px] text-slate-400 mt-1 font-medium">Weekly total · avg 108 stops/driver/day</p>
      </div>

      {/* Area chart */}
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="stopsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="bg-slate-900 text-white text-[11px] px-2 py-1 rounded-lg shadow-xl">
                    {payload[0].payload.day}: {payload[0].value} stops
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="stops"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#stopsGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">Last report: Nov 24, 2025</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

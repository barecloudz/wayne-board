"use client";

import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

const ilsData = [
  { name: "bg", value: 100, fill: "#e2e8f0" },
  { name: "ILS", value: 99.2, fill: "#6366f1" },
];

export default function DriversCard() {
  return (
    <Link
      href="/reports/drivers"
      className="group bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col gap-5 cursor-pointer overflow-hidden
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)]
        hover:shadow-[0_8px_36px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.06)]
        hover:-translate-y-1 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Users className="w-5 h-5 text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 leading-none">Driver Performance</p>
            <p className="text-[11px] text-slate-400 mt-1">ILS · safety · attendance</p>
          </div>
        </div>
        <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          ↑ 0.3%
        </span>
      </div>

      {/* Ring + stats */}
      <div className="flex items-center gap-6">
        {/* Donut */}
        <div className="relative w-24 h-24 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              data={ilsData}
              barSize={10}
            >
              <RadialBar dataKey="value" background={false} cornerRadius={10} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[17px] font-extrabold text-slate-900 leading-none">99.2%</span>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">ILS</span>
          </div>
        </div>

        {/* Side stats */}
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[22px] font-extrabold text-slate-900 leading-none tracking-tight">12</p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Active drivers</p>
          </div>
          <div className="flex gap-3">
            <div>
              <p className="text-[15px] font-bold text-emerald-600 leading-none">10</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Top performers</p>
            </div>
            <div>
              <p className="text-[15px] font-bold text-amber-500 leading-none">1</p>
              <p className="text-[10px] text-slate-400 mt-0.5">In training</p>
            </div>
            <div>
              <p className="text-[15px] font-bold text-slate-700 leading-none">0</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Call-outs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
        <p className="text-[11px] text-slate-400">Last report: Nov 24, 2025</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

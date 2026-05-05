"use client";

import Link from "next/link";
import { Truck, ArrowRight } from "lucide-react";

export default function FleetCard({
  vehicleCount = 0,
  inspectedCount = 0,
}: {
  vehicleCount?: number;
  inspectedCount?: number;
}) {
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
            <p className="text-[11px] text-slate-400 mt-1">Q2 2026 inspection cycle</p>
          </div>
        </div>
        {inspectedCount < vehicleCount && (
          <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            {vehicleCount - inspectedCount} Pending
          </span>
        )}
        {inspectedCount === vehicleCount && vehicleCount > 0 && (
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            All Done
          </span>
        )}
      </div>

      {/* Big number */}
      <div>
        <p className="text-[42px] font-extrabold text-slate-900 leading-none tracking-tight">{vehicleCount}</p>
        <p className="text-[12px] text-slate-400 mt-1 font-medium">
          Active trucks · {inspectedCount} / {vehicleCount} inspected Q2
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Inspection progress</span>
          <span className="text-[11px] font-semibold text-slate-600">
            {vehicleCount > 0 ? Math.round((inspectedCount / vehicleCount) * 100) : 0}%
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
            style={{ width: vehicleCount > 0 ? `${(inspectedCount / vehicleCount) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">M-121 · Q2 2026</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

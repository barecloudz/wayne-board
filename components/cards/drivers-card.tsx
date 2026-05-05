"use client";

import Link from "next/link";
import { Users, ArrowRight } from "lucide-react";

export default function DriversCard({ driverCount = 0 }: { driverCount?: number }) {
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
            <p className="text-[13px] font-bold text-slate-900 leading-none">Driver Accounts</p>
            <p className="text-[11px] text-slate-400 mt-1">Active driver roster</p>
          </div>
        </div>
      </div>

      {/* Big number */}
      <div>
        <p className="text-[42px] font-extrabold text-slate-900 leading-none tracking-tight">{driverCount}</p>
        <p className="text-[12px] text-slate-400 mt-1 font-medium">Active drivers on roster</p>
      </div>

      {/* Placeholder message if no drivers */}
      {driverCount === 0 ? (
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-center">
          <p className="text-[12px] text-slate-400">No driver accounts created yet</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Add drivers via Driver Accounts</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-slate-500">Ryde Score data</span>
            <span className="text-slate-400 font-medium">Coming soon</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full w-0 bg-indigo-400 rounded-full" />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
        <p className="text-[11px] text-slate-400">Q2 2026</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View roster <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

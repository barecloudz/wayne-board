"use client";

import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";

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
            <p className="text-[11px] text-slate-400 mt-1">Weekly driver payroll</p>
          </div>
        </div>
        <span className="bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          No Data
        </span>
      </div>

      {/* Big number */}
      <div>
        <p className="text-[42px] font-extrabold text-slate-400 leading-none tracking-tight">$—</p>
        <p className="text-[12px] text-slate-400 mt-1 font-medium">No payroll records yet</p>
      </div>

      {/* Empty state */}
      <div className="bg-slate-50 rounded-xl px-4 py-3 text-center flex-1 flex items-center justify-center">
        <p className="text-[12px] text-slate-400">Payroll tracking coming soon</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">Q2 2026</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

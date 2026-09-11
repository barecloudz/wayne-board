"use client";

import Link from "next/link";
import { DollarSign, ArrowRight } from "lucide-react";
import type { PayrollCardSummary } from "@/lib/actions/attendance";

function formatWeekRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

export default function PayrollCard({ summary }: { summary: PayrollCardSummary }) {
  return (
    <Link
      href="/dashboard/payroll"
      className="group bg-white rounded-2xl border border-slate-200/80 p-6 flex flex-col gap-5 cursor-pointer overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_36px_rgba(0,0,0,0.11),0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shadow-sm">
            <DollarSign className="w-5 h-5 text-slate-900" strokeWidth={2} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 leading-none">Payroll</p>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.hasData ? formatWeekRange(summary.weekStart, summary.weekEnd) : "Weekly driver payroll"}
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${summary.hasData ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
          {summary.hasData ? "Ready" : "No Data"}
        </span>
      </div>

      {summary.hasData ? (
        <div className="flex gap-4">
          <div>
            <p className="text-[36px] font-extrabold text-slate-900 leading-none tracking-tight">
              {summary.totalWorkDays % 1 === 0 ? summary.totalWorkDays : summary.totalWorkDays.toFixed(1)}
            </p>
            <p className="text-[12px] text-slate-400 mt-1 font-medium">days worked</p>
          </div>
          {summary.traineeCount > 0 && (
            <div className="border-l border-slate-100 pl-4">
              <p className="text-[36px] font-extrabold text-blue-600 leading-none tracking-tight">{summary.traineeCount}</p>
              <p className="text-[12px] text-slate-400 mt-1 font-medium">trainee days</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[42px] font-extrabold text-slate-400 leading-none tracking-tight">$-</p>
          <p className="text-[12px] text-slate-400 mt-1 font-medium">No payroll records yet</p>
        </div>
      )}

      {summary.hasData ? (
        <div className="bg-slate-50 rounded-xl px-4 py-3">
          <p className="text-[12px] text-slate-500">
            <span className="font-bold text-slate-700">{summary.totalDrivers}</span>{" "}
            driver{summary.totalDrivers !== 1 ? "s" : ""} with records
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl px-4 py-3 text-center flex-1 flex items-center justify-center">
          <p className="text-[12px] text-slate-400">Log attendance from Scheduling to populate payroll</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">{summary.hasData ? "Last completed week" : "No data yet"}</p>
        <span className="flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:gap-1.5 transition-all duration-150">
          View report <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}

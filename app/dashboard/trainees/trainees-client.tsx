"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type TraineeRow = {
  driverId: string;
  name: string;
  days: string[];
  total: number;
};

type WeekData = {
  weekStart: string;
  dates: string[];   // 7 YYYY-MM-DD strings Mon–Sun
  trainees: TraineeRow[];
};

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function prevMonday(monday: string): string {
  const d = new Date(monday + "T12:00:00");
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function nextMonday(monday: string): string {
  const d = new Date(monday + "T12:00:00");
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function currentMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function formatWeekRange(dates: string[]): string {
  if (!dates.length) return "";
  const fmt = (s: string) => {
    const d = new Date(s + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(dates[0])} – ${fmt(dates[6])}`;
}

function formatDate(s: string): string {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TraineesClient() {
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trainee-work-days?weekStart=${weekStart}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [weekStart]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      {/* Week navigator */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setWeekStart(prevMonday(weekStart))}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>

        <span className="text-[15px] font-semibold text-slate-800 min-w-[180px] text-center">
          {data ? formatWeekRange(data.dates) : "Loading…"}
        </span>

        <button
          onClick={() => setWeekStart(nextMonday(weekStart))}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>

        <button
          onClick={() => setWeekStart(currentMonday())}
          className="ml-2 px-3 py-1.5 text-[12px] font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
        >
          This week
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : !data || data.trainees.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center text-slate-400 text-sm">
          No active trainees found. Mark drivers as trainees in Driver Accounts.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-[180px]">
                  Trainee
                </th>
                {data.dates.map((date, i) => (
                  <th
                    key={date}
                    className={`text-center px-2 py-3 text-[11px] font-semibold uppercase tracking-wider w-[70px] ${
                      date === today ? "text-indigo-600" : "text-slate-400"
                    }`}
                  >
                    <div>{DOW_LABELS[i]}</div>
                    <div className="font-normal normal-case text-[10px] mt-0.5 text-slate-400">
                      {formatDate(date)}
                    </div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.trainees.map((t, idx) => {
                const workedSet = new Set(t.days);
                return (
                  <tr
                    key={t.driverId}
                    className={`border-b border-slate-50 last:border-0 ${
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    }`}
                  >
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      <div>{t.name}</div>
                      <div className="text-[11px] text-slate-400 font-normal">{t.driverId}</div>
                    </td>
                    {data.dates.map((date) => (
                      <td key={date} className="px-2 py-3.5 text-center">
                        {workedSet.has(date) ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-200 text-xs">-</span>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-bold ${
                          t.total > 0
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {t.total}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

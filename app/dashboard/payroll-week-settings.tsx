"use client";

import { useState, useTransition } from "react";
import { setPayWeekStart } from "@/lib/actions/settings";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PayrollWeekSettings({ initialDay }: { initialDay: number }) {
  const [selected, setSelected] = useState(initialDay);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSelect(day: number) {
    setSelected(day);
    setSaved(false);
    startTransition(async () => {
      await setPayWeekStart(day);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900">Payroll</h2>
          <p className="text-[13px] text-slate-400 mt-0.5">Configure your pay week cycle</p>
        </div>
        {saved && <span className="text-[12px] font-semibold text-emerald-600">Saved ✓</span>}
      </div>
      <p className="text-[13px] font-semibold text-slate-700 mb-3">Pay Week Start Day</p>
      <div className="grid grid-cols-7 gap-1.5">
        {DAY_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => handleSelect(i)}
            disabled={isPending}
            className={`py-2.5 rounded-xl text-[12px] font-bold transition-colors disabled:opacity-50 ${
              selected === i
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2.5">
        Current cycle: <span className="font-semibold text-slate-600">{DAY_LABELS[selected]}</span> → <span className="font-semibold text-slate-600">{DAY_LABELS[(selected + 6) % 7]}</span>
      </p>
    </div>
  );
}

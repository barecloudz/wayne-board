"use client";

import { useState, useTransition } from "react";
import { setPayWeekStart } from "@/lib/actions/settings";
import { X } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PayWeekModal({
  initialDay,
  onClose,
}: {
  initialDay: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(initialDay);
  const [isPending, startTransition] = useTransition();

  function handleSelect(day: number) {
    setSelected(day);
    startTransition(async () => {
      await setPayWeekStart(day);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[15px] font-extrabold text-slate-900">Pay Week Start</p>
            <p className="text-[12px] text-slate-400 mt-0.5">Select the first day of your pay week</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
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
        <p className="text-[11px] text-slate-400 text-center mt-3">
          Pay week: <span className="font-semibold text-slate-600">{DAY_LABELS[selected]}</span> → <span className="font-semibold text-slate-600">{DAY_LABELS[(selected + 6) % 7]}</span>
        </p>
      </div>
    </div>
  );
}

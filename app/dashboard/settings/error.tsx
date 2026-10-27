"use client";

import { AlertTriangle } from "lucide-react";

export default function SettingsError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <AlertTriangle className="w-8 h-8 text-slate-200" />
      <p className="text-[13px] text-slate-400 font-medium">Settings failed to load</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-700 active:scale-[0.97] transition-all"
      >
        Try again
      </button>
    </div>
  );
}

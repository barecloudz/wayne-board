"use client";

import { useState, useEffect } from "react";
import { Loader2, FileDown } from "lucide-react";

const UNITS = [
  "206127",
  "206129",
  "206543",
  "473141",
  "479036",
  "479632",
  "504191",
  "532095",
  "532096",
  "537362",
  "537366",
  "537367",
  "537369",
  "537372",
  "538564",
  "538565",
  "538566",
];

const STATION_LOOKUP: Record<string, string> = {
  "206127": "0259",
  "206129": "0259",
  "206543": "0259",
  "473141": "0267",
  "479036": "0259",
  "479632": "0259",
  "504191": "0259",
  "532095": "0259",
  "532096": "0259",
  "537362": "0259",
  "537366": "0259",
  "537367": "0259",
  "537369": "0259",
  "537372": "0259",
  "538564": "0259",
  "538565": "0259",
  "538566": "0259",
};

const MILEAGE_LOOKUP: Record<string, string> = {
  "206127-2026-07": "52,822",
  "206129-2026-07": "62,681",
  "206543-2026-07": "18,724",
  "473141-2026-07": "69,992",
  "479036-2026-07": "62,852",
  "479632-2026-07": "103,310",
  "504191-2026-07": "41,055",
  "532095-2026-07": "43,028",
  "532096-2026-07": "37,738",
  "537362-2026-07": "22,507",
  "537366-2026-07": "26,567",
  "537367-2026-07": "20,294",
  "537369-2026-07": "18,810",
  "537372-2026-07": "18,713",
  "538564-2026-07": "",
  "538565-2026-07": "20,725",
  "538566-2026-07": "18,908",
};

function getCurrentYearMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMileage(unit: string, month: string): string {
  return MILEAGE_LOOKUP[`${unit}-${month}`] ?? "";
}

const INPUT =
  "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

const SELECT =
  "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white appearance-none cursor-pointer";

export default function MmrClient() {
  const [unit, setUnit] = useState(UNITS[0]);
  const [month, setMonth] = useState(getCurrentYearMonth());
  const [mileage, setMileage] = useState(() => getMileage(UNITS[0], getCurrentYearMonth()));
  const [loading, setLoading] = useState(false);

  // Auto-populate mileage when unit or month changes
  useEffect(() => {
    setMileage(getMileage(unit, month));
  }, [unit, month]);

  function handleGenerate() {
    setLoading(true);
    const params = new URLSearchParams({ unit, month });
    if (mileage) params.set("mileage", mileage);
    const url = `/api/mmr-pdf?${params.toString()}`;
    const win = window.open(url, "_blank");
    // Reset loading after a short delay since we can't detect when the PDF loads in a new tab
    if (win) {
      setTimeout(() => setLoading(false), 2000);
    } else {
      setLoading(false);
    }
  }

  const station = STATION_LOOKUP[unit] ?? "";

  return (
    <main className="flex-1 px-6 py-8 max-w-[680px] w-full mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
          MyGroundOps · Fleet
        </p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none mb-2">
          MMR Generator
        </h1>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          Generate a U.S. Monthly Maintenance Record (MGBA-355) PDF for any unit. Maintenance
          entries are pulled from the tracker spreadsheet automatically.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
        <div className="grid grid-cols-1 gap-5">

          {/* Unit # */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Vehicle Unit #
            </label>
            <div className="relative">
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className={SELECT}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {station && (
              <p className="text-[11px] text-slate-400 mt-1">Station: {station}</p>
            )}
          </div>

          {/* Month */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Month
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={INPUT}
            />
          </div>

          {/* Mileage */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Current Mileage (Odometer)
            </label>
            <input
              type="text"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder="e.g. 52,822 — leave blank for N/A"
              className={INPUT}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Auto-filled from lookup. Edit to override, or leave blank.
            </p>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !unit || !month}
            className="flex items-center justify-center gap-2 w-full py-3 px-5 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating PDF&hellip;
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                Generate PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="mt-4 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-600">Note:</span> The generated PDF is the
        MGBA-355 form pre-filled with your data. Maintenance entries are sourced from the
        maintenance tracker spreadsheet (configured via <code className="font-mono text-[11px] bg-slate-100 px-1 py-0.5 rounded">MAINTENANCE_TRACKER_PATH</code>). Submit to FedEx by the 20th of the following month.
      </div>
    </main>
  );
}

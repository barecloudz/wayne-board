"use client";

import { useState, useCallback } from "react";
import { Loader2, FileDown, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import type { VehicleMmrRow } from "@/lib/actions/mmr";

function getPreviousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function formatTimestamp(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MmrClient({
  initialVehicles,
  defaultMonth,
  orgName,
}: {
  initialVehicles: VehicleMmrRow[];
  defaultMonth: string;
  orgName: string;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [vehicles, setVehicles] = useState<VehicleMmrRow[]>(initialVehicles);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState<number | null>(null);
  const maxMonth = getPreviousMonth();

  const loadMonth = useCallback(async (m: string) => {
    setLoadingMonth(true);
    try {
      const res = await fetch(`/api/mmr-vehicles?month=${m}`);
      if (res.ok) setVehicles(await res.json());
    } finally {
      setLoadingMonth(false);
    }
  }, []);

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val > maxMonth) return;
    setMonth(val);
    loadMonth(val);
  }

  async function generatePdf(vehicleIds: number[]) {
    const res = await fetch("/api/mmr-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleIds, monthYear: month }),
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vehicleIds.length === 1
      ? `MMR_${vehicles.find(v => v.id === vehicleIds[0])?.unitNumber ?? "vehicle"}_${month}.pdf`
      : `MMR_${month}_All.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    await loadMonth(month);
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    try { await generatePdf(vehicles.map((v) => v.id)); }
    catch (e) {
      console.error(e);
      alert("Failed to generate PDF. Please try again.");
    }
    finally { setGeneratingAll(false); }
  }

  async function handleGenerateSingle(v: VehicleMmrRow) {
    setGeneratingSingle(v.id);
    try { await generatePdf([v.id]); }
    catch (e) {
      console.error(e);
      alert("Failed to generate PDF. Please try again.");
    }
    finally { setGeneratingSingle(null); }
  }

  const generatedCount = vehicles.filter((v) => v.lastGenerated !== null).length;
  const pendingCount = vehicles.length - generatedCount;

  return (
    <main className="flex-1 px-6 py-8 max-w-[900px] w-full mx-auto">
      <div className="mb-6">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">MyGroundOps · Fleet</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none mb-1">MMR Generator</h1>
        <p className="text-[13px] text-slate-500">{orgName} · MGBA-355 Monthly Maintenance Records</p>
      </div>

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Month</label>
          <input
            type="month"
            value={month}
            max={maxMonth}
            onChange={handleMonthChange}
            className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
          />
        </div>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            {generatedCount} generated
          </span>
          <span className="text-[12px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            {pendingCount} pending
          </span>
          <button
            onClick={handleGenerateAll}
            disabled={generatingAll || loadingMonth || vehicles.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generatingAll
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating&hellip;</>
              : <><FileDown className="w-4 h-4" /> Generate All ({vehicles.length})</>
            }
          </button>
        </div>
      </div>

      {loadingMonth ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-[14px]">No active vehicles found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => {
            const isGenerated = v.lastGenerated !== null;
            const isBusy = generatingSingle === v.id;
            return (
              <div key={v.id} className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 ${isGenerated ? "border-emerald-200" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[22px] font-extrabold text-slate-900 leading-none">{v.unitNumber}</p>
                    {v.stationCode
                      ? <p className="text-[11px] text-slate-400 mt-0.5">Station {v.stationCode}</p>
                      : <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No station assigned</p>
                    }
                  </div>
                  {isGenerated
                    ? <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0"><CheckCircle2 className="w-3 h-3" /> Generated</span>
                    : <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0"><Clock className="w-3 h-3" /> Pending</span>
                  }
                </div>
                <p className="text-[12px] text-slate-500">
                  {v.maintenanceCount > 0
                    ? `${v.maintenanceCount} maintenance entr${v.maintenanceCount === 1 ? "y" : "ies"} this month`
                    : "No maintenance records this month"}
                </p>
                {isGenerated && (
                  <p className="text-[11px] text-slate-400">Generated {formatTimestamp(v.lastGenerated)}</p>
                )}
                <button
                  onClick={() => handleGenerateSingle(v)}
                  disabled={isBusy || generatingAll}
                  className="mt-auto flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isBusy
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating&hellip;</>
                    : <><FileDown className="w-3.5 h-3.5" /> Generate</>
                  }
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 text-[12px] text-slate-500">
        <span className="font-semibold text-slate-600">Submit by:</span> 20th of the following month.
        Maintenance entries pulled from the maintenance tracker. Update vehicle mileage in Fleet settings before generating.
        Assign vehicles to locations in Fleet settings to populate station codes.
      </div>
    </main>
  );
}

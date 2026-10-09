"use client";

import { useState, useCallback } from "react";
import { Loader2, FileDown, CheckCircle2, Clock, AlertTriangle, X, Gauge } from "lucide-react";
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
  const [pdfError, setPdfError] = useState<string | null>(null);
  const maxMonth = getPreviousMonth();

  // Mileage pull state
  type MileageResult = {
    vehicleName: string;
    unitNumber: string | null;
    startMileage: number | null;
    endMileage: number | null;
    status: "matched" | "unmatched";
    isAnomaly: boolean;
    anomalyReason: string | null;
  };
  const getFirstOfPrevMonth = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  };
  const [mileageDate,    setMileageDate]    = useState(getFirstOfPrevMonth);
  const [mileagePulling, setMileagePulling] = useState(false);
  const [mileageResults, setMileageResults] = useState<MileageResult[] | null>(null);
  const [mileageError,   setMileageError]   = useState<string | null>(null);
  const [mileageMessage, setMileageMessage] = useState<string | null>(null);

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

  async function handlePullMileage() {
    setMileagePulling(true);
    setMileageResults(null);
    setMileageError(null);
    setMileageMessage(null);
    try {
      const res = await fetch("/api/auto-gc/pull-mileage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: mileageDate }),
      });
      const r = await res.json();
      if (r.success) {
        setMileageResults(r.results ?? []);
        if (r.results?.length > 0) {
          // Reload vehicles to reflect updated mileage
          await loadMonth(month);
        }
      } else {
        setMileageError(r.message ?? r.error ?? "Pull failed");
      }
    } catch (e: any) {
      setMileageError(e?.message ?? "Unknown error");
    } finally {
      setMileagePulling(false);
    }
  }

  async function handleGenerateAll() {
    setGeneratingAll(true);
    try { await generatePdf(vehicles.map((v) => v.id)); }
    catch (e) {
      console.error(e);
      setPdfError("Failed to generate PDF. Please try again.");
    }
    finally { setGeneratingAll(false); }
  }

  async function handleGenerateSingle(v: VehicleMmrRow) {
    setGeneratingSingle(v.id);
    try { await generatePdf([v.id]); }
    catch (e) {
      console.error(e);
      setPdfError("Failed to generate PDF. Please try again.");
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

      {pdfError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 font-medium mb-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {pdfError}
          <button onClick={() => setPdfError(null)} className="ml-auto p-1 hover:bg-red-100 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Pull Mileage from GC ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="w-4 h-4 text-slate-400" />
          <h2 className="text-[14px] font-extrabold text-slate-900">Pull Mileage from GC</h2>
        </div>
        <p className="text-[12px] text-slate-400 mb-4">
          Fetch vehicle odometer readings from GroundCloud for a specific date and update vehicle mileage records.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</label>
            <input
              type="date"
              value={mileageDate}
              onChange={e => setMileageDate(e.target.value)}
              disabled={mileagePulling}
              className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
            />
          </div>
          <button
            onClick={handlePullMileage}
            disabled={mileagePulling || !mileageDate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {mileagePulling
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Pulling…</>
              : <><Gauge className="w-4 h-4" /> Pull Mileage</>
            }
          </button>
        </div>

        {mileageError && (
          <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{mileageError}</span>
            <button onClick={() => setMileageError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {mileageMessage && (
          <p className="mt-3 text-[12px] text-slate-500">{mileageMessage}</p>
        )}

        {mileageResults && mileageResults.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Unit #", "Start Miles", "End Miles", "Status", "Anomaly"].map(h => (
                    <th key={h} className="pb-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mileageResults.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-slate-50 transition-colors ${
                      r.isAnomaly ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-slate-50/50"
                    }`}
                  >
                    <td className="py-2.5 pr-4">
                      <span className="text-[13px] font-semibold text-slate-800">
                        {r.unitNumber ?? r.vehicleName}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-[13px] text-slate-600 font-mono">
                        {r.startMileage != null ? r.startMileage.toLocaleString() : "-"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-[13px] text-slate-600 font-mono">
                        {r.endMileage != null ? r.endMileage.toLocaleString() : "-"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {r.status === "matched"
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Matched</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">Unmatched</span>
                      }
                    </td>
                    <td className="py-2.5">
                      {r.isAnomaly
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5" /> {r.anomalyReason}
                          </span>
                        : <span className="text-[12px] text-slate-300">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-slate-400">
              {mileageResults.filter(r => r.status === "matched").length} matched ·{" "}
              {mileageResults.filter(r => r.isAnomaly).length} anomalies detected
              {mileageResults.some(r => r.isAnomaly) &&
                " · Anomalous vehicles were flagged but vehicle mileage was not updated"
              }
            </p>
          </div>
        )}

        {mileageResults && mileageResults.length === 0 && (
          <p className="mt-4 text-[13px] text-slate-400">No vehicle mileage records returned for this date.</p>
        )}
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

"use client";

import { useState, useCallback } from "react";
import { Loader2, FileDown, CheckCircle2, Clock, AlertTriangle, X, Gauge, ChevronDown, ChevronUp, Pencil } from "lucide-react";
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

function formatEntryDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type VehicleReview = {
  vehicleId: number;
  unitNumber: string;
  mileage: string;
  station: string;
  maintenanceEntries: { date: string; description: string }[];
  maintenancePerformed: boolean;
  outOfService: boolean;
  expanded: boolean;
};

function buildReviews(vehicles: VehicleMmrRow[]): VehicleReview[] {
  return vehicles.map(v => ({
    vehicleId: v.id,
    unitNumber: v.unitNumber,
    mileage: v.mileage ? v.mileage.toLocaleString("en-US") : "",
    station: v.stationCode ?? "",
    maintenanceEntries: v.maintenanceEntries,
    maintenancePerformed: v.maintenanceCount > 0,
    outOfService: false,
    expanded: false,
  }));
}

export default function MmrClient({
  initialVehicles,
  defaultMonth,
  orgName,
  signerName: defaultSignerName,
}: {
  initialVehicles: VehicleMmrRow[];
  defaultMonth: string;
  orgName: string;
  signerName: string;
}) {
  const [month, setMonth] = useState(defaultMonth);
  const [vehicles, setVehicles] = useState<VehicleMmrRow[]>(initialVehicles);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const maxMonth = getPreviousMonth();

  // Review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewVehicles, setReviewVehicles] = useState<VehicleReview[]>([]);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);

  // OOS pre-step (batch generate only)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [modalStep, setModalStep] = useState<"oos" | "review">("review");
  const [oosAny, setOosAny] = useState<boolean | null>(null);
  const [oosSelectedIds, setOosSelectedIds] = useState<Set<number>>(new Set());

  // Mileage pull
  type MileageResult = {
    gcVehicleId: number;
    gcName: string;
    unitNumber: string | null;
    odometer: number | null;
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

  function openReview(vehicleSubset: VehicleMmrRow[], batch = false) {
    setReviewVehicles(buildReviews(vehicleSubset));
    setSignerName(defaultSignerName);
    setConfirmed(true);
    setIsBatchMode(batch);
    setOosAny(null);
    setOosSelectedIds(new Set());
    setModalStep(batch ? "oos" : "review");
    setReviewOpen(true);
  }

  function applyOosAndProceed() {
    if (oosAny) {
      setReviewVehicles(prev =>
        prev.map(r => ({ ...r, outOfService: oosSelectedIds.has(r.vehicleId) }))
      );
    }
    setModalStep("review");
  }

  function updateReview(vehicleId: number, patch: Partial<VehicleReview>) {
    setReviewVehicles(prev => prev.map(r => r.vehicleId === vehicleId ? { ...r, ...patch } : r));
  }

  async function handleConfirmGenerate() {
    setGenerating(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/mmr-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthYear: month,
          signerName,
          vehicles: reviewVehicles.map(r => ({
            vehicleId: r.vehicleId,
            mileage: r.mileage,
            station: r.station,
            maintenancePerformed: r.maintenancePerformed,
            outOfService: r.outOfService,
          })),
        }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reviewVehicles.length === 1
        ? `MMR_${reviewVehicles[0].unitNumber}_${month}.pdf`
        : `MMR_${month}_All.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setReviewOpen(false);
      await loadMonth(month);
    } catch (e) {
      console.error(e);
      setPdfError("Failed to generate PDF. Please try again.");
    } finally {
      setGenerating(false);
    }
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
        if (r.results?.length > 0) await loadMonth(month);
      } else {
        setMileageError(r.message ?? r.error ?? "Pull failed");
      }
    } catch (e: unknown) {
      setMileageError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setMileagePulling(false);
    }
  }

  const generatedCount = vehicles.filter(v => v.lastGenerated !== null).length;
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
            onClick={() => openReview(vehicles, true)}
            disabled={loadingMonth || vehicles.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            Generate All ({vehicles.length})
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 font-medium mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {pdfError}
          <button onClick={() => setPdfError(null)} className="ml-auto p-1 hover:bg-red-100 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Pull Mileage ── */}
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
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {mileagePulling ? <><Loader2 className="w-4 h-4 animate-spin" /> Pulling…</> : <><Gauge className="w-4 h-4" /> Pull Mileage</>}
          </button>
        </div>
        {mileageError && (
          <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{mileageError}</span>
            <button onClick={() => setMileageError(null)} className="ml-auto p-1 hover:bg-red-100 rounded"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {mileageMessage && <p className="mt-3 text-[12px] text-slate-500">{mileageMessage}</p>}
        {mileageResults && mileageResults.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Unit #", "Odometer", "Status", "Anomaly"].map(h => (
                    <th key={h} className="pb-2.5 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mileageResults.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-50 ${r.isAnomaly ? "bg-amber-50/60" : "hover:bg-slate-50/50"}`}>
                    <td className="py-2.5 pr-4"><span className="text-[13px] font-semibold text-slate-800">{r.unitNumber ?? r.gcName}</span></td>
                    <td className="py-2.5 pr-4"><span className="text-[13px] text-slate-600 font-mono">{r.odometer != null ? r.odometer.toLocaleString() : "-"}</span></td>
                    <td className="py-2.5 pr-4">
                      {r.status === "matched"
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Matched</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">Unmatched</span>}
                    </td>
                    <td className="py-2.5">
                      {r.isAnomaly
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><AlertTriangle className="w-3.5 h-3.5" />{r.anomalyReason}</span>
                        : <span className="text-[12px] text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-slate-400">
              {mileageResults.filter(r => r.status === "matched").length} matched · {mileageResults.filter(r => r.isAnomaly).length} anomalies
              {mileageResults.some(r => r.isAnomaly) && " · Anomalous vehicles flagged but not updated"}
            </p>
          </div>
        )}
        {mileageResults && mileageResults.length === 0 && (
          <p className="mt-4 text-[13px] text-slate-400">No vehicle mileage records returned for this date.</p>
        )}
      </div>

      {/* ── Vehicle grid ── */}
      {loadingMonth ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-[14px]">No active vehicles found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vehicles.map((v) => {
            const isGenerated = v.lastGenerated !== null;
            return (
              <div key={v.id} className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 ${isGenerated ? "border-emerald-200" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[22px] font-extrabold text-slate-900 leading-none">{v.unitNumber}</p>
                    {v.stationCode
                      ? <p className="text-[11px] text-slate-400 mt-0.5">Station {v.stationCode}</p>
                      : <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No station</p>}
                  </div>
                  {isGenerated
                    ? <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0"><CheckCircle2 className="w-3 h-3" /> Generated</span>
                    : <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0"><Clock className="w-3 h-3" /> Pending</span>}
                </div>
                <p className="text-[12px] text-slate-500">
                  {v.maintenanceCount > 0
                    ? `${v.maintenanceCount} maintenance entr${v.maintenanceCount === 1 ? "y" : "ies"} this month`
                    : "No maintenance records this month"}
                </p>
                <div className="flex items-center gap-1.5">
                  <Gauge className={`w-3.5 h-3.5 shrink-0 ${v.mileage ? "text-slate-400" : "text-amber-400"}`} />
                  <span className={`text-[12px] font-semibold ${v.mileage ? "text-slate-600" : "text-amber-500"}`}>
                    {v.mileage ? `${v.mileage.toLocaleString()} mi` : "No mileage on file"}
                  </span>
                </div>
                {isGenerated && <p className="text-[11px] text-slate-400">Generated {formatTimestamp(v.lastGenerated)}</p>}
                <button
                  onClick={() => openReview([v])}
                  className="mt-auto flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all"
                >
                  <FileDown className="w-3.5 h-3.5" /> Review &amp; Generate
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

      {/* ── Review & Confirm Modal ── */}
      {reviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !generating && setReviewOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <p className="text-white font-extrabold text-[16px]">Review &amp; Confirm</p>
                <p className="text-slate-400 text-[12px] mt-0.5">
                  {reviewVehicles.length} vehicle{reviewVehicles.length !== 1 ? "s" : ""} · {month}
                </p>
              </div>
              <button onClick={() => !generating && setReviewOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* OOS pre-step (batch only) */}
            {modalStep === "oos" && (
              <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5">
                <div>
                  <p className="text-[15px] font-extrabold text-slate-900 mb-1">Were any trucks out of service this month?</p>
                  <p className="text-[12px] text-slate-400">OOS means the truck was unable to provide service — awaiting repair, on hold, etc. Most months the answer is No.</p>
                </div>
                <div className="flex gap-3">
                  {([false, true] as const).map(val => (
                    <button
                      key={String(val)}
                      onClick={() => { setOosAny(val); if (!val) setOosSelectedIds(new Set()); }}
                      className={`flex-1 py-3 rounded-xl text-[14px] font-bold border transition-colors ${
                        oosAny === val ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {val ? "Yes" : "No"}
                    </button>
                  ))}
                </div>

                {oosAny && (
                  <div>
                    <p className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Which trucks were OOS?</p>
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                      {reviewVehicles.filter(r => !r.maintenancePerformed).map(r => (
                        <label key={r.vehicleId} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={oosSelectedIds.has(r.vehicleId)}
                            onChange={() => {
                              setOosSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(r.vehicleId)) next.delete(r.vehicleId);
                                else next.add(r.vehicleId);
                                return next;
                              });
                            }}
                            className="w-4 h-4 rounded accent-slate-900"
                          />
                          <span className="text-[14px] font-bold text-slate-800">{r.unitNumber}</span>
                        </label>
                      ))}
                      {reviewVehicles.filter(r => !r.maintenancePerformed).length === 0 && (
                        <p className="text-[12px] text-slate-400 px-1">All trucks have maintenance records this month.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-auto pt-4 border-t border-slate-100">
                  <button
                    onClick={() => { setReviewOpen(false); }}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyOosAndProceed}
                    disabled={oosAny === null}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* Signer name */}
            {modalStep === "review" && <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                <Pencil className="w-3 h-3" /> Authorized Signer
              </label>
              <input
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Full name of authorized officer"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">This name appears as the signature on every form in this batch.</p>
            </div>}

            {/* Vehicle list */}
            {modalStep === "review" && <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
              {reviewVehicles.map((r) => (
                <div key={r.vehicleId} className="border border-slate-200 rounded-xl overflow-hidden shrink-0">
                  <div className="bg-slate-50 px-4 py-3 flex items-center gap-3">
                    <span className="text-[16px] font-extrabold text-slate-900">{r.unitNumber}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                      r.maintenanceEntries.length > 0
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {r.maintenanceEntries.length > 0
                        ? `${r.maintenanceEntries.length} record${r.maintenanceEntries.length !== 1 ? "s" : ""}`
                        : "No records"}
                    </span>
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-3">
                    {/* Mileage + Station */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mileage</label>
                        <input
                          value={r.mileage}
                          onChange={e => updateReview(r.vehicleId, { mileage: e.target.value })}
                          placeholder="e.g. 125,000"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Station</label>
                        <input
                          value={r.station}
                          onChange={e => updateReview(r.vehicleId, { station: e.target.value })}
                          placeholder="e.g. APA"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition"
                        />
                      </div>
                    </div>

                    {/* Q1 */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                        Maintenance performed this month?
                      </p>
                      <div className="flex gap-2">
                        {(["Yes", "No"] as const).map(opt => {
                          const isYes = opt === "Yes";
                          const active = r.maintenancePerformed === isYes;
                          return (
                            <button
                              key={opt}
                              onClick={() => updateReview(r.vehicleId, { maintenancePerformed: isYes })}
                              className={`px-5 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                                active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Q2 — only when No maintenance */}
                    {!r.maintenancePerformed && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Was unit out of service?
                        </p>
                        <div className="flex gap-2">
                          {(["Yes", "No"] as const).map(opt => {
                            const isYes = opt === "Yes";
                            const active = r.outOfService === isYes;
                            return (
                              <button
                                key={opt}
                                onClick={() => updateReview(r.vehicleId, { outOfService: isYes })}
                                className={`px-5 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
                                  active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                                }`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Expand maintenance entries */}
                    {r.maintenanceEntries.length > 0 && (
                      <div>
                        <button
                          onClick={() => updateReview(r.vehicleId, { expanded: !r.expanded })}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {r.expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {r.expanded ? "Hide" : "View"} entries
                        </button>
                        {r.expanded && (
                          <div className="mt-2 flex flex-col gap-1.5 pl-1">
                            {r.maintenanceEntries.map((entry, i) => (
                              <div key={i} className="flex gap-2 text-[12px]">
                                <span className="text-slate-400 font-medium w-14 shrink-0">{formatEntryDate(entry.date)}</span>
                                <span className="text-slate-700">{entry.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>}

            {/* Declaration + footer */}
            {modalStep === "review" && <div className="px-6 py-4 border-t border-slate-100 shrink-0 bg-white flex flex-col gap-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 accent-slate-900 cursor-pointer shrink-0"
                />
                <span className="text-[11px] text-slate-500 leading-relaxed">
                  By checking this box, I declare that this record is true and correct. I confirm the equipment listed is in compliance with Federal Motor Carrier Safety Regulations 49 C.F.R. 396.3(a)(1) and 396.7(a) and is in safe operating condition.
                </span>
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setReviewOpen(false)}
                  disabled={generating}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmGenerate}
                  disabled={!confirmed || !signerName.trim() || generating}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {generating
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                    : <><FileDown className="w-4 h-4" /> Generate {reviewVehicles.length > 1 ? `${reviewVehicles.length} PDFs` : "PDF"}</>}
                </button>
              </div>
            </div>}
          </div>
        </div>
      )}
    </main>
  );
}

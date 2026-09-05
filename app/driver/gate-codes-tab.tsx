"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, Plus, ChevronDown, ChevronUp, Trash2, Loader2, X, MapPin, AlertTriangle } from "lucide-react";
import { addGateCode, addGateArea, reportNotWorking, deleteGateCode } from "@/lib/actions/gate-codes";
import type { GateCodeRow } from "@/lib/gate-code-constants";

const INPUT = "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition";

export default function GateCodesTab({
  initial,
  areas,
  driverId,
  driverName,
  isAdmin,
}: {
  initial: GateCodeRow[];
  areas: string[];
  driverId: string;
  driverName: string;
  isAdmin: boolean;
}) {
  const [codes, setCodes] = useState<GateCodeRow[]>(initial);
  const [allAreas, setAllAreas] = useState<string[]>(areas);
  const [openAreas, setOpenAreas] = useState<Set<string>>(new Set(areas));
  const [showAdd, setShowAdd] = useState(false);
  const [addArea, setAddArea] = useState<string>(areas[0] ?? "");
  const [addRoadName, setAddRoadName] = useState("");
  const [addCode, setAddCode] = useState("");
  const [showNewArea, setShowNewArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [isPending, startTransition] = useTransition();

  // Thumbs-down modal state
  const [reportTarget, setReportTarget] = useState<GateCodeRow | null>(null);
  const [hasNew, setHasNew] = useState<boolean | null>(null);
  const [newCode, setNewCode] = useState("");
  const [newRoadName, setNewRoadName] = useState("");

  function toggleArea(area: string) {
    setOpenAreas((prev) => {
      const next = new Set(prev);
      next.has(area) ? next.delete(area) : next.add(area);
      return next;
    });
  }

  function handleAdd() {
    if (!addCode.trim() || !addRoadName.trim()) return;
    startTransition(async () => {
      await addGateCode(addArea, addRoadName.trim(), addCode.trim(), driverId, driverName);
      setCodes((prev) => [
        {
          id: Date.now(), location: addArea, roadName: addRoadName.trim(), code: addCode.trim(),
          addedByName: driverName, active: true, createdAt: new Date(),
          reportCount: 0, myReport: false,
        },
        ...prev,
      ]);
      setAddCode("");
      setAddRoadName("");
      setShowAdd(false);
    });
  }

  function handleAddArea() {
    const trimmed = newAreaName.trim();
    if (!trimmed || allAreas.includes(trimmed)) return;
    startTransition(async () => {
      await addGateArea(trimmed);
      setAllAreas((prev) => [...prev, trimmed]);
      setOpenAreas((prev) => new Set([...prev, trimmed]));
      setNewAreaName("");
      setShowNewArea(false);
    });
  }

  function openReport(row: GateCodeRow) {
    setReportTarget(row);
    setHasNew(null);
    setNewCode("");
    setNewRoadName("");
  }

  function handleReport() {
    if (!reportTarget) return;
    startTransition(async () => {
      await reportNotWorking(
        reportTarget.id,
        driverId,
        hasNew ? newCode : undefined,
        hasNew ? reportTarget.location : undefined,
        hasNew ? driverName : undefined,
        hasNew ? newRoadName : undefined,
      );
      setCodes((prev) =>
        prev.map((c) =>
          c.id === reportTarget.id
            ? { ...c, reportCount: c.myReport ? c.reportCount : c.reportCount + 1, myReport: true }
            : c
        )
      );
      if (hasNew && newCode.trim()) {
        setCodes((prev) => [
          {
            id: Date.now(), location: reportTarget.location, roadName: newRoadName.trim() || reportTarget.roadName,
            code: newCode.trim(), addedByName: driverName, active: true, createdAt: new Date(),
            reportCount: 0, myReport: false,
          },
          ...prev,
        ]);
      }
      setReportTarget(null);
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteGateCode(id);
      setCodes((prev) => prev.filter((c) => c.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add button row */}
      <div className="flex gap-2 justify-end flex-wrap">
        {isAdmin && (
          <button
            onClick={() => { setShowNewArea((p) => !p); setNewAreaName(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold
              bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors border border-slate-200"
          >
            <MapPin className="w-4 h-4" />
            Add Location
          </button>
        )}
        <button
          onClick={() => { setShowAdd((p) => !p); setAddCode(""); setAddRoadName(""); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold
            bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Gate Code
        </button>
      </div>

      {/* Add new location form (admin only) */}
      {showNewArea && isAdmin && (
        <div className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold" style={{ color: "#0F172A" }}>Add a New Location</p>
            <button onClick={() => setShowNewArea(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-700">Once a location is added, it <strong>cannot be removed</strong>. Make sure the name is correct before saving.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>Location Name</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. South Hendersonville"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddArea()}
              className={INPUT}
            />
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowNewArea(false)}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddArea}
              disabled={!newAreaName.trim() || allAreas.includes(newAreaName.trim()) || isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white
                hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Location
            </button>
          </div>
        </div>
      )}

      {/* Add gate code form */}
      {showAdd && (
        <div className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "#ffffff", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold" style={{ color: "#0F172A" }}>Add a Gate Code</p>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>Area</label>
            <select
              value={addArea}
              onChange={(e) => setAddArea(e.target.value)}
              className={INPUT}
            >
              {allAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>
              Road / Street Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Lyndsey Dr, US-64, Kanuga Rd"
              value={addRoadName}
              onChange={(e) => setAddRoadName(e.target.value)}
              className={INPUT}
            />
            <p className="text-[11px]" style={{ color: "#94A3B8" }}>Helps other drivers find the gate</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>
              Gate Code <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 1234#"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addCode.trim() || !addRoadName.trim() || isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white
                hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Area sections */}
      {allAreas.map((area) => {
        const areaCodes = codes.filter((c) => c.location === area);
        const isOpen = openAreas.has(area);
        const badCount = areaCodes.reduce((s, c) => s + c.reportCount, 0);

        return (
          <div key={area} className="rounded-2xl overflow-hidden"
            style={{ background: "#ffffff", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {/* Area header */}
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              onClick={() => toggleArea(area)}
            >
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold" style={{ color: "#0F172A" }}>{area}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {areaCodes.length} code{areaCodes.length !== 1 ? "s" : ""}
                </span>
                {badCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center gap-1">
                    <ThumbsDown className="w-3 h-3" />
                    {badCount}
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {/* Code list */}
            {isOpen && (
              <div className="border-t border-slate-100">
                {areaCodes.length === 0 ? (
                  <p className="px-5 py-4 text-[13px]" style={{ color: "#94A3B8" }}>No codes for this area yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {areaCodes.map((c) => (
                      <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                        {/* Code display */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[22px] font-extrabold tracking-widest font-mono leading-none" style={{ color: "#0F172A" }}>
                            {c.code}
                          </p>
                          {c.roadName && (
                            <p className="text-[12px] font-semibold mt-1 flex items-center gap-1" style={{ color: "#475569" }}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              {c.roadName}
                            </p>
                          )}
                          <p className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>
                            Added by {c.addedByName}
                            {c.createdAt ? ` · ${new Date(c.createdAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>

                        {/* Not-working badge */}
                        {c.reportCount > 0 && (
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 shrink-0">
                            <ThumbsDown className="w-3 h-3 text-red-500" />
                            <span className="text-[12px] font-bold text-red-600">{c.reportCount}</span>
                          </div>
                        )}

                        {/* Thumbs down button */}
                        <button
                          onClick={() => openReport(c)}
                          disabled={c.myReport || isPending}
                          title={c.myReport ? "You already reported this" : "Report as not working"}
                          className={`p-2 rounded-xl transition-colors shrink-0 ${
                            c.myReport
                              ? "bg-red-50 text-red-400 cursor-default"
                              : "bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 border border-slate-200"
                          }`}
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>

                        {/* Admin delete */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={isPending}
                            className="p-2 rounded-xl bg-slate-50 text-slate-300 hover:bg-red-50 hover:text-red-400 transition-colors shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Report modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.2)]"
            style={{ background: "#ffffff", border: "1px solid #E2E8F0" }}>
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <ThumbsDown className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="text-[15px] font-extrabold" style={{ color: "#0F172A" }}>Not Working?</p>
                  <p className="text-[12px]" style={{ color: "#94A3B8" }}>{reportTarget.location} · Code: {reportTarget.code}</p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-4 flex flex-col gap-4">
              {hasNew === null ? (
                <>
                  <p className="text-[13px]" style={{ color: "#475569" }}>Do you have the correct code?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setHasNew(false)}
                      className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      No, just report it
                    </button>
                    <button
                      onClick={() => setHasNew(true)}
                      className="flex-1 py-3 rounded-xl text-[13px] font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                    >
                      Yes, I have it
                    </button>
                  </div>
                </>
              ) : hasNew ? (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>Road / Street Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Lyndsey Dr"
                        value={newRoadName}
                        onChange={(e) => setNewRoadName(e.target.value)}
                        className={INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748B" }}>New Gate Code</label>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Enter new code..."
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        className={INPUT}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReportTarget(null)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReport}
                      disabled={!newCode.trim() || isPending}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-slate-900 text-white
                        hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Submit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px]" style={{ color: "#475569" }}>Got it — we&apos;ll mark this code as reported.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReportTarget(null)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReport}
                      disabled={isPending}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-red-500 text-white
                        hover:bg-red-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Report
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

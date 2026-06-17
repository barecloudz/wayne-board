"use client";

import { useState, useTransition } from "react";
import { ThumbsDown, Plus, ChevronDown, ChevronUp, Trash2, Loader2, X, MapPin, AlertTriangle } from "lucide-react";
import { addGateCode, addGateArea, reportNotWorking, deleteGateCode } from "@/lib/actions/gate-codes";
import type { GateCodeRow } from "@/lib/gate-code-constants";

const INPUT = "w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-[13px] text-white placeholder-white/40 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10 transition";

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
              bg-white/10 text-white/70 hover:bg-white/20 transition-colors border border-white/15"
          >
            <MapPin className="w-4 h-4" />
            Add Location
          </button>
        )}
        <button
          onClick={() => { setShowAdd((p) => !p); setAddCode(""); setAddRoadName(""); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold
            bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/20"
        >
          <Plus className="w-4 h-4" />
          Add Gate Code
        </button>
      </div>

      {/* Add new location form (admin only) */}
      {showNewArea && isAdmin && (
        <div className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.25)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold text-white">Add a New Location</p>
            <button onClick={() => setShowNewArea(false)} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-amber-500/15 border border-amber-400/30">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-200">Once a location is added, it <strong>cannot be removed</strong>. Make sure the name is correct before saving.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Location Name</label>
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
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-white/20 text-white/60 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddArea}
              disabled={!newAreaName.trim() || allAreas.includes(newAreaName.trim()) || isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-white text-slate-900
                hover:bg-white/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
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
          style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold text-white">Add a Gate Code</p>
            <button onClick={() => setShowAdd(false)} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Area</label>
            <select
              value={addArea}
              onChange={(e) => setAddArea(e.target.value)}
              className={INPUT}
              style={{ colorScheme: "dark" }}
            >
              {allAreas.map((a) => <option key={a} value={a} style={{ background: "#4D148C", color: "white" }}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Road / Street Name <span className="text-red-300">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Lyndsey Dr, US-64, Kanuga Rd"
              value={addRoadName}
              onChange={(e) => setAddRoadName(e.target.value)}
              className={INPUT}
            />
            <p className="text-[11px] text-white/40">Helps other drivers find the gate</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Gate Code <span className="text-red-300">*</span>
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
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-white/20 text-white/60 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!addCode.trim() || !addRoadName.trim() || isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-white text-slate-900
                hover:bg-white/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
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
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
            {/* Area header */}
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              onClick={() => toggleArea(area)}
            >
              <div className="flex items-center gap-3">
                <span className="text-[14px] font-bold text-white">{area}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                  {areaCodes.length} code{areaCodes.length !== 1 ? "s" : ""}
                </span>
                {badCount > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                    <ThumbsDown className="w-3 h-3" />
                    {badCount}
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
            </button>

            {/* Code list */}
            {isOpen && (
              <div className="border-t border-white/10">
                {areaCodes.length === 0 ? (
                  <p className="px-5 py-4 text-[13px] text-white/30">No codes for this area yet.</p>
                ) : (
                  <div className="divide-y divide-white/8">
                    {areaCodes.map((c) => (
                      <div key={c.id} className="px-5 py-4 flex items-center gap-4">
                        {/* Code display */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[22px] font-extrabold text-white tracking-widest font-mono leading-none">
                            {c.code}
                          </p>
                          {c.roadName && (
                            <p className="text-[12px] font-semibold text-white/70 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {c.roadName}
                            </p>
                          )}
                          <p className="text-[11px] text-white/40 mt-0.5">
                            Added by {c.addedByName}
                            {c.createdAt ? ` · ${new Date(c.createdAt).toLocaleDateString()}` : ""}
                          </p>
                        </div>

                        {/* Not-working badge */}
                        {c.reportCount > 0 && (
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/25 shrink-0">
                            <ThumbsDown className="w-3 h-3 text-red-400" />
                            <span className="text-[12px] font-bold text-red-300">{c.reportCount}</span>
                          </div>
                        )}

                        {/* Thumbs down button */}
                        <button
                          onClick={() => openReport(c)}
                          disabled={c.myReport || isPending}
                          title={c.myReport ? "You already reported this" : "Report as not working"}
                          className={`p-2 rounded-xl transition-colors shrink-0 ${
                            c.myReport
                              ? "bg-red-500/20 text-red-400 cursor-default"
                              : "bg-white/10 text-white/50 hover:bg-red-500/20 hover:text-red-400 border border-white/10"
                          }`}
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>

                        {/* Admin delete */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={isPending}
                            className="p-2 rounded-xl bg-white/5 text-white/30 hover:bg-red-500/20 hover:text-red-400 transition-colors shrink-0"
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
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
            style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                  <ThumbsDown className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-[15px] font-extrabold text-white">Not Working?</p>
                  <p className="text-[12px] text-white/50">{reportTarget.location} · Code: {reportTarget.code}</p>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex flex-col gap-4">
              {hasNew === null ? (
                <>
                  <p className="text-[13px] text-white/70">Do you have the correct code?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setHasNew(false)}
                      className="flex-1 py-3 rounded-xl text-[13px] font-bold border border-white/20 text-white/70 hover:bg-white/10 transition-colors"
                    >
                      No, just report it
                    </button>
                    <button
                      onClick={() => setHasNew(true)}
                      className="flex-1 py-3 rounded-xl text-[13px] font-bold bg-white text-slate-900 hover:bg-white/90 transition-colors"
                    >
                      Yes, I have it
                    </button>
                  </div>
                </>
              ) : hasNew ? (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Road / Street Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Lyndsey Dr"
                        value={newRoadName}
                        onChange={(e) => setNewRoadName(e.target.value)}
                        className={INPUT}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">New Gate Code</label>
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
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-white/20 text-white/60 hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReport}
                      disabled={!newCode.trim() || isPending}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-white text-slate-900
                        hover:bg-white/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Submit
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-white/70">Got it — we&apos;ll mark this code as reported.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setReportTarget(null)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-white/20 text-white/60 hover:bg-white/10 transition-colors"
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

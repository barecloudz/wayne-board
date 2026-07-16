"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function driverName(raw: string): string {
  if (!raw) return "—";
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim().split(" ")[0];
  if (!first) return last.trim();
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() + " " + last.trim().charAt(0).toUpperCase() + ".";
}

function ilsImpacts(vscan: number | null, ilsPct: number | null): number {
  if (vscan && vscan > 0 && ilsPct != null) return Math.round(vscan * (100 - ilsPct) / 100);
  return 0;
}

export default function DswScorecardClient({ drivers, latestDate }: { drivers: any[]; latestDate: string }) {
  const [showPkgs, setShowPkgs] = useState(true);

  const dateLabel = (() => {
    try {
      const [y, m, d] = latestDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return latestDate; }
  })();

  const totalVscan   = drivers.reduce((s, r) => s + (r.vscanPkgs ?? 0), 0);
  const totalImpacts = drivers.reduce((s, r) => s + ilsImpacts(r.vscanPkgs, r.ilsPct), 0);
  const teamIlsPct   = totalVscan > 0 ? ((totalVscan - totalImpacts) / totalVscan) * 100 : null;
  const teamPassing  = teamIlsPct == null || teamIlsPct >= 99.0;
  const impactBudget = totalVscan > 0 ? Math.floor(totalVscan * 0.01) : 0;
  const remaining    = Math.max(0, impactBudget - totalImpacts);

  const sorted = [...drivers].sort((a, b) => ilsImpacts(a.vscanPkgs, a.ilsPct) - ilsImpacts(b.vscanPkgs, b.ilsPct));

  return (
    <div className="mb-8">

      {/* ── Team Status Banner ── */}
      <div className={`rounded-2xl p-5 mb-5 ${teamPassing ? "bg-emerald-500" : "bg-red-500"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mb-1">{dateLabel}</p>
            <h2 className="text-[24px] font-extrabold text-white leading-tight">
              {teamPassing ? "✅ Team is Passing Service" : "🚨 Team is FAILING Service"}
            </h2>
            <p className="text-[13px] text-white/80 mt-1">
              {teamPassing
                ? "Keep it up — every driver needs to deliver everything on their truck."
                : "We are below 99% ILS. Every undelivered package hurts the whole team."}
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide">Team ILS</p>
              <p className="text-[36px] font-extrabold text-white leading-none">
                {teamIlsPct != null ? teamIlsPct.toFixed(1) + "%" : "—"}
              </p>
              <p className="text-[11px] font-semibold text-white/70">Need ≥ 99.0%</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide">Impacts</p>
              <p className="text-[36px] font-extrabold text-white leading-none">{totalImpacts}</p>
              <p className="text-[11px] font-semibold text-white/70">
                {remaining > 0 ? `${remaining} left before fail` : "Over budget"}
              </p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide">Budget</p>
              <p className="text-[36px] font-extrabold text-white leading-none">{impactBudget}</p>
              <p className="text-[11px] font-semibold text-white/70">{totalVscan} pkgs × 1%</p>
            </div>
          </div>
        </div>

        {/* Impact budget bar */}
        <div className="mt-4">
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-white/80"
              style={{ width: `${Math.min(100, impactBudget > 0 ? (totalImpacts / impactBudget) * 100 : 0)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <p className="text-[10px] text-white/50">0 impacts</p>
            <p className="text-[10px] text-white/50">{impactBudget} max before failing</p>
          </div>
        </div>
      </div>

      {/* ── Notice + toggle ── */}
      <div className="flex items-start gap-3 mb-5">
        <div className="flex-1 bg-slate-900 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <p className="text-[12px] text-slate-300 leading-relaxed">
            <span className="text-white font-bold">ILS impacts come from status codes 2, 3, 12, and 27.</span>{" "}
            These mean a package was not delivered. Every driver is expected to deliver everything on their truck.
            Zero impacts is the standard — not a goal.
          </p>
        </div>
        <button
          onClick={() => setShowPkgs(v => !v)}
          className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 shadow-sm transition-colors whitespace-nowrap"
          title={showPkgs ? "Hide package counts" : "Show package counts"}
        >
          {showPkgs ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPkgs ? "Hide Pkgs" : "Show Pkgs"}
        </button>
      </div>

      {/* ── Driver Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.map((r) => {
          const impacts   = ilsImpacts(r.vscanPkgs, r.ilsPct);
          const ilsFail   = r.ilsPct != null && r.ilsPct < 99.0;
          const name      = driverName(r.driverNameRaw);
          const delivered = r.actDelPkgs ?? 0;
          const loaded    = r.vscanPkgs ?? 0;
          const pct       = loaded > 0 ? Math.round((delivered / loaded) * 100) : null;
          const status    = impacts === 0 ? "green" : impacts <= 3 ? "yellow" : "red";

          return (
            <div key={r.id} className={`rounded-2xl overflow-hidden border-2 shadow-sm bg-white ${
              status === "green"  ? "border-emerald-400" :
              status === "yellow" ? "border-amber-400" :
                                    "border-red-500"
            }`}>
              {/* Name bar */}
              <div className={`px-4 py-3 flex items-center justify-between ${
                status === "green"  ? "bg-emerald-500" :
                status === "yellow" ? "bg-amber-400" :
                                      "bg-red-500"
              }`}>
                <div>
                  <p className="text-[17px] font-extrabold text-white leading-tight">{name}</p>
                  <p className="text-[11px] text-white/70">{r.waName || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[28px] font-extrabold text-white leading-none">
                    {impacts === 0 ? "✓" : impacts}
                  </p>
                  <p className="text-[10px] font-bold text-white/80">
                    {impacts === 0 ? "CLEAN" : impacts === 1 ? "1 IMPACT" : `${impacts} IMPACTS`}
                  </p>
                </div>
              </div>

              {/* Stats */}
              <div className={`grid divide-x divide-slate-100 ${showPkgs ? "grid-cols-3" : "grid-cols-1"}`}>
                <div className="py-3 text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">ILS %</p>
                  <p className={`text-[20px] font-extrabold leading-none ${ilsFail ? "text-red-500" : "text-emerald-600"}`}>
                    {r.ilsPct != null ? r.ilsPct.toFixed(1) : "—"}
                  </p>
                  <p className={`text-[10px] font-bold mt-0.5 ${ilsFail ? "text-red-400" : "text-emerald-500"}`}>
                    {r.ilsPct != null ? (ilsFail ? "FAIL" : "PASS") : "—"}
                  </p>
                </div>

                {showPkgs && (
                  <div className="py-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Stops</p>
                    <p className="text-[20px] font-extrabold text-slate-800 leading-none">{r.actDelStps ?? "—"}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {r.delStpsPlanned ? `of ${r.delStpsPlanned}` : "delivered"}
                    </p>
                  </div>
                )}

                {showPkgs && (
                  <div className="py-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Pkgs</p>
                    <p className="text-[20px] font-extrabold text-slate-800 leading-none">{delivered}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">of {loaded}</p>
                  </div>
                )}
              </div>

              {/* Package bar — only when shown */}
              {showPkgs && (
                <div className="px-4 pb-3">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        (pct ?? 0) >= 99 ? "bg-emerald-400" :
                        (pct ?? 0) >= 90 ? "bg-amber-400" : "bg-red-400"
                      }`}
                      style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 text-right">
                    {pct != null ? `${pct}% of load delivered` : ""}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

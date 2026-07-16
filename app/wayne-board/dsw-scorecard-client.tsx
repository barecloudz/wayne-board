"use client";

function driverName(raw: string): string {
  if (!raw) return "—";
  const [last, ...rest] = raw.split(",");
  const first = rest.join(" ").trim().split(" ")[0];
  if (!first) return last.trim();
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() + " " + last.trim().charAt(0).toUpperCase() + ".";
}

type WeekDriver = {
  driverNameRaw: string;
  waName: string;
  totalVscan: number;
  totalImpacts: number;
  days: string[];
};

export default function DswScorecardClient({
  drivers,
  weekStart,
  weekEnd,
  latestDate,
}: {
  drivers: WeekDriver[];
  weekStart: string;
  weekEnd: string;
  latestDate: string;
}) {
  const weekLabel = (() => {
    try {
      const fmt = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      };
      return `Week of ${fmt(weekStart)} – ${fmt(weekEnd)}`;
    } catch { return weekStart; }
  })();

  const latestLabel = (() => {
    try {
      const [y, m, d] = latestDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return latestDate; }
  })();

  const totalVscan   = drivers.reduce((s, r) => s + r.totalVscan, 0);
  const totalImpacts = drivers.reduce((s, r) => s + r.totalImpacts, 0);
  const impactBudget = totalVscan > 0 ? Math.floor(totalVscan * 0.01) : 0;
  const teamIlsPct   = totalVscan > 0 ? ((totalVscan - totalImpacts) / totalVscan) * 100 : null;
  const teamPassing  = teamIlsPct == null || teamIlsPct >= 99.0;
  const remaining    = Math.max(0, impactBudget - totalImpacts);

  // Sort: fewest impacts first (clean drivers at top)
  const sorted = [...drivers].sort((a, b) => a.totalImpacts - b.totalImpacts);

  return (
    <div className="mb-8">

      {/* ── Team Banner ── */}
      <div className={`rounded-2xl p-5 mb-5 ${teamPassing ? "bg-emerald-500" : "bg-red-500"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-widest mb-1">{weekLabel}</p>
            <h2 className="text-[22px] font-extrabold text-white leading-tight">
              {teamPassing ? "✅ Team is Passing Service" : "🚨 Team is FAILING Service"}
            </h2>
            <p className="text-[12px] text-white/80 mt-1">
              {teamPassing
                ? "Keep it up — every driver needs to deliver everything on their truck."
                : "We are below 99% ILS. Every undelivered package hurts the whole team."}
            </p>
            <p className="text-[11px] text-white/60 mt-1">Last sync: {latestLabel}</p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Week ILS</p>
              <p className="text-[34px] font-extrabold text-white leading-none">
                {teamIlsPct != null ? teamIlsPct.toFixed(1) + "%" : "—"}
              </p>
              <p className="text-[10px] font-semibold text-white/70">Need ≥ 99.0%</p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Impacts</p>
              <p className="text-[34px] font-extrabold text-white leading-none">{totalImpacts}</p>
              <p className="text-[10px] font-semibold text-white/70">
                {remaining > 0 ? `${remaining} left before fail` : "Over budget"}
              </p>
            </div>
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Budget</p>
              <p className="text-[34px] font-extrabold text-white leading-none">{impactBudget}</p>
              <p className="text-[10px] font-semibold text-white/70">1% of week total</p>
            </div>
          </div>
        </div>

        {/* Budget bar */}
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

      {/* ── Notice ── */}
      <div className="bg-slate-900 rounded-xl px-4 py-3 flex items-start gap-3 mb-5">
        <span className="text-lg shrink-0">⚠️</span>
        <p className="text-[12px] text-slate-300 leading-relaxed">
          <span className="text-white font-bold">ILS impacts come from status codes 2, 3, 12, and 27.</span>{" "}
          These mean a package was not delivered. Deliver everything on your truck — zero impacts is the standard, not a goal.
        </p>
      </div>

      {/* ── Leaderboard ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {sorted.map((r, i) => {
          const impacts = r.totalImpacts;
          const name    = driverName(r.driverNameRaw);
          const status  = impacts === 0 ? "green" : impacts <= 3 ? "yellow" : "red";
          const rank    = i + 1;

          return (
            <div
              key={r.driverNameRaw}
              className={`rounded-2xl overflow-hidden border-2 shadow-sm bg-white ${
                status === "green"  ? "border-emerald-400" :
                status === "yellow" ? "border-amber-400" :
                                      "border-red-500"
              }`}
            >
              {/* Header */}
              <div className={`px-3 py-2.5 flex items-center justify-between ${
                status === "green"  ? "bg-emerald-500" :
                status === "yellow" ? "bg-amber-400" :
                                      "bg-red-500"
              }`}>
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-white leading-tight truncate">{name}</p>
                  <p className="text-[10px] text-white/70">{r.waName || "—"}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-[24px] font-extrabold text-white leading-none">
                    {impacts === 0 ? "✓" : impacts}
                  </p>
                  <p className="text-[9px] font-bold text-white/80 uppercase">
                    {impacts === 0 ? "CLEAN" : impacts === 1 ? "1 IMPACT" : `${impacts} IMPACTS`}
                  </p>
                </div>
              </div>

              {/* Week stats */}
              <div className="py-3 px-3 flex items-center justify-between">
                <div className="text-center flex-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Days</p>
                  <p className="text-[18px] font-extrabold text-slate-800 leading-none">{r.days.length}</p>
                  <p className="text-[9px] text-slate-400">this week</p>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center flex-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Rank</p>
                  <p className="text-[18px] font-extrabold text-slate-800 leading-none">#{rank}</p>
                  <p className="text-[9px] text-slate-400">of {sorted.length}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

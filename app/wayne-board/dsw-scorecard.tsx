import { db } from "@/lib/db";
import { dswRouteDays } from "@/lib/schema";
import { desc } from "drizzle-orm";

function initials(raw: string): string {
  if (!raw) return "?";
  const [last, ...rest] = raw.split(",");
  const first = rest.join("").trim();
  const fi = first.charAt(0).toUpperCase();
  const li = last.trim().charAt(0).toUpperCase();
  return fi && li ? `${fi}.${li}.` : li || fi || "?";
}

function ilsImpacts(vscanPkgs: number | null, ilsPct: number | null, allStatusCodePkgs: number | null): number {
  if (vscanPkgs && vscanPkgs > 0 && ilsPct != null) {
    return Math.round(vscanPkgs * (100 - ilsPct) / 100);
  }
  return allStatusCodePkgs ?? 0;
}

function serviceRate(actDelStps: number | null, nonDelvdStps: number | null): number | null {
  const del = actDelStps ?? 0;
  const nondel = nonDelvdStps ?? 0;
  const total = del + nondel;
  if (!total) return null;
  return (del / total) * 100;
}

export default async function DswScorecard() {
  const rows = await db.select().from(dswRouteDays).orderBy(desc(dswRouteDays.date)).limit(80);

  const latestDate = rows[0]?.date ?? null;
  if (!latestDate) return null;

  const dateRows = rows.filter(r => r.date === latestDate && !!r.driverNameRaw);

  const dateLabel = (() => {
    try {
      const [y, m, d] = latestDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return latestDate; }
  })();

  // Sort: fewest ILS first, then best service rate
  const sorted = [...dateRows].sort((a, b) => {
    const ia = ilsImpacts(a.vscanPkgs, a.ilsPct, a.allStatusCodePkgs);
    const ib = ilsImpacts(b.vscanPkgs, b.ilsPct, b.allStatusCodePkgs);
    if (ia !== ib) return ia - ib;
    return (serviceRate(b.actDelStps, b.nonDelvdStps) ?? 0) - (serviceRate(a.actDelStps, a.nonDelvdStps) ?? 0);
  });

  const totalImpacts = sorted.reduce((s, r) => s + ilsImpacts(r.vscanPkgs, r.ilsPct, r.allStatusCodePkgs), 0);
  const green  = sorted.filter(r => ilsImpacts(r.vscanPkgs, r.ilsPct, r.allStatusCodePkgs) === 0).length;
  const yellow = sorted.filter(r => { const i = ilsImpacts(r.vscanPkgs, r.ilsPct, r.allStatusCodePkgs); return i >= 1 && i <= 3; }).length;
  const red    = sorted.filter(r => ilsImpacts(r.vscanPkgs, r.ilsPct, r.allStatusCodePkgs) > 3).length;
  const failSvc = sorted.filter(r => { const s = serviceRate(r.actDelStps, r.nonDelvdStps); return s != null && s < 99; }).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900">Service Scorecard</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{dateLabel} · FedEx DSW</p>
        </div>
        {/* Summary pills */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[12px] font-bold text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            {green} clean
          </span>
          {yellow > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[12px] font-bold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              {yellow} watch
            </span>
          )}
          {red > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[12px] font-bold text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {red} high
            </span>
          )}
          {failSvc > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-[12px] font-bold text-red-600">
              ⚠ {failSvc} below 99%
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              {["Driver", "Route", "ILS Impacts", "Service Rate", "Loaded → Del'd", "Not Del'd", "Stops"].map(h => (
                <th key={h} className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap first:pl-6 last:pr-6">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const impacts = ilsImpacts(r.vscanPkgs, r.ilsPct, r.allStatusCodePkgs);
              const svc     = serviceRate(r.actDelStps, r.nonDelvdStps);
              const svcFail = svc != null && svc < 99;

              const tier =
                impacts === 0 ? "green"
                : impacts <= 3 ? "yellow"
                : "red";

              const rowBg =
                tier === "green"  ? "bg-emerald-50/40 border-l-[3px] border-emerald-400" :
                tier === "yellow" ? "bg-amber-50/40 border-l-[3px] border-amber-400" :
                                    "bg-red-50/40 border-l-[3px] border-red-500";

              const impactColor =
                impacts === 0     ? "text-emerald-600" :
                impacts <= 3      ? "text-amber-600" :
                                    "text-red-600";

              const impactBadge =
                tier === "green"  ? "bg-emerald-100 text-emerald-700" :
                tier === "yellow" ? "bg-amber-100 text-amber-700" :
                                    "bg-red-100 text-red-600";

              return (
                <tr key={r.id} className={`border-b border-slate-50 transition-colors ${rowBg}`}>
                  {/* Driver */}
                  <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-extrabold shrink-0 ${
                        tier === "green"  ? "bg-emerald-100 text-emerald-700" :
                        tier === "yellow" ? "bg-amber-100 text-amber-700" :
                                            "bg-red-100 text-red-600"
                      }`}>
                        {initials(r.driverNameRaw).replace(/\./g, "")}
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-slate-800">{initials(r.driverNameRaw)}</p>
                        <p className="text-[10px] text-slate-400">{r.driverId ? "matched" : "unmatched"}</p>
                      </div>
                    </div>
                  </td>

                  {/* Route */}
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-slate-600">{r.waName || "—"}</span>
                  </td>

                  {/* ILS Impacts */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-[18px] font-extrabold leading-none ${impactColor}`}>{impacts}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${impactBadge}`}>
                        {tier === "green" ? "CLEAN" : tier === "yellow" ? "WATCH" : "HIGH"}
                      </span>
                    </div>
                  </td>

                  {/* Service Rate */}
                  <td className="px-4 py-3">
                    {svc != null ? (
                      <span className={`inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-lg ${
                        svcFail ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {svc.toFixed(1)}% {svcFail ? "✗" : "✓"}
                      </span>
                    ) : <span className="text-[12px] text-slate-300">—</span>}
                  </td>

                  {/* Loaded → Delivered */}
                  <td className="px-4 py-3">
                    <span className="text-[12px] text-slate-600 font-mono">
                      {r.vscanPkgs ?? "—"} → {r.actDelPkgs ?? "—"}
                    </span>
                  </td>

                  {/* Not Delivered */}
                  <td className="px-4 py-3">
                    {(r.nonDelvdStps ?? 0) > 0 ? (
                      <span className="text-[12px] font-bold text-red-500">{r.nonDelvdStps}</span>
                    ) : (
                      <span className="text-[12px] text-slate-300">0</span>
                    )}
                  </td>

                  {/* Stops */}
                  <td className="px-4 py-3 pr-6">
                    <span className="text-[12px] text-slate-600">{r.actDelStps ?? "—"}</span>
                    {r.delStpsPlanned ? <span className="text-[11px] text-slate-400"> / {r.delStpsPlanned}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-100 flex items-center gap-4">
        <span className="text-[11px] text-slate-400">{sorted.length} routes · {totalImpacts} total ILS impacts</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1 text-[11px] text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />0 impacts</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />1–3 impacts</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />4+ impacts</span>
          <span className="text-[11px] text-slate-300 ml-2">Service fails below 99.0%</span>
        </div>
      </div>
    </div>
  );
}

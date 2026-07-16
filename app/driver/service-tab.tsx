"use client";

export type DswRow = {
  id: number;
  date: string;
  driverId: string | null;
  driverNameRaw: string;
  waName: string;
  waNumber: string;
  ilsPct: number | null;
  actDelStps: number | null;
  actDelPkgs: number | null;
  nonDelvdStps: number | null;
  allStatusCodePkgs: number | null;
  vscanPkgs: number | null;
  delStpsPlanned: number | null;
};

function dswInitials(raw: string): string {
  if (!raw) return "?";
  const [last, ...rest] = raw.split(",");
  const first = rest.join("").trim();
  const fi = first.charAt(0).toUpperCase();
  const li = last.trim().charAt(0).toUpperCase();
  return fi && li ? `${fi}.${li}.` : li || fi || "?";
}

function ilsImpacts(row: DswRow): number {
  if (row.vscanPkgs && row.vscanPkgs > 0 && row.ilsPct != null) {
    return Math.round(row.vscanPkgs * (100 - row.ilsPct) / 100);
  }
  return row.allStatusCodePkgs ?? 0;
}

function serviceRate(row: DswRow): number | null {
  const del = row.actDelStps ?? 0;
  const nondel = row.nonDelvdStps ?? 0;
  const total = del + nondel;
  if (!total) return null;
  return (del / total) * 100;
}

type IlsTier = "green" | "yellow" | "red" | "none";

function ilsTier(impacts: number, hasData: boolean): IlsTier {
  if (!hasData) return "none";
  if (impacts === 0) return "green";
  if (impacts <= 3) return "yellow";
  return "red";
}

const tierStyles = {
  green:  { row: "bg-emerald-50/60 border-l-2 border-emerald-400", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-400", label: "CLEAN" },
  yellow: { row: "bg-amber-50/60 border-l-2 border-amber-400",    badge: "bg-amber-100 text-amber-700",    dot: "bg-amber-400",   label: "WATCH" },
  red:    { row: "bg-red-50/60 border-l-2 border-red-400",        badge: "bg-red-100 text-red-600",        dot: "bg-red-500",     label: "HIGH"  },
  none:   { row: "bg-slate-50 border-l-2 border-slate-200",        badge: "bg-slate-100 text-slate-400",    dot: "bg-slate-300",   label: "—"     },
};

function svcBadge(rate: number | null) {
  if (rate == null) return null;
  const pass = rate >= 99.0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
      pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
    }`}>
      {rate.toFixed(1)}% {pass ? "✓" : "✗"}
    </span>
  );
}

export default function ServiceTab({
  rows,
  myDriverId,
}: {
  rows: DswRow[];
  myDriverId: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-10 flex flex-col items-center text-center"
        style={{
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.15)",
          backdropFilter: "blur(12px)",
        }}
      >
        <p className="text-[22px] mb-2">📋</p>
        <p className="text-[15px] font-bold text-white/70">No service data yet</p>
        <p className="text-[12px] text-white/40 mt-1">
          Data syncs each morning from the FedEx Daily Service Worksheet.
        </p>
      </div>
    );
  }

  const dateLabel = (() => {
    try {
      const [y, m, d] = rows[0].date.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch { return rows[0].date; }
  })();

  const myRow = rows.find(r => r.driverId === myDriverId) ?? null;
  const myImpacts = myRow ? ilsImpacts(myRow) : 0;
  const mySvcRate = myRow ? serviceRate(myRow) : null;
  const myTier    = myRow ? ilsTier(myImpacts, true) : "none";

  const statusConfig = {
    green:  { headline: "Looking Good!", sub: "Clean ILS and solid service rate.", emoji: "✅" },
    yellow: { headline: "Watch Your ILS", sub: `${myImpacts} ILS impact${myImpacts !== 1 ? "s" : ""} — keep it under 4.`, emoji: "⚠️" },
    red:    { headline: "Needs Attention", sub: `${myImpacts} ILS impacts — talk to your manager.`, emoji: "🔴" },
    none:   { headline: "No Data Found", sub: "Your route may not have synced yet.", emoji: "❓" },
  }[myTier];

  // Sort: fewest ILS impacts first; within same impact count, best service rate first
  const sorted = [...rows].sort((a, b) => {
    const ia = ilsImpacts(a), ib = ilsImpacts(b);
    if (ia !== ib) return ia - ib;
    return (serviceRate(b) ?? 0) - (serviceRate(a) ?? 0);
  });

  const svcFail = mySvcRate != null && mySvcRate < 99.0;

  return (
    <div className="flex flex-col gap-4">

      {/* Personal card */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.2)]">
        {/* Header stripe */}
        <div
          className="px-5 pt-5 pb-4"
          style={{
            background: myTier === "green"
              ? "linear-gradient(135deg, #065f46, #059669)"
              : myTier === "yellow"
              ? "linear-gradient(135deg, #78350f, #d97706)"
              : myTier === "red"
              ? "linear-gradient(135deg, #7f1d1d, #dc2626)"
              : "linear-gradient(135deg, #1e293b, #475569)",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">How You&apos;re Doing</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">{statusConfig.emoji}</span>
            <div>
              <p className="text-[22px] font-extrabold text-white leading-tight">{statusConfig.headline}</p>
              <p className="text-[12px] text-white/65 mt-0.5">{statusConfig.sub}</p>
            </div>
          </div>
        </div>

        {myRow ? (
          <>
            {/* Metric row */}
            <div className="grid grid-cols-3 divide-x divide-slate-100">
              {/* Service rate */}
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Service Rate</p>
                {mySvcRate != null ? (
                  <>
                    <p className={`text-[24px] font-extrabold leading-none ${
                      mySvcRate >= 99 ? "text-emerald-600" : "text-red-500"
                    }`}>{mySvcRate.toFixed(1)}%</p>
                    <p className={`text-[11px] font-bold mt-1 ${
                      mySvcRate >= 99 ? "text-emerald-500" : "text-red-500"
                    }`}>{mySvcRate >= 99 ? "PASS" : "FAIL"}</p>
                  </>
                ) : (
                  <p className="text-[22px] font-extrabold text-slate-300">—</p>
                )}
              </div>

              {/* ILS impacts */}
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">ILS Impacts</p>
                <p className={`text-[24px] font-extrabold leading-none ${
                  myImpacts === 0 ? "text-emerald-600"
                  : myImpacts <= 3 ? "text-amber-500"
                  : "text-red-500"
                }`}>{myImpacts}</p>
                <p className={`text-[11px] font-bold mt-1 ${
                  myImpacts === 0 ? "text-emerald-500"
                  : myImpacts <= 3 ? "text-amber-500"
                  : "text-red-500"
                }`}>{myImpacts === 0 ? "CLEAN" : myImpacts <= 3 ? "WATCH" : "HIGH"}</p>
              </div>

              {/* Stops */}
              <div className="px-4 py-4 text-center">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Stops Del&apos;d</p>
                <p className="text-[24px] font-extrabold text-slate-800 leading-none">
                  {myRow.actDelStps ?? "—"}
                </p>
                {myRow.delStpsPlanned ? (
                  <p className="text-[11px] text-slate-400 mt-1">of {myRow.delStpsPlanned} planned</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">&nbsp;</p>
                )}
              </div>
            </div>

            {/* Vscan vs delivered row */}
            {(myRow.vscanPkgs != null || myRow.actDelPkgs != null) && (
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loaded (Vscan)</p>
                    <p className="text-[16px] font-extrabold text-slate-700">{myRow.vscanPkgs ?? "—"}</p>
                  </div>
                  <span className="text-slate-300 text-lg">→</span>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivered</p>
                    <p className="text-[16px] font-extrabold text-slate-700">{myRow.actDelPkgs ?? "—"}</p>
                  </div>
                  {myRow.nonDelvdStps != null && myRow.nonDelvdStps > 0 && (
                    <>
                      <span className="text-slate-300 text-lg">·</span>
                      <div>
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Not Del&apos;d</p>
                        <p className="text-[16px] font-extrabold text-red-500">{myRow.nonDelvdStps}</p>
                      </div>
                    </>
                  )}
                </div>
                {svcFail && (
                  <span className="text-[11px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
                    Below 99% — Fail
                  </span>
                )}
              </div>
            )}

            {/* Date footer */}
            <div className="px-5 py-2.5 border-t border-slate-100">
              <p className="text-[11px] text-slate-400">{dateLabel}</p>
            </div>
          </>
        ) : (
          <div className="px-5 py-5 text-center">
            <p className="text-[13px] text-slate-400">Your route wasn&apos;t found in yesterday&apos;s data.</p>
            <p className="text-[11px] text-slate-300 mt-1">Make sure your Wayne Board profile is linked to your FedEx account.</p>
          </div>
        )}
      </div>

      {/* Team list */}
      <div className="bg-white rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-slate-900">Team Service</h2>
          <span className="text-[11px] text-slate-400">{dateLabel}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {sorted.map((row, i) => {
            const impacts = ilsImpacts(row);
            const svc     = serviceRate(row);
            const tier    = ilsTier(impacts, row.ilsPct != null);
            const ts      = tierStyles[tier];
            const isMe    = row.driverId === myDriverId;
            const initials = dswInitials(row.driverNameRaw);

            return (
              <div
                key={row.id}
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${ts.row} ${isMe ? "ring-1 ring-inset ring-blue-200" : ""}`}
              >
                {/* Rank */}
                <span className="text-[12px] font-bold text-slate-400 w-5 shrink-0 text-center">{i + 1}</span>

                {/* Color dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ts.dot}`} />

                {/* Driver initials */}
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-extrabold ${
                  isMe ? "text-white" : "text-slate-600 bg-slate-100"
                }`}
                  style={isMe ? { background: "linear-gradient(135deg, #4D148C, #7B2FC0)" } : {}}
                >
                  {initials.replace(/\./g, "")}
                </div>

                {/* Route name */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-bold truncate ${isMe ? "text-purple-800" : "text-slate-700"}`}>
                    {initials}{isMe ? " (You)" : ""}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{row.waName || "—"}</p>
                </div>

                {/* Service rate */}
                <div className="shrink-0">{svcBadge(svc)}</div>

                {/* ILS */}
                <div className="shrink-0 text-right min-w-[52px]">
                  <p className={`text-[13px] font-extrabold ${
                    impacts === 0 ? "text-emerald-600"
                    : impacts <= 3 ? "text-amber-500"
                    : "text-red-500"
                  }`}>{impacts} ILS</p>
                  <p className={`text-[10px] font-bold ${ts.badge.split(" ").slice(1).join(" ")}`}>{ts.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /><span className="text-[11px] text-slate-400">0 impacts</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /><span className="text-[11px] text-slate-400">1–3 impacts</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /><span className="text-[11px] text-slate-400">4+ impacts</span></div>
          <span className="ml-auto text-[10px] text-slate-300">Names shown as initials only</span>
        </div>
      </div>

    </div>
  );
}

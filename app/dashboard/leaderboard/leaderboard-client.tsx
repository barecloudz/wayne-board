"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Trophy, Settings, Clock, Loader2, X, Camera } from "lucide-react";
import {
  computeTopDrivers, awardBadgesForWeek, awardSpecialBadge,
  upsertBadgeType, deleteBadgeType, isWeekAwarded, revokeBadge, clearBadgeIcon,
} from "@/lib/actions/badges";
import type { BadgeTypeRow, TopDriverRow, BadgeHistoryRow } from "@/lib/actions/badges";
import { useRouter } from "next/navigation";

// ── Default trophy SVGs ───────────────────────────────────────────────────────
function DefaultTrophySvg({ rank }: { rank: number }) {
  const color = rank === 1 ? "#F59E0B" : rank === 2 ? "#9CA3AF" : "#B45309";
  return (
    <svg viewBox="0 0 24 24" fill={color} className="w-8 h-8">
      <path d="M12 2C9.79 2 8 3.79 8 6v2H5a1 1 0 0 0-1 1c0 2.76 2.08 5.04 4.8 5.44A6.01 6.01 0 0 0 11 16.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A6.01 6.01 0 0 0 15.2 14.44C17.92 14.04 20 11.76 20 9a1 1 0 0 0-1-1h-3V6c0-2.21-1.79-4-4-4zm-5 9.86A4.01 4.01 0 0 1 5.07 9H8v2a6.07 6.07 0 0 1-1 .86zM16 11V9h2.93A4.01 4.01 0 0 1 17 11.86 6.07 6.07 0 0 1 16 11z" />
    </svg>
  );
}

// ── Shine CSS ─────────────────────────────────────────────────────────────────
const shineStyle = `
  @keyframes shine-sweep {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .badge-shine {
    position: relative;
    display: inline-block;
  }
  .badge-shine::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,215,0,0.55) 50%, transparent 60%);
    background-size: 200% 100%;
    animation: shine-sweep 2s linear infinite;
    pointer-events: none;
    border-radius: inherit;
  }
`;

// ── Badge icon display ────────────────────────────────────────────────────────
function BadgeIcon({ badge, size = 32 }: { badge: BadgeTypeRow; size?: number }) {
  if (!badge.iconUrl) return <DefaultTrophySvg rank={badge.rank ?? 0} />;
  return (
    <span className={badge.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
      <img src={badge.iconUrl} alt={badge.name} width={size} height={size} style={{ objectFit: "contain" }} />
    </span>
  );
}

// ── Week picker helpers ───────────────────────────────────────────────────────
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function getSundayOf(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d;
}
function prevMonday(): Date {
  const today = new Date();
  const thisMonday = getMondayOfWeek(today);
  const prev = new Date(thisMonday);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

type Driver = { driverId: string; name: string; avatarUrl?: string | null };

type Props = {
  initialBadgeTypes: BadgeTypeRow[];
  initialHistory:    BadgeHistoryRow[];
  allDrivers:        Driver[];
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaderboardClient({ initialBadgeTypes, initialHistory, allDrivers }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"award" | "setup" | "history">("award");
  const history = initialHistory;

  const weeklyBadges = initialBadgeTypes
    .filter(b => b.category === "weekly")
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const specialBadges = initialBadgeTypes.filter(b => b.category === "special");

  // ── Award Tab State ──────────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(() => toDateStr(prevMonday()));
  const weekEnd = toDateStr(getSundayOf(new Date(weekStart + "T00:00:00")));

  const [topDrivers, setTopDrivers] = useState<TopDriverRow[] | null>(null);
  const [weekAwarded, setWeekAwarded] = useState(false);
  const [loadingWeek, startLoadWeek] = useTransition();
  const [awarding, startAward] = useTransition();

  const [specialDriverId, setSpecialDriverId] = useState("");
  const [specialBadgeTypeId, setSpecialBadgeTypeId] = useState("");
  const [specialAwarding, startSpecialAward] = useTransition();

  function loadWeek() {
    startLoadWeek(async () => {
      const [drivers, awarded] = await Promise.all([
        computeTopDrivers(weekStart, weekEnd),
        isWeekAwarded(weekStart),
      ]);
      setTopDrivers(drivers);
      setWeekAwarded(awarded);
    });
  }

  function handleAward() {
    if (!topDrivers) return;
    startAward(async () => {
      const awards = topDrivers
        .map((d, i) => ({ driverId: d.driverId, badgeTypeId: weeklyBadges[i]?.id }))
        .filter(a => a.badgeTypeId != null) as Array<{ driverId: string; badgeTypeId: number }>;
      await awardBadgesForWeek(weekStart, awards);
      setWeekAwarded(true);
      router.refresh();
    });
  }

  function handleSpecialAward() {
    if (!specialDriverId || !specialBadgeTypeId) return;
    startSpecialAward(async () => {
      await awardSpecialBadge(specialDriverId, Number(specialBadgeTypeId), weekStart);
      setSpecialDriverId("");
      setSpecialBadgeTypeId("");
      router.refresh();
    });
  }

  // ── Badge Setup Tab — Rank cards (always editable, no toggle) ───────────
  function defaultRankName(rank: number) {
    return rank === 1 ? "Gold" : rank === 2 ? "Silver" : "Bronze";
  }

  const weeklyKey = weeklyBadges.map(b => `${b.id}:${b.name}:${b.shine}`).join(",");

  const [rankEdits, setRankEdits] = useState<Record<number, { name: string; shine: boolean }>>(() => {
    const init: Record<number, { name: string; shine: boolean }> = {};
    for (const r of [1, 2, 3]) {
      const bt = weeklyBadges.find(b => b.rank === r);
      init[r] = bt ? { name: bt.name, shine: bt.shine } : { name: defaultRankName(r), shine: false };
    }
    return init;
  });

  useEffect(() => {
    setRankEdits(prev => {
      const next = { ...prev };
      for (const r of [1, 2, 3]) {
        const bt = weeklyBadges.find(b => b.rank === r);
        if (bt) next[r] = { name: bt.name, shine: bt.shine };
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyKey]);

  const [rankSaving, setRankSaving]           = useState<Record<number, boolean>>({});
  const [rankUploading, setRankUploading]     = useState<Record<number, boolean>>({});
  const [rankPendingFile, setRankPendingFile] = useState<Record<number, File | null>>({});
  const [rankPendingPreview, setRankPendingPreview] = useState<Record<number, string | null>>({});

  const rankRef1 = useRef<HTMLInputElement>(null);
  const rankRef2 = useRef<HTMLInputElement>(null);
  const rankRef3 = useRef<HTMLInputElement>(null);
  const rankRefs: Record<number, React.RefObject<HTMLInputElement | null>> = {
    1: rankRef1, 2: rankRef2, 3: rankRef3,
  };

  function handleRankFileSelect(rank: number, file: File) {
    const existingBt = weeklyBadges.find(b => b.rank === rank);
    if (existingBt) {
      // Badge exists — upload immediately
      setRankUploading(prev => ({ ...prev, [rank]: true }));
      const fd = new FormData();
      fd.append("file", file);
      fd.append("badgeTypeId", String(existingBt.id));
      fetch("/api/badge-icons/upload", { method: "POST", body: fd })
        .then(r => r.json())
        .then(data => {
          setRankUploading(prev => ({ ...prev, [rank]: false }));
          if (data.url) router.refresh();
        })
        .catch(() => setRankUploading(prev => ({ ...prev, [rank]: false })));
    } else {
      // Badge not yet created — store pending, upload on Save
      setRankPendingFile(prev => ({ ...prev, [rank]: file }));
      setRankPendingPreview(prev => ({ ...prev, [rank]: URL.createObjectURL(file) }));
    }
  }

  async function handleSaveRank(rank: number) {
    setRankSaving(prev => ({ ...prev, [rank]: true }));
    try {
      const edit = rankEdits[rank] ?? { name: defaultRankName(rank), shine: false };
      const existingBt = weeklyBadges.find(b => b.rank === rank);
      const { id: badgeId } = await upsertBadgeType({
        id:       existingBt?.id,
        rank,
        name:     edit.name,
        shine:    edit.shine,
        iconUrl:  existingBt?.iconUrl,
        category: "weekly",
      });
      const pendingFile = rankPendingFile[rank];
      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        fd.append("badgeTypeId", String(badgeId));
        await fetch("/api/badge-icons/upload", { method: "POST", body: fd });
        setRankPendingFile(prev => ({ ...prev, [rank]: null }));
        setRankPendingPreview(prev => ({ ...prev, [rank]: null }));
      }
      router.refresh();
    } finally {
      setRankSaving(prev => ({ ...prev, [rank]: false }));
    }
  }

  // ── Special Badges ───────────────────────────────────────────────────────
  const [newSpecialName, setNewSpecialName]   = useState("");
  const [newSpecialShine, setNewSpecialShine] = useState(false);
  const [newSpecialFile, setNewSpecialFile]   = useState<File | null>(null);
  const [newSpecialPreview, setNewSpecialPreview] = useState<string | null>(null);
  const [addingSpecial, startAddSpecial]      = useTransition();
  const [deleting, startDelete]               = useTransition();
  const newSpecialRef = useRef<HTMLInputElement>(null);

  function handleAddSpecial() {
    if (!newSpecialName.trim()) return;
    startAddSpecial(async () => {
      const { id: badgeId } = await upsertBadgeType({
        name:     newSpecialName.trim(),
        shine:    newSpecialShine,
        category: "special",
      });
      if (newSpecialFile) {
        const fd = new FormData();
        fd.append("file", newSpecialFile);
        fd.append("badgeTypeId", String(badgeId));
        await fetch("/api/badge-icons/upload", { method: "POST", body: fd });
      }
      setNewSpecialName("");
      setNewSpecialShine(false);
      setNewSpecialFile(null);
      setNewSpecialPreview(null);
      router.refresh();
    });
  }

  function handleDeleteSpecial(id: number) {
    startDelete(async () => {
      await deleteBadgeType(id);
      router.refresh();
    });
  }

  // ── History Revoke ───────────────────────────────────────────────────────
  const [revoking, setRevoking] = useState<number | null>(null);

  async function handleRevoke(id: number) {
    setRevoking(id);
    try {
      await revokeBadge(id);
      router.refresh();
    } finally {
      setRevoking(null);
    }
  }

  const unmappedCount = topDrivers?.[0]?.unmappedCount ?? 0;

  return (
    <>
      <style>{shineStyle}</style>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Leaderboard</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {([["award", "Award", Trophy], ["setup", "Badge Setup", Settings], ["history", "History", Clock]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Award Tab ───────────────────────────────────────────────────── */}
        {tab === "award" && (
          <div className="flex flex-col gap-6">
            {/* Week picker */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-semibold text-slate-700">Week of</label>
              <input
                type="date"
                value={weekStart}
                onChange={e => { setWeekStart(e.target.value); setTopDrivers(null); setWeekAwarded(false); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-400">→ {weekEnd}</span>
              <button
                onClick={loadWeek}
                disabled={loadingWeek}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {loadingWeek && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Load
              </button>
            </div>

            {unmappedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                ⚠ {unmappedCount} unmapped DSW route{unmappedCount !== 1 ? "s" : ""} for this week — fix driver mappings in DSW Upload for accurate rankings.
              </div>
            )}

            {topDrivers && topDrivers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Rank</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Driver</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500">Avg ILS%</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500">Days</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-500">Badge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDrivers.map((d, i) => {
                      const badge = weeklyBadges[i];
                      return (
                        <tr key={d.driverId} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 font-bold text-slate-800">#{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{d.driverName}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{d.avgIls.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right text-slate-500">{d.dayCount}</td>
                          <td className="px-4 py-3 flex justify-center">
                            {badge ? <BadgeIcon badge={badge} size={28} /> : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {topDrivers && topDrivers.length === 0 && (
              <p className="text-slate-500 text-sm">No mapped DSW data found for this week.</p>
            )}

            {topDrivers && !weekAwarded && (
              <button
                onClick={handleAward}
                disabled={awarding || topDrivers.length === 0}
                className="self-start px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {awarding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Award Badges for This Week
              </button>
            )}

            {weekAwarded && (
              <p className="text-sm font-semibold text-emerald-600">✓ Badges awarded for this week</p>
            )}

            {/* Special badge award */}
            {specialBadges.length > 0 && (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
                <p className="text-sm font-bold text-slate-700">Award Special Badge</p>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={specialDriverId}
                    onChange={e => setSpecialDriverId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]"
                  >
                    <option value="">Select driver…</option>
                    {allDrivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
                  </select>
                  <select
                    value={specialBadgeTypeId}
                    onChange={e => setSpecialBadgeTypeId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]"
                  >
                    <option value="">Select badge…</option>
                    {specialBadges.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button
                    onClick={handleSpecialAward}
                    disabled={specialAwarding || !specialDriverId || !specialBadgeTypeId}
                    className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {specialAwarding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Award
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Badge Setup Tab ─────────────────────────────────────────────── */}
        {tab === "setup" && (
          <div className="flex flex-col gap-8">

            {/* Weekly rank cards — always editable, no Edit toggle */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-1">Weekly Badges</p>
              <p className="text-xs text-slate-400 mb-4">Click the icon area to upload a custom trophy image for each rank.</p>
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map(rank => {
                  const bt         = weeklyBadges.find(b => b.rank === rank);
                  const edit       = rankEdits[rank] ?? { name: defaultRankName(rank), shine: false };
                  const isSaving   = rankSaving[rank] ?? false;
                  const isUploading = rankUploading[rank] ?? false;
                  const preview    = rankPendingPreview[rank] ?? null;
                  const rankEmoji  = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
                  const rankColor  = rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-orange-700";

                  return (
                    <div key={rank} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
                      {/* Clickable icon area */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => rankRefs[rank].current?.click()}
                          disabled={isUploading}
                          title="Upload icon"
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center hover:border-amber-400 hover:bg-amber-50 transition-colors relative overflow-hidden group disabled:opacity-40"
                        >
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          ) : preview ? (
                            <img src={preview} alt="" className="w-full h-full object-contain p-1" />
                          ) : bt?.iconUrl ? (
                            <>
                              <img src={bt.iconUrl} alt="" className="w-full h-full object-contain p-1" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                <Camera className="w-4 h-4 text-white" />
                              </div>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); clearBadgeIcon(bt.id).then(() => router.refresh()); }}
                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                title="Remove icon"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <Camera className="w-5 h-5 text-slate-300" />
                              <span className="text-[9px] text-slate-300 font-medium">Upload</span>
                            </div>
                          )}
                        </button>
                        <input
                          ref={rankRefs[rank]}
                          type="file"
                          accept="image/png,image/svg+xml,image/gif,image/webp"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleRankFileSelect(rank, f); e.target.value = ""; }}
                        />
                        <span className={`text-[11px] font-bold ${rankColor}`}>{rankEmoji} Rank {rank}</span>
                      </div>

                      {/* Name + shine + save */}
                      <div className="flex-1 flex flex-col gap-2.5">
                        <input
                          value={edit.name}
                          onChange={e => setRankEdits(prev => ({ ...prev, [rank]: { ...prev[rank], name: e.target.value } }))}
                          placeholder={`Rank ${rank} badge name`}
                          className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-300"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={edit.shine}
                              onChange={e => setRankEdits(prev => ({ ...prev, [rank]: { ...prev[rank], shine: e.target.checked } }))}
                              className="rounded"
                            />
                            Shine effect
                          </label>
                          <button
                            onClick={() => handleSaveRank(rank)}
                            disabled={isSaving || !edit.name.trim()}
                            className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
                          >
                            {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                            {bt ? "Save" : "Create"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Special badges */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-3">Special Badges</p>
              <div className="flex flex-col gap-3">
                {specialBadges.map(bt => (
                  <div key={bt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-slate-50 border border-slate-100 shrink-0 relative group/icon">
                      {bt.iconUrl
                        ? <>
                            <img src={bt.iconUrl} alt="" className="w-full h-full object-contain p-0.5" />
                            <button
                              type="button"
                              onClick={() => clearBadgeIcon(bt.id).then(() => router.refresh())}
                              className="absolute inset-0 bg-red-500/80 flex items-center justify-center opacity-0 group-hover/icon:opacity-100 transition-opacity"
                              title="Remove icon"
                            >
                              <X className="w-3.5 h-3.5 text-white" />
                            </button>
                          </>
                        : <Trophy className="w-5 h-5 text-amber-500" />
                      }
                    </div>
                    <span className="flex-1 text-sm font-semibold text-slate-700">{bt.name}</span>
                    {bt.shine && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Shine</span>}
                    <button
                      onClick={() => handleDeleteSpecial(bt.id)}
                      disabled={deleting}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40 rounded-lg hover:bg-red-50"
                      title="Delete badge type"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {/* Add special badge form */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Special Badge</p>
                  <div className="flex gap-3 items-start">
                    {/* Icon upload */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => newSpecialRef.current?.click()}
                        title="Upload icon"
                        className="w-12 h-12 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-violet-400 hover:bg-violet-50 transition-colors overflow-hidden"
                      >
                        {newSpecialPreview
                          ? <img src={newSpecialPreview} alt="" className="w-full h-full object-contain p-0.5" />
                          : <Camera className="w-4 h-4 text-slate-300" />
                        }
                      </button>
                      <input
                        ref={newSpecialRef}
                        type="file"
                        accept="image/png,image/svg+xml,image/gif,image/webp"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) { setNewSpecialFile(f); setNewSpecialPreview(URL.createObjectURL(f)); }
                          e.target.value = "";
                        }}
                      />
                      <span className="text-[9px] text-slate-400 font-medium">Icon</span>
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                      <input
                        value={newSpecialName}
                        onChange={e => setNewSpecialName(e.target.value)}
                        placeholder="Badge name (e.g. Driver of the Month)"
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-300"
                        onKeyDown={e => { if (e.key === "Enter") handleAddSpecial(); }}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                          <input type="checkbox" checked={newSpecialShine} onChange={e => setNewSpecialShine(e.target.checked)} className="rounded" />
                          Shine effect
                        </label>
                        <button
                          onClick={handleAddSpecial}
                          disabled={addingSpecial || !newSpecialName.trim()}
                          className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                        >
                          {addingSpecial && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Add Badge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ─────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <p className="text-slate-400 text-sm">No badges awarded yet.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Week</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Driver</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Badge</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Awarded</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{h.weekStart}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.avatarUrl
                              ? <img src={h.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              : <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">{h.driverName[0]}</div>
                            }
                            <span className="font-semibold text-slate-800">{h.driverName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.iconUrl
                              ? <span className={h.shine ? "badge-shine" : ""}><img src={h.iconUrl} alt="" className="w-6 h-6 object-contain" /></span>
                              : <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
                            }
                            <span className="text-slate-700">{h.badgeName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(h.awardedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRevoke(h.id)}
                            disabled={revoking === h.id}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 font-semibold transition-colors disabled:opacity-40 whitespace-nowrap"
                          >
                            {revoking === h.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />
                            }
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

"use client";

import { useState, useTransition, useRef } from "react";
import { Trophy, Settings, Clock, Loader2, Upload, X } from "lucide-react";
import {
  computeTopDrivers, awardBadgesForWeek, awardSpecialBadge,
  upsertBadgeType, deleteBadgeType, isWeekAwarded,
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
  const router   = useRouter();
  const [tab, setTab] = useState<"award" | "setup" | "history">("award");

  const [badgeTypes, setBadgeTypes] = useState(initialBadgeTypes);
  const history = initialHistory;

  // suppress unused warning — setBadgeTypes used indirectly via router.refresh()
  void setBadgeTypes;

  // ── Award Tab State ──────────────────────────────────────────────────────
  const weeklyBadges = badgeTypes.filter(b => b.category === "weekly").sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const specialBadges = badgeTypes.filter(b => b.category === "special");

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

  // ── Badge Setup Tab State ────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName]   = useState("");
  const [editShine, setEditShine] = useState(false);
  const [saving, startSave]       = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEdit(bt: BadgeTypeRow) {
    setEditingId(bt.id);
    setEditName(bt.name);
    setEditShine(bt.shine);
  }

  function handleSaveBadgeType(bt: BadgeTypeRow) {
    startSave(async () => {
      await upsertBadgeType({ id: bt.id, rank: bt.rank, name: editName, iconUrl: bt.iconUrl, shine: editShine, category: bt.category });
      setEditingId(null);
      router.refresh();
    });
  }

  async function handleIconUpload(badgeTypeId: number, file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("badgeTypeId", String(badgeTypeId));
    const res  = await fetch("/api/badge-icons/upload", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.url) router.refresh();
  }

  const [newSpecialName, setNewSpecialName]   = useState("");
  const [newSpecialShine, setNewSpecialShine] = useState(false);
  const [addingSpecial, startAddSpecial]      = useTransition();
  const [deleting, startDelete]               = useTransition();

  function handleAddSpecial() {
    if (!newSpecialName.trim()) return;
    startAddSpecial(async () => {
      await upsertBadgeType({ name: newSpecialName.trim(), shine: newSpecialShine, category: "special" });
      setNewSpecialName("");
      setNewSpecialShine(false);
      router.refresh();
    });
  }

  function handleDeleteSpecial(id: number) {
    startDelete(async () => {
      await deleteBadgeType(id);
      router.refresh();
    });
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
            <div className="flex items-center gap-3">
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
            {/* Weekly badges */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-3">Weekly Badges (Ranks 1–3)</p>
              <div className="flex flex-col gap-3">
                {weeklyBadges.length === 0 && (
                  <p className="text-sm text-slate-400">No weekly badge types configured yet.</p>
                )}
                {weeklyBadges.map(bt => (
                  <div key={bt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 flex justify-center">
                      <BadgeIcon badge={bt} size={32} />
                    </div>
                    {editingId === bt.id ? (
                      <div className="flex-1 flex items-center gap-3 flex-wrap">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40"
                          placeholder="Badge name"
                        />
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={editShine} onChange={e => setEditShine(e.target.checked)} className="rounded" />
                          Shine
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/svg+xml,image/gif,image/webp"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleIconUpload(bt.id, f); }}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          Upload Icon
                        </button>
                        <button
                          onClick={() => handleSaveBadgeType(bt)}
                          disabled={saving}
                          className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1"
                        >
                          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700">Rank {bt.rank} — {bt.name}</span>
                        {bt.shine && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Shine</span>}
                        <button onClick={() => startEdit(bt)} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-900 border border-slate-200 px-3 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {/* Add missing weekly rank slots */}
                {[1,2,3].filter(r => !weeklyBadges.find(b => b.rank === r)).map(rank => (
                  <button
                    key={rank}
                    onClick={async () => {
                      const label = rank === 1 ? "Gold" : rank === 2 ? "Silver" : "Bronze";
                      await upsertBadgeType({ rank, name: label, shine: false, category: "weekly" });
                      router.refresh();
                    }}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors text-center"
                  >
                    + Add Rank {rank} badge
                  </button>
                ))}
              </div>
            </div>

            {/* Special badges */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-3">Special Badges</p>
              <div className="flex flex-col gap-3">
                {specialBadges.map(bt => (
                  <div key={bt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                    <BadgeIcon badge={bt} size={28} />
                    <span className="flex-1 text-sm font-semibold text-slate-700">{bt.name}</span>
                    {bt.shine && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Shine</span>}
                    <button
                      onClick={() => handleDeleteSpecial(bt.id)}
                      disabled={deleting}
                      className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {/* Add special badge */}
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    value={newSpecialName}
                    onChange={e => setNewSpecialName(e.target.value)}
                    placeholder="Badge name (e.g. Driver of the Month)"
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px]"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={newSpecialShine} onChange={e => setNewSpecialShine(e.target.checked)} className="rounded" />
                    Shine
                  </label>
                  <button
                    onClick={handleAddSpecial}
                    disabled={addingSpecial || !newSpecialName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {addingSpecial && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Add
                  </button>
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
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Week</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Driver</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Badge</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Awarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-600">{h.weekStart}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.avatarUrl
                              ? <img src={h.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                              : <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{h.driverName[0]}</div>
                            }
                            <span className="font-semibold text-slate-800">{h.driverName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.iconUrl
                              ? <span className={h.shine ? "badge-shine" : ""}><img src={h.iconUrl} alt="" className="w-6 h-6 object-contain" /></span>
                              : <Trophy className="w-5 h-5 text-amber-500" />
                            }
                            <span className="text-slate-700">{h.badgeName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(h.awardedAt).toLocaleDateString()}
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

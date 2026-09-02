"use client";

import { useState, useEffect, useTransition } from "react";
import AppShell from "@/components/app-shell";
import {
  Plus, Pencil, Trash2, Loader2, Trophy, ChevronDown, X,
} from "lucide-react";
import {
  getMilestoneRewards, createMilestoneReward, updateMilestoneReward,
  deleteMilestoneReward, getDriverStreaks,
} from "@/lib/actions/milestones";

type Reward = {
  id: number;
  name: string;
  description: string | null;
  daysRequired: number;
  type: string;
  bonusAmount: number | null;
  icon: string;
  active: boolean;
  sortOrder: number;
};

type DriverStreak = {
  id: number;
  driverId: string;
  name: string;
  streakDays: number;
};

const INPUT_CLS = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

const BLANK: Omit<Reward, "id"> = {
  name: "",
  description: "",
  daysRequired: 30,
  type: "physical",
  bonusAmount: null,
  icon: "🏅",
  active: true,
  sortOrder: 0,
};

export default function MilestonesPage() {
  const [rewards, setRewards]   = useState<Reward[]>([]);
  const [streaks, setStreaks]   = useState<DriverStreak[]>([]);
  const [loading, setLoading]   = useState(true);
  const [isPending, startTransition] = useTransition();

  // Modal state
  const [editing, setEditing]   = useState<Reward | null>(null);
  const [form, setForm]         = useState<Omit<Reward, "id">>(BLANK);
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Reward | null>(null);

  async function refresh() {
    const [r, s] = await Promise.all([getMilestoneRewards(), getDriverStreaks()]);
    setRewards(r as Reward[]);
    setStreaks(s as DriverStreak[]);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK, sortOrder: rewards.length });
    setShowModal(true);
  }

  function openEdit(reward: Reward) {
    setEditing(reward);
    setForm({
      name: reward.name,
      description: reward.description ?? "",
      daysRequired: reward.daysRequired,
      type: reward.type,
      bonusAmount: reward.bonusAmount,
      icon: reward.icon,
      active: reward.active,
      sortOrder: reward.sortOrder,
    });
    setShowModal(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    startTransition(async () => {
      const data = {
        ...form,
        description: form.description?.trim() || null,
        bonusAmount: form.type === "bonus" && form.bonusAmount != null ? form.bonusAmount : null,
        type: form.type as "physical" | "bonus",
      };
      if (editing) {
        await updateMilestoneReward(editing.id, data);
      } else {
        await createMilestoneReward(data);
      }
      setShowModal(false);
      await refresh();
    });
  }

  function handleDelete(reward: Reward) {
    startTransition(async () => {
      await deleteMilestoneReward(reward.id);
      setConfirmDelete(null);
      await refresh();
    });
  }

  const activeRewards = rewards.filter((r) => r.active).sort((a, b) => a.daysRequired - b.daysRequired);

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              MyGroundOps · Admin
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Milestones & Rewards
            </h1>
            <p className="text-[13px] text-slate-400 mt-1.5">
              Configure driver rewards and track clean-streak progress.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 transition-colors mt-1"
          >
            <Plus className="w-4 h-4" />
            New Reward
          </button>
        </div>

        {/* ── Reward Definitions ─────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-widest mb-4">
            Reward Definitions
          </h2>

          {loading ? (
            <div className="flex items-center gap-2 text-slate-400 py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[13px]">Loading...</span>
            </div>
          ) : rewards.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center
              shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <Trophy className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-[13px] text-slate-400">No rewards configured yet.</p>
              <button onClick={openCreate}
                className="mt-3 text-[13px] font-semibold text-slate-600 underline underline-offset-2">
                Create the first one
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rewards
                .sort((a, b) => a.daysRequired - b.daysRequired)
                .map((reward) => (
                  <RewardCard
                    key={reward.id}
                    reward={reward}
                    onEdit={() => openEdit(reward)}
                    onDelete={() => setConfirmDelete(reward)}
                  />
                ))}
            </div>
          )}
        </section>

        {/* ── Driver Progress ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[13px] font-bold text-slate-700 uppercase tracking-widest mb-4">
            Driver Progress
          </h2>

          <div className="bg-white rounded-2xl border border-slate-200/80
            shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[13px]">Loading...</span>
              </div>
            ) : streaks.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-[13px]">
                No active drivers found.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Driver</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Clean Streak</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Next Milestone</th>
                      <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Unlocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streaks
                      .sort((a, b) => b.streakDays - a.streakDays)
                      .map((driver) => {
                        const unlocked = activeRewards.filter((r) => driver.streakDays >= r.daysRequired);
                        const next = activeRewards.find((r) => driver.streakDays < r.daysRequired);
                        const pct = next
                          ? Math.min(100, Math.round((driver.streakDays / next.daysRequired) * 100))
                          : 100;

                        return (
                          <tr key={driver.id}
                            className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-800">{driver.name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">{driver.driverId}</p>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex items-baseline gap-1">
                                <span className="text-[20px] font-extrabold text-slate-900 leading-none">
                                  {driver.streakDays}
                                </span>
                                <span className="text-[11px] text-slate-400">days</span>
                              </div>
                            </td>
                            <td className="px-3 py-4 min-w-[180px]">
                              {next ? (
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[12px] font-semibold text-slate-700">
                                      {next.icon} {next.name}
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                      {next.daysRequired - driver.streakDays}d left
                                    </span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-emerald-500 transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-1">{pct}% there</p>
                                </div>
                              ) : (
                                <span className="text-[12px] font-semibold text-emerald-600">
                                  All rewards unlocked 🎉
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-4 hidden md:table-cell">
                              {unlocked.length === 0 ? (
                                <span className="text-[12px] text-slate-300">None yet</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {unlocked.map((r) => (
                                    <span
                                      key={r.id}
                                      title={r.name}
                                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full
                                        bg-emerald-50 text-emerald-700 border border-emerald-200/80"
                                    >
                                      {r.icon} {r.name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Reward form modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold text-slate-900">
                {editing ? "Edit Reward" : "New Reward"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Icon + Name row */}
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 w-20 shrink-0">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Icon</label>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    className={INPUT_CLS + " text-center text-[20px]"}
                    maxLength={4}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reward Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={INPUT_CLS}
                    placeholder="e.g. Name Badge"
                    autoFocus
                  />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Description (optional)</label>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className={INPUT_CLS + " resize-none"}
                  placeholder="Brief description of the reward..."
                />
              </div>

              {/* Days required */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Days Required (clean streak)</label>
                <input
                  type="number"
                  min={1}
                  value={form.daysRequired}
                  onChange={(e) => setForm((f) => ({ ...f, daysRequired: parseInt(e.target.value) || 1 }))}
                  className={INPUT_CLS}
                />
              </div>

              {/* Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</label>
                <div className="flex gap-2">
                  {(["physical", "bonus"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                        form.type === t
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {t === "physical" ? "Physical Item" : "Paycheck Bonus"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bonus amount */}
              {form.type === "bonus" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bonus Amount ($)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.bonusAmount ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, bonusAmount: parseFloat(e.target.value) || null }))}
                    className={INPUT_CLS}
                    placeholder="e.g. 50.00"
                  />
                </div>
              )}

              {/* Sort order */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sort Order</label>
                <input
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                  className={INPUT_CLS}
                />
                <p className="text-[11px] text-slate-400">Lower numbers appear first.</p>
              </div>

              {/* Active toggle (edit only) */}
              {editing && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span className="text-[13px] font-semibold text-slate-700">Active</span>
                </label>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editing ? "Save Changes" : "Create Reward"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm p-6">
            <h2 className="text-[16px] font-extrabold text-slate-900 mb-2">Delete Reward?</h2>
            <p className="text-[13px] text-slate-500 mb-6">
              <span className="font-semibold">{confirmDelete.icon} {confirmDelete.name}</span> will be permanently removed.
              Driver progress is not affected.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-red-500 text-white
                  hover:bg-red-600 transition-colors disabled:opacity-40
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function RewardCard({ reward, onEdit, onDelete }: {
  reward: Reward;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`bg-white rounded-xl border px-5 py-4
      shadow-[0_1px_3px_rgba(0,0,0,0.04)]
      ${reward.active ? "border-slate-200/80" : "border-slate-100 opacity-50"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[28px] leading-none">{reward.icon}</span>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-50 transition-colors text-slate-300 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-[14px] font-extrabold text-slate-900 leading-tight">{reward.name}</p>
      {reward.description && (
        <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">{reward.description}</p>
      )}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
          {reward.daysRequired} days clean
        </span>
        {reward.type === "bonus" ? (
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
            {reward.bonusAmount != null ? `$${reward.bonusAmount.toFixed(2)} bonus` : "Bonus"}
          </span>
        ) : (
          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-full">
            Physical
          </span>
        )}
        {!reward.active && (
          <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-full">
            Inactive
          </span>
        )}
      </div>
    </div>
  );
}

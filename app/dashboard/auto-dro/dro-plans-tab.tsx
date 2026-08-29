"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, Copy, Trash2, GitBranch } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DroPlan = {
  planId: number;
  name: string;
  totalRoutes: number;
  lpRoutes: number;
  bulkRoutes: number;
  regRoutes: number;
  smallRoutes: number;
  isActive?: boolean;
  lastUsedDate?: string;
  [key: string]: unknown;
};

async function droManage(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch("/api/auto-dro/manage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DroPlansTab() {
  const [plans, setPlans] = useState<DroPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPlanId, setActionPlanId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [connectingMsg, setConnectingMsg] = useState(false);

  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setConnectingMsg(true);
    try {
      const res = await droManage("getPlans");
      setConnectingMsg(false);
      if (Array.isArray(res?.data)) {
        setPlans(res.data as DroPlan[]);
      } else if (res?.error) {
        showToast(false, res.error);
      }
    } catch {
      showToast(false, "Failed to load plans");
    } finally {
      setLoading(false);
      setConnectingMsg(false);
    }
  }, [showToast]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  async function handleCopy(plan: DroPlan) {
    const rawName = window.prompt("New plan name:", `${plan.name} (copy)`);
    if (!rawName?.trim()) return;
    setActionPlanId(plan.planId);
    try {
      const res = await droManage("copyPlan", { planId: plan.planId, newName: rawName.trim() });
      if (res?.error) {
        showToast(false, res.error);
      } else {
        showToast(true, `Plan copied as "${rawName.trim()}"`);
        await loadPlans();
      }
    } catch {
      showToast(false, "Copy failed");
    } finally {
      setActionPlanId(null);
    }
  }

  async function handleDelete(plan: DroPlan) {
    if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    setActionPlanId(plan.planId);
    try {
      const res = await droManage("deletePlan", { planId: plan.planId });
      if (res?.error) {
        showToast(false, res.error);
      } else {
        showToast(true, `Plan "${plan.name}" deleted`);
        await loadPlans();
      }
    } catch {
      showToast(false, "Delete failed");
    } finally {
      setActionPlanId(null);
    }
  }

  // ── Skeleton ──
  if (loading) {
    return (
      <div className="space-y-4">
        {connectingMsg && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-[13px] text-blue-700 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            Connecting to DRO… (first login takes ~15 seconds)
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-6 animate-pulse space-y-3">
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-8 bg-slate-100 rounded w-1/3" />
              <div className="flex gap-2">
                <div className="h-6 bg-slate-100 rounded w-16" />
                <div className="h-6 bg-slate-100 rounded w-16" />
              </div>
              <div className="flex gap-2 pt-2">
                <div className="h-10 bg-slate-100 rounded-xl flex-1" />
                <div className="h-10 bg-slate-100 rounded-xl flex-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[13px] font-medium border ${
          toast.ok
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <GitBranch className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-[15px] font-semibold text-slate-500">No plans found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => {
            const isActive = plan.isActive === true;
            const isActing = actionPlanId === plan.planId;

            return (
              <div
                key={plan.planId}
                className={`rounded-2xl border-2 p-6 bg-slate-800 text-white transition-all shadow-sm ${
                  isActive
                    ? "border-emerald-400 ring-2 ring-emerald-400 ring-offset-2 shadow-emerald-100 shadow-lg"
                    : "border-slate-600"
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-[16px] font-extrabold text-white leading-tight flex-1">
                    {plan.name || `Plan ${plan.planId}`}
                  </h3>
                  {isActive && (
                    <span className="shrink-0 text-[10px] font-bold uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full">
                      ACTIVE
                    </span>
                  )}
                </div>

                {/* Route count */}
                <div className="flex items-end gap-2 mb-4">
                  <span className="text-[36px] font-extrabold leading-none text-white">
                    {plan.totalRoutes}
                  </span>
                  <span className="text-[13px] text-slate-400 mb-1">routes</span>
                </div>

                {/* Route type breakdown */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(plan.lpRoutes ?? 0) > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-900/60 text-indigo-300">
                      LP {plan.lpRoutes}
                    </span>
                  )}
                  {(plan.bulkRoutes ?? 0) > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-900/60 text-emerald-300">
                      Bulk {plan.bulkRoutes}
                    </span>
                  )}
                  {(plan.smallRoutes ?? 0) > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-900/60 text-amber-300">
                      SM {plan.smallRoutes}
                    </span>
                  )}
                  {(plan.regRoutes ?? 0) > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300">
                      Reg {plan.regRoutes}
                    </span>
                  )}
                </div>

                {/* Last used */}
                {plan.lastUsedDate && (
                  <p className="text-[11px] text-slate-500 mb-4">
                    Last used: {plan.lastUsedDate}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => handleCopy(plan)}
                    disabled={isActing}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                      text-[13px] font-bold bg-blue-600 hover:bg-blue-700 text-white
                      disabled:opacity-50 transition-colors"
                  >
                    {isActing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Copy className="w-4 h-4" />
                    }
                    Copy
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    disabled={isActing || isActive}
                    title={isActive ? "Cannot delete the active plan" : "Delete plan"}
                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl
                      text-[13px] font-bold bg-red-600 hover:bg-red-700 text-white
                      disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isActing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

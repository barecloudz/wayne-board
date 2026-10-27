"use client";

import { useState } from "react";
import { Bell, Mail, Smartphone, Loader2 } from "lucide-react";

const NOTIFICATION_LABELS: Record<string, { label: string; description: string }> = {
  maintenance_request:        { label: "Maintenance Request",      description: "When a driver submits a new maintenance request" },
  maintenance_resolved:       { label: "Maintenance Resolved",     description: "When a maintenance request is marked complete" },
  vehicle_expiry:             { label: "Vehicle Expiry",           description: "Reminders when vehicle registrations, inspections, or leases are expiring" },
  vehicle_condition_critical: { label: "Vehicle Condition Alert",  description: "When a vehicle is marked Out of Service or critical condition" },
  task_overdue:               { label: "Task Overdue",             description: "When a daily task hasn't been completed on time" },
  payroll_ready:              { label: "Payroll Ready",            description: "When the weekly payroll report is generated" },
  mmr_report:                 { label: "MMR Report",               description: "When a Monthly Maintenance Report is created" },
};

type Pref = {
  type: string;
  enabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
};

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-indigo-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function NotificationSettings({ initialPrefs }: { initialPrefs: Pref[] }) {
  const [prefs, setPrefs] = useState<Pref[]>(initialPrefs);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function update(type: string, patch: Partial<Pref>) {
    setSaving(type);
    setToast(null);
    const prev = prefs.find((p) => p.type === type);
    setPrefs((ps) => ps.map((p) => (p.type === type ? { ...p, ...patch } : p)));
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ type: "success", msg: "Saved" });
    } catch {
      // revert optimistic update
      if (prev) setPrefs((ps) => ps.map((p) => (p.type === type ? prev : p)));
      setToast({ type: "error", msg: "Failed to save" });
    } finally {
      setSaving(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4 text-slate-500" />
        <h2 className="text-[15px] font-bold text-slate-900">Notifications</h2>
      </div>
      <p className="text-[12px] text-slate-400 mb-5">Control which events trigger in-app and email notifications.</p>

      {/* Column headers — desktop */}
      <div className="hidden sm:grid grid-cols-[1fr_80px_80px_56px] gap-2 mb-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Event</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1 justify-center">
          <Smartphone className="w-3 h-3" /> In-App
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1 justify-center">
          <Mail className="w-3 h-3" /> Email
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 text-center">On</span>
      </div>

      <div className="flex flex-col divide-y divide-slate-100">
        {prefs.map((pref) => {
          const meta = NOTIFICATION_LABELS[pref.type];
          if (!meta) return null;
          const isSaving = saving === pref.type;
          return (
            <div
              key={pref.type}
              className={`py-3.5 sm:grid sm:grid-cols-[1fr_80px_80px_56px] sm:gap-2 sm:items-center flex flex-col gap-2.5 transition-opacity ${!pref.enabled ? "opacity-50" : ""}`}
            >
              <div>
                <p className="text-[13px] font-semibold text-slate-800 flex items-center gap-1.5">
                  {meta.label}
                  {isSaving && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                </p>
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{meta.description}</p>
              </div>

              <div className="flex items-center gap-2 sm:justify-center">
                <span className="text-[11px] text-slate-500 sm:hidden w-16">In-App</span>
                <Toggle checked={pref.inAppEnabled} disabled={!pref.enabled || isSaving} onChange={(v) => update(pref.type, { inAppEnabled: v })} />
              </div>

              <div className="flex items-center gap-2 sm:justify-center">
                <span className="text-[11px] text-slate-500 sm:hidden w-16">Email</span>
                <Toggle checked={pref.emailEnabled} disabled={!pref.enabled || isSaving} onChange={(v) => update(pref.type, { emailEnabled: v })} />
              </div>

              <div className="flex items-center gap-2 sm:justify-center">
                <span className="text-[11px] text-slate-500 sm:hidden w-16">Enabled</span>
                <Toggle checked={pref.enabled} disabled={isSaving} onChange={(v) => update(pref.type, { enabled: v })} />
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <p className={`mt-3 text-[12px] font-medium ${toast.type === "success" ? "text-emerald-600" : "text-red-500"}`}>
          {toast.msg}
        </p>
      )}
    </div>
  );
}

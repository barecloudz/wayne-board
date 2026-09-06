"use client";

import { useTransition } from "react";
import { setSetting } from "@/lib/actions/settings";
import { Loader2 } from "lucide-react";

export default function PortalSettings({
  showRyde,
  showMilestones,
  clockInEnabled,
  showDsw,
}: {
  showRyde: boolean;
  showMilestones: boolean;
  clockInEnabled: boolean;
  showDsw: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function toggle(key: string, current: boolean) {
    startTransition(async () => {
      await setSetting(key, current ? "false" : "true");
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[15px] font-extrabold text-slate-900">Driver Portal Visibility</h2>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>
      <p className="text-[12px] text-slate-400 mb-5">
        Control which features drivers can see on their dashboard. Schedule is always shown.
      </p>
      <div className="flex flex-col gap-3">
        <ToggleRow
          label="Ryde Scores"
          description="My Score tab, Reviews, Leaderboard, and company rating goal"
          enabled={showRyde}
          onToggle={() => toggle("show_ryde", showRyde)}
          disabled={isPending}
        />
        <ToggleRow
          label="Milestones & Bonuses"
          description="Milestones tab, Bonuses tab, and the streak progress bar"
          enabled={showMilestones}
          onToggle={() => toggle("show_milestones", showMilestones)}
          disabled={isPending}
        />
        <ToggleRow
          label="Service Data (DSW)"
          description="ILS%, service rate, and team scorecard · hide when auto-sync data is stale"
          enabled={showDsw}
          onToggle={() => toggle("show_dsw", showDsw)}
          disabled={isPending}
        />
        <ToggleRow
          label="Driver Clock-In"
          description="When on, drivers who are scheduled for the day are prompted at login: &quot;Are you at work today?&quot;"
          enabled={clockInEnabled}
          onToggle={() => toggle("clock_in_enabled", clockInEnabled)}
          disabled={isPending}
          badge="Coming Soon"
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label, description, enabled, onToggle, disabled, badge,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-slate-800">{label}</p>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50
          ${enabled ? "bg-slate-900" : "bg-slate-200"}`}
        role="switch"
        aria-checked={enabled}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow
            transform transition duration-200 ease-in-out
            ${enabled ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

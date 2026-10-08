"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { AlertTriangle, Wrench, Truck, CheckSquare, DollarSign, Bell, Settings, History, Loader2, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { upsertNotificationPreference } from "@/lib/actions/notifications";

// ── Types ──────────────────────────────────────────────────────────────────────

type NotificationPreference = {
  id: number;
  organizationId: number;
  type: string;
  enabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  recipientRoles: string[] | null;
  recipientIds: number[] | null;
  timingDays: number[] | null;
  createdAt: Date;
  updatedAt: Date;
};

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  linkTo: string | null;
  readAt: string | null;
  createdAt: string;
};

interface Props {
  initialPreferences: NotificationPreference[];
  adminsWithoutEmail: { id: number; name: string; role: string }[];
  organizationId: number;
}

// ── Static config ──────────────────────────────────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  maintenance_request:        "New Maintenance Request",
  maintenance_resolved:       "Maintenance Resolved",
  vehicle_expiry:             "Vehicle Compliance Expiry",
  vehicle_condition_critical: "Critical Vehicle Condition",
  task_overdue:               "Task Overdue",
  payroll_ready:              "Payroll Ready",
  mmr_report:                 "Monthly MMR Report",
};

const DESCRIPTIONS: Record<string, string> = {
  maintenance_request:        "Sent when a driver submits a new maintenance request.",
  maintenance_resolved:       "Sent when an admin marks a maintenance request as resolved.",
  vehicle_expiry:             "Sent ahead of vehicle compliance dates (MMR, registration, federal inspection).",
  vehicle_condition_critical: "Sent when a vehicle condition is reported at critical severity.",
  task_overdue:               "Sent when a recurring task passes its due time without being completed.",
  payroll_ready:              "Sent when a payroll report is generated and ready to review.",
  mmr_report:                 "Sent when an MMR report is generated for a vehicle.",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  maintenance_request:        Wrench,
  maintenance_resolved:       Wrench,
  vehicle_expiry:             Truck,
  vehicle_condition_critical: Truck,
  task_overdue:               CheckSquare,
  payroll_ready:              DollarSign,
  mmr_report:                 DollarSign,
};

const CATEGORIES: Record<string, string[]> = {
  Fleet:       ["vehicle_expiry", "vehicle_condition_critical"],
  Maintenance: ["maintenance_request", "maintenance_resolved"],
  Tasks:       ["task_overdue"],
  Reports:     ["payroll_ready", "mmr_report"],
};

const ALL_TYPES = [
  "maintenance_request",
  "maintenance_resolved",
  "vehicle_expiry",
  "vehicle_condition_critical",
  "task_overdue",
  "payroll_ready",
  "mmr_report",
];

const ROLE_OPTIONS = [
  { value: "owner",     label: "Owner" },
  { value: "co_owner",  label: "Co-Owner" },
  { value: "bc",        label: "BC" },
  { value: "developer", label: "Developer" },
];

const TIMING_OPTIONS = [60, 30, 7, 0];

// Notification type → display category for history
const TYPE_CATEGORY: Record<string, string> = {
  maintenance_request:        "maintenance",
  maintenance_resolved:       "maintenance",
  vehicle_expiry:             "fleet",
  vehicle_condition_critical: "fleet",
  task_overdue:               "tasks",
  payroll_ready:              "reports",
  mmr_report:                 "reports",
};

const HISTORY_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  maintenance: { border: "border-orange-400", bg: "bg-orange-50",  icon: "text-orange-500" },
  fleet:       { border: "border-blue-400",   bg: "bg-blue-50",    icon: "text-blue-500" },
  tasks:       { border: "border-purple-400", bg: "bg-purple-50",  icon: "text-purple-500" },
  reports:     { border: "border-green-400",  bg: "bg-green-50",   icon: "text-green-500" },
};

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "w-8 h-4" : "w-10 h-5";
  const thumb = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const translate = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
        ${track}
        ${checked ? "bg-slate-800" : "bg-slate-200"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <span className={`${thumb} rounded-full bg-white shadow-sm transition-transform duration-200 transform ${checked ? translate : "translate-x-0.5"}`} />
    </button>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all
        ${active ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"}
        ${disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}
      `}
    >
      {label}
    </button>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [items, setItems]             = useState<NotificationItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [page, setPage]               = useState(1);
  const [total, setTotal]             = useState(0);
  const [unread, setUnread]           = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [markingAll, setMarkingAll]   = useState(false);

  const LIMIT = 25;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?limit=${LIMIT}&page=${p}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.notifications ?? []);
        setTotal(data.total ?? 0);
        setUnread(data.unread ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  async function markAllRead() {
    setMarkingAll(true);
    await fetch("/api/notifications/read-all", { method: "POST" });
    await load(page);
    setMarkingAll(false);
  }

  async function markRead(id: number) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setItems(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
    setUnread(prev => Math.max(0, prev - 1));
  }

  const filtered = categoryFilter === "all"
    ? items
    : items.filter(n => TYPE_CATEGORY[n.type] === categoryFilter);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {["all", "fleet", "maintenance", "tasks", "reports"].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-all capitalize
                ${categoryFilter === cat
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"}
              `}
            >
              {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && (
            <span className="text-[12px] text-slate-500 font-medium">{unread} unread</span>
          )}
          {unread > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Bell className="w-8 h-8 text-slate-200" />
            <p className="text-[13px] text-slate-400 font-medium">No notifications yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(n => {
              const isUnread = n.readAt === null;
              const cat = TYPE_CATEGORY[n.type] ?? "default";
              const colors = HISTORY_COLORS[cat] ?? { border: "border-slate-200", bg: "bg-slate-50", icon: "text-slate-400" };
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => { if (isUnread) markRead(n.id); }}
                    className={`w-full text-left flex gap-3 px-5 py-4 border-l-4 transition-colors hover:bg-slate-50 ${colors.border} ${isUnread ? colors.bg : ""}`}
                  >
                    <div className={`pt-0.5 shrink-0 ${colors.icon}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[13px] leading-snug ${isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-600"}`}>
                          {n.title}
                        </p>
                        {isUnread && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{n.body}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        {n.readAt && (
                          <span className="ml-2 text-emerald-500">· Read</span>
                        )}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-slate-400">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main client component ──────────────────────────────────────────────────────

export default function NotificationsClient({
  initialPreferences,
  adminsWithoutEmail,
  organizationId,
}: Props) {
  const [tab, setTab]                   = useState<"history" | "settings">("history");
  const [preferences, setPreferences]   = useState<NotificationPreference[]>(initialPreferences);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [, startTransition]             = useTransition();

  function getPref(type: string): NotificationPreference | undefined {
    return preferences.find((p) => p.type === type);
  }

  function updateLocal(type: string, patch: Partial<NotificationPreference>) {
    setPreferences(prev => prev.map(p => p.type === type ? { ...p, ...patch } : p));
  }

  async function save(type: string, patch: Parameters<typeof upsertNotificationPreference>[2]) {
    updateLocal(type, patch as Partial<NotificationPreference>);
    startTransition(async () => {
      await upsertNotificationPreference(organizationId, type, patch);
    });
  }

  function toggleEnabled(type: string)  { save(type, { enabled:      !getPref(type)?.enabled }); }
  function toggleInApp(type: string)    { save(type, { inAppEnabled:  !getPref(type)?.inAppEnabled }); }
  function toggleEmail(type: string)    { save(type, { emailEnabled:  !getPref(type)?.emailEnabled }); }

  function toggleRole(type: string, role: string) {
    const current = getPref(type)?.recipientRoles ?? [];
    save(type, { recipientRoles: current.includes(role) ? current.filter(r => r !== role) : [...current, role] });
  }

  function toggleTimingDay(type: string, day: number) {
    const current = getPref(type)?.timingDays ?? [];
    save(type, { timingDays: current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => b - a) });
  }

  const filteredTypes = activeCategory === "All" ? ALL_TYPES : CATEGORIES[activeCategory] ?? ALL_TYPES;

  return (
    <div className="flex flex-col gap-6">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${tab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
        <button
          onClick={() => setTab("settings")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${tab === "settings" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>

      {/* ── HISTORY TAB ── */}
      {tab === "history" && <HistoryTab />}

      {/* ── SETTINGS TAB ── */}
      {tab === "settings" && (
        <div className="flex flex-col gap-6">
          {/* Missing email banner */}
          {adminsWithoutEmail.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[13px] text-amber-800 font-medium">
                <span className="font-bold">{adminsWithoutEmail.length}</span>{" "}
                {adminsWithoutEmail.length === 1 ? "admin is" : "admins are"} missing email
                addresses — they&apos;ll receive in-app notifications only.
              </p>
            </div>
          )}

          {/* Category filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {["All", "Fleet", "Maintenance", "Tasks", "Reports"].map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition-all
                  ${activeCategory === cat ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 hover:text-slate-700"}
                `}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTypes.map(type => {
              const pref = getPref(type);
              const enabled = pref?.enabled ?? true;
              const inApp   = pref?.inAppEnabled ?? true;
              const email   = pref?.emailEnabled ?? false;
              const roles   = pref?.recipientRoles ?? [];
              const timingDays = pref?.timingDays ?? [];
              const recipientCount = roles.length;
              let channelLabel = "";
              if (inApp && email) channelLabel = "Email + In-App";
              else if (email)     channelLabel = "Email only";
              else if (inApp)     channelLabel = "In-App only";
              else                channelLabel = "No channels";
              const Icon = TYPE_ICONS[type] ?? Bell;

              return (
                <div key={type} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">{DISPLAY_NAMES[type] ?? type}</p>
                    </div>
                    <Toggle checked={enabled} onChange={() => toggleEnabled(type)} />
                  </div>

                  <div className={`px-5 py-4 flex flex-col gap-4 ${!enabled ? "opacity-50 pointer-events-none" : ""}`}>
                    <p className="text-[12px] text-slate-500">{DESCRIPTIONS[type]}</p>
                    <div className="border-t border-slate-100" />

                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Channels</p>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <Toggle size="sm" checked={inApp} onChange={() => toggleInApp(type)} />
                          <span className="text-[12px] text-slate-600 font-medium">In-App</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <Toggle size="sm" checked={email} onChange={() => toggleEmail(type)} />
                          <span className="text-[12px] text-slate-600 font-medium">Email</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Recipients</p>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {ROLE_OPTIONS.map(opt => (
                          <Chip key={opt.value} label={opt.label} active={roles.includes(opt.value)} onClick={() => toggleRole(type, opt.value)} />
                        ))}
                      </div>
                    </div>

                    {type === "vehicle_expiry" && (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Advance Notice</p>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {TIMING_OPTIONS.map(day => (
                            <Chip key={day} label={day === 0 ? "Day of" : `${day}d`} active={timingDays.includes(day)} onClick={() => toggleTimingDay(type, day)} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-slate-100" />
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-500">
                        <span>{recipientCount} recipient{recipientCount !== 1 ? "s" : ""}</span>
                        <span className="text-slate-300">·</span>
                        <span>{channelLabel}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { AlertTriangle, Wrench, Truck, CheckSquare, DollarSign, Bell, Settings, History, Loader2, Check, X, Trash2 } from "lucide-react";
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

type OrgAdmin = {
  id:    number;
  name:  string;
  role:  string;
  email: string | null;
};

interface Props {
  initialPreferences: NotificationPreference[];
  adminsWithoutEmail: { id: number; name: string; role: string }[];
  admins:             OrgAdmin[];
  organizationId:     number;
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

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", co_owner: "Co-Owner", bc: "BC", developer: "Dev",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-indigo-100 text-indigo-700",
  co_owner: "bg-violet-100 text-violet-700",
  bc: "bg-sky-100 text-sky-700",
  developer: "bg-slate-100 text-slate-600",
};

const AVATAR_PALETTE = [
  "#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

function adminColor(id: number) { return AVATAR_PALETTE[id % AVATAR_PALETTE.length]; }

function adminInitials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

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
  maintenance: { border: "border-amber-400",  bg: "bg-amber-50",   icon: "text-amber-500" },
  fleet:       { border: "border-blue-400",   bg: "bg-blue-50",    icon: "text-blue-500" },
  tasks:       { border: "border-indigo-400", bg: "bg-indigo-50",  icon: "text-indigo-500" },
  reports:     { border: "border-emerald-400",bg: "bg-emerald-50", icon: "text-emerald-500" },
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

// ── Person card ───────────────────────────────────────────────────────────────

function PersonCard({
  admin, selected, onClick, disabled,
}: {
  admin: OrgAdmin; selected: boolean; onClick: () => void; disabled?: boolean;
}) {
  const color = adminColor(admin.id);
  const hasEmail = !!admin.email;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left
        ${selected
          ? "bg-slate-900 border-slate-900 shadow-md"
          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"}
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
        style={{ backgroundColor: selected ? color + "33" : color + "22", color }}
      >
        {adminInitials(admin.name)}
      </div>

      {/* Name + role */}
      <div className="min-w-0">
        <p className={`text-[12px] font-semibold leading-tight truncate ${selected ? "text-white" : "text-slate-800"}`}>
          {admin.name.split(" ")[0]}
        </p>
        <span className={`text-[10px] font-bold ${selected ? "text-slate-400" : "text-slate-400"}`}>
          {ROLE_LABELS[admin.role] ?? admin.role}
        </span>
      </div>

      {/* Email dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0 ml-auto"
        title={hasEmail ? admin.email! : "No email set"}
        style={{ backgroundColor: hasEmail ? "#10b981" : "#f59e0b" }}
      />
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
  const [clearingAll, setClearingAll] = useState(false);

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

  async function dismiss(id: number) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(n => n.id !== id));
    setTotal(prev => Math.max(0, prev - 1));
  }

  async function clearAll() {
    setClearingAll(true);
    await fetch("/api/notifications/clear-all", { method: "POST" });
    setItems([]);
    setTotal(0);
    setUnread(0);
    setClearingAll(false);
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Mark all read
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={clearAll}
              disabled={clearingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-red-200 text-red-600 hover:bg-red-50 active:scale-[0.97] transition-all disabled:opacity-40"
            >
              {clearingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Clear all
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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bell className="w-8 h-8 text-slate-200" />
            <p className="text-[13px] text-slate-400 font-medium">No notifications yet</p>
            <button
              onClick={() => {/* tab switching handled by parent */}}
              className="mt-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-700 active:scale-[0.97] transition-all"
            >
              Configure notifications
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(n => {
              const isUnread = n.readAt === null;
              const cat = TYPE_CATEGORY[n.type] ?? "default";
              const colors = HISTORY_COLORS[cat] ?? { border: "border-slate-200", bg: "bg-slate-50", icon: "text-slate-400" };
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              return (
                <li key={n.id} className={`flex items-start border-l-4 ${colors.border} ${isUnread ? colors.bg : ""}`}>
                  <button
                    onClick={() => { if (isUnread) markRead(n.id); }}
                    className="flex-1 text-left flex gap-3 px-5 py-4 transition-colors hover:bg-black/5"
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
                  <button
                    onClick={() => dismiss(n.id)}
                    className="p-3 text-slate-300 hover:text-red-400 transition-colors shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
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
  admins,
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

  function togglePerson(type: string, adminId: number) {
    const current = getPref(type)?.recipientIds ?? [];
    const next = current.includes(adminId)
      ? current.filter(id => id !== adminId)
      : [...current, adminId];
    // Switch to individual mode — clear role-based selection
    save(type, { recipientIds: next, recipientRoles: [] });
  }

  function isPersonSelected(type: string, adminId: number): boolean {
    const pref = getPref(type);
    // Explicit individual selection
    if (pref?.recipientIds?.includes(adminId)) return true;
    // Fall back to role-based (existing preferences)
    const admin = admins.find(a => a.id === adminId);
    if (admin && pref?.recipientRoles?.includes(admin.role)) return true;
    return false;
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

          {/* Missing email banner — shows names, not just a count */}
          {adminsWithoutEmail.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-amber-800 font-semibold mb-2">
                  These admins have no email — they&apos;ll only receive in-app notifications:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {adminsWithoutEmail.map(a => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-200 text-[11px] font-semibold text-amber-800"
                    >
                      <span
                        className="w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-black"
                        style={{ backgroundColor: adminColor(a.id) + "33", color: adminColor(a.id) }}
                      >
                        {adminInitials(a.name)}
                      </span>
                      {a.name.split(" ")[0]}
                      <span className="opacity-60">{ROLE_LABELS[a.role] ?? a.role}</span>
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-amber-700 mt-2">
                  Go to <span className="font-bold">Account Settings</span> to add an email address.
                </p>
              </div>
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
              const pref        = getPref(type);
              const enabled     = pref?.enabled ?? true;
              const inApp       = pref?.inAppEnabled ?? true;
              const email       = pref?.emailEnabled ?? false;
              const timingDays  = pref?.timingDays ?? [];
              const selectedAdmins = admins.filter(a => isPersonSelected(type, a.id));
              const Icon = TYPE_ICONS[type] ?? Bell;

              let channelLabel = "";
              if (inApp && email) channelLabel = "Email + In-App";
              else if (email)     channelLabel = "Email only";
              else if (inApp)     channelLabel = "In-App only";
              else                channelLabel = "No channels";

              return (
                <div key={type} className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">

                  {/* Card header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">{DISPLAY_NAMES[type] ?? type}</p>
                    </div>
                    <Toggle checked={enabled} onChange={() => toggleEnabled(type)} />
                  </div>

                  <div className={`px-5 py-4 flex flex-col gap-4 ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
                    <p className="text-[12px] text-slate-400 leading-relaxed">{DESCRIPTIONS[type]}</p>

                    <div className="border-t border-slate-100" />

                    {/* Delivery channels */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Deliver via</p>
                      <div className="flex items-center gap-3">
                        <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl border transition-all
                          ${inApp ? "bg-slate-900 border-slate-900" : "bg-white border-slate-200 hover:border-slate-300"}`}>
                          <Toggle size="sm" checked={inApp} onChange={() => toggleInApp(type)} />
                          <span className={`text-[12px] font-semibold ${inApp ? "text-white" : "text-slate-500"}`}>In-App</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl border transition-all
                          ${email ? "bg-slate-900 border-slate-900" : "bg-white border-slate-200 hover:border-slate-300"}`}>
                          <Toggle size="sm" checked={email} onChange={() => toggleEmail(type)} />
                          <span className={`text-[12px] font-semibold ${email ? "text-white" : "text-slate-500"}`}>Email</span>
                        </label>
                      </div>
                    </div>

                    {/* Advance notice — vehicle expiry only */}
                    {type === "vehicle_expiry" && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Advance Notice</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {TIMING_OPTIONS.map(day => (
                            <Chip key={day} label={day === 0 ? "Day of" : `${day}d`} active={timingDays.includes(day)} onClick={() => toggleTimingDay(type, day)} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notify — person picker */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Notify</p>
                      {admins.length === 0 ? (
                        <p className="text-[12px] text-slate-400 italic">No admins found</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {admins.map(admin => (
                            <PersonCard
                              key={admin.id}
                              admin={admin}
                              selected={isPersonSelected(type, admin.id)}
                              onClick={() => togglePerson(type, admin.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer summary */}
                    <div className="border-t border-slate-100 pt-1 flex items-center gap-2 flex-wrap">
                      {selectedAdmins.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">No recipients selected</span>
                      ) : (
                        <>
                          <div className="flex -space-x-1.5">
                            {selectedAdmins.slice(0, 5).map(a => (
                              <div
                                key={a.id}
                                title={a.name}
                                className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black"
                                style={{ backgroundColor: adminColor(a.id) + "33", color: adminColor(a.id) }}
                              >
                                {adminInitials(a.name)}
                              </div>
                            ))}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {selectedAdmins.length} recipient{selectedAdmins.length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-slate-300 text-[11px]">·</span>
                          <span className="text-[11px] text-slate-400">{channelLabel}</span>
                        </>
                      )}
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

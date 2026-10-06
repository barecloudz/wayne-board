"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Wrench, Truck, CheckSquare, DollarSign, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface NotificationBellProps {
  recipientId: number;
}

interface NotificationItem {
  id: number;
  recipientId: number;
  type: string;
  title: string;
  body: string | null;
  linkTo: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  maintenance: "border-orange-400",
  fleet:       "border-blue-400",
  tasks:       "border-purple-400",
  payroll:     "border-green-400",
  reports:     "border-green-400",
};

const TYPE_BG: Record<string, string> = {
  maintenance: "bg-orange-50",
  fleet:       "bg-blue-50",
  tasks:       "bg-purple-50",
  payroll:     "bg-green-50",
  reports:     "bg-green-50",
};

function typeColor(type: string) {
  return TYPE_COLORS[type] ?? "border-slate-300";
}

function typeBg(type: string) {
  return TYPE_BG[type] ?? "bg-slate-50";
}

function TypeIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5 flex-shrink-0";
  if (type === "maintenance") return <Wrench className={cls + " text-orange-500"} />;
  if (type === "fleet")       return <Truck className={cls + " text-blue-500"} />;
  if (type === "tasks")       return <CheckSquare className={cls + " text-purple-500"} />;
  if (type === "payroll" || type === "reports") return <DollarSign className={cls + " text-green-500"} />;
  return <Bell className={cls + " text-slate-400"} />;
}

export default function NotificationBell({ recipientId: _recipientId }: NotificationBellProps) {
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [panelOpen,      setPanelOpen]      = useState(false);
  const [notifications,  setNotifications]  = useState<NotificationItem[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [visible,        setVisible]        = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const router       = useRouter();

  // ── Fetch unread count ────────────────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // ignore network errors silently
    }
  }, []);

  // ── Polling: every 30 s, paused when tab is hidden ───────────────────────
  useEffect(() => {
    fetchCount();

    function startInterval() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchCount, 30_000);
    }
    function stopInterval() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setVisible(true);
        fetchCount();
        startInterval();
      } else {
        setVisible(false);
        stopInterval();
      }
    }

    if (document.visibilityState === "visible") startInterval();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchCount]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // ── Fetch notifications when panel opens ──────────────────────────────────
  useEffect(() => {
    if (!panelOpen) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications ?? []);
          setUnreadCount(data.unread ?? 0);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [panelOpen]);

  // ── Mark all read ─────────────────────────────────────────────────────────
  async function handleMarkAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    const res = await fetch("/api/notifications?limit=20", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(0);
    }
  }

  // ── Row click ─────────────────────────────────────────────────────────────
  async function handleRowClick(n: NotificationItem) {
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    setPanelOpen(false);
    if (n.linkTo) {
      router.push(n.linkTo);
    }
  }

  const displayCount = unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : "";

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setPanelOpen(v => !v)}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {displayCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-slate-200/80 flex flex-col overflow-hidden"
          style={{
            maxHeight: "70vh",
            animation: "notif-panel-in 0.18s ease forwards",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
            <span className="text-[14px] font-semibold text-slate-800">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-1">
                <span className="text-[22px]">✓</span>
                <p className="text-[13px] text-slate-400 font-medium">You're all caught up</p>
              </div>
            ) : (
              <ul>
                {notifications.map(n => {
                  const isUnread = n.readAt === null;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleRowClick(n)}
                        className={`w-full text-left flex gap-3 px-4 py-3 border-l-4 hover:bg-slate-50 transition-colors ${typeColor(n.type)} ${isUnread ? typeBg(n.type) : ""}`}
                      >
                        <div className="pt-0.5 flex-shrink-0">
                          <TypeIcon type={n.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] leading-snug truncate ${isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-1 leading-snug">
                              {n.body}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 mt-1 leading-none">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5">
            <Link
              href="/dashboard/notifications"
              onClick={() => setPanelOpen(false)}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @keyframes notif-panel-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Wrench, Truck, CheckSquare, DollarSign, Loader2, X } from "lucide-react";
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

  const containerRef  = useRef<HTMLButtonElement>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef         = useRef<EventSource | null>(null);
  const router        = useRouter();

  // ── Fetch unread count (polling fallback) ─────────────────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch {
      // ignore
    }
  }, []);

  // ── SSE real-time push with polling fallback ──────────────────────────────
  useEffect(() => {
    function startPolling() {
      if (intervalRef.current) return;
      fetchCount();
      intervalRef.current = setInterval(fetchCount, 10_000);
    }
    function stopPolling() {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    function closeSSE() {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    }

    function connectSSE() {
      closeSSE();
      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setUnreadCount(data.count ?? 0);
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        closeSSE();
        startPolling(); // fall back to polling if SSE fails
      };
      stopPolling(); // SSE is live — no need to poll
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        setVisible(true);
        connectSSE();
      } else {
        setVisible(false);
        closeSSE();
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") connectSSE();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      closeSSE();
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchCount]);

  // Scrim click handles close — no outside-click listener needed

  // ── Fetch notifications when panel opens; re-sync count on close ─────────
  useEffect(() => {
    if (panelOpen) {
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
    } else {
      // Panel just closed — re-sync badge so it reflects reads done inside panel
      fetchCount();
    }
  }, [panelOpen, fetchCount]);

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
    <>
      <style>{`
        @keyframes notif-slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .notif-modal { animation: notif-slide-down 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards; }
      `}</style>

      {/* Bell button */}
      <button
        ref={containerRef as React.RefObject<HTMLButtonElement>}
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

      {/* Full-screen overlay modal */}
      {panelOpen && (
        <div className="fixed inset-0 z-[200] flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {/* Scrim */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />

          {/* Modal card — slides down from top, takes ~90% height */}
          <div
            className="notif-modal relative z-10 mx-auto w-full max-w-lg flex flex-col bg-white shadow-[0_16px_64px_rgba(0,0,0,0.25)]"
            style={{
              height: "88vh",
              borderRadius: "0 0 28px 28px",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h2 className="text-[18px] font-extrabold text-slate-900 leading-none">Notifications</h2>
                {unreadCount > 0 && (
                  <p className="text-[12px] text-slate-400 mt-1">{unreadCount} unread</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setPanelOpen(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Bell className="w-10 h-10 text-slate-200" />
                  <p className="text-[15px] font-bold text-slate-700">You're all caught up</p>
                  <p className="text-[13px] text-slate-400">No notifications right now</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map(n => {
                    const isUnread = n.readAt === null;
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => handleRowClick(n)}
                          className={`w-full text-left flex gap-4 px-5 py-4 border-l-[3px] active:bg-slate-50 transition-colors ${typeColor(n.type)} ${isUnread ? typeBg(n.type) : "bg-white"}`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            <TypeIcon type={n.type} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-[14px] leading-snug ${isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-600"}`}>
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="text-[13px] text-slate-500 mt-0.5 line-clamp-2 leading-snug">
                                {n.body}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-400 mt-1.5 leading-none">
                              {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          {isUnread && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-slate-100 px-5 py-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
              <Link
                href="/dashboard/notifications"
                onClick={() => setPanelOpen(false)}
                className="flex items-center justify-center w-full py-3 rounded-2xl bg-slate-900 text-white text-[14px] font-bold hover:bg-slate-700 transition-colors"
              >
                View all notifications
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

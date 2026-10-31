"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, CalendarDays } from "lucide-react";
import { getUnseenNotifications, dismissNotification, isAdminUser } from "@/lib/actions/recruiting";
import type { ProspectNotification } from "@/lib/actions/recruiting";
import { useInterval } from "@/hooks/use-interval";

export default function NotificationBar() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [notifications, setNotifications] = useState<ProspectNotification[]>([]);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    isAdminUser().then(setAdmin);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!admin) return;
    const unseen = await getUnseenNotifications();
    setNotifications(unseen);
    if (unseen.length > 0) setVisible(true);
  }, [admin]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useInterval(fetchNotifications, admin ? 30_000 : null);

  if (!admin || !visible || notifications.length === 0) return null;

  const latest = notifications[notifications.length - 1];
  const count = notifications.length;
  const extra = count - 1;

  const isRoadTest = latest.type === "ready_for_road_test";
  const Icon = isRoadTest ? CalendarDays : UserPlus;

  const message = isRoadTest
    ? `Road test ready — ${latest.prospectName}`
    : `New candidate — ${latest.prospectName}`;

  async function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    if (dismissing) return;
    setDismissing(true);
    await Promise.all(notifications.map(n => dismissNotification(n.id)));
    setNotifications([]);
    setVisible(false);
    setDismissing(false);
  }

  return (
    <div className="fixed top-3 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none animate-notification-slide-down">
      <div
        onClick={() => router.push("/dashboard/recruiting")}
        className="pointer-events-auto flex items-center gap-3 bg-slate-900 rounded-2xl shadow-2xl shadow-black/30 px-4 py-3 cursor-pointer max-w-sm w-full border border-white/5"
      >
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[13px] font-semibold leading-tight truncate">{message}</p>
          {extra > 0 && (
            <p className="text-slate-400 text-[11px] mt-0.5">+{extra} more unseen</p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-40"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

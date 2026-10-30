"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
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

  const message =
    count > 1
      ? `${count} new candidates added`
      : latest.type === "ready_for_road_test"
      ? `Road test ready — ${latest.prospectName} needs scheduling`
      : `New candidate added — ${latest.prospectName}`;

  async function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    if (dismissing) return;
    setDismissing(true);
    await Promise.all(notifications.map(n => dismissNotification(n.id)));
    setNotifications([]);
    setVisible(false);
    setDismissing(false);
  }

  function handleClick() {
    router.push("/dashboard/recruiting");
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] animate-notification-slide-down">
      <div
        onClick={handleClick}
        className="relative bg-slate-900/95 backdrop-blur-md rounded-b-2xl shadow-2xl cursor-pointer"
      >
        {/* Amber top accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-amber-400/70" />
        <div className="flex items-center gap-3 px-5 py-3">
          <UserPlus className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="flex-1 text-white text-[13px] font-semibold leading-tight">
            {message}
          </span>
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-40"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

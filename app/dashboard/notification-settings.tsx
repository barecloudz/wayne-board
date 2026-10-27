"use client";

import Link from "next/link";
import { Bell, ChevronRight, Mail, Smartphone } from "lucide-react";

export default function NotificationSettings({ initialPrefs }: { initialPrefs: any[] }) {
  return (
    <Link
      href="/dashboard/notifications"
      className="group flex items-center gap-4 bg-white rounded-2xl border border-slate-200 px-5 py-5
        hover:border-indigo-300 hover:shadow-[0_4px_16px_rgba(99,102,241,0.08)] transition-all duration-150"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        <Bell className="w-5 h-5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-slate-900">Notification Settings</p>
        <p className="text-[12px] text-slate-400 mt-0.5">
          Control which events send alerts, choose email recipients, and manage delivery preferences.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Smartphone className="w-3 h-3" /> In-App
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <Mail className="w-3 h-3" /> Email
          </span>
          <span className="text-[11px] font-semibold text-slate-400">· Per-person recipient control</span>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
    </Link>
  );
}

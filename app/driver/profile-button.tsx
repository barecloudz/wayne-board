"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

export default function ProfileButton({
  name,
  orgSlug,
  isAdmin,
  accentColor = "#FF6200",
}: {
  name: string;
  orgSlug: string;
  isAdmin?: boolean;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(orgSlug ? `/login/${orgSlug}` : "/sign-in");
  }

  function goAccount() {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("mgops:goto-driver-tab", { detail: "account" })
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shadow-sm transition-all active:scale-95 hover:opacity-90 select-none"
        style={{ background: accentColor }}
      >
        {initials}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-2xl overflow-hidden z-50"
          style={{
            background: "#ffffff",
            border: "1px solid #E2E8F0",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[13px] font-semibold text-slate-800 truncate">{name}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Driver Portal</p>
          </div>

          {isAdmin && (
            <a
              href="/dashboard"
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </a>
          )}

          <button
            onClick={goAccount}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors text-left"
          >
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            Account Settings
          </button>

          <div className="border-t border-slate-100" />

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

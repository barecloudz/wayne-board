"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Camera } from "lucide-react";

export default function ProfileButton({
  name,
  orgSlug,
  isAdmin,
  accentColor = "#FF6200",
  avatarUrl,
}: {
  name: string;
  orgSlug: string;
  isAdmin?: boolean;
  accentColor?: string;
  avatarUrl?: string | null;
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

  function openAccount() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("mgops:open-account"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div ref={ref} className="relative">
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-[13px] font-bold text-white shadow-sm transition-all active:scale-95 hover:opacity-90 select-none border-2 border-white/40"
        style={{ background: accentColor }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          : initials
        }
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-50"
          style={{
            background: "#ffffff",
            border: "1px solid #E2E8F0",
            boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
          }}
        >
          {/* Profile header card */}
          <div className="px-4 py-4 bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
            <div className="flex items-center gap-3">
              {/* Avatar with camera nudge */}
              <button
                onClick={openAccount}
                className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 group"
                style={{ background: accentColor }}
                title="Change photo"
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                  : <span className="text-[18px] font-bold text-white">{initials}</span>
                }
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-extrabold text-slate-900 truncate">{name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Driver Portal</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Tap photo to update it — it shows on the leaderboard
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          {isAdmin && (
            <a
              href="/dashboard"
              className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
              onClick={() => setOpen(false)}
            >
              Admin Dashboard
            </a>
          )}

          <button
            onClick={openAccount}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors text-left"
          >
            Account Settings
          </button>

          <div className="border-t border-slate-100" />

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors text-left"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Global OTP prompt for Spotlight sync.
 * Rendered in the root layout alongside UpdateBanner so it appears on every admin page.
 * Polls /api/auto-spotlight/status every 10s; shows a fixed bottom banner
 * when syncStatus is "waiting_for_otp" or "otp_failed".
 */

import { useEffect, useState, useRef } from "react";
import { KeyRound, XCircle, Loader2, X } from "lucide-react";
import { usePathname } from "next/navigation";

export default function SpotlightOtpBanner() {
  const pathname = usePathname();
  const [status,    setStatus]    = useState<string>("idle");
  const [otpInput,  setOtpInput]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only show on admin pages, not on the Auto Spotlight page itself (it has its own panel)
  const isAdminPage = !!(pathname?.startsWith("/dashboard") || pathname?.startsWith("/mgops"));
  const isSpotlightPage = !!pathname?.includes("auto-spotlight");

  async function poll() {
    try {
      const res = await fetch("/api/auto-spotlight/status");
      if (!res.ok) return;
      const d = await res.json();
      const s = d.syncStatus ?? "idle";
      setStatus(s);
      // Reset dismissed when a fresh OTP request comes in
      if (s === "waiting_for_otp") setDismissed(false);
    } catch {}
  }

  useEffect(() => {
    if (!isAdminPage || isSpotlightPage) return;
    poll();
    pollRef.current = setInterval(poll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isAdminPage, isSpotlightPage]);

  async function submitOtp() {
    if (!otpInput.trim()) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "spotlight_otp", value: otpInput.trim() }),
    });
    setOtpInput("");
    setSaving(false);
    setDismissed(true);
  }

  const show = !dismissed && isAdminPage && !isSpotlightPage &&
    (status === "waiting_for_otp" || status === "otp_failed");

  if (!show) return null;

  const failed = status === "otp_failed";

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 pointer-events-none">
      <div
        className="pointer-events-auto rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.30)] border overflow-hidden"
        style={{
          background: failed ? "#FEF2F2" : "#EFF6FF",
          borderColor: failed ? "#FECACA" : "#BFDBFE",
        }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
          <div className="flex items-center gap-2">
            {failed
              ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              : <KeyRound className="w-4 h-4 text-blue-500 shrink-0" />}
            <p className={`text-[13px] font-bold ${failed ? "text-red-900" : "text-blue-900"}`}>
              {failed ? "Incorrect code — try again" : "Spotlight sync needs your code"}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className={`text-[11px] px-4 pb-3 ${failed ? "text-red-700" : "text-blue-700"}`}>
          {failed
            ? "That code wasn't accepted. Enter the correct one below."
            : "FedEx sent a verification code to your phone or email. Enter it here to continue."}
        </p>
        <div className="flex gap-2 px-4 pb-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={otpInput}
            onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && submitOtp()}
            placeholder="123456"
            autoFocus
            className={`flex-1 px-3 py-2 rounded-xl border bg-white text-[15px] font-bold text-slate-900 tracking-widest outline-none transition
              ${failed
                ? "border-red-200 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                : "border-blue-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"}`}
          />
          <button
            onClick={submitOtp}
            disabled={saving || !otpInput.trim()}
            className={`px-4 py-2 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50 transition-colors
              ${failed ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

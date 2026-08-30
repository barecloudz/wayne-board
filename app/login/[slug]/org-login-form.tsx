"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function OrgLoginForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!driverId.trim() || !password.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: driverId.trim(), password, orgSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed.");
        setLoading(false);
        return;
      }
      router.push(data.isAdmin ? "/dashboard" : "/driver");
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-7 py-7 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Driver ID
        </label>
        <input
          type="text"
          placeholder="e.g. 1234567"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full px-4 py-3 rounded-xl text-[15px] text-white placeholder-white/20 outline-none transition-all"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 pr-11 rounded-xl text-[15px] text-white placeholder-white/20 outline-none transition-all"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            onFocus={(e) => (e.target.style.borderColor = "#16A34A")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-center" style={{ color: "#f87171" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !driverId.trim() || !password.trim()}
        className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
        style={{ background: "#16A34A" }}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

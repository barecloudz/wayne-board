"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function OrgLoginForm({
  orgSlug,
  accentColor,
}: {
  orgSlug: string;
  accentColor: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, orgSlug }),
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

  /* Inset-shadow input style · clean, slightly recessed look */
  const inputBase: React.CSSProperties = {
    background: "rgba(241,245,249,0.8)",
    border: "1px solid rgba(203,213,225,0.7)",
    boxShadow: "inset 0 2px 4px rgba(148,163,184,0.12), inset 0 1px 2px rgba(148,163,184,0.08)",
    color: "#0F172A",
    borderRadius: 12,
    padding: "13px 16px",
    fontSize: 15,
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = accentColor;
    e.target.style.boxShadow = `inset 0 2px 4px rgba(148,163,184,0.10), 0 0 0 3px ${accentColor}28`;
    e.target.style.background = "#FFFFFF";
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "rgba(203,213,225,0.7)";
    e.target.style.boxShadow = "inset 0 2px 4px rgba(148,163,184,0.12), inset 0 1px 2px rgba(148,163,184,0.08)";
    e.target.style.background = "rgba(241,245,249,0.8)";
  }

  /* Derive a slightly lighter tint for the button gloss */
  function hexLighten(hex: string, amount: number): string {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + amount);
    const g = Math.min(255, ((n >> 8) & 0xff) + amount);
    const b = Math.min(255, (n & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }
  function hexDarken(hex: string, amount: number): string {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - amount);
    const g = Math.max(0, ((n >> 8) & 0xff) - amount);
    const b = Math.max(0, (n & 0xff) - amount);
    return `rgb(${r},${g},${b})`;
  }

  const btnGradient = `linear-gradient(180deg, ${hexLighten(accentColor, 24)} 0%, ${accentColor} 48%, ${hexDarken(accentColor, 18)} 100%)`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full">
      {/* Username */}
      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "#94A3B8" }}
        >
          Username
        </label>
        <input
          type="text"
          placeholder="your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          style={inputBase}
          onFocus={onFocus}
          onBlur={onBlur}
          className="placeholder:text-slate-300"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "#94A3B8" }}
        >
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ ...inputBase, paddingRight: 44 }}
            onFocus={onFocus}
            onBlur={onBlur}
            className="placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-60"
            style={{ color: "#94A3B8" }}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p
          className="text-[12px] text-center font-medium rounded-xl px-3 py-2.5"
          style={{
            color: "#DC2626",
            background: "rgba(254,226,226,0.7)",
            border: "1px solid rgba(252,165,165,0.5)",
          }}
        >
          {error}
        </p>
      )}

      {/* CTA button · gloss gradient */}
      <button
        type="submit"
        disabled={loading || !username.trim() || !password.trim()}
        className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 mt-1"
        style={{
          background: btnGradient,
          boxShadow: [
            `0 1px 0 0 ${hexLighten(accentColor, 40)}60 inset`,  /* top gloss on button */
            `0 4px 14px ${accentColor}50`,                        /* color glow */
            `0 1px 3px rgba(0,0,0,0.15)`,                        /* base shadow */
          ].join(", "),
          letterSpacing: "0.01em",
        }}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

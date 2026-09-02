"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function OrgLoginForm({ orgSlug }: { orgSlug: string }) {
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

  const inputBase: React.CSSProperties = {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    color: "#0F172A",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 15,
    width: "100%",
    outline: "none",
    transition: "border-color 0.15s",
  };

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#FF6200";
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = "#E2E8F0";
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Username */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#64748B" }}>
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
          className="placeholder-slate-300"
        />
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#64748B" }}>
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
            className="placeholder-slate-300"
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-80"
            style={{ color: "#94A3B8" }}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-center font-medium" style={{ color: "#f87171" }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !username.trim() || !password.trim()}
        className="w-full py-3.5 rounded-xl text-[14px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2 mt-1"
        style={{ background: "#FF6200" }}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

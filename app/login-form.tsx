"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Eye, EyeOff } from "lucide-react";

export default function LoginForm({ variant }: { variant: "card" | "mobile" }) {
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
        body: JSON.stringify({ driverId: driverId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed."); return; }
      router.push("/driver");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (variant === "mobile") {
    return (
      <form onSubmit={handleSubmit} className="bg-white px-5 py-4 flex flex-col gap-2">
        <input
          type="text"
          placeholder="Driver ID"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
            text-slate-800 placeholder-slate-400 outline-none
            focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
              text-slate-800 placeholder-slate-400 outline-none pr-10
              focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
          />
          <button type="button" onClick={() => setShowPassword((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-[11px] text-red-500 text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !driverId.trim() || !password.trim()}
          className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white mt-0.5
            transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Sign In
        </button>
      </form>
    );
  }

  // card variant (desktop)
  return (
    <form onSubmit={handleSubmit} className="px-8 py-8 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">Driver ID</label>
        <input
          type="text"
          placeholder="e.g. blake_742"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          className="w-full px-5 py-4 rounded-xl border border-slate-200 text-[16px]
            text-slate-800 placeholder-slate-300 outline-none
            focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
          autoCapitalize="none"
          autoCorrect="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-4 rounded-xl border border-slate-200 text-[16px]
              text-slate-800 placeholder-slate-300 outline-none pr-12
              focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
          />
          <button type="button" onClick={() => setShowPassword((p) => !p)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}
      <button
        type="submit"
        disabled={loading || !driverId.trim() || !password.trim()}
        className="w-full py-4 rounded-xl text-[16px] font-bold text-white mt-2
          transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50
          flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}
      >
        {loading && <Loader2 className="w-5 h-5 animate-spin" />}
        Sign In
        {!loading && <ChevronRight className="w-5 h-5" />}
      </button>
    </form>
  );
}

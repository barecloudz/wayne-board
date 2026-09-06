"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOnboardingGcCredentials } from "@/lib/actions/onboarding";

export default function OnboardingGroundCloud() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    if (!username.trim() || !password.trim()) {
      setError("Both username and password are required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await saveOnboardingGcCredentials(username.trim(), password);
      router.push("/onboarding/done");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleSkip() {
    router.push("/onboarding/done");
  }

  return (
    <div className="w-full max-w-lg">
      <div
        className="bg-white rounded-2xl border border-slate-200/60
          shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-slate-900 transition-all" style={{ width: "75%" }} />
        </div>

        <div className="px-8 py-8">
          {/* Step label */}
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Step 3 of 4
          </p>

          {/* Heading */}
          <h1 className="text-[24px] font-extrabold text-slate-900 mb-1">
            Connect GroundCloud
          </h1>
          <p className="text-[13px] text-slate-500 mb-7">
            We&apos;ll automatically pull stops-per-hour data for your drivers
            each morning.
          </p>

          <div className="space-y-4 mb-2">
            <div>
              <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                GroundCloud Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username@example.com"
                autoComplete="username"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200
                  text-[13px] text-slate-800 outline-none focus:border-slate-400
                  focus:ring-2 focus:ring-slate-100 transition"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                GroundCloud Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200
                  text-[13px] text-slate-800 outline-none focus:border-slate-400
                  focus:ring-2 focus:ring-slate-100 transition"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mb-2">
            Credentials are stored securely and used only for automated data
            pulls.
          </p>

          {error && (
            <p className="text-[12px] text-red-500 mt-3">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-8">
            <button
              type="button"
              onClick={handleSkip}
              className="text-slate-400 text-[13px] hover:text-slate-600 transition-colors"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleConnect}
              disabled={loading}
              className="bg-slate-900 text-white rounded-xl px-6 py-2.5 text-[13px]
                font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

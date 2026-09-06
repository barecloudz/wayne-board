"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOnboardingLocations } from "@/lib/actions/onboarding";

export default function OnboardingLocation() {
  const router = useRouter();
  const [locationName, setLocationName] = useState("");
  const [multiLocation, setMultiLocation] = useState(false);
  const [locationName2, setLocationName2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleNext() {
    if (!locationName.trim()) {
      setError("Location name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const locs = [{ name: locationName }];
      if (multiLocation && locationName2.trim()) {
        locs.push({ name: locationName2 });
      }
      await saveOnboardingLocations(locs);
      router.push("/onboarding/fleet");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg">
      <div
        className="bg-white rounded-2xl border border-slate-200/60
          shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-slate-900 transition-all" style={{ width: "25%" }} />
        </div>

        <div className="px-8 py-8">
          {/* Step label */}
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Step 1 of 4
          </p>

          {/* Heading */}
          <h1 className="text-[24px] font-extrabold text-slate-900 mb-1">
            Where do you operate?
          </h1>
          <p className="text-[13px] text-slate-500 mb-7">
            Tell us about your station so we can set up your workspace.
          </p>

          {/* Location name */}
          <div className="mb-5">
            <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
              Location name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g. Fletcher Station - 0259"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
                text-slate-800 outline-none focus:border-slate-400 focus:ring-2
                focus:ring-slate-100 transition"
            />
          </div>

          {/* Multi-location toggle */}
          <div className="flex items-center gap-2.5 mb-5">
            <button
              type="button"
              onClick={() => setMultiLocation((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                multiLocation ? "bg-slate-900" : "bg-slate-200"
              }`}
              aria-pressed={multiLocation}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  multiLocation ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span className="text-[13px] text-slate-700 font-medium">
              I operate multiple locations
            </span>
          </div>

          {multiLocation && (
            <div className="mb-5">
              <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
                Second location name
              </label>
              <input
                type="text"
                value={locationName2}
                onChange={(e) => setLocationName2(e.target.value)}
                placeholder="e.g. Riverside Station - 0312"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
                  text-slate-800 outline-none focus:border-slate-400 focus:ring-2
                  focus:ring-slate-100 transition"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                You can add more later in Settings.
              </p>
            </div>
          )}

          {error && (
            <p className="text-[12px] text-red-500 mb-4">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-8">
            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="bg-slate-900 text-white rounded-xl px-6 py-2.5 text-[13px]
                font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving…" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

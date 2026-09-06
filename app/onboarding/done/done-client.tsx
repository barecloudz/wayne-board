"use client";

import { useState } from "react";
import { completeOnboarding } from "@/lib/actions/onboarding";

type Props = {
  gcConnected: boolean;
  vehicleCount: number;
  locationNames: string[];
};

export default function DoneClient({ gcConnected, vehicleCount, locationNames }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGo() {
    setLoading(true);
    await completeOnboarding();
    // completeOnboarding redirects, so nothing needed after
  }

  return (
    <div className="w-full max-w-lg">
      <div
        className="bg-white rounded-2xl border border-slate-200/60
          shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden"
      >
        {/* Progress bar — full */}
        <div className="h-1 bg-slate-900" />

        <div className="px-8 py-8">
          {/* Step label */}
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Step 4 of 4
          </p>

          {/* Heading */}
          <h1 className="text-[24px] font-extrabold text-slate-900 mb-1">
            You&apos;re all set
          </h1>
          <p className="text-[13px] text-slate-500 mb-7">
            Here&apos;s a summary of what was configured for your workspace.
          </p>

          {/* Summary list */}
          <div className="space-y-3 mb-8">
            {/* Locations */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[18px] leading-none mt-0.5">📍</span>
              <div>
                <p className="text-[13px] font-bold text-slate-800">
                  {locationNames.length > 0
                    ? `${locationNames.length} location${locationNames.length > 1 ? "s" : ""} added`
                    : "No locations added yet"}
                </p>
                {locationNames.length > 0 && (
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {locationNames.join(", ")}
                  </p>
                )}
              </div>
            </div>

            {/* Vehicles */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[18px] leading-none mt-0.5">🚚</span>
              <div>
                <p className="text-[13px] font-bold text-slate-800">
                  {vehicleCount > 0
                    ? `${vehicleCount} truck${vehicleCount > 1 ? "s" : ""} added`
                    : "No trucks added yet"}
                </p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {vehicleCount > 0
                    ? "You can manage your fleet in the Fleet section."
                    : "Add trucks anytime from the Fleet section."}
                </p>
              </div>
            </div>

            {/* GroundCloud */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[18px] leading-none mt-0.5">
                {gcConnected ? "✅" : "⏭️"}
              </span>
              <div>
                <p className="text-[13px] font-bold text-slate-800">
                  {gcConnected ? "GroundCloud connected" : "GroundCloud skipped"}
                </p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  {gcConnected
                    ? "SPH data will be pulled automatically each morning."
                    : "Connect anytime from Settings → Auto GC."}
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleGo}
            disabled={loading}
            className="w-full bg-slate-900 text-white rounded-xl px-6 py-3 text-[14px]
              font-bold hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading…" : "Go to Dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

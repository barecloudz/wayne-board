"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOnboardingVehicles } from "@/lib/actions/onboarding";

type TruckEntry = { unitNumber: string; make: string; model: string };

export default function OnboardingFleet() {
  const router = useRouter();
  const [trucks, setTrucks] = useState<TruckEntry[]>([
    { unitNumber: "", make: "", model: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addTruck() {
    setTrucks((prev) => [...prev, { unitNumber: "", make: "", model: "" }]);
  }

  function updateTruck(index: number, field: keyof TruckEntry, value: string) {
    setTrucks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  }

  function removeTruck(index: number) {
    setTrucks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleNext() {
    const filled = trucks.filter((t) => t.unitNumber.trim());
    setError("");
    setLoading(true);
    try {
      if (filled.length > 0) {
        await saveOnboardingVehicles(filled);
      }
      router.push("/onboarding/groundcloud");
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleSkip() {
    router.push("/onboarding/groundcloud");
  }

  return (
    <div className="w-full max-w-lg">
      <div
        className="bg-white rounded-2xl border border-slate-200/60
          shadow-[0_8px_40px_rgba(0,0,0,0.08)] overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div className="h-full bg-slate-900 transition-all" style={{ width: "50%" }} />
        </div>

        <div className="px-8 py-8">
          {/* Step label */}
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-6">
            Step 2 of 4
          </p>

          {/* Heading */}
          <h1 className="text-[24px] font-extrabold text-slate-900 mb-1">
            Add your trucks
          </h1>
          <p className="text-[13px] text-slate-500 mb-7">
            Enter your vehicles now or skip and add them later in Fleet.
          </p>

          {/* Truck list */}
          <div className="space-y-4">
            {trucks.map((truck, i) => (
              <div
                key={i}
                className="border border-slate-200 rounded-xl p-4 relative"
              >
                {trucks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTruck(i)}
                    className="absolute top-3 right-3 text-[11px] text-slate-400
                      hover:text-slate-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Unit Number <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={truck.unitNumber}
                      onChange={(e) => updateTruck(i, "unitNumber", e.target.value)}
                      placeholder="e.g. T-101"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200
                        text-[13px] text-slate-800 outline-none focus:border-slate-400
                        focus:ring-2 focus:ring-slate-100 transition"
                    />
                  </div>
                  <div className="col-span-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Make
                      </label>
                      <input
                        type="text"
                        value={truck.make}
                        onChange={(e) => updateTruck(i, "make", e.target.value)}
                        placeholder="e.g. Ford"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200
                          text-[13px] text-slate-800 outline-none focus:border-slate-400
                          focus:ring-2 focus:ring-slate-100 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                        Model
                      </label>
                      <input
                        type="text"
                        value={truck.model}
                        onChange={(e) => updateTruck(i, "model", e.target.value)}
                        placeholder="e.g. Transit"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200
                          text-[13px] text-slate-800 outline-none focus:border-slate-400
                          focus:ring-2 focus:ring-slate-100 transition"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add another */}
          <button
            type="button"
            onClick={addTruck}
            className="mt-3 text-[13px] text-slate-500 hover:text-slate-800
              font-medium transition-colors"
          >
            + Add another truck
          </button>

          {error && (
            <p className="text-[12px] text-red-500 mt-4">{error}</p>
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

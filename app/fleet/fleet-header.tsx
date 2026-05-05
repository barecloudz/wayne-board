"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  HelpCircle, X, ClipboardCheck, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, Truck,
} from "lucide-react";

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
};

export default function FleetHeader({ trucks }: { trucks: Vehicle[] }) {
  const [showHelp, setShowHelp] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const router = useRouter();

  function startInspection(vehicleId: number) {
    setShowPicker(false);
    router.push(`/fleet/${vehicleId}/inspect`);
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-1">
        {/* Help button */}
        <button
          onClick={() => setShowHelp(true)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100
            active:scale-90 active:bg-slate-200 transition-all duration-150"
          title="How inspections work"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Start New Inspection */}
        <button
          onClick={() => setShowPicker(true)}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
            hover:bg-slate-700 active:scale-95 active:bg-slate-800
            transition-all duration-150 shadow-sm hover:shadow-md"
        >
          Start New Inspection
        </button>
      </div>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">How Inspections Work</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">M-121 Quarterly Vehicle Inspection Checklist</p>
              </div>
              <button onClick={() => setShowHelp(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 active:bg-slate-200 transition-all duration-150">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5">
              {/* Steps */}
              <div className="flex flex-col gap-3">
                {[
                  {
                    icon: Truck,
                    color: "bg-indigo-50 text-indigo-600",
                    title: "Select a truck",
                    body: "Click \"Start New Inspection\" and choose the truck you're inspecting from the list.",
                  },
                  {
                    icon: ClipboardCheck,
                    color: "bg-slate-100 text-slate-600",
                    title: "Go through all 20 items",
                    body: "Each item on the M-121 form is presented one at a time. Mark each as OK, Repair Needed, N/A, or A/D (access denied — only valid for asterisked items).",
                  },
                  {
                    icon: AlertTriangle,
                    color: "bg-amber-50 text-amber-600",
                    title: "Record any defects",
                    body: "If an item is marked \"Repair Needed\", you'll add notes. Items 1–15 and 19–20 are safety items — defects here require notification of the AO/BC and an agreed repair date before the vehicle can run.",
                  },
                  {
                    icon: CheckCircle2,
                    color: "bg-emerald-50 text-emerald-600",
                    title: "Submit the inspection",
                    body: "Completed inspections are saved to the fleet record. Compliant vehicles show a green Q2 ✓ badge. You can generate a PDF copy that matches the official M-121 format.",
                  },
                ].map(({ icon: Icon, color, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-slate-800">{title}</p>
                      <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Status key</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { dot: "bg-emerald-400", label: "OK", desc: "Item passes inspection" },
                    { dot: "bg-amber-400",   label: "Repair Needed", desc: "Defect found, action required" },
                    { dot: "bg-slate-300",   label: "N/A", desc: "Not applicable to this vehicle" },
                    { dot: "bg-indigo-300",  label: "A/D", desc: "Access denied (asterisk items only)" },
                  ].map(({ dot, label, desc }) => (
                    <div key={label} className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full ${dot} mt-1 shrink-0`} />
                      <div>
                        <span className="text-[12px] font-semibold text-slate-700">{label}</span>
                        <p className="text-[11px] text-slate-400">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-[12px] font-bold text-slate-800">Out of Service</p>
                </div>
                <p className="text-[12px] text-slate-600 leading-relaxed">
                  If a truck is removed from rotation, mark it Out of Service. No inspection checklist is required, but supporting documentation must be provided.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 active:scale-[0.98] active:bg-slate-800 transition-all duration-150"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Truck Picker Modal ── */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Select a Truck</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Choose the truck you are inspecting</p>
              </div>
              <button onClick={() => setShowPicker(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 active:bg-slate-200 transition-all duration-150">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="overflow-y-auto py-2">
              {trucks.map((truck) => (
                <button
                  key={truck.id}
                  onClick={() => startInspection(truck.id)}
                  className="w-full flex items-center justify-between px-6 py-3.5
                    hover:bg-slate-50 active:bg-slate-100 active:scale-[0.99]
                    transition-all duration-100 text-left group border-b border-slate-100/80 last:border-0"
                >
                  <div>
                    <p className="text-[14px] font-bold text-slate-900">{truck.unitNumber}</p>
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      {truck.year} {truck.make} {truck.model}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

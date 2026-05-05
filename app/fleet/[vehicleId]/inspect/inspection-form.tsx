"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INSPECTION_COMPONENTS } from "@/lib/inspection-components";
import { saveInspection, type ItemResult } from "@/lib/actions/inspections";
import VinScanner from "@/components/vin-scanner";
import {
  CheckCircle2, AlertTriangle, Minus, Ban,
  Loader2, AlertCircle, CheckCheck,
} from "lucide-react";

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  type: string;
  vin: string;
};

type Status = "OK" | "Repair Needed" | "N/A" | "A/D" | null;

function today() {
  return new Date().toISOString().split("T")[0];
}

const STATUS_CONFIG = {
  "OK": {
    label: "OK",
    icon: CheckCircle2,
    active: "bg-emerald-600 text-white border-emerald-600 shadow-[0_2px_8px_rgba(5,150,105,0.35)]",
    hover: "hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50",
    dot: "bg-emerald-500",
  },
  "Repair Needed": {
    label: "Repair Needed",
    icon: AlertTriangle,
    active: "bg-amber-500 text-white border-amber-500 shadow-[0_2px_8px_rgba(245,158,11,0.35)]",
    hover: "hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50",
    dot: "bg-amber-400",
  },
  "N/A": {
    label: "N/A",
    icon: Minus,
    active: "bg-slate-500 text-white border-slate-500",
    hover: "hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50",
    dot: "bg-slate-300",
  },
  "A/D": {
    label: "A/D",
    icon: Ban,
    active: "bg-indigo-600 text-white border-indigo-600 shadow-[0_2px_8px_rgba(79,70,229,0.3)]",
    hover: "hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50",
    dot: "bg-indigo-400",
  },
};

export default function InspectionForm({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isTractor = vehicle.type === "tractor";

  // VIN tracking
  const [scannedVin, setScannedVin] = useState<string | null>(null);
  const displayVin = scannedVin ?? vehicle.vin;

  // Header fields
  const [inspectorName, setInspectorName] = useState("");
  const [inspectorId, setInspectorId]     = useState("");
  const [stationName]                      = useState("Hampstead Terminal");
  const [stationNumber]                    = useState("742");
  const [inspectionDate, setInspectionDate] = useState(today());
  const [outOfService, setOutOfService]    = useState(false);
  const [outOfServiceDocs, setOutOfServiceDocs] = useState("");

  // Notification section
  const [notificationDate, setNotificationDate]   = useState("");
  const [notifiedAOBCName, setNotifiedAOBCName]   = useState("");
  const [agreedRepairDate, setAgreedRepairDate]   = useState("");

  // Item results — pre-seed tractor-only items as N/A for vans
  const [results, setResults] = useState<Record<number, Status>>(() => {
    const init: Record<number, Status> = {};
    INSPECTION_COMPONENTS.forEach((c) => {
      if (c.tractorOnly && !isTractor) init[c.id] = "N/A";
      else init[c.id] = null;
    });
    return init;
  });
  const [notes, setNotes]     = useState<Record<number, string>>({});
  const [repaired, setRepaired] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function setStatus(id: number, status: Status) {
    setResults((prev) => ({ ...prev, [id]: status }));
    // clear repair note when switching away
    if (status !== "Repair Needed") {
      setNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setRepaired((prev) => { const r = { ...prev }; delete r[id]; return r; });
    }
  }

  const hasDefects = Object.values(results).some((s) => s === "Repair Needed");
  const allAnswered = !outOfService && INSPECTION_COMPONENTS.every((c) => {
    if (c.tractorOnly && !isTractor) return true;
    return results[c.id] !== null;
  });

  const progress = (() => {
    if (outOfService) return 100;
    const applicable = INSPECTION_COMPONENTS.filter(
      (c) => !(c.tractorOnly && !isTractor)
    );
    const answered = applicable.filter((c) => results[c.id] !== null).length;
    return Math.round((answered / applicable.length) * 100);
  })();

  function handleSubmit() {
    if (!inspectorName.trim()) { setSubmitError("Inspector name is required."); return; }
    if (!allAnswered && !outOfService) { setSubmitError("All applicable items must be marked before submitting."); return; }
    setSubmitError("");

    const itemResults: ItemResult[] = INSPECTION_COMPONENTS.map((c) => ({
      componentId: c.id,
      status:      results[c.id] ?? "N/A",
      notes:       notes[c.id] || undefined,
      dateRepaired: repaired[c.id] || undefined,
    }));

    startTransition(async () => {
      try {
        const result = await saveInspection({
          vehicleId:       vehicle.id,
          inspectorName:   inspectorName.trim(),
          inspectorId:     inspectorId.trim() || "—",
          stationName,
          stationNumber,
          inspectionDate,
          outOfService,
          outOfServiceDocs: outOfServiceDocs || undefined,
          results:         itemResults,
          notificationDate: notificationDate || undefined,
          notifiedAOBCName: notifiedAOBCName || undefined,
          agreedRepairDate: agreedRepairDate || undefined,
        });
        setSubmitted(true);
        setTimeout(() => router.push(`/fleet/${vehicle.id}`), 2000);
      } catch (e) {
        setSubmitError("Failed to save inspection. Please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCheck className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-[20px] font-extrabold text-slate-900">Inspection Saved</h2>
        <p className="text-[13px] text-slate-500">Returning to vehicle details...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-5 py-3
        shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Progress
          </span>
          <span className="text-[11px] font-bold text-slate-700">{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Header fields */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
        <h2 className="text-[13px] font-bold text-slate-900 mb-4">Inspection Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Employee Name / ID *">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Full name"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className={INPUT}
              />
              <input
                type="text"
                placeholder="ID"
                value={inspectorId}
                onChange={(e) => setInspectorId(e.target.value)}
                className={`${INPUT} w-28 shrink-0`}
              />
            </div>
          </Field>
          <Field label="Date of Inspection">
            <input
              type="date"
              value={inspectionDate}
              onChange={(e) => setInspectionDate(e.target.value)}
              className={INPUT}
            />
          </Field>
          <Field label="Station Name">
            <input type="text" value={stationName} readOnly className={`${INPUT} bg-slate-50 text-slate-500`} />
          </Field>
          <Field label="Station #">
            <input type="text" value={stationNumber} readOnly className={`${INPUT} bg-slate-50 text-slate-500`} />
          </Field>
          <Field label="Vehicle Unit #">
            <input type="text" value={vehicle.unitNumber} readOnly className={`${INPUT} bg-slate-50 text-slate-500`} />
          </Field>

          {/* VIN Scanner — full width */}
          <div className="sm:col-span-2">
            <Field label="Vehicle Identification Number (VIN)">
              {scannedVin ? (
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="font-mono text-[13px] text-slate-800 tracking-wider flex-1">{scannedVin}</span>
                  <button
                    type="button"
                    onClick={() => setScannedVin(null)}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                  >
                    Re-scan
                  </button>
                </div>
              ) : (
                <VinScanner
                  vehicleId={vehicle.id}
                  currentVin={displayVin}
                  vehicle={{ make: vehicle.make, model: vehicle.model, year: vehicle.year, unitNumber: vehicle.unitNumber }}
                  onVinConfirmed={(vin) => setScannedVin(vin)}
                />
              )}
            </Field>
          </div>
        </div>

        {/* Out of service */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div
              onClick={() => setOutOfService((v) => !v)}
              className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                outOfService ? "bg-red-600 border-red-600" : "border-slate-300 group-hover:border-slate-400"
              }`}
            >
              {outOfService && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <div>
              <p className="text-[13px] font-semibold text-slate-800">
                Vehicle is out of service and not available for inspection
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Attach supporting documentation showing the vehicle has not provided service.
              </p>
            </div>
          </label>
          {outOfService && (
            <textarea
              placeholder="Supporting documentation / notes..."
              value={outOfServiceDocs}
              onChange={(e) => setOutOfServiceDocs(e.target.value)}
              rows={3}
              className={`${INPUT} mt-3 resize-none`}
            />
          )}
        </div>
      </div>

      {/* Checklist */}
      {!outOfService && (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden
          shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-[13px] font-bold text-slate-900">Vehicle Components Inspected</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Indicate with OK or Repair Needed · Mark N/A if not applicable · Mark A/D if access denied (* items only)
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {INSPECTION_COMPONENTS.map((component) => {
              const isAutoNA = component.tractorOnly && !isTractor;
              const status = results[component.id];
              const isRepairNeeded = status === "Repair Needed";
              const isSafety = component.affectsSafety;
              const allowAD = component.requiresAccess;

              return (
                <div
                  key={component.id}
                  className={`px-6 py-4 transition-colors ${
                    isAutoNA ? "opacity-50 pointer-events-none bg-slate-50/40" :
                    isRepairNeeded ? "bg-amber-50/50" : ""
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    {/* Component info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {String(component.id).padStart(2, "0")}
                        </span>
                        {component.requiresAccess && (
                          <span className="text-[11px] text-slate-400">*</span>
                        )}
                        <span className="text-[13px] font-bold text-slate-900">
                          {component.name}
                        </span>
                        {!isSafety && (
                          <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50
                            border border-indigo-200/80 px-1.5 py-0.5 rounded-full shrink-0">
                            Non-safety
                          </span>
                        )}
                        {isAutoNA && (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100
                            border border-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                            Tractor only · Auto N/A
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed pr-4">
                        <span className="font-semibold text-slate-500">{component.regulation}</span>
                        {" · "}
                        {component.description}
                      </p>
                    </div>

                    {/* Status buttons */}
                    {!isAutoNA && (
                      <div className="flex gap-1.5 shrink-0 flex-wrap">
                        {(["OK", "Repair Needed", "N/A", ...(allowAD ? ["A/D"] : [])] as ("OK" | "Repair Needed" | "N/A" | "A/D")[]).map(
                          (s) => {
                            const cfg = STATUS_CONFIG[s];
                            const Icon = cfg.icon;
                            const active = status === s;
                            return (
                              <button
                                key={s}
                                onClick={() => setStatus(component.id, s)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border
                                  text-[12px] font-semibold transition-all duration-150
                                  active:scale-95 ${
                                    active
                                      ? cfg.active
                                      : `border-slate-200 text-slate-400 bg-white ${cfg.hover}`
                                  }`}
                              >
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                {s}
                              </button>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>

                  {/* Repair Needed expansion */}
                  {isRepairNeeded && (
                    <div className="mt-3 ml-6 flex flex-col gap-2">
                      <textarea
                        placeholder="Describe the defect..."
                        value={notes[component.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [component.id]: e.target.value }))
                        }
                        rows={2}
                        className={`${INPUT} resize-none text-[12px]`}
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                          Date Repaired (MM/DD/YY)
                        </label>
                        <input
                          type="text"
                          placeholder="MM/DD/YY"
                          value={repaired[component.id] ?? ""}
                          onChange={(e) =>
                            setRepaired((prev) => ({ ...prev, [component.id]: e.target.value }))
                          }
                          className={`${INPUT} w-36`}
                        />
                      </div>
                      {isSafety && (
                        <div className="flex items-start gap-1.5 text-amber-700 bg-amber-50
                          border border-amber-200 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <p className="text-[11px] font-medium leading-relaxed">
                            Safety defect — packages must not be loaded until this item is
                            confirmed repaired and verified by FedEx management.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notification section — only when defects exist */}
      {hasDefects && !outOfService && (
        <div className="bg-white rounded-2xl border border-amber-200 p-6
          shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-[13px] font-bold text-slate-900">Notification Section</h2>
          </div>
          <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
            Service provider AO/BC must be notified within one business day of inspection.
            The vehicle must not provide service for FedEx until all safety defect(s) have been
            corrected and verified by FedEx management.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Date AO/BC Notified">
              <input
                type="date"
                value={notificationDate}
                onChange={(e) => setNotificationDate(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Name of AO/BC Notified">
              <input
                type="text"
                placeholder="e.g. Rich Lastname"
                value={notifiedAOBCName}
                onChange={(e) => setNotifiedAOBCName(e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label="Date All Repairs Will Be Completed">
              <input
                type="date"
                value={agreedRepairDate}
                onChange={(e) => setAgreedRepairDate(e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
        {submitError && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-red-50 border border-red-200
            rounded-lg text-[12px] text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {submitError}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.back()}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold border border-slate-200
              text-slate-600 hover:bg-slate-50 active:scale-[0.98] active:bg-slate-100
              transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold bg-slate-900 text-white
              hover:bg-slate-700 active:scale-[0.98] active:bg-slate-800
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150 shadow-sm hover:shadow-md
              flex items-center justify-center gap-2"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
            ) : (
              <><CheckCheck className="w-4 h-4" />Submit Inspection</>
            )}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-3">
          Inspection will be saved to the fleet record for {vehicle.unitNumber}.
        </p>
      </div>
    </div>
  );
}

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 " +
  "placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 " +
  "focus:ring-slate-100 transition bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

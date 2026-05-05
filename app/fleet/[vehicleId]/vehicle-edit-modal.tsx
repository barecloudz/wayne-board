"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Loader2, CheckCheck, AlertCircle } from "lucide-react";
import { updateVehicle } from "@/lib/actions/vehicles";

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  type: string;
  active: boolean;
};

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

export default function VehicleEditModal({ vehicle }: { vehicle: Vehicle }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();

  // Form state
  const [unitNumber, setUnitNumber] = useState(vehicle.unitNumber);
  const [make, setMake]             = useState(vehicle.make);
  const [model, setModel]           = useState(vehicle.model);
  const [year, setYear]             = useState(String(vehicle.year));
  const [mileage, setMileage]       = useState(String(vehicle.mileage));
  const [vin, setVin]               = useState(vehicle.vin ?? "");
  const [type, setType]             = useState(vehicle.type);
  const [active, setActive]         = useState(vehicle.active);

  function openModal() {
    // Reset to current vehicle values each time
    setUnitNumber(vehicle.unitNumber);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(String(vehicle.year));
    setMileage(String(vehicle.mileage));
    setVin(vehicle.vin ?? "");
    setType(vehicle.type);
    setActive(vehicle.active);
    setError("");
    setOpen(true);
  }

  function handleSave() {
    if (!unitNumber.trim()) { setError("Truck name is required."); return; }
    if (!make.trim() || !model.trim()) { setError("Make and model are required."); return; }
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > 2030) { setError("Enter a valid year."); return; }
    const mileageNum = parseInt(mileage);
    if (isNaN(mileageNum) || mileageNum < 0) { setError("Enter a valid mileage."); return; }

    setError("");
    startTransition(async () => {
      try {
        await updateVehicle(vehicle.id, {
          unitNumber: unitNumber.trim(),
          make: make.trim(),
          model: model.trim(),
          year: yearNum,
          mileage: mileageNum,
          vin: vin.trim().toUpperCase(),
          type,
          active,
        });
        setOpen(false);
        router.refresh();
      } catch {
        setError("Failed to save changes. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold
          border border-slate-200 text-slate-600 bg-white
          hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98]
          transition-all duration-150"
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit Truck
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Edit Truck</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">{vehicle.unitNumber}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 transition-all"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <Field label="Truck Name / Unit #">
                <input
                  type="text"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="e.g. Truck 01"
                  className={INPUT}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Make">
                  <input
                    type="text"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="Ford"
                    className={INPUT}
                  />
                </Field>
                <Field label="Model">
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Transit 350"
                    className={INPUT}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Year">
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2022"
                    min="1990"
                    max="2030"
                    className={INPUT}
                  />
                </Field>
                <Field label="Mileage">
                  <input
                    type="number"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="85000"
                    min="0"
                    className={INPUT}
                  />
                </Field>
              </div>

              <Field label="VIN">
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="17-character VIN"
                  maxLength={17}
                  className={`${INPUT} font-mono tracking-wider`}
                />
              </Field>

              <Field label="Vehicle Type">
                <div className="flex gap-2">
                  {[
                    { value: "van",     label: "Van" },
                    { value: "tractor", label: "Tractor" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`flex-1 py-2 rounded-lg border text-[13px] font-semibold transition-all
                        ${type === opt.value
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-200 text-slate-500 hover:border-slate-400"
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Status">
                <div className="flex gap-2">
                  {[
                    { value: true,  label: "Active" },
                    { value: false, label: "Inactive" },
                  ].map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setActive(opt.value)}
                      className={`flex-1 py-2 rounded-lg border text-[13px] font-semibold transition-all
                        ${active === opt.value
                          ? opt.value
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "bg-red-600 text-white border-red-600"
                          : "border-slate-200 text-slate-500 hover:border-slate-400"
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200
                  text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-slate-900 text-white
                  hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50
                  transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                ) : (
                  <><CheckCheck className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

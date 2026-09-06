"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X, Loader2, CheckCircle2 } from "lucide-react";
import { updateVehicle, deleteVehicle } from "@/lib/actions/vehicles";
import { vinPrefixLookup } from "@/lib/vin-lookup";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  mileage: number;
  vin: string;
  type: string;
  ownership: string;
  active: boolean;
};

export default function VehicleActions({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [unitNumber, setUnitNumber] = useState(vehicle.unitNumber);
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [year, setYear] = useState(String(vehicle.year));
  const [mileage, setMileage] = useState(String(vehicle.mileage));
  const [vin, setVin] = useState(vehicle.vin ?? "");
  const [ownership, setOwnership] = useState<"owned" | "rental">(
    vehicle.ownership === "rental" ? "rental" : "owned"
  );
  const [vinLoading, setVinLoading] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [error, setError] = useState("");

  function openEdit() {
    setUnitNumber(vehicle.unitNumber);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(String(vehicle.year));
    setMileage(String(vehicle.mileage));
    setVin(vehicle.vin ?? "");
    setOwnership(vehicle.ownership === "rental" ? "rental" : "owned");
    setVinDecoded(false);
    setError("");
    setShowEdit(true);
  }

  async function handleVinChange(raw: string) {
    const v = raw.toUpperCase();
    setVin(v);
    setVinDecoded(false);
    if (v.length !== 17) return;
    setVinLoading(true);
    try {
      const local = vinPrefixLookup(v);
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`
      );
      const data = await res.json();
      const r = data?.Results?.[0];
      if (r?.ModelYear) setYear(r.ModelYear);
      if (local) {
        setMake(local.make);
        setModel(local.model);
        setVinDecoded(true);
      } else {
        if (r?.Make) setMake(r.Make.charAt(0).toUpperCase() + r.Make.slice(1).toLowerCase());
        const genericModels = ["commercial chassis", "incomplete vehicle", "multipurpose passenger vehicle (mpv)"];
        const rawModel = r?.Model ?? "";
        const series = r?.Series ?? "";
        const bodyClass = r?.BodyClass?.toLowerCase() ?? "";
        const modelIsGeneric = genericModels.includes(rawModel.toLowerCase());
        let resolved: string;
        if (modelIsGeneric && series) resolved = series;
        else if (modelIsGeneric && bodyClass.includes("step van")) resolved = "Step Van";
        else if (rawModel && series && !rawModel.toLowerCase().includes(series.toLowerCase())) resolved = `${rawModel} ${series}`;
        else resolved = rawModel;
        if (resolved) setModel(resolved);
        if (r?.Make) setVinDecoded(true);
      }
    } catch { /* silent */ }
    finally { setVinLoading(false); }
  }

  function handleSave() {
    if (!unitNumber.trim() || !make.trim() || !model.trim()) {
      setError("Unit number, make, and model are required.");
      return;
    }
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1990 || yearNum > 2030) {
      setError("Enter a valid year (1990–2030).");
      return;
    }
    setError("");
    startTransition(async () => {
      await updateVehicle(vehicle.id, {
        unitNumber: unitNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        year: yearNum,
        mileage: parseInt(mileage) || 0,
        vin: vin.trim().toUpperCase(),
        type: vehicle.type,
        ownership,
        active: vehicle.active,
      });
      setShowEdit(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteVehicle(vehicle.id);
      setShowDelete(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={openEdit} className="p-1.5 rounded hover:bg-slate-100 transition-colors" title="Edit vehicle">
          <Pencil className="w-3.5 h-3.5 text-slate-400" />
        </button>
        <button onClick={() => setShowDelete(true)} className="p-1.5 rounded hover:bg-red-50 transition-colors" title="Delete vehicle">
          <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
        </button>
      </div>

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Edit Vehicle</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">{vehicle.unitNumber}</p>
              </div>
              <button onClick={() => setShowEdit(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  VIN
                  {vinLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                  {vinDecoded && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </label>
                <input type="text" value={vin} onChange={(e) => handleVinChange(e.target.value)}
                  placeholder="17-character VIN" maxLength={17}
                  className={`${INPUT} font-mono tracking-wider`} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ownership</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {(["owned", "rental"] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setOwnership(opt)}
                      className={`flex-1 py-2 text-[13px] font-semibold capitalize transition-colors ${
                        ownership === opt ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Unit Number / Name</label>
                <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className={INPUT} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Make</label>
                  <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Ford" className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Model</label>
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Transit 350" className={INPUT} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Year</label>
                  <input type="number" value={year} onChange={(e) => setYear(e.target.value)} min="1990" max="2030" className={INPUT} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mileage</label>
                  <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} min="0" className={INPUT} />
                </div>
              </div>

              {error && (
                <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setShowEdit(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-[16px] font-extrabold text-slate-900">Delete {vehicle.unitNumber}?</h2>
              <p className="text-[13px] text-slate-400 mt-1.5">
                Permanently removes the vehicle and all its inspection records. Cannot be undone.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setShowDelete(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

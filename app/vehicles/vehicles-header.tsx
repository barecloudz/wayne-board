"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { createVehicle } from "@/lib/actions/vehicles";
import { vinPrefixLookup } from "@/lib/vin-lookup";

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

export default function VehiclesHeader() {
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [unitNumber, setUnitNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("0");
  const [vin, setVin] = useState("");
  const [vinLoading, setVinLoading] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [ownership, setOwnership] = useState<"owned" | "rental">("owned");
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [locationId, setLocationId] = useState<number | undefined>(undefined);

  useEffect(() => {
    fetch("/api/locations").then(r => r.json()).then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function handleVinChange(raw: string) {
    const v = raw.toUpperCase();
    setVin(v);
    setVinDecoded(false);
    if (v.length !== 17) return;
    setVinLoading(true);
    try {
      const local = vinPrefixLookup(v);
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`);
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
    } catch { /* silent · user can fill manually */ }
    finally { setVinLoading(false); }
  }

  function openModal() {
    setUnitNumber(""); setMake(""); setModel(""); setYear("");
    setMileage("0"); setVin(""); setOwnership("owned"); setError("");
    setLocationId(undefined);
    setShowModal(true);
  }

  function handleAdd() {
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
      const result = await createVehicle({
        unitNumber: unitNumber.trim(),
        make: make.trim(),
        model: model.trim(),
        year: yearNum,
        mileage: parseInt(mileage) || 0,
        vin: vin.trim().toUpperCase(),
        type: "van",
        ownership,
        locationId,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setShowModal(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold
          bg-slate-900 text-white hover:bg-slate-700 active:scale-95 transition-all duration-150 shadow-sm mt-1"
      >
        <Plus className="w-4 h-4" />
        Add Vehicle
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-[16px] font-extrabold text-slate-900">Add Vehicle</h2>
                <p className="text-[12px] text-slate-400 mt-0.5">Add a new vehicle to the fleet.</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-all"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {/* VIN · leads the form, auto-fills below */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  VIN
                  {vinLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                  {vinDecoded && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </label>
                <input
                  type="text"
                  value={vin}
                  onChange={(e) => handleVinChange(e.target.value)}
                  placeholder="Enter 17-character VIN to auto-fill"
                  maxLength={17}
                  className={`${INPUT} font-mono tracking-wider`}
                  autoFocus
                />
                {vinDecoded && (
                  <p className="text-[11px] text-emerald-600 font-medium">Make, model &amp; year filled from VIN</p>
                )}
              </div>

              {/* Ownership toggle */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Ownership
                </label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {(["owned", "rental"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOwnership(opt)}
                      className={`flex-1 py-2 text-[13px] font-semibold capitalize transition-colors ${
                        ownership === opt
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Unit Number / Name
                </label>
                <input
                  type="text"
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder="e.g. Rental 01"
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Make</label>
                  <input
                    type="text"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="Ford"
                    className={INPUT}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Model</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Transit 350"
                    className={INPUT}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Year</label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="2022"
                    min="1990"
                    max="2030"
                    className={INPUT}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mileage</label>
                  <input
                    type="number"
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    placeholder="0"
                    min="0"
                    className={INPUT}
                  />
                </div>
              </div>

              {/* Location picker · only shown when org has multiple locations */}
              {locations.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Location</label>
                  <select
                    value={locationId ?? ""}
                    onChange={(e) => setLocationId(e.target.value ? parseInt(e.target.value) : undefined)}
                    className={INPUT}
                  >
                    <option value="">- Any / All -</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Vehicle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

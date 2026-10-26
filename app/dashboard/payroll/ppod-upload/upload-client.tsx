"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  uploadPpodBatch,
  deletePpodDay,
  savePpodNameMapping,
  getActiveDriversForOrg,
  getPpodNameMappings,
  deletePpodNameMapping,
  getUploadedPpodDatesWithCounts,
  getUnmatchedPpodNames,
} from "@/lib/actions/ppod-upload";
import { getLocationsForOrg } from "@/lib/actions/driver-locations";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Link2, Pencil, Trash2, Calendar, MapPin } from "lucide-react";

type DriverOption = { driverId: string; name: string };
type Mapping = { id: number; ppodName: string; driverId: string; driverName: string };
type UnmatchedRow = { driverNameRaw: string; rowCount: number; dates: string[] };
type LocationOption = { id: number; name: string; terminalId: string | null };

export default function PpodUploadClient() {
  const [ppodFiles, setPpodFiles] = useState<File[]>([]);
  const [batchResults, setBatchResults] = useState<Array<{
    fileName: string;
    date?: string;
    rowsInserted?: number;
    unmatchedNames?: string[];
    success: boolean;
    error?: string;
  }> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [savingName, setSavingName] = useState<string | null>(null);
  const [savedNames, setSavedNames] = useState<Set<string>>(new Set());

  // Saved mappings management
  const [savedMappings, setSavedMappings] = useState<Mapping[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);

  // Upload history
  const [uploadedDates, setUploadedDates] = useState<Array<{ date: string; rowCount: number }>>([]);

  // Persistent unmatched rows from DB (driverId IS NULL)
  const [persistedUnmatched, setPersistedUnmatched] = useState<UnmatchedRow[]>([]);
  const [persistedMappings, setPersistedMappings] = useState<Record<string, string>>({});
  const [savingPersistedName, setSavingPersistedName] = useState<string | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState<string>("");

  // Location picker (only shown when org has multiple locations)
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const ppodRef = useRef<HTMLInputElement>(null);

  function refreshUnmatched() {
    getUnmatchedPpodNames().then(setPersistedUnmatched).catch(() => {});
  }

  useEffect(() => {
    getActiveDriversForOrg().then(setDriverOptions).catch(() => {});
    getPpodNameMappings().then(setSavedMappings).catch(() => {});
    getUploadedPpodDatesWithCounts().then(setUploadedDates).catch(() => {});
    getLocationsForOrg().then((locs) => {
      setLocations(locs);
      if (locs.length === 1) setSelectedLocationId(String(locs[0].id));
    }).catch(() => {});
    refreshUnmatched();
  }, []);

  function handleUpload() {
    if (ppodFiles.length === 0) return;
    if (locations.length > 1 && !selectedLocationId) return;
    setBatchResults(null);
    setSavedNames(new Set());
    setMappings({});
    startTransition(async () => {
      const fd = new FormData();
      ppodFiles.forEach((f) => fd.append("ppod", f));
      if (selectedLocationId) fd.append("locationId", selectedLocationId);
      if (manualDate) fd.append("manualDate", manualDate);
      const res = await uploadPpodBatch(fd);
      setBatchResults(res.results);
      if (res.results.some((r) => r.success)) {
        getUploadedPpodDatesWithCounts().then(setUploadedDates).catch(() => {});
        refreshUnmatched();
      }
      setPpodFiles([]);
      if (ppodRef.current) ppodRef.current.value = "";
    });
  }

  async function handleDeleteDay(date: string) {
    setDeletingDate(date);
    await deletePpodDay(date);
    setDeletingDate(null);
    getUploadedPpodDatesWithCounts().then(setUploadedDates).catch(() => {});
  }

  async function handleSaveMapping(ppodName: string) {
    const driverId = mappings[ppodName];
    if (!driverId) return;
    setSavingName(ppodName);
    await savePpodNameMapping(ppodName, driverId);
    setSavedNames((prev) => new Set([...prev, ppodName]));
    setSavingName(null);
    getPpodNameMappings().then(setSavedMappings).catch(() => {});
    refreshUnmatched();
  }

  async function handleSavePersistedMapping(driverNameRaw: string) {
    const driverId = persistedMappings[driverNameRaw];
    if (!driverId) return;
    setSavingPersistedName(driverNameRaw);
    await savePpodNameMapping(driverNameRaw, driverId);
    setSavingPersistedName(null);
    getPpodNameMappings().then(setSavedMappings).catch(() => {});
    refreshUnmatched();
  }

  async function handleSaveEdit(mapping: Mapping) {
    const driverId = editValues[mapping.id];
    if (!driverId || driverId === mapping.driverId) { setEditingId(null); return; }
    setSavingEditId(mapping.id);
    await savePpodNameMapping(mapping.ppodName, driverId);
    setSavingEditId(null);
    setEditingId(null);
    getPpodNameMappings().then(setSavedMappings).catch(() => {});
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    await deletePpodNameMapping(id);
    setDeletingId(null);
    setSavedMappings((prev) => prev.filter((m) => m.id !== id));
  }

  const allUnmatched = [
    ...new Set(
      (batchResults ?? [])
        .filter((r) => r.success)
        .flatMap((r) => r.unmatchedNames ?? []),
    ),
  ];
  const pendingUnmatched = allUnmatched.filter((n) => !savedNames.has(n));

  function formatDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[680px] w-full mx-auto space-y-8">
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">PPOD Upload</h1>
        <p className="text-[14px] text-slate-400 mt-2">Upload FedEx PPOD compliance reports (.xls or .xlsx)</p>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <p className="text-[13px] font-semibold text-sky-800 mb-1">About PPOD files</p>
        <ol className="text-[12px] text-sky-700 space-y-1 list-decimal list-inside">
          <li>Download the daily PPOD report from the FedEx performance portal</li>
          <li>The filename should include the date — e.g. <strong>ppod_2024-11-15.xlsx</strong> — or enter it manually below</li>
          <li>Columns: Driver Name (LAST,FIRST), PPOD%, Total Pkgs, POD Captured</li>
          <li>You can select multiple files at once for batch upload</li>
        </ol>
      </div>

      <div className="flex flex-col gap-4">
        {/* PPOD File(s) */}
        <div
          onClick={() => ppodRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${ppodFiles.length > 0 ? "border-sky-300 bg-sky-50/30" : "border-slate-200 hover:border-slate-300"}`}
        >
          <input
            ref={ppodRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => setPpodFiles(Array.from(e.target.files ?? []))}
          />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ppodFiles.length > 0 ? "bg-sky-100" : "bg-slate-100"}`}>
              {ppodFiles.length > 0 ? <CheckCircle className="w-5 h-5 text-sky-600" /> : <FileSpreadsheet className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">
                PPOD Report (.xls/.xlsx) <span className="text-red-500">*</span>
              </p>
              <p className="text-[12px] text-slate-400">
                {ppodFiles.length === 0
                  ? "ppod_YYYY-MM-DD.xlsx"
                  : ppodFiles.length === 1
                  ? ppodFiles[0].name
                  : `${ppodFiles.length} files selected`}
              </p>
            </div>
          </div>
        </div>

        {/* Location picker — only when org has multiple locations */}
        {locations.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-slate-500" />
              <p className="text-[14px] font-bold text-slate-800">
                Which location is this PPOD for? <span className="text-red-500">*</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {locations.map((loc) => (
                <label
                  key={loc.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedLocationId === String(loc.id)
                      ? "border-slate-800 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="locationId"
                    value={String(loc.id)}
                    checked={selectedLocationId === String(loc.id)}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="accent-slate-900"
                  />
                  <span className="text-[14px] font-semibold text-slate-800">{loc.name}</span>
                  {loc.terminalId && (
                    <span className="text-[11px] text-slate-400 font-mono">{loc.terminalId}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Manual week-ending date override */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
            Week Ending Date
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">— required if your file has no date in the name</span>
          </label>
          <input
            type="date"
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={ppodFiles.length === 0 || isPending || (locations.length > 1 && !selectedLocationId)}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold bg-sky-700 text-white hover:bg-sky-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isPending ? "Processing..." : "Upload Files"}
        </button>

        {/* Batch results list */}
        {batchResults && (
          <div className="flex flex-col gap-2">
            {batchResults.map((r, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 flex items-start gap-3 ${r.success ? "bg-sky-50 border border-sky-200" : "bg-red-50 border border-red-200"}`}
              >
                {r.success ? (
                  <CheckCircle className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                )}
                <div>
                  {r.success ? (
                    <>
                      <p className="text-[13px] font-bold text-sky-800">
                        {formatDate(r.date!)} · {r.rowsInserted} rows
                      </p>
                      <p className="text-[11px] text-sky-700">{r.fileName}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-bold text-red-800">{r.fileName}</p>
                      <p className="text-[11px] text-red-700">{r.error}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unmatched driver names panel — from this upload batch */}
        {batchResults && batchResults.some((r) => r.success) && pendingUnmatched.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-amber-700" />
              <p className="text-[14px] font-bold text-amber-900">Link unmatched drivers</p>
            </div>
            <p className="text-[12px] text-amber-700 mb-4">
              These PPOD names don&apos;t match any driver account yet. Link each one once and it will auto-match on every future upload.
            </p>
            <div className="flex flex-col gap-3">
              {pendingUnmatched.map((ppodName) => (
                <div key={ppodName} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-mono font-semibold text-slate-700 truncate">{ppodName}</p>
                  </div>
                  <select
                    className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                    value={mappings[ppodName] ?? ""}
                    onChange={(e) => setMappings((prev) => ({ ...prev, [ppodName]: e.target.value }))}
                  >
                    <option value="">Select driver…</option>
                    {driverOptions.map((d) => (
                      <option key={d.driverId} value={d.driverId}>{d.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSaveMapping(ppodName)}
                    disabled={!mappings[ppodName] || savingName === ppodName}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {savingName === ppodName ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Save
                  </button>
                </div>
              ))}
            </div>
            {savedNames.size > 0 && (
              <p className="text-[11px] text-emerald-700 mt-3 font-medium">
                {savedNames.size} link{savedNames.size === 1 ? "" : "s"} saved — these drivers will auto-match on future uploads.
              </p>
            )}
          </div>
        )}

        {batchResults && batchResults.some((r) => r.success) && allUnmatched.length > 0 && pendingUnmatched.length === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-[13px] font-medium text-emerald-800">All drivers linked successfully.</p>
          </div>
        )}
      </div>

      {/* Upload history */}
      {uploadedDates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-slate-500" />
            <p className="text-[14px] font-bold text-slate-800">Upload History</p>
            <span className="ml-auto text-[11px] text-slate-400">
              {uploadedDates.length} day{uploadedDates.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {uploadedDates.map(({ date, rowCount }) => (
              <div key={date} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800">{formatDate(date)}</p>
                  <p className="text-[11px] text-slate-400">{rowCount} row{rowCount !== 1 ? "s" : ""}</p>
                </div>
                <button
                  onClick={() => handleDeleteDay(date)}
                  disabled={deletingDate === date}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                  title="Delete this day's data"
                >
                  {deletingDate === date ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persistent unmatched PPOD names — always visible if any rows have driverId=null */}
      {persistedUnmatched.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-[14px] font-bold text-red-900">Unlinked PPOD names in database</p>
            <span className="ml-auto text-[11px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
              {persistedUnmatched.length} name{persistedUnmatched.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-[12px] text-red-700 mb-4">
            These names exist in uploaded PPOD files but have no driver linked — their data is{" "}
            <strong>invisible in payroll and won&apos;t count toward any compliance metrics</strong>. Link each one now.
          </p>
          <div className="flex flex-col gap-3">
            {persistedUnmatched.map((u) => (
              <div key={u.driverNameRaw} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-mono font-semibold text-slate-700 truncate">{u.driverNameRaw}</p>
                  <p className="text-[11px] text-slate-400">
                    {u.rowCount} row{u.rowCount !== 1 ? "s" : ""} ·{" "}
                    {u.dates.slice(0, 3).map((d) => formatDate(d)).join(", ")}
                    {u.dates.length > 3 ? ` +${u.dates.length - 3} more` : ""}
                  </p>
                </div>
                <select
                  className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                  value={persistedMappings[u.driverNameRaw] ?? ""}
                  onChange={(e) =>
                    setPersistedMappings((prev) => ({ ...prev, [u.driverNameRaw]: e.target.value }))
                  }
                >
                  <option value="">Select driver…</option>
                  {driverOptions.map((d) => (
                    <option key={d.driverId} value={d.driverId}>{d.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleSavePersistedMapping(u.driverNameRaw)}
                  disabled={!persistedMappings[u.driverNameRaw] || savingPersistedName === u.driverNameRaw}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-red-700 text-white hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {savingPersistedName === u.driverNameRaw ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Link
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved mappings manager */}
      {savedMappings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="w-4 h-4 text-slate-500" />
            <p className="text-[14px] font-bold text-slate-800">Saved Name Mappings</p>
            <span className="ml-auto text-[11px] text-slate-400">
              {savedMappings.length} mapping{savedMappings.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-[12px] text-slate-400 mb-4">
            PPOD names linked to driver accounts. Edit or remove incorrect links.
          </p>
          <div className="flex flex-col divide-y divide-slate-100">
            {savedMappings.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-slate-500 truncate">{m.ppodName}</p>
                  {editingId !== m.id && (
                    <p className="text-[13px] font-semibold text-slate-800">{m.driverName}</p>
                  )}
                </div>
                {editingId === m.id ? (
                  <>
                    <select
                      className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                      value={editValues[m.id] ?? m.driverId}
                      onChange={(e) => setEditValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    >
                      {driverOptions.map((d) => (
                        <option key={d.driverId} value={d.driverId}>{d.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSaveEdit(m)}
                      disabled={savingEditId === m.id}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                      {savingEditId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(m.id);
                        setEditValues((prev) => ({ ...prev, [m.id]: m.driverId }));
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                      title="Edit mapping"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 disabled:opacity-40"
                      title="Remove mapping"
                    >
                      {deletingId === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

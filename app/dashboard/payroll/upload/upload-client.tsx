"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { uploadDswBatch, deleteDswDay, saveDswNameMapping, getActiveDriversForOrg, getDswNameMappings, deleteDswNameMapping, getUploadedDswDatesWithCounts, getUnmatchedDswNames } from "@/lib/actions/dsw-upload";
import { getLocationsForOrg } from "@/lib/actions/driver-locations";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Link2, Pencil, Trash2, Calendar, MapPin, X } from "lucide-react";

type DriverOption = { driverId: string; name: string };
type Mapping = { id: number; dswName: string; driverId: string; driverName: string };
type UnmatchedRow = { driverNameRaw: string; rowCount: number; dates: string[] };
type LocationOption = { id: number; name: string; terminalId: string | null };

export default function UploadClient() {
  const [dswFiles, setDswFiles] = useState<File[]>([]);
  const [pldFiles, setPldFiles] = useState<File[]>([]);
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

  // Location picker (only shown when org has multiple locations)
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const dswRef = useRef<HTMLInputElement>(null);
  const pldRef = useRef<HTMLInputElement>(null);

  function refreshUnmatched() {
    getUnmatchedDswNames().then(setPersistedUnmatched).catch(() => {});
  }

  useEffect(() => {
    getActiveDriversForOrg().then(setDriverOptions).catch(() => {});
    getDswNameMappings().then(setSavedMappings).catch(() => {});
    getUploadedDswDatesWithCounts().then(setUploadedDates).catch(() => {});
    getLocationsForOrg().then(locs => {
      setLocations(locs);
      if (locs.length === 1) setSelectedLocationId(String(locs[0].id));
    }).catch(() => {});
    refreshUnmatched();
  }, []);

  function handleUpload() {
    if (dswFiles.length === 0) return;
    if (locations.length > 1 && !selectedLocationId) return;
    setBatchResults(null);
    setSavedNames(new Set());
    setMappings({});
    startTransition(async () => {
      const fd = new FormData();
      dswFiles.forEach(f => fd.append("dsw", f));
      pldFiles.forEach(f => fd.append("pld", f));
      if (selectedLocationId) fd.append("locationId", selectedLocationId);
      const res = await uploadDswBatch(fd);
      setBatchResults(res.results);
      if (res.results.some(r => r.success)) {
        getUploadedDswDatesWithCounts().then(setUploadedDates).catch(() => {});
        refreshUnmatched();
      }
      setDswFiles([]);
      setPldFiles([]);
      if (dswRef.current) dswRef.current.value = "";
      if (pldRef.current) pldRef.current.value = "";
    });
  }

  async function handleDeleteDay(date: string) {
    setDeletingDate(date);
    await deleteDswDay(date);
    setDeletingDate(null);
    getUploadedDswDatesWithCounts().then(setUploadedDates).catch(() => {});
  }

  async function handleSaveMapping(dswName: string) {
    const driverId = mappings[dswName];
    if (!driverId) return;
    setSavingName(dswName);
    await saveDswNameMapping(dswName, driverId);
    setSavedNames((prev) => new Set([...prev, dswName]));
    setSavingName(null);
    getDswNameMappings().then(setSavedMappings).catch(() => {});
    refreshUnmatched();
  }

  async function handleSavePersistedMapping(driverNameRaw: string) {
    const driverId = persistedMappings[driverNameRaw];
    if (!driverId) return;
    setSavingPersistedName(driverNameRaw);
    await saveDswNameMapping(driverNameRaw, driverId);
    setSavingPersistedName(null);
    getDswNameMappings().then(setSavedMappings).catch(() => {});
    refreshUnmatched();
  }

  async function handleSaveEdit(mapping: Mapping) {
    const driverId = editValues[mapping.id];
    if (!driverId || driverId === mapping.driverId) { setEditingId(null); return; }
    setSavingEditId(mapping.id);
    await saveDswNameMapping(mapping.dswName, driverId);
    setSavingEditId(null);
    setEditingId(null);
    getDswNameMappings().then(setSavedMappings).catch(() => {});
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    await deleteDswNameMapping(id);
    setDeletingId(null);
    setSavedMappings(prev => prev.filter(m => m.id !== id));
  }

  const allUnmatched = [...new Set((batchResults ?? []).filter(r => r.success).flatMap(r => r.unmatchedNames ?? []))];
  const pendingUnmatched = allUnmatched.filter(n => !savedNames.has(n));

  function formatDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[680px] w-full mx-auto space-y-8">
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">DSW Upload</h1>
        <p className="text-[14px] text-slate-400 mt-2">Upload the previous day&apos;s Daily Service Worksheet files to populate the payroll performance data.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-[13px] font-semibold text-amber-800 mb-1">How to get these files</p>
        <ol className="text-[12px] text-amber-700 space-y-1 list-decimal list-inside">
          <li>Log in to the FedEx DSW portal for the previous day</li>
          <li>Click <strong>Export</strong> &rarr; save as &quot;daily service worksheet.xls&quot;</li>
          <li>Click <strong>All Status Code Pkgs</strong> &rarr; save as &quot;PackageLevelDetails.xls&quot;</li>
          <li>Upload both files below — you can select multiple files at once for batch upload</li>
        </ol>
      </div>

      <div className="flex flex-col gap-4">
        {/* DSW File(s) */}
        <div
          onClick={() => dswRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${dswFiles.length > 0 ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 hover:border-slate-300"}`}
        >
          <input
            ref={dswRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => setDswFiles(Array.from(e.target.files ?? []))}
          />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dswFiles.length > 0 ? "bg-emerald-100" : "bg-slate-100"}`}>
              {dswFiles.length > 0 ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <FileSpreadsheet className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">Daily Service Worksheet <span className="text-red-500">*</span></p>
              <p className="text-[12px] text-slate-400">
                {dswFiles.length === 0
                  ? "daily service worksheet.xls"
                  : dswFiles.length === 1
                  ? dswFiles[0].name
                  : `${dswFiles.length} files selected`}
              </p>
            </div>
          </div>
        </div>

        {/* PLD File(s) */}
        <div
          onClick={() => pldRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${pldFiles.length > 0 ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 hover:border-slate-300"}`}
        >
          <input
            ref={pldRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => setPldFiles(Array.from(e.target.files ?? []))}
          />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pldFiles.length > 0 ? "bg-emerald-100" : "bg-slate-100"}`}>
              {pldFiles.length > 0 ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <FileSpreadsheet className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">Package Level Details <span className="text-[12px] font-normal text-slate-400">(optional — adds status code breakdown)</span></p>
              <p className="text-[12px] text-slate-400">
                {pldFiles.length === 0
                  ? "PackageLevelDetails.xls"
                  : pldFiles.length === 1
                  ? pldFiles[0].name
                  : `${pldFiles.length} files selected`}
              </p>
            </div>
          </div>
        </div>

        {/* Location picker — only when org has multiple locations */}
        {locations.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-slate-500" />
              <p className="text-[14px] font-bold text-slate-800">Which location is this DSW for? <span className="text-red-500">*</span></p>
            </div>
            <div className="flex flex-col gap-2">
              {locations.map(loc => (
                <label key={loc.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedLocationId === String(loc.id) ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input
                    type="radio"
                    name="locationId"
                    value={String(loc.id)}
                    checked={selectedLocationId === String(loc.id)}
                    onChange={e => setSelectedLocationId(e.target.value)}
                    className="accent-slate-900"
                  />
                  <span className="text-[14px] font-semibold text-slate-800">{loc.name}</span>
                  {loc.terminalId && <span className="text-[11px] text-slate-400 font-mono">{loc.terminalId}</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={dswFiles.length === 0 || isPending || (locations.length > 1 && !selectedLocationId)}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isPending ? "Processing..." : "Upload Files"}
        </button>

        {/* Batch results list */}
        {batchResults && (
          <div className="flex flex-col gap-2">
            {batchResults.map((r, i) => (
              <div key={i} className={`rounded-2xl p-4 flex items-start gap-3 ${r.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                {r.success
                  ? <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  : <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                }
                <div>
                  {r.success
                    ? <>
                        <p className="text-[13px] font-bold text-emerald-800">{formatDate(r.date!)} · {r.rowsInserted} routes</p>
                        <p className="text-[11px] text-emerald-700">{r.fileName}</p>
                      </>
                    : <>
                        <p className="text-[13px] font-bold text-red-800">{r.fileName}</p>
                        <p className="text-[11px] text-red-700">{r.error}</p>
                      </>
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unmatched driver names panel */}
        {batchResults && batchResults.some(r => r.success) && pendingUnmatched.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-amber-700" />
              <p className="text-[14px] font-bold text-amber-900">Link unmatched drivers</p>
            </div>
            <p className="text-[12px] text-amber-700 mb-4">
              These DSW names don&apos;t match any driver account yet. Link each one once and it will auto-match on every future upload.
            </p>
            <div className="flex flex-col gap-3">
              {pendingUnmatched.map((dswName) => (
                <div key={dswName} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-mono font-semibold text-slate-700 truncate">{dswName}</p>
                  </div>
                  <select
                    className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                    value={mappings[dswName] ?? ""}
                    onChange={(e) => setMappings((prev) => ({ ...prev, [dswName]: e.target.value }))}
                  >
                    <option value="">Select driver…</option>
                    {driverOptions.map((d) => (
                      <option key={d.driverId} value={d.driverId}>{d.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleSaveMapping(dswName)}
                    disabled={!mappings[dswName] || savingName === dswName}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {savingName === dswName ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
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

        {batchResults && batchResults.some(r => r.success) && allUnmatched.length > 0 && pendingUnmatched.length === 0 && (
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
            <span className="ml-auto text-[11px] text-slate-400">{uploadedDates.length} day{uploadedDates.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex flex-col divide-y divide-slate-100">
            {uploadedDates.map(({ date, rowCount }) => (
              <div key={date} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800">{formatDate(date)}</p>
                  <p className="text-[11px] text-slate-400">{rowCount} route{rowCount !== 1 ? "s" : ""}</p>
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

      {/* Persistent unmatched DSW names — always visible if any rows have driverId=null */}
      {persistedUnmatched.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-[14px] font-bold text-red-900">Unlinked DSW names in database</p>
            <span className="ml-auto text-[11px] font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{persistedUnmatched.length} name{persistedUnmatched.length !== 1 ? "s" : ""}</span>
          </div>
          <p className="text-[12px] text-red-700 mb-4">
            These names exist in uploaded DSW files but have no driver linked — their data is <strong>invisible in payroll and won&apos;t count toward any awards</strong>. Link each one now.
          </p>
          <div className="flex flex-col gap-3">
            {persistedUnmatched.map((u) => (
              <div key={u.driverNameRaw} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-mono font-semibold text-slate-700 truncate">{u.driverNameRaw}</p>
                  <p className="text-[11px] text-slate-400">{u.rowCount} row{u.rowCount !== 1 ? "s" : ""} · {u.dates.slice(0, 3).map(d => formatDate(d)).join(", ")}{u.dates.length > 3 ? ` +${u.dates.length - 3} more` : ""}</p>
                </div>
                <select
                  className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                  value={persistedMappings[u.driverNameRaw] ?? ""}
                  onChange={(e) => setPersistedMappings(prev => ({ ...prev, [u.driverNameRaw]: e.target.value }))}
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
            <span className="ml-auto text-[11px] text-slate-400">{savedMappings.length} mapping{savedMappings.length !== 1 ? "s" : ""}</span>
          </div>
          <p className="text-[12px] text-slate-400 mb-4">DSW names linked to driver accounts. Edit or remove incorrect links.</p>
          <div className="flex flex-col divide-y divide-slate-100">
            {savedMappings.map(m => (
              <div key={m.id} className="flex items-center gap-2 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-slate-500 truncate">{m.dswName}</p>
                  {editingId !== m.id && (
                    <p className="text-[13px] font-semibold text-slate-800">{m.driverName}</p>
                  )}
                </div>
                {editingId === m.id ? (
                  <>
                    <select
                      className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                      value={editValues[m.id] ?? m.driverId}
                      onChange={(e) => setEditValues(prev => ({ ...prev, [m.id]: e.target.value }))}
                    >
                      {driverOptions.map(d => (
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
                      onClick={() => { setEditingId(m.id); setEditValues(prev => ({ ...prev, [m.id]: m.driverId })); }}
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

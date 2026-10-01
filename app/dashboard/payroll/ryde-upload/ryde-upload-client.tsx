"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { uploadRydeFile, getUploadedRydeDates, getOrgDrivers, linkRydeDriver, getUnmatchedRydeResources } from "@/lib/actions/ryde-upload";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Link2 } from "lucide-react";

type DriverOption = { id: number; driverId: string; name: string };

export default function RydeUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    unmatched: string[];
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadedWeeks, setUploadedWeeks] = useState<string[]>([]);
  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);
  const [linkMappings, setLinkMappings] = useState<Record<string, number>>({});
  const [linkedResources, setLinkedResources] = useState<Set<string>>(new Set());
  const [linkingResource, setLinkingResource] = useState<string | null>(null);
  // Persisted unmatched — loaded from DB on mount so panel survives page navigation
  const [persistedUnmatched, setPersistedUnmatched] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function refreshUnmatched() {
    getUnmatchedRydeResources().then(setPersistedUnmatched).catch(() => {});
  }

  useEffect(() => {
    getUploadedRydeDates().then(setUploadedWeeks).catch(() => {});
    getOrgDrivers().then(setDriverOptions).catch(() => {});
    refreshUnmatched();
  }, []);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.name.endsWith(".xlsx")) return;
    setFile(f);
    setResult(null);
  }

  function handleUpload() {
    if (!file) return;
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("ryde", file);
      const res = await uploadRydeFile(fd);
      setResult(res);
      if (!res.error) {
        getUploadedRydeDates().then(setUploadedWeeks).catch(() => {});
      }
    });
  }

  async function handleLink(resourceRaw: string) {
    const driverDbId = linkMappings[resourceRaw];
    if (!driverDbId) return;
    setLinkingResource(resourceRaw);
    await linkRydeDriver(driverDbId, resourceRaw);
    setLinkedResources((prev) => new Set([...prev, resourceRaw]));
    setLinkingResource(null);
    // Refresh persisted list so newly-linked resources disappear
    refreshUnmatched();
  }

  // Merge upload-result unmatched with persisted DB unmatched, deduplicate
  const allUnmatched = Array.from(new Set([...(result?.unmatched ?? []), ...persistedUnmatched]));
  const pendingUnmatched = allUnmatched.filter((r) => !linkedResources.has(r));

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Ryde Upload</h1>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Upload your Ryde package Excel export to sync driver ratings.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-2">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">How to export from Spotlight</p>
          <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Sign into Spotlight → Ryde → Package Detail</li>
            <li>Set your date range for the week you want</li>
            <li>Hover over the grey bar at the bottom-left — click the <strong>⋯</strong> (more options) icon</li>
            <li>Select <strong>Export data</strong></li>
            <li>Choose <strong>"Data with current layout"</strong> and download</li>
            <li>Upload the .xlsx file here</li>
          </ol>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-colors
          ${dragging
            ? "border-slate-400 bg-slate-50"
            : file
              ? "border-emerald-300 bg-emerald-50"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {file ? (
          <>
            <FileSpreadsheet className="w-10 h-10 text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · click to change
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-300" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">
                Drop your Ryde Excel file here
              </p>
              <p className="text-xs text-slate-400 mt-0.5">or click to browse (.xlsx only)</p>
            </div>
          </>
        )}
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || isPending}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload &amp; Import
          </>
        )}
      </button>

      {/* Result card */}
      {result && (
        <div className={`mt-6 rounded-2xl border p-5 ${
          result.error
            ? "border-red-200 bg-red-50"
            : "border-emerald-200 bg-emerald-50"
        }`}>
          {result.error ? (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Upload failed</p>
                <p className="text-sm text-red-600 mt-0.5">{result.error}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Import complete</p>
                <div className="flex gap-4 mt-2 text-sm text-emerald-700">
                  <span>
                    <span className="font-bold">{result.inserted}</span> inserted
                  </span>
                  <span>
                    <span className="font-bold">{result.skipped}</span> skipped
                  </span>
                </div>
                {result.unmatched.length > 0 && pendingUnmatched.length === 0 && (
                  <div className="mt-3 flex items-center gap-2 text-emerald-700">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <p className="text-xs font-semibold">All drivers linked.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Link unmatched drivers panel — shows from DB-persisted data even without a fresh upload */}
      {pendingUnmatched.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="w-4 h-4 text-amber-700" />
            <p className="text-sm font-bold text-amber-900">Link unmatched drivers</p>
          </div>
          <p className="text-xs text-amber-700 mb-4">
            These Ryde entries don&apos;t match any driver account. Select the driver, save once, and it will auto-match on future uploads.
          </p>
          <div className="flex flex-col gap-3">
            {pendingUnmatched.map((resourceRaw) => (
              <div key={resourceRaw} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono font-semibold text-slate-700 truncate">{resourceRaw}</p>
                </div>
                <select
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 min-w-[160px]"
                  value={linkMappings[resourceRaw] ?? ""}
                  onChange={(e) => setLinkMappings((prev) => ({ ...prev, [resourceRaw]: parseInt(e.target.value) }))}
                >
                  <option value="">Select driver…</option>
                  {driverOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleLink(resourceRaw)}
                  disabled={!linkMappings[resourceRaw] || linkingResource === resourceRaw}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {linkingResource === resourceRaw ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save
                </button>
              </div>
            ))}
          </div>
          {linkedResources.size > 0 && (
            <p className="text-xs text-emerald-700 mt-3 font-medium">
              {linkedResources.size} driver{linkedResources.size === 1 ? "" : "s"} linked — FedEx ID set and reviews retroactively matched.
            </p>
          )}
        </div>
      )}

      {/* Upload history */}
      {uploadedWeeks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-slate-700 mb-3">Upload History</h2>
          <div className="flex flex-wrap gap-2">
            {uploadedWeeks.map(w => (
              <span
                key={w}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200"
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

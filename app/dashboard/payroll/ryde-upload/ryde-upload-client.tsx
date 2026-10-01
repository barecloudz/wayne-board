"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { uploadRydeFile, getUploadedRydeDates } from "@/lib/actions/ryde-upload";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getUploadedRydeDates().then(setUploadedWeeks).catch(() => {});
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Ryde Upload</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload your Ryde package Excel export to sync driver ratings.
        </p>
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
                {result.unmatched.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-amber-700 mb-1">
                      Unmatched drivers ({result.unmatched.length}) — no FedEx ID match found:
                    </p>
                    <ul className="text-xs text-amber-700 space-y-0.5 max-h-40 overflow-y-auto">
                      {result.unmatched.map(r => (
                        <li key={r} className="font-mono bg-amber-100 rounded px-2 py-0.5">{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
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

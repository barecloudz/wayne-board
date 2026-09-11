"use client";

import { useState, useTransition, useRef } from "react";
import { uploadDswFile } from "@/lib/actions/dsw-upload";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function UploadClient() {
  const [dswFile, setDswFile] = useState<File | null>(null);
  const [pldFile, setPldFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ success: boolean; date?: string; rowsInserted?: number; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const dswRef = useRef<HTMLInputElement>(null);
  const pldRef = useRef<HTMLInputElement>(null);

  function handleUpload() {
    if (!dswFile) return;
    setResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("dsw", dswFile);
      if (pldFile) fd.append("pld", pldFile);
      const res = await uploadDswFile(fd);
      setResult(res);
    });
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[680px] w-full mx-auto">
      <div className="mb-8">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">DSW Upload</h1>
        <p className="text-[14px] text-slate-400 mt-2">Upload the previous day&apos;s Daily Service Worksheet files to populate the payroll performance data.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
        <p className="text-[13px] font-semibold text-amber-800 mb-1">How to get these files</p>
        <ol className="text-[12px] text-amber-700 space-y-1 list-decimal list-inside">
          <li>Log in to the FedEx DSW portal for the previous day</li>
          <li>Click <strong>Export</strong> &rarr; save as &quot;daily service worksheet.xls&quot;</li>
          <li>Click <strong>All Status Code Pkgs</strong> &rarr; save as &quot;PackageLevelDetails.xls&quot;</li>
          <li>Upload both files below</li>
        </ol>
      </div>

      <div className="flex flex-col gap-4">
        {/* DSW File */}
        <div
          onClick={() => dswRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${dswFile ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 hover:border-slate-300"}`}
        >
          <input ref={dswRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => setDswFile(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dswFile ? "bg-emerald-100" : "bg-slate-100"}`}>
              {dswFile ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <FileSpreadsheet className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">Daily Service Worksheet <span className="text-red-500">*</span></p>
              <p className="text-[12px] text-slate-400">{dswFile ? dswFile.name : "daily service worksheet.xls"}</p>
            </div>
          </div>
        </div>

        {/* PLD File */}
        <div
          onClick={() => pldRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${pldFile ? "border-emerald-300 bg-emerald-50/30" : "border-slate-200 hover:border-slate-300"}`}
        >
          <input ref={pldRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => setPldFile(e.target.files?.[0] ?? null)} />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pldFile ? "bg-emerald-100" : "bg-slate-100"}`}>
              {pldFile ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <FileSpreadsheet className="w-5 h-5 text-slate-500" />}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">Package Level Details <span className="text-[12px] font-normal text-slate-400">(optional — adds status code breakdown)</span></p>
              <p className="text-[12px] text-slate-400">{pldFile ? pldFile.name : "PackageLevelDetails.xls"}</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!dswFile || isPending}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isPending ? "Processing..." : "Upload Files"}
        </button>

        {result && (
          <div className={`rounded-2xl p-4 flex items-start gap-3 ${result.success ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            {result.success
              ? <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            }
            <div>
              {result.success
                ? <>
                    <p className="text-[14px] font-bold text-emerald-800">Upload successful</p>
                    <p className="text-[12px] text-emerald-700">{result.date} &middot; {result.rowsInserted} driver rows imported{pldFile ? " with status code breakdown" : ""}</p>
                  </>
                : <>
                    <p className="text-[14px] font-bold text-red-800">Upload failed</p>
                    <p className="text-[12px] text-red-700">{result.error}</p>
                  </>
              }
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

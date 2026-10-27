"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  uploadSigCompliance,
  getSigComplianceData,
  getSigPeriods,
  deleteSigPeriod,
  deleteSigRow,
  linkSigDriver,
  type SigRow,
} from "@/lib/actions/sig-upload";
import { getActiveDriversForOrg } from "@/lib/actions/ppod-upload";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  Link2,
  AlertTriangle,
} from "lucide-react";

type DriverOption = { driverId: string; name: string };

function fmtPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return (val * 100).toFixed(2) + "%";
}

function FileCell({ label, value, alert: isAlert }: { label: string; value: number | string | null | undefined; alert?: boolean }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{label}</p>
      <p className={`text-[15px] font-extrabold ${isAlert ? "text-red-400" : "text-white"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

function passFailBadge(pct: number | null | undefined) {
  if (pct == null) return null;
  const pass = pct >= 1.0;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase ${
        pass ? "bg-emerald-500 text-white" : "bg-red-600 text-white"
      }`}
    >
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}


function DriverRow({
  row,
  driverOptions,
  onLink,
  onDelete,
}: {
  row: SigRow;
  driverOptions: DriverOption[];
  onLink: (fedexId: string, driverDbId: number) => Promise<void>;
  onDelete: (rowId: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [linkVal, setLinkVal] = useState("");
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onDelete(row.id);
  }

  const hasFail = (row.sigCompliancePct ?? 1) < 1.0;
  const hasCoaching =
    (row.sigInvalidDriverRelease ?? 0) > 0 ||
    (row.sigInvalid ?? 0) > 0 ||
    hasFail;
  const isViolation = (row.sigInvalidDriverRelease ?? 0) > 0;

  async function handleLink() {
    if (!linkVal) return;
    setLinking(true);
    await onLink(row.fedexId, parseInt(linkVal, 10));
    setLinking(false);
  }

  return (
    <div
      className={`rounded-2xl overflow-hidden border ${
        isViolation
          ? "border-red-700"
          : hasFail
          ? "border-amber-700/50"
          : "border-slate-700"
      }`}
    >
      {/* Row header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
          isViolation
            ? "bg-red-950/60 hover:bg-red-950/80"
            : hasFail
            ? "bg-slate-800/80 hover:bg-slate-800"
            : "bg-slate-800/40 hover:bg-slate-800/60"
        }`}
      >
        {/* Status icon */}
        <div className="shrink-0">
          {isViolation ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : hasFail ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
        </div>

        {/* Driver name */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white truncate">
            {row.driverNameRaw}
          </p>
          {!row.driverId && (
            <p className="text-[11px] text-amber-400 font-medium">Unmatched driver</p>
          )}
        </div>

        {/* Sig compliance % + badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[13px] font-bold text-white">{fmtPct(row.sigCompliancePct)}</span>
          {passFailBadge(row.sigCompliancePct)}
        </div>

        {/* Required stops */}
        <div className="hidden sm:flex flex-col items-end shrink-0">
          <span className="text-[11px] text-slate-400">Required</span>
          <span className="text-[12px] font-semibold text-white">{row.sigRequiredStops ?? "—"}</span>
        </div>

        {/* Failures */}
        <div className="hidden sm:flex flex-col items-end shrink-0">
          <span className="text-[11px] text-slate-400">Failures</span>
          <span
            className={`text-[12px] font-bold ${
              (row.sigFailures ?? 0) > 0 ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {row.sigFailures ?? 0}
          </span>
        </div>

        {/* Expand toggle */}
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="bg-slate-900 px-4 py-4 flex flex-col gap-4 border-t border-slate-700/50">

          {/* Signature columns from file */}
          <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
            <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700">Signature Compliance</p>
            <div className="grid grid-cols-3 divide-x divide-slate-700">
              <FileCell label="Sig Compliance %" value={fmtPct(row.sigCompliancePct)} alert={(row.sigCompliancePct ?? 1) < 1} />
              <FileCell label="Sig Required Stops" value={row.sigRequiredStops} />
              <FileCell label="Sig Failures" value={row.sigFailures} alert={(row.sigFailures ?? 0) > 0} />
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-700 border-t border-slate-700">
              <FileCell label="Sig Invalid" value={row.sigInvalid} alert={(row.sigInvalid ?? 0) > 0} />
              <FileCell label="Invalid Driver Release" value={row.sigInvalidDriverRelease} alert={(row.sigInvalidDriverRelease ?? 0) > 0} />
            </div>
          </div>

          {/* Alcohol columns — only show if driver had alcohol stops */}
          {(row.alcoholRequiredStops ?? 0) > 0 && (
            <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
              <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700">Alcohol Compliance</p>
              <div className="grid grid-cols-3 divide-x divide-slate-700">
                <FileCell label="Alcohol Compliance %" value={fmtPct(row.alcoholCompliancePct)} alert={(row.alcoholCompliancePct ?? 1) < 1} />
                <FileCell label="Alcohol Required Stops" value={row.alcoholRequiredStops} />
                <FileCell label="Alcohol Failures" value={row.alcoholFailures} alert={(row.alcoholFailures ?? 0) > 0} />
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-700 border-t border-slate-700">
                <FileCell label="Alcohol Sig Invalid" value={row.alcoholSigInvalid} alert={(row.alcoholSigInvalid ?? 0) > 0} />
                <FileCell label="Alcohol Invalid Driver Release" value={row.alcoholInvalidDriverRelease} alert={(row.alcoholInvalidDriverRelease ?? 0) > 0} />
              </div>
            </div>
          )}

          {/* Link or remove unmatched driver */}
          {!row.driverId && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[12px] text-amber-300 font-semibold">Link this driver:</span>
                <select
                  className="text-[12px] border border-slate-600 rounded-lg px-2 py-1.5 bg-slate-800 text-slate-200 flex-1 min-w-0"
                  value={linkVal}
                  onChange={(e) => setLinkVal(e.target.value)}
                >
                  <option value="">Select driver…</option>
                  {driverOptions.map((d) => (
                    <option key={d.driverId} value={d.driverId}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleLink}
                  disabled={!linkVal || linking}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors shrink-0"
                >
                  {linking ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Link
                </button>
              </div>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold text-red-400 border border-red-800/50 hover:bg-red-950/40 transition-colors disabled:opacity-40 self-start"
              >
                {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remove record — driver no longer with us
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function buildPeriodLabel(endDateStr: string): string {
  if (!endDateStr) return "";
  const end = new Date(endDateStr + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function buildDateDisplay(endDateStr: string): { start: string; end: string } | null {
  if (!endDateStr) return null;
  const end = new Date(endDateStr + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return { start: fmt(start), end: fmt(end) };
}

export default function SigUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [periodEndDate, setPeriodEndDate] = useState("");
  const periodLabel = buildPeriodLabel(periodEndDate);
  const dateDisplay = buildDateDisplay(periodEndDate);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    inserted: number;
    unmatched: string[];
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [periods, setPeriods] = useState<string[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [tableData, setTableData] = useState<SigRow[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [deletingPeriod, setDeletingPeriod] = useState<string | null>(null);

  const [driverOptions, setDriverOptions] = useState<DriverOption[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  function refreshPeriods() {
    getSigPeriods()
      .then((ps) => {
        setPeriods(ps);
        if (ps.length > 0 && !selectedPeriod) setSelectedPeriod(ps[0]);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshPeriods();
    getActiveDriversForOrg().then(setDriverOptions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPeriod) { setTableData([]); return; }
    setLoadingTable(true);
    getSigComplianceData(selectedPeriod)
      .then(setTableData)
      .catch(() => setTableData([]))
      .finally(() => setLoadingTable(false));
  }, [selectedPeriod]);

  function handleUpload() {
    if (!file || !periodLabel) return;
    setUploadResult(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("periodLabel", periodLabel.trim());
      const res = await uploadSigCompliance(fd);
      setUploadResult(res);
      if (res.success) {
        refreshPeriods();
        setSelectedPeriod(periodLabel.trim());
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  async function handleDeletePeriod(label: string) {
    setDeletingPeriod(label);
    await deleteSigPeriod(label);
    setDeletingPeriod(null);
    setPeriods((prev) => prev.filter((p) => p !== label));
    if (selectedPeriod === label) {
      const remaining = periods.filter((p) => p !== label);
      setSelectedPeriod(remaining[0] ?? "");
    }
  }

  async function handleLink(fedexId: string, driverDbId: number) {
    await linkSigDriver(fedexId, driverDbId);
    if (selectedPeriod) {
      getSigComplianceData(selectedPeriod).then(setTableData).catch(() => {});
    }
  }

  async function handleDeleteRow(rowId: number) {
    await deleteSigRow(rowId);
    setTableData((prev) => prev.filter((r) => r.id !== rowId));
  }

  // Summary stats
  const totalRequired = tableData.reduce((s, r) => s + (r.sigRequiredStops ?? 0), 0);
  const totalFailures = tableData.reduce((s, r) => s + (r.sigFailures ?? 0), 0);
  const totalViolations = tableData.reduce((s, r) => s + (r.sigInvalidDriverRelease ?? 0), 0);
  const passingDrivers = tableData.filter((r) => (r.sigCompliancePct ?? 0) >= 1.0).length;
  const passRate = tableData.length > 0 ? (passingDrivers / tableData.length) * 100 : null;
  const unmatchedRows = tableData.filter((r) => !r.driverId);

  return (
    <main className="flex-1 px-6 py-8 max-w-[760px] w-full mx-auto space-y-8">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
        <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Sig Compliance Upload</h1>
        <p className="text-[14px] text-slate-400 mt-2">
          Upload FedEx SPOTlight Signature Compliance exports (.xlsx). FedEx standard is 100% — anything under is a FAIL.
        </p>
      </div>

      {/* Info box */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <p className="text-[13px] font-semibold text-sky-800 mb-1">About Signature Compliance files</p>
        <ol className="text-[12px] text-sky-700 space-y-1 list-decimal list-inside">
          <li>In SPOTlight, go to Signature Compliance → Resource Detail view</li>
          <li>Export as Excel (.xlsx)</li>
          <li>Select the period end date — the last day of the 7-day window shown in SPOTlight</li>
          <li>Upload — rows sorted worst-first so you see who needs coaching immediately</li>
        </ol>
      </div>

      {/* Upload section */}
      <div className="flex flex-col gap-4">
        {/* File picker */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`bg-white border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-colors ${
            file ? "border-sky-300 bg-sky-50/30" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${file ? "bg-sky-100" : "bg-slate-100"}`}>
              {file ? (
                <CheckCircle className="w-5 h-5 text-sky-600" />
              ) : (
                <FileSpreadsheet className="w-5 h-5 text-slate-500" />
              )}
            </div>
            <div>
              <p className="text-[14px] font-bold text-slate-800">
                SPOTlight Signature Compliance (.xlsx) <span className="text-red-500">*</span>
              </p>
              <p className="text-[12px] text-slate-400">{file ? file.name : "Click to select file…"}</p>
            </div>
          </div>
        </div>

        {/* Period end-date picker */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="block text-[13px] font-bold text-slate-800 mb-1">
            Period End Date <span className="text-red-500">*</span>
          </label>
          <p className="text-[12px] text-slate-400 mb-2.5">
            Select the last day of the 7-day window in SPOTlight. The system will label this period as the 7 days ending on that date.
          </p>
          <input
            type="date"
            value={periodEndDate}
            onChange={(e) => setPeriodEndDate(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
          {dateDisplay && (
            <p className="text-[12px] font-semibold text-sky-700 mt-2">
              Covers {dateDisplay.start} – {dateDisplay.end}
            </p>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || !periodLabel || isPending}
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold bg-sky-700 text-white hover:bg-sky-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isPending ? "Processing…" : "Upload File"}
        </button>

        {/* Upload result */}
        {uploadResult && (
          <div
            className={`rounded-2xl p-4 flex items-start gap-3 ${
              uploadResult.success
                ? "bg-sky-50 border border-sky-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {uploadResult.success ? (
              <CheckCircle className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            )}
            <div>
              {uploadResult.success ? (
                <>
                  <p className="text-[13px] font-bold text-sky-800">
                    {uploadResult.inserted} drivers imported for "{periodLabel || selectedPeriod}"
                  </p>
                  {uploadResult.unmatched.length > 0 && (
                    <p className="text-[11px] text-sky-700 mt-0.5">
                      {uploadResult.unmatched.length} unmatched driver{uploadResult.unmatched.length !== 1 ? "s" : ""} — expand their rows below to link them.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] font-bold text-red-800">{uploadResult.error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Period selector + table */}
      {periods.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* Period selector */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="flex-1 border border-slate-700 rounded-xl px-3 py-2 text-[13px] font-semibold bg-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                {periods.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                onClick={() => selectedPeriod && handleDeletePeriod(selectedPeriod)}
                disabled={!selectedPeriod || deletingPeriod === selectedPeriod}
                className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-700/50 hover:bg-red-950/30 transition-colors disabled:opacity-30"
                title="Delete this period"
              >
                {deletingPeriod === selectedPeriod ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Team summary */}
            {selectedPeriod && tableData.length > 0 && !loadingTable && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sig-Required Stops</p>
                  <p className="text-[20px] font-extrabold text-white">{totalRequired.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">stops where customer had to sign</p>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${totalFailures > 0 ? "bg-red-900" : "bg-slate-800"}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sig Failures</p>
                  <p className={`text-[20px] font-extrabold ${totalFailures > 0 ? "text-red-300" : "text-white"}`}>
                    {totalFailures}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">stops that failed compliance</p>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${totalViolations > 0 ? "bg-red-950 border border-red-700" : "bg-slate-800"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${totalViolations > 0 ? "text-red-400" : "text-slate-400"}`}>
                    Invalid Driver Release
                  </p>
                  <p className={`text-[20px] font-extrabold ${totalViolations > 0 ? "text-red-300" : "text-white"}`}>
                    {totalViolations}
                  </p>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${passRate != null && passRate < 100 ? "bg-amber-900" : "bg-slate-800"}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Team Pass Rate</p>
                  <p className={`text-[20px] font-extrabold ${passRate != null && passRate < 100 ? "text-amber-300" : "text-emerald-400"}`}>
                    {passRate != null ? passRate.toFixed(0) + "%" : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">drivers at 100%</p>
                </div>
              </div>
            )}
          </div>

          {/* Driver rows */}
          {loadingTable ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : tableData.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center">
              <p className="text-[14px] text-slate-400">No data for this period.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                {tableData.length} driver{tableData.length !== 1 ? "s" : ""} — sorted worst first
              </p>
              {tableData.map((row) => (
                <DriverRow
                  key={row.id}
                  row={row}
                  driverOptions={driverOptions}
                  onLink={handleLink}
                  onDelete={handleDeleteRow}
                />
              ))}
            </div>
          )}

          {/* Unmatched summary at bottom */}
          {unmatchedRows.length > 0 && !loadingTable && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <p className="text-[13px] font-bold text-amber-900">
                  {unmatchedRows.length} unmatched driver{unmatchedRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <p className="text-[12px] text-amber-700">
                Expand each unmatched row above to link them to a driver account.
                Their compliance data won&apos;t appear in performance metrics until linked.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

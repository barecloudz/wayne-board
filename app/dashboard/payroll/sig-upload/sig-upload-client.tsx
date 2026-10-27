"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import {
  uploadSigCompliance,
  getSigComplianceData,
  getSigPeriods,
  deleteSigPeriod,
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

function passFailBadge(pct: number | null | undefined) {
  if (pct == null) return null;
  const pass = pct >= 1.0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
        pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {pass ? (
        <ShieldCheck className="w-3 h-3" />
      ) : (
        <ShieldAlert className="w-3 h-3" />
      )}
      {pass ? "PASS" : "FAIL"}
    </span>
  );
}

function CoachingCallout({ row }: { row: SigRow }) {
  const hasViolation = (row.sigInvalidDriverRelease ?? 0) > 0;
  const hasInvalid = (row.sigInvalid ?? 0) > 0;
  const hasFail = (row.sigCompliancePct ?? 1) < 1.0;

  if (!hasFail && !hasViolation && !hasInvalid) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-900/20 border border-emerald-700/40">
        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-[12px] text-emerald-300 font-semibold">Clean — no coaching needed</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {hasFail && (
        <div className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-600 text-[12px] text-slate-300">
          This driver failed signature compliance this period.
        </div>
      )}
      {hasViolation && (
        <div className="px-3 py-2.5 rounded-xl bg-red-950 border border-red-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-bold text-red-300 mb-0.5">
              VIOLATION: {row.sigInvalidDriverRelease} package{(row.sigInvalidDriverRelease ?? 0) !== 1 ? "s" : ""} released without a signature
            </p>
            <p className="text-[12px] text-red-400">
              Driver is opening the door and leaving signature-required packages without making the customer sign.
              This is not acceptable — coach immediately. Repeated violations can result in lost packages and FedEx consequences.
            </p>
          </div>
        </div>
      )}
      {hasInvalid && (
        <div className="px-3 py-2.5 rounded-xl bg-amber-950 border border-amber-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] font-bold text-amber-300 mb-0.5">
              {row.sigInvalid} invalid signature{(row.sigInvalid ?? 0) !== 1 ? "s" : ""} — fake name or acronym used
            </p>
            <p className="text-[12px] text-amber-400 leading-relaxed">
              FedEx requires the customer's real <strong className="text-amber-300">first initial and last name</strong> (e.g. "J. Smith"). Drivers get hit when they write their own initials, use an acronym like "JD", collect a first name only, or let a customer sign a fake name. Coach this driver to hand the device to the customer and require a proper signature every time — no shortcuts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverRow({
  row,
  driverOptions,
  onLink,
}: {
  row: SigRow;
  driverOptions: DriverOption[];
  onLink: (fedexId: string, driverDbId: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [linkVal, setLinkVal] = useState("");
  const [linking, setLinking] = useState(false);

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
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Sig Required Stops" value={row.sigRequiredStops} />
            <StatCard label="Failures" value={row.sigFailures} highlight={((row.sigFailures ?? 0) > 0) ? "red" : "green"} />
            <StatCard label="Sig Invalid" value={row.sigInvalid} highlight={((row.sigInvalid ?? 0) > 0) ? "amber" : undefined} />
            <StatCard
              label="Invalid Driver Release"
              value={row.sigInvalidDriverRelease}
              highlight={((row.sigInvalidDriverRelease ?? 0) > 0) ? "red" : undefined}
              serious
            />
            <StatCard label="Alcohol Compliance" value={row.alcoholCompliancePct != null ? fmtPct(row.alcoholCompliancePct) : null} />
            <StatCard label="Alcohol Required" value={row.alcoholRequiredStops} />
            <StatCard label="Alcohol Failures" value={row.alcoholFailures} highlight={((row.alcoholFailures ?? 0) > 0) ? "red" : undefined} />
          </div>

          {/* Coaching callout */}
          <CoachingCallout row={row} />

          {/* Link unmatched driver */}
          {!row.driverId && (
            <div className="flex items-center gap-2 mt-1">
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
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  serious,
}: {
  label: string;
  value: number | string | null | undefined;
  highlight?: "red" | "amber" | "green";
  serious?: boolean;
}) {
  const colorMap = {
    red: "text-red-400",
    amber: "text-amber-400",
    green: "text-emerald-400",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 bg-slate-800 border ${serious ? "border-red-800" : "border-slate-700"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${serious ? "text-red-400" : "text-slate-500"}`}>
        {label}
      </p>
      <p className={`text-[15px] font-extrabold ${highlight ? colorMap[highlight] : "text-white"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function SigUploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
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
    if (!file || !periodLabel.trim()) return;
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
          <li>Enter the period label (e.g. "October 2026") — used for grouping</li>
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

        {/* Period label */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
            Period Label <span className="text-red-500">*</span>
            <span className="ml-1.5 text-[11px] font-normal text-slate-400">— e.g. "October 2026"</span>
          </label>
          <input
            type="text"
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="October 2026"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || !periodLabel.trim() || isPending}
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
          {/* Period tabs */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {periods.map((p) => (
                <div key={p} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedPeriod(p)}
                    className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-colors ${
                      selectedPeriod === p
                        ? "bg-slate-900 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    {p}
                  </button>
                  <button
                    onClick={() => handleDeletePeriod(p)}
                    disabled={deletingPeriod === p}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Delete this period's data"
                  >
                    {deletingPeriod === p ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Team summary */}
            {selectedPeriod && tableData.length > 0 && !loadingTable && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800 rounded-2xl px-4 py-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Required</p>
                  <p className="text-[20px] font-extrabold text-white">{totalRequired.toLocaleString()}</p>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${totalFailures > 0 ? "bg-red-900" : "bg-slate-800"}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Failures</p>
                  <p className={`text-[20px] font-extrabold ${totalFailures > 0 ? "text-red-300" : "text-white"}`}>
                    {totalFailures}
                  </p>
                </div>
                <div className={`rounded-2xl px-4 py-3 ${totalViolations > 0 ? "bg-red-950 border border-red-700" : "bg-slate-800"}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${totalViolations > 0 ? "text-red-400" : "text-slate-400"}`}>
                    IDR Violations
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

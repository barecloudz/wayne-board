"use client";

import { useState, useTransition } from "react";
import {
  UserPlus, Trash2, Loader2, ChevronDown, ChevronUp,
  Phone, Mail, StickyNote, CalendarDays, CheckCircle2, XCircle, Copy, Check,
  HelpCircle, X as XIcon,
} from "lucide-react";
import {
  createProspect,
  updateProspectChecklist,
  updateProspectNotes,
  deleteProspect,
  proposeRoadTestDate,
  confirmRoadTestDate,
  markRoadTestPassed,
  markDiscontinued,
  hireProspect,
  advanceProspectStatus,
} from "@/lib/actions/recruiting";
import type { Prospect, ChecklistStatus } from "@/lib/actions/recruiting";

// ── Legacy flat checklist (old prospects with status = 'prospect') ────────────

const CHECKLIST_FIELDS: { key: string; label: string }[] = [
  { key: "applicationDone",       label: "Application" },
  { key: "interviewDone",         label: "Interview" },
  { key: "drugTestPassed",        label: "Drug Test" },
  { key: "backgroundCheckPassed", label: "Background Check" },
  { key: "roadTestPassed",        label: "Road Test" },
  { key: "orientationDone",       label: "Orientation" },
  { key: "fedexIdAssigned",       label: "FedEx ID Assigned" },
];

const TOTAL_STEPS = CHECKLIST_FIELDS.length;

function getLegacyProgress(prospect: Prospect): number {
  return CHECKLIST_FIELDS.filter((f) => (prospect as Record<string, unknown>)[f.key] === "passed").length;
}

function nextStatus(current: string): ChecklistStatus {
  if (current === "pending") return "passed";
  if (current === "passed") return "failed";
  return "pending";
}

function ChecklistBadge({ status, label, onClick, pending }: {
  status: string; label: string; onClick: () => void; pending: boolean;
}) {
  const styles =
    status === "passed" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
    status === "failed" ? "bg-red-50 border-red-200 text-red-600" :
    "bg-slate-50 border-slate-200 text-slate-400";
  const dot =
    status === "passed" ? "bg-emerald-400" :
    status === "failed" ? "bg-red-400" :
    "bg-slate-300";
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={`${label} — click to cycle: Pending → Passed → Failed`}
      className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-[13px] font-semibold transition-all active:scale-95 disabled:opacity-50 select-none min-h-[44px] ${styles}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      {label}
      {status === "passed" && <span className="ml-0.5 text-emerald-600">✓</span>}
      {status === "failed" && <span className="ml-0.5 font-bold text-red-500">✕ Failed</span>}
    </button>
  );
}

// ── Stage pipeline constants ──────────────────────────────────────────────────

const STAGE_ORDER = [
  "application",
  "clearances",
  "training",
  "ready_for_road_test",
  "road_test_scheduled",
  "onboarding",
  "hired",
] as const;

// Legacy statuses map to nearest equivalent for the rail
const LEGACY_STATUS_MAP: Record<string, string> = {
  screening:  "application",
  ride_alongs: "onboarding",
};

type PipelineStatus = typeof STAGE_ORDER[number] | "discontinued";

function getStageIndex(status: string): number {
  const mapped = LEGACY_STATUS_MAP[status] ?? status;
  return STAGE_ORDER.indexOf(mapped as typeof STAGE_ORDER[number]);
}

const STAGE_LABELS: Record<string, string> = {
  application:          "Application",
  clearances:           "Clearances",
  training:             "Training",
  ready_for_road_test:  "Road Test Ready",
  road_test_scheduled:  "Road Test Scheduled",
  onboarding:           "Onboarding",
  hired:                "Hired",
  discontinued:         "Discontinued",
  // legacy
  screening:            "Screening",
  ride_alongs:          "Ride-Alongs",
};

const STAGE_COLORS: Record<string, { pill: string; dot: string }> = {
  application:          { pill: "bg-slate-100 text-slate-600 border-slate-200",      dot: "bg-slate-400" },
  clearances:           { pill: "bg-orange-50 text-orange-700 border-orange-200",    dot: "bg-orange-400" },
  training:             { pill: "bg-sky-50 text-sky-700 border-sky-200",             dot: "bg-sky-400" },
  ready_for_road_test:  { pill: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-400" },
  road_test_scheduled:  { pill: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-400" },
  onboarding:           { pill: "bg-violet-50 text-violet-700 border-violet-200",    dot: "bg-violet-400" },
  hired:                { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  discontinued:         { pill: "bg-red-50 text-red-600 border-red-200",             dot: "bg-red-400" },
  // legacy
  screening:            { pill: "bg-slate-100 text-slate-600 border-slate-200",      dot: "bg-slate-400" },
  ride_alongs:          { pill: "bg-violet-50 text-violet-700 border-violet-200",    dot: "bg-violet-400" },
};

function StagePill({ status }: { status: string }) {
  const color = STAGE_COLORS[status] ?? STAGE_COLORS.screening;
  const label = STAGE_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-bold ${color.pill}`}>
      <span className={`w-2 h-2 rounded-full ${color.dot}`} />
      {label}
    </span>
  );
}

function StageRail({ currentStatus }: { currentStatus: string }) {
  if (currentStatus === "discontinued") return null;
  const currentIdx = getStageIndex(currentStatus);
  return (
    <div className="flex items-center mt-3 mb-4">
      {STAGE_ORDER.map((stage, i) => {
        const filled = i <= currentIdx;
        const color = STAGE_COLORS[stage]?.dot ?? "bg-slate-300";
        return (
          <div key={stage} className="flex items-center flex-1 last:flex-none">
            <div
              title={STAGE_LABELS[stage]}
              className={`w-3 h-3 rounded-full flex-shrink-0 transition-all ${filled ? color : "bg-slate-200"}`}
            />
            {i < STAGE_ORDER.length - 1 && (
              <div className={`flex-1 h-[2px] mx-1 ${i < currentIdx ? color : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Discontinue panel ─────────────────────────────────────────────────────────

function DiscontinuePanel({ prospectId, onDone, onCancel }: {
  prospectId: number; onDone: () => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl">
      <p className="text-[12px] font-semibold text-red-700 mb-2">Reason for discontinuing</p>
      <input
        type="text"
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Drug test failed"
        className="w-full px-3.5 py-3 rounded-lg border border-red-200 text-[15px] text-slate-800 outline-none focus:border-red-400 bg-white"
        autoFocus
      />
      <div className="flex flex-col gap-2 mt-3">
        <button
          onClick={() => {
            if (!reason.trim()) return;
            startTransition(async () => {
              await markDiscontinued(prospectId, reason);
              onDone();
            });
          }}
          disabled={!reason.trim() || isPending}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-600 text-white text-[14px] font-semibold hover:bg-red-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirm Discontinue
        </button>
        <button onClick={onCancel} className="w-full px-4 py-3 rounded-lg text-[14px] font-semibold text-slate-500 hover:text-slate-700 transition-colors min-h-[44px]">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Hire success panel ────────────────────────────────────────────────────────

function HireSuccessPanel({ name, username, tempPassword }: { name: string; username: string; tempPassword: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="text-[14px] font-bold text-emerald-800">Driver account created for {name}</span>
      </div>
      <div className="space-y-2 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-28 flex-shrink-0">Username:</span>
          <span className="font-mono font-semibold text-slate-800">{username}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-28 flex-shrink-0">Temp password:</span>
          <span className="font-mono font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-emerald-200">{tempPassword}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="p-2 rounded text-emerald-600 hover:bg-emerald-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <p className="text-[12px] text-slate-400 mt-2">Give these credentials to {name} for first login. Update their FedEx ID from the driver profile.</p>
    </div>
  );
}

// ── Checklist group helper ────────────────────────────────────────────────────

function ChecklistGroup({ label, items, prospect, isPending, onUpdate }: {
  label: string;
  items: { key: keyof Prospect; label: string }[];
  prospect: Prospect;
  isPending: boolean;
  onUpdate: (u: Partial<Prospect>) => void;
}) {
  const [, startTransition] = useTransition();
  return (
    <div>
      <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex flex-col gap-2">
        {items.map(({ key, label: itemLabel }) => {
          const status = prospect[key] as string;
          return (
            <ChecklistBadge
              key={key}
              label={itemLabel}
              status={status}
              pending={isPending}
              onClick={() => {
                const next = nextStatus(status);
                startTransition(async () => {
                  await updateProspectChecklist(prospect.id, key as string, next);
                  onUpdate({ [key]: next } as Partial<Prospect>);
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Stage body ────────────────────────────────────────────────────────────────

function StageBody({ prospect, onUpdate }: { prospect: Prospect; onUpdate: (updated: Partial<Prospect>) => void }) {
  const [isPending, startTransition] = useTransition();
  const [showDiscontinue, setShowDiscontinue] = useState(false);
  const [proposedDateStr, setProposedDateStr] = useState("");
  const [confirmedDateStr, setConfirmedDateStr] = useState(
    prospect.roadTestProposedDate
      ? new Date(prospect.roadTestProposedDate).toISOString().slice(0, 16)
      : ""
  );
  const [managerNote, setManagerNote] = useState(prospect.roadTestManagerNote ?? "");
  const [hireResult, setHireResult] = useState<{ tempPassword: string; username: string } | null>(null);

  const rawStatus = prospect.status;
  // Normalize legacy statuses
  const status = (LEGACY_STATUS_MAP[rawStatus] ?? rawStatus) as PipelineStatus;

  // ── Stage 1: Application ───────────────────────────────────────────────────
  if (status === "application") {
    const bothPassed = prospect.applicationDone === "passed" && prospect.backgroundCheckPassed === "passed";
    const anyFailed = prospect.backgroundCheckPassed === "failed";
    return (
      <div className="space-y-4">
        <ChecklistGroup
          label="Application"
          items={[
            { key: "applicationDone", label: "FA Application" },
            { key: "backgroundCheckPassed", label: "Background Check" },
          ]}
          prospect={prospect}
          isPending={isPending}
          onUpdate={onUpdate}
        />
        {bothPassed && (
          <button
            onClick={() => startTransition(async () => {
              await advanceProspectStatus(prospect.id, "clearances");
              onUpdate({ status: "clearances" });
            })}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-orange-500 text-white text-[14px] font-semibold hover:bg-orange-600 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Move to Clearances
          </button>
        )}
        {anyFailed && !showDiscontinue && (
          <button onClick={() => setShowDiscontinue(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-100 transition-colors active:scale-[0.97] min-h-[44px]">
            <XCircle className="w-4 h-4" /> Discontinue
          </button>
        )}
        {showDiscontinue && (
          <DiscontinuePanel prospectId={prospect.id} onDone={() => onUpdate({ status: "discontinued" })} onCancel={() => setShowDiscontinue(false)} />
        )}
      </div>
    );
  }

  // ── Stage 2: Clearances ────────────────────────────────────────────────────
  if (status === "clearances") {
    const allPassed = prospect.drugTestPassed === "passed" && prospect.physicalPassed === "passed" && prospect.mecCardCopied === "passed";
    const anyFailed = prospect.drugTestPassed === "failed" || prospect.physicalPassed === "failed";
    return (
      <div className="space-y-4">
        <ChecklistGroup
          label="Clearances"
          items={[
            { key: "drugTestPassed", label: "Drug Test" },
            { key: "physicalPassed", label: "Physical" },
            { key: "mecCardCopied", label: "MEC Card Copy" },
          ]}
          prospect={prospect}
          isPending={isPending}
          onUpdate={onUpdate}
        />
        {allPassed && (
          <button
            onClick={() => startTransition(async () => {
              await advanceProspectStatus(prospect.id, "training");
              onUpdate({ status: "training" });
            })}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-sky-600 text-white text-[14px] font-semibold hover:bg-sky-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Move to Training
          </button>
        )}
        {anyFailed && !showDiscontinue && (
          <button onClick={() => setShowDiscontinue(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-100 transition-colors active:scale-[0.97] min-h-[44px]">
            <XCircle className="w-4 h-4" /> Discontinue
          </button>
        )}
        {showDiscontinue && (
          <DiscontinuePanel prospectId={prospect.id} onDone={() => onUpdate({ status: "discontinued" })} onCancel={() => setShowDiscontinue(false)} />
        )}
      </div>
    );
  }

  // ── Stage 3: Training ──────────────────────────────────────────────────────
  if (status === "training") {
    const allPassed = prospect.gcSetUp === "passed" && prospect.gcTrainingOnline === "passed" && prospect.gcCertificate === "passed";
    return (
      <div className="space-y-4">
        <ChecklistGroup
          label="GroundCloud Training"
          items={[
            { key: "gcSetUp", label: "GC Set Up" },
            { key: "gcTrainingOnline", label: "GC Training Online" },
            { key: "gcCertificate", label: "GC Certificate / Uploaded to FA" },
          ]}
          prospect={prospect}
          isPending={isPending}
          onUpdate={onUpdate}
        />
        {allPassed && (
          <div>
            <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Schedule Road Test</p>
            <div className="flex flex-col gap-2">
              <input
                type="datetime-local"
                value={proposedDateStr}
                onChange={e => setProposedDateStr(e.target.value)}
                className="w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[15px] text-slate-800 outline-none focus:border-slate-400 bg-white"
              />
              <button
                onClick={() => {
                  if (!proposedDateStr) return;
                  startTransition(async () => {
                    await proposeRoadTestDate(prospect.id, new Date(proposedDateStr));
                    onUpdate({ status: "ready_for_road_test", roadTestProposedDate: new Date(proposedDateStr) });
                  });
                }}
                disabled={!proposedDateStr || isPending}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-amber-500 text-white text-[14px] font-semibold hover:bg-amber-600 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                Propose Road Test Date
              </button>
            </div>
          </div>
        )}
        {!allPassed && !showDiscontinue && (
          <button onClick={() => setShowDiscontinue(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-100 transition-colors active:scale-[0.97] min-h-[44px]">
            <XCircle className="w-4 h-4" /> Discontinue
          </button>
        )}
        {showDiscontinue && (
          <DiscontinuePanel prospectId={prospect.id} onDone={() => onUpdate({ status: "discontinued" })} onCancel={() => setShowDiscontinue(false)} />
        )}
      </div>
    );
  }

  // ── Stage 4a: Road Test Ready ──────────────────────────────────────────────
  if (rawStatus === "ready_for_road_test") {
    const proposedDate = prospect.roadTestProposedDate
      ? new Date(prospect.roadTestProposedDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    return (
      <div className="space-y-4">
        {proposedDate && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-[12px] font-semibold text-amber-700 mb-1">Proposed Road Test Date</p>
            <p className="text-[15px] font-bold text-slate-800">{proposedDate}</p>
          </div>
        )}
        <div>
          <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm or suggest a different date</p>
          <div className="flex flex-col gap-2">
            <input
              type="datetime-local"
              value={confirmedDateStr}
              onChange={e => setConfirmedDateStr(e.target.value)}
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[15px] text-slate-800 outline-none focus:border-slate-400 bg-white"
            />
            <textarea
              value={managerNote}
              onChange={e => setManagerNote(e.target.value)}
              placeholder="Note (optional) — e.g. 8am at the station"
              rows={2}
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[14px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 bg-white resize-none"
            />
            <button
              onClick={() => {
                if (!confirmedDateStr) return;
                startTransition(async () => {
                  await confirmRoadTestDate(prospect.id, new Date(confirmedDateStr), managerNote);
                  onUpdate({ status: "road_test_scheduled", roadTestConfirmedDate: new Date(confirmedDateStr), roadTestManagerNote: managerNote });
                });
              }}
              disabled={!confirmedDateStr || isPending}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-blue-600 text-white text-[14px] font-semibold hover:bg-blue-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Confirm Date
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Stage 4b: Road Test Scheduled ─────────────────────────────────────────
  if (rawStatus === "road_test_scheduled") {
    const confirmedDate = prospect.roadTestConfirmedDate
      ? new Date(prospect.roadTestConfirmedDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : null;
    return (
      <div className="space-y-4">
        {confirmedDate && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-[12px] font-semibold text-blue-700 mb-1">Confirmed Road Test Date</p>
            <p className="text-[15px] font-bold text-slate-800">{confirmedDate}</p>
            {prospect.roadTestManagerNote && (
              <p className="text-[13px] text-slate-500 mt-1">{prospect.roadTestManagerNote}</p>
            )}
          </div>
        )}
        <ChecklistGroup
          label="Road Test"
          items={[
            { key: "roadTestPassed", label: "Road Test Passed" },
            { key: "roadCertUploaded", label: "Road Cert. Uploaded to FA" },
          ]}
          prospect={prospect}
          isPending={isPending}
          onUpdate={onUpdate}
        />
        {prospect.roadTestPassed === "passed" && (
          <button
            onClick={() => startTransition(async () => {
              await markRoadTestPassed(prospect.id);
              onUpdate({ status: "onboarding", roadTestPassed: "passed" });
            })}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-violet-600 text-white text-[14px] font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Move to Onboarding
          </button>
        )}
        {prospect.roadTestPassed === "failed" && !showDiscontinue && (
          <button onClick={() => setShowDiscontinue(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-100 transition-colors active:scale-[0.97] min-h-[44px]">
            <XCircle className="w-4 h-4" /> Discontinue
          </button>
        )}
        {showDiscontinue && (
          <DiscontinuePanel prospectId={prospect.id} onDone={() => onUpdate({ status: "discontinued" })} onCancel={() => setShowDiscontinue(false)} />
        )}
      </div>
    );
  }

  // ── Stage 5: Onboarding (also handles legacy ride_alongs) ─────────────────
  if (status === "onboarding") {
    const offerSigned = prospect.offerLetterSigned === "passed";
    const anyFailed = prospect.offerLetterSigned === "failed" || prospect.eVerify === "failed";
    return (
      <div className="space-y-4">
        <ChecklistGroup
          label="Offer & Onboarding"
          items={[
            { key: "offerLetterSigned", label: "Offer Letter Signed" },
            { key: "faEligible", label: "FA Eligible" },
            { key: "mbaEligible", label: "MBA Eligible" },
            { key: "eVerify", label: "e-Verify" },
            { key: "adpDone", label: "ADP" },
            { key: "gasCard", label: "Gas Card" },
            { key: "driverContacted", label: "Driver Contacted (day before)" },
          ]}
          prospect={prospect}
          isPending={isPending}
          onUpdate={onUpdate}
        />
        {offerSigned && !hireResult && (
          <button
            onClick={() => startTransition(async () => {
              const result = await hireProspect(prospect.id);
              setHireResult(result);
              onUpdate({ status: "hired" });
            })}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-emerald-600 text-white text-[15px] font-bold hover:bg-emerald-700 disabled:opacity-40 transition-all active:scale-[0.97] shadow-sm min-h-[44px]"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Hire {prospect.name.split(" ")[0]}
          </button>
        )}
        {hireResult && (
          <HireSuccessPanel name={prospect.name} username={hireResult.username} tempPassword={hireResult.tempPassword} />
        )}
        {anyFailed && !showDiscontinue && !hireResult && (
          <button onClick={() => setShowDiscontinue(true)}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-[14px] font-semibold hover:bg-red-100 transition-colors active:scale-[0.97] min-h-[44px]">
            <XCircle className="w-4 h-4" /> Discontinue
          </button>
        )}
        {showDiscontinue && (
          <DiscontinuePanel prospectId={prospect.id} onDone={() => onUpdate({ status: "discontinued" })} onCancel={() => setShowDiscontinue(false)} />
        )}
      </div>
    );
  }

  if (rawStatus === "hired") {
    return (
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-[14px] font-bold text-emerald-800">Hired</span>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">Driver account created. Update FedEx ID from the driver profile.</p>
      </div>
    );
  }

  if (rawStatus === "discontinued") {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="w-4 h-4 text-red-500" />
          <span className="text-[13px] font-bold text-red-700">Discontinued</span>
        </div>
        {prospect.discontinuedReason && (
          <p className="text-[13px] text-slate-500 italic">{prospect.discontinuedReason}</p>
        )}
      </div>
    );
  }

  return null;
}

// ── Stage-aware card ──────────────────────────────────────────────────────────

function StageCard({ prospect, onRemove }: { prospect: Prospect; onRemove: () => void }) {
  const [data, setData] = useState(prospect);
  const [expanded, setExpanded] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState(prospect.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleUpdate(updated: Partial<Prospect>) {
    setData(prev => ({ ...prev, ...updated }));
  }

  function handleDelete() {
    if (!confirm(`Remove ${data.name} from recruiting?`)) return;
    setDeleting(true);
    startTransition(async () => { await deleteProspect(data.id); onRemove(); });
  }

  const isDiscontinued = data.status === "discontinued";
  const isHired = data.status === "hired";

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      isHired       ? "border-emerald-300 shadow-[0_0_0_2px_rgba(52,211,153,0.12)]" :
      isDiscontinued ? "border-slate-200 opacity-70" :
      "border-slate-200/80"
    }`}>
      <div className="px-4 pt-4 pb-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-extrabold text-slate-900 leading-tight">{data.name}</h3>
              <StagePill status={data.status} />
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {prospect.phone && <span className="flex items-center gap-1.5 text-[12px] text-slate-400"><Phone className="w-3.5 h-3.5" />{prospect.phone}</span>}
              {prospect.email && <span className="flex items-center gap-1.5 text-[12px] text-slate-400"><Mail className="w-3.5 h-3.5" />{prospect.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowNotes(v => !v)}
              className="p-2.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Notes"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-2.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-2.5 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <StageRail currentStatus={data.status} />

        {expanded && <StageBody prospect={data} onUpdate={handleUpdate} />}

        {showNotes && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this candidate…"
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[14px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
            />
            <button
              onClick={() => {
                setSavingNotes(true);
                startTransition(async () => { await updateProspectNotes(data.id, notes); setSavingNotes(false); });
              }}
              disabled={savingNotes || isPending}
              className="mt-2 w-full px-4 py-3 rounded-lg bg-slate-900 text-white text-[14px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
            >
              {savingNotes ? "Saving…" : "Save Notes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Legacy card (old prospects, status = 'prospect') ──────────────────────────

function LegacyCard({ prospect, onRemove }: { prospect: Prospect; onRemove: () => void }) {
  const [data, setData] = useState(prospect);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [notes, setNotes] = useState(prospect.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const passed = getLegacyProgress(data);
  const pct = Math.round((passed / TOTAL_STEPS) * 100);
  const allPassed = passed === TOTAL_STEPS;

  function handleToggle(field: string) {
    const current = (data as Record<string, unknown>)[field] as string;
    const next = nextStatus(current);
    setPendingField(field);
    setData(prev => ({ ...prev, [field]: next }));
    startTransition(async () => { await updateProspectChecklist(data.id, field, next); setPendingField(null); });
  }

  function handleDelete() {
    if (!confirm(`Remove ${data.name} from recruiting?`)) return;
    setDeleting(true);
    startTransition(async () => { await deleteProspect(data.id); onRemove(); });
  }

  return (
    <div className={`bg-white rounded-2xl border transition-all ${allPassed ? "border-emerald-300 shadow-[0_0_0_2px_rgba(52,211,153,0.15)]" : "border-slate-200/80"}`}>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-extrabold text-slate-900 leading-tight">{data.name}</h3>
              {allPassed && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Ready to Hire</span>}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {data.phone && <span className="flex items-center gap-1.5 text-[12px] text-slate-400"><Phone className="w-3.5 h-3.5" />{data.phone}</span>}
              {data.email && <span className="flex items-center gap-1.5 text-[12px] text-slate-400"><Mail className="w-3.5 h-3.5" />{data.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-2.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-2.5 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-slate-500">{passed} of {TOTAL_STEPS} steps complete</span>
            <span className={`text-[12px] font-bold ${allPassed ? "text-emerald-600" : "text-slate-400"}`}>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${allPassed ? "bg-emerald-500" : "bg-slate-800"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {CHECKLIST_FIELDS.map((f) => (
            <ChecklistBadge
              key={f.key}
              label={f.label}
              status={(data as Record<string, unknown>)[f.key] as string}
              pending={isPending && pendingField === f.key}
              onClick={() => handleToggle(f.key)}
            />
          ))}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-4 h-4 text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Notes</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this prospect…"
            className="w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[14px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
          />
          <button
            onClick={() => {
              setSavingNotes(true);
              startTransition(async () => { await updateProspectNotes(data.id, notes); setSavingNotes(false); });
            }}
            disabled={savingNotes || isPending}
            className="mt-2 w-full px-4 py-3 rounded-lg bg-slate-900 text-white text-[14px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
          >
            {savingNotes ? "Saving…" : "Save Notes"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProspectCard({ prospect, onRemove }: { prospect: Prospect; onRemove: () => void }) {
  if (prospect.status === "prospect") {
    return <LegacyCard prospect={prospect} onRemove={onRemove} />;
  }
  return <StageCard prospect={prospect} onRemove={onRemove} />;
}

// ── Help guide ────────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
  {
    stage: "application",
    label: "Application",
    color: "border-l-slate-400 bg-slate-50",
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    what: "Candidate is added. Checklist: FA Application + Background Check.",
    action: "Mark both passed once cleared. A \"Move to Clearances\" button appears — tap it to advance.",
  },
  {
    stage: "clearances",
    label: "Clearances",
    color: "border-l-orange-400 bg-orange-50",
    pill: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-400",
    what: "Drug test, physical, and MEC card copy must be completed before the road test.",
    action: "Mark each item as results come in. Once all three pass, tap \"Move to Training.\"",
  },
  {
    stage: "training",
    label: "Training",
    color: "border-l-sky-400 bg-sky-50",
    pill: "bg-sky-50 text-sky-700 border-sky-200",
    dot: "bg-sky-400",
    what: "Candidate completes GroundCloud setup, online training, and uploads the certificate to FA.",
    action: "Mark each training item complete. Once all pass, the road test date picker appears — propose a date to move forward.",
  },
  {
    stage: "road_test",
    label: "Road Test",
    color: "border-l-blue-400 bg-blue-50",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-400",
    what: "Date is proposed and confirmed. Candidate comes in for the road test.",
    action: "After the road test passes, mark it and upload the road cert to FA. Tap \"Move to Onboarding.\"",
  },
  {
    stage: "onboarding",
    label: "Onboarding",
    color: "border-l-violet-400 bg-violet-50",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
    dot: "bg-violet-400",
    what: "Offer letter, eligibility, e-Verify, ADP, and gas card are completed.",
    action: "Once the offer letter is signed, the Hire button appears. Tapping it creates their driver account with a temporary password.",
  },
  {
    stage: "hired",
    label: "Hired",
    color: "border-l-emerald-400 bg-emerald-50",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    what: "Driver account created. They can log in on day one.",
    action: "Hand them the username and temp password shown on the card. Update their FedEx ID from the driver profile once assigned.",
  },
];

function HelpGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div
        className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="px-5 pt-4 pb-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-[18px] font-extrabold text-slate-900 leading-tight">How Recruiting Works</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">Everything in one place — no spreadsheets.</p>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors ml-3 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Value statement */}
          <div className="mt-3 mb-5 p-3 bg-slate-900 rounded-xl">
            <p className="text-[12px] text-slate-300 leading-relaxed">
              Every candidate moves through <span className="text-white font-semibold">5 stages</span> from first contact to hired driver. Open this screen on your phone and you see exactly where everyone stands — no color-coded spreadsheet, no digging through texts.
            </p>
          </div>

          {/* Stage steps */}
          <div className="flex flex-col gap-3">
            {GUIDE_STEPS.map((step, i) => (
              <div key={step.stage} className={`border-l-4 rounded-r-xl px-4 py-3 ${step.color}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-bold text-slate-400">STEP {i + 1}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${step.pill}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${step.dot}`} />
                    {step.label}
                  </span>
                </div>
                <p className="text-[12px] font-semibold text-slate-700 mb-0.5">{step.what}</p>
                <p className="text-[12px] text-slate-500 leading-relaxed">{step.action}</p>
              </div>
            ))}
          </div>

          {/* Discontinue note */}
          <div className="mt-4 p-3 border border-dashed border-slate-200 rounded-xl">
            <p className="text-[11px] font-semibold text-slate-500 mb-1">Discontinuing a candidate</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">
              A Discontinue button appears any time something fails — background check, drug test, road test, etc. Enter the reason and they move out of the active pipeline but stay in the system for your records.
            </p>
          </div>

          {/* Notifications note */}
          <div className="mt-3 p-3 border border-dashed border-amber-200 bg-amber-50 rounded-xl">
            <p className="text-[11px] font-semibold text-amber-700 mb-1">Notifications</p>
            <p className="text-[12px] text-amber-600 leading-relaxed">
              When a new candidate is added or a road test date is proposed, a banner slides down at the top of your screen — no matter what page you're on. Each admin sees and dismisses their own.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Input style ───────────────────────────────────────────────────────────────

const INPUT = "w-full px-3.5 py-3 rounded-lg border border-slate-200 text-[15px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

const ACTIVE_STATUSES = ["application", "clearances", "training", "ready_for_road_test", "road_test_scheduled", "onboarding", "screening", "ride_alongs"];

type FilterTab = "all" | "in_progress" | "road_test" | "hired";

export default function RecruitingClient({ prospects: initial }: { prospects: Prospect[] }) {
  const [prospects, setProspects] = useState<Prospect[]>(initial);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = prospects
    .filter(p => {
      if (filter === "in_progress") return ACTIVE_STATUSES.includes(p.status);
      if (filter === "road_test") return p.status === "ready_for_road_test" || p.status === "road_test_scheduled";
      if (filter === "hired") return p.status === "hired";
      return true;
    })
    .sort((a, b) => {
      if (a.status === "discontinued" && b.status !== "discontinued") return 1;
      if (b.status === "discontinued" && a.status !== "discontinued") return -1;
      if (a.status === "hired" && b.status !== "hired") return -1;
      if (b.status === "hired" && a.status !== "hired") return 1;
      return 0;
    });

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      const created = await createProspect({ name, phone, email, notes, status: "application" });
      setName(""); setPhone(""); setEmail(""); setNotes("");
      setShowAdd(false);
      setProspects(prev => [...prev, created]);
    });
  }

  const inProgress = prospects.filter(p => ACTIVE_STATUSES.includes(p.status)).length;
  const roadTestCount = prospects.filter(p => p.status === "ready_for_road_test" || p.status === "road_test_scheduled").length;
  const hiredCount = prospects.filter(p => p.status === "hired").length;

  return (
    <main className="flex-1 px-4 py-6 max-w-[760px] w-full mx-auto">
      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Recruiting</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">Track candidates through the hiring pipeline.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="How this works"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          {/* Add Candidate: icon-only on mobile, full text on sm+ */}
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center justify-center gap-2 px-2.5 py-2.5 sm:px-3.5 sm:py-2 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors active:scale-[0.97] min-h-[44px] min-w-[44px]"
            title="Add Candidate"
          >
            <UserPlus className="w-5 h-5 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Add Candidate</span>
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {prospects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {([
            { key: "all",         label: "Total",      value: prospects.length, color: "text-slate-800",   ring: "ring-slate-300" },
            { key: "in_progress", label: "In Progress", value: inProgress,       color: "text-amber-600",   ring: "ring-amber-300" },
            { key: "road_test",   label: "Road Test",  value: roadTestCount,    color: "text-blue-600",    ring: "ring-blue-300" },
            { key: "hired",       label: "Hired",      value: hiredCount,       color: "text-emerald-600", ring: "ring-emerald-300" },
          ] as { key: FilterTab; label: string; value: number; color: string; ring: string }[]).map(({ key, label, value, color, ring }) => (
            <button
              key={key}
              onClick={() => setFilter(f => f === key ? "all" : key)}
              className={`bg-white rounded-xl border px-3 py-3.5 text-center transition-all active:scale-[0.97] min-h-[44px] ${filter === key ? `border-transparent ring-2 ${ring}` : "border-slate-200/80 hover:border-slate-300"}`}
            >
              <p className={`text-[22px] font-extrabold ${color}`}>{value}</p>
              <p className="text-[11px] text-slate-400 font-semibold leading-tight mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-slate-800 mb-4">New Candidate</h2>
          <div className="grid grid-cols-1 gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name *" className={INPUT} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className={INPUT} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className={INPUT} />
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={`${INPUT} resize-none`} />
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={() => setShowAdd(false)}
                className="w-full sm:w-auto px-4 py-3 rounded-xl text-[14px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors active:scale-[0.97] min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!name.trim() || isPending}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-[14px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-all active:scale-[0.97] min-h-[44px]"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {prospects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <p className="text-[15px] font-semibold text-slate-500">No candidates yet</p>
          <p className="text-[13px] text-slate-400 mt-1">Tap "Add Candidate" to start tracking.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <p className="text-[14px] font-semibold text-slate-400">No candidates in this category</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p) => (
            <ProspectCard
              key={p.id}
              prospect={p}
              onRemove={() => setProspects(prev => prev.filter(x => x.id !== p.id))}
            />
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import { UserPlus, Trash2, Loader2, ChevronDown, ChevronUp, Phone, Mail, StickyNote } from "lucide-react";
import {
  createProspect,
  updateProspectChecklist,
  updateProspectNotes,
  deleteProspect,
} from "@/lib/actions/recruiting";
import type { Prospect, ChecklistStatus } from "@/lib/actions/recruiting";

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

function getProgress(prospect: Prospect): number {
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
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 disabled:opacity-50 select-none ${styles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
      {status === "passed" && <span className="ml-0.5 text-emerald-600">✓</span>}
      {status === "failed" && <span className="ml-0.5 font-bold text-red-500">✕ Failed</span>}
    </button>
  );
}

function ProspectCard({ prospect, onRemove }: { prospect: Prospect; onRemove: () => void }) {
  const [data, setData] = useState(prospect);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingField, setPendingField] = useState<string | null>(null);
  const [notes, setNotes] = useState(prospect.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const passed = getProgress(data);
  const pct = Math.round((passed / TOTAL_STEPS) * 100);
  const allPassed = passed === TOTAL_STEPS;

  function handleToggle(field: string) {
    const current = (data as Record<string, unknown>)[field] as string;
    const next = nextStatus(current);
    setPendingField(field);
    setData(prev => ({ ...prev, [field]: next }));
    startTransition(async () => {
      await updateProspectChecklist(data.id, field, next);
      setPendingField(null);
    });
  }

  function handleSaveNotes() {
    setSavingNotes(true);
    startTransition(async () => {
      await updateProspectNotes(data.id, notes);
      setSavingNotes(false);
    });
  }

  function handleDelete() {
    if (!confirm(`Remove ${data.name} from recruiting?`)) return;
    setDeleting(true);
    startTransition(async () => {
      await deleteProspect(data.id);
      onRemove();
    });
  }

  return (
    <div className={`bg-white rounded-2xl border transition-all ${allPassed ? "border-emerald-300 shadow-[0_0_0_2px_rgba(52,211,153,0.15)]" : "border-slate-200/80"}`}>
      <div className="px-5 pt-4 pb-3">
        {/* Name row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-extrabold text-slate-900 leading-tight">{data.name}</h3>
              {allPassed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  Ready to Hire ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {data.phone && <span className="flex items-center gap-1 text-[11px] text-slate-400"><Phone className="w-3 h-3" />{data.phone}</span>}
              {data.email && <span className="flex items-center gap-1 text-[11px] text-slate-400"><Mail className="w-3 h-3" />{data.email}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-500">{passed} of {TOTAL_STEPS} steps complete</span>
            <span className={`text-[11px] font-bold ${allPassed ? "text-emerald-600" : "text-slate-400"}`}>{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allPassed ? "bg-emerald-500" : "bg-slate-800"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist badges */}
        <div className="flex flex-wrap gap-1.5">
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

      {/* Notes panel */}
      {expanded && (
        <div className="px-5 pb-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes</span>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add notes about this prospect…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
          />
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes || isPending}
            className="mt-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[12px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-all"
          >
            {savingNotes ? "Saving…" : "Save Notes"}
          </button>
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white";

export default function RecruitingClient({ prospects: initial }: { prospects: Prospect[] }) {
  const [prospects, setProspects] = useState<Prospect[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createProspect({ name, phone, email, notes });
      setName(""); setPhone(""); setEmail(""); setNotes("");
      setShowAdd(false);
      window.location.reload();
    });
  }

  return (
    <main className="flex-1 px-4 py-6 max-w-[760px] w-full mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Recruiting</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            Track candidates through onboarding. Click any step to cycle: Pending → Passed → Failed.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Prospect
        </button>
      </div>

      {/* Summary bar */}
      {prospects.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total",         value: prospects.length,                                                          color: "text-slate-800" },
            { label: "In Progress",   value: prospects.filter(p => getProgress(p) > 0 && getProgress(p) < TOTAL_STEPS).length, color: "text-amber-600" },
            { label: "Ready to Hire", value: prospects.filter(p => getProgress(p) === TOTAL_STEPS).length,             color: "text-emerald-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200/80 px-4 py-3 text-center">
              <p className={`text-[22px] font-extrabold ${color}`}>{value}</p>
              <p className="text-[11px] text-slate-400 font-semibold">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 mb-5 shadow-sm">
          <h2 className="text-[14px] font-bold text-slate-800 mb-4">New Prospect</h2>
          <div className="grid grid-cols-1 gap-3">
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full name *" className={INPUT} />
            <div className="grid grid-cols-2 gap-3">
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className={INPUT} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className={INPUT} />
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={`${INPUT} resize-none`} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!name.trim() || isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 disabled:opacity-40 transition-all"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Prospect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {prospects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <p className="text-[15px] font-semibold text-slate-500">No prospects yet</p>
          <p className="text-[13px] text-slate-400 mt-1">Click "Add Prospect" to start tracking candidates.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {prospects.map((p) => (
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

"use client";

import { useState, useTransition } from "react";
import { Wrench, Loader2, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { submitMaintenanceRequest } from "@/lib/actions/maintenance";

type Request = {
  id: number;
  truckNumber: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: Date | null;
};

type Vehicle = { id: number; unitNumber: string; model: string };

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  pending:     { label: "Pending",     icon: Clock,         cls: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  in_progress: { label: "In Progress", icon: AlertTriangle, cls: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
};

const INPUT = "w-full px-3.5 py-2.5 rounded-xl border border-white/20 bg-white/10 text-[13px] text-white placeholder-white/40 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/10 transition [&>option]:bg-slate-800 [&>option]:text-white";

export default function MaintenanceTab({
  initial,
  driverId,
  driverName,
  vehicles,
}: {
  initial: Request[];
  driverId: string;
  driverName: string;
  vehicles: Vehicle[];
}) {
  const [requests, setRequests] = useState<Request[]>(initial);
  const [truck, setTruck] = useState("");
  const [desc, setDesc] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSubmit = truck && desc.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    startTransition(async () => {
      await submitMaintenanceRequest(driverId, driverName, truck, desc.trim());
      const newReq: Request = {
        id: Date.now(), truckNumber: truck, description: desc.trim(),
        status: "pending", adminNote: null, createdAt: new Date(),
      };
      setRequests((p) => [newReq, ...p]);
      setTruck("");
      setDesc("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 4000);
    });
  }

  const open     = requests.filter((r) => r.status !== "resolved");
  const resolved = requests.filter((r) => r.status === "resolved");

  return (
    <div className="flex flex-col gap-4">
      {/* Submit form */}
      <div className="rounded-2xl p-5 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Wrench className="w-4 h-4 text-white/70" />
          </div>
          <div>
            <p className="text-[15px] font-extrabold text-white leading-tight">Maintenance Request</p>
            <p className="text-[11px] text-white/50">Select your truck and describe the issue</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Truck Number *</label>
          <select value={truck} onChange={(e) => setTruck(e.target.value)} className={INPUT}>
            <option value="">— Select your truck —</option>
            {vehicles.map((v) => {
              const m = v.model ?? "";
              const label = /transit/i.test(m) ? "Transit" : (m.match(/P-?\d+/i)?.[0]?.replace("-", "") ?? m);
              return (
                <option key={v.id} value={v.unitNumber}>{v.unitNumber} — {label}</option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Describe the Problem *</label>
          <textarea
            rows={4}
            placeholder="e.g. Check engine light on, brakes squealing on left side, AC not blowing cold..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className={INPUT + " resize-none"}
          />
          <p className="text-[11px] text-white/30">Be as specific as possible — when it started, any sounds or warning lights.</p>
        </div>

        {submitted && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/25">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-[13px] font-semibold text-emerald-300">Request submitted — management has been notified.</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="w-full py-3 rounded-xl text-[14px] font-bold bg-white text-slate-900
            hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-40
            flex items-center justify-center gap-2"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Send Request
        </button>
      </div>

      {/* Open requests */}
      {open.length > 0 && (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
          <div className="px-5 py-4 border-b border-white/10">
            <p className="text-[13px] font-bold text-white">Your Open Requests</p>
          </div>
          <div className="divide-y divide-white/8">
            {open.map((r) => {
              const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon as React.ComponentType<{ className?: string }>;
              return (
                <div key={r.id} className="px-5 py-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold text-white">{r.truckNumber}</span>
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${cfg.cls}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[13px] text-white/70 leading-relaxed">{r.description}</p>
                  {r.adminNote && (
                    <div className="px-3 py-2 rounded-lg bg-white/8 border border-white/10">
                      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Management Note</p>
                      <p className="text-[12px] text-white/70">{r.adminNote}</p>
                    </div>
                  )}
                  {r.createdAt && (
                    <p className="text-[11px] text-white/30">{new Date(r.createdAt).toLocaleDateString()}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resolved — collapsible */}
      {resolved.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory((p) => !p)}
            className="flex items-center gap-2 text-[12px] font-semibold text-white/40 hover:text-white/60 transition-colors"
          >
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {resolved.length} resolved request{resolved.length !== 1 ? "s" : ""}
          </button>
          {showHistory && (
            <div className="mt-2 rounded-2xl overflow-hidden divide-y divide-white/8"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {resolved.map((r) => (
                <div key={r.id} className="px-5 py-3 opacity-60">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-bold text-white">{r.truckNumber}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <p className="text-[12px] text-white/60 line-through">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Wrench, DollarSign, ChevronDown, ChevronUp, Check, Loader2 } from "lucide-react";
import { updateRepairDetails } from "@/lib/actions/inspections";

const INPUT = "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white resize-none";

export default function RepairEditor({
  resultId,
  componentName,
  inspectorNotes,
  repairInstructions,
  repairCost,
  dateRepaired,
}: {
  resultId: number;
  componentName: string;
  inspectorNotes: string;
  repairInstructions: string;
  repairCost: number | null;
  dateRepaired: string | null;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [instructions, setInstructions] = useState(repairInstructions);
  const [cost, setCost]               = useState(repairCost?.toString() ?? "");
  const [saved, setSaved]             = useState(false);
  const [isPending, startTransition]  = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateRepairDetails(
        resultId,
        instructions.trim() || null,
        cost ? parseFloat(cost) : null
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const hasDetails = repairInstructions || repairCost;

  return (
    <div className="px-6 py-4">
      {/* Row summary */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between gap-4 text-left group"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center mt-0.5 shrink-0">
            <Wrench className="w-2.5 h-2.5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-800">{componentName}</p>
            {inspectorNotes && (
              <p className="text-[12px] text-slate-400 mt-0.5 italic">&ldquo;{inspectorNotes}&rdquo;</p>
            )}
            {dateRepaired && (
              <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Repaired {dateRepaired}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {repairCost && (
            <span className="text-[12px] font-semibold text-indigo-600">
              ${repairCost.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </span>
          )}
          {hasDetails && !expanded && (
            <span className="text-[11px] text-slate-300 hidden sm:inline">details added</span>
          )}
          {expanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Expanded repair editor */}
      {expanded && (
        <div className="mt-4 ml-8 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              How to Fix
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className={INPUT}
              placeholder="Describe the repair steps, parts needed, or service required..."
            />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex flex-col gap-1.5 flex-1 max-w-[180px]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Est. Cost ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className={INPUT + " pl-8"}
                  placeholder="Optional"
                />
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold
                bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : saved
                ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Saved</>
                : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

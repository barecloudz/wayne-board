"use client";

import { useState, useTransition } from "react";
import { X, Loader2 } from "lucide-react";
import { upsertAttendance, deleteAttendance } from "@/lib/actions/attendance";
import { setDriverTrainee } from "@/lib/actions/drivers";
import type { AttendanceStatus } from "@/lib/actions/attendance";

export type PayrollEditTarget = {
  driverId: string;
  driverName: string;
  date: string;
  currentStatus: AttendanceStatus | undefined;
  currentNote: string | null | undefined;
  isInferred: boolean;
  isDriverTrainee: boolean;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

const STATUS_BUTTONS: Array<{
  status: AttendanceStatus;
  label: string;
  activeClass: string;
  inactiveClass: string;
}> = [
  { status: "work",     label: "Worked",   activeClass: "bg-emerald-500 text-white border-transparent", inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50" },
  { status: "half_day", label: "½ Day",    activeClass: "bg-amber-500 text-white border-transparent",   inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-amber-50" },
  { status: "cut",      label: "Cut",      activeClass: "bg-slate-600 text-white border-transparent",   inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100" },
  { status: "call_out", label: "Call Out", activeClass: "bg-red-500 text-white border-transparent",     inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-red-50" },
  { status: "holiday",  label: "Holiday",  activeClass: "bg-violet-500 text-white border-transparent",  inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-violet-50" },
  { status: "trainee",  label: "Trainee",  activeClass: "bg-sky-500 text-white border-transparent",     inactiveClass: "bg-slate-50 text-slate-600 border-slate-200 hover:bg-sky-50" },
];

export default function PayrollEditModal({
  target,
  onClose,
  onSaved,
}: {
  target: PayrollEditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { driverId, driverName, date, currentStatus, currentNote, isInferred, isDriverTrainee } = target;

  const initialStatus: AttendanceStatus =
    currentStatus && currentStatus !== "day_off" ? currentStatus : "work";

  const [selected, setSelected] = useState<AttendanceStatus>(initialStatus);
  const [note, setNote] = useState(currentNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [traineePending, startTraineeTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await upsertAttendance(driverId, driverName, date, selected, note || undefined);
      onSaved();
    });
  }

  function handleClear() {
    startTransition(async () => {
      await deleteAttendance(driverId, date);
      onSaved();
    });
  }

  function handleToggleTrainee() {
    startTraineeTransition(async () => {
      await setDriverTrainee(driverId, !isDriverTrainee);
      onSaved();
    });
  }

  const busy = isPending || traineePending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.2)] w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <p className="text-[18px] font-extrabold text-slate-900">{driverName}</p>
            <p className="text-[12px] font-semibold text-slate-500 mt-1.5 bg-slate-50 rounded-lg px-3 py-1 inline-block">
              {formatDate(date)}
            </p>
            {isInferred && (
              <p className="text-[10px] text-slate-400 mt-1">Schedule-inferred · no manual record yet</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Status picker */}
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Attendance Status</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_BUTTONS.map(({ status, label, activeClass, inactiveClass }) => (
                <button
                  key={status}
                  disabled={isPending}
                  onClick={() => setSelected(status)}
                  className={`py-2.5 rounded-xl text-[12px] font-bold border ring-2 transition-all disabled:opacity-40 ${
                    selected === status
                      ? `${activeClass} ring-slate-800 ring-offset-1`
                      : `${inactiveClass} ring-transparent`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            disabled={isPending}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none disabled:opacity-40"
          />

          {/* Save / Clear */}
          <div className="flex gap-2">
            {!isInferred && (
              <button
                onClick={handleClear}
                disabled={busy}
                title="Remove override — reverts to schedule inference"
                className="py-2.5 px-4 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
          </div>

          {/* Driver trainee profile toggle */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold text-slate-700">Driver Profile — Trainee</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Sets all inferred schedule days to Trainee</p>
            </div>
            <button
              onClick={handleToggleTrainee}
              disabled={busy}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 flex items-center gap-1.5 ${
                isDriverTrainee
                  ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {traineePending && <Loader2 className="w-3 h-3 animate-spin" />}
              {isDriverTrainee ? "Trainee ✓" : "Not Trainee"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

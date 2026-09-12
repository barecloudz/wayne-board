"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { ClipboardList, X, CheckSquare, Square, Loader2, Clock, Users } from "lucide-react";
import { getTodayTasksAndUser, completeTask, uncompleteTask } from "@/lib/actions/tasks";
import type { TaskWithCompletion } from "@/lib/actions/tasks";

export default function TaskFloatingSheet() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tasks, setTasks] = useState<TaskWithCompletion[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Load tasks on first open
  useEffect(() => {
    if (open && !loaded) {
      getTodayTasksAndUser().then(({ tasks: t, userId: uid, role: r }) => {
        setTasks(t);
        setUserId(uid);
        setRole(r);
        setLoaded(true);
      }).catch(() => setLoaded(true));
    }
  }, [open, loaded]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);

  function handleToggle(task: TaskWithCompletion) {
    const isCompleted = task.completedByIds.includes(userId);
    setPendingId(task.id);
    startTransition(async () => {
      if (isCompleted) {
        await uncompleteTask(task.id);
      } else {
        await completeTask(task.id);
      }
      // Refresh
      const { tasks: t } = await getTodayTasksAndUser();
      setTasks(t);
      setPendingId(null);
    });
  }

  const completedCount = tasks.filter(t => t.completedByIds.includes(userId)).length;
  const remaining = tasks.length - completedCount;
  const allDone = tasks.length > 0 && completedCount === tasks.length;

  return (
    <div className="print:hidden">
      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 right-0 sm:right-6 sm:bottom-[72px] w-full sm:w-[420px] z-50 transition-all duration-300 ease-out ${
          open ? "translate-y-0 opacity-100" : "translate-y-full sm:translate-y-[calc(100%+24px)] opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-white sm:rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-slate-200/80 overflow-hidden">
          {/* Sheet header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-500" />
              <span className="text-[14px] font-bold text-slate-800">Daily Tasks</span>
              {tasks.length > 0 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${allDone ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {allDone ? "All done!" : `${completedCount}/${tasks.length}`}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          {tasks.length > 0 && (
            <div className="px-5 pt-3 pb-1">
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-slate-800"}`}
                  style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Task list */}
          <div className="px-4 py-3 max-h-[60vh] overflow-y-auto flex flex-col gap-2">
            {!loaded ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[14px] font-semibold text-slate-500">No tasks scheduled for today</p>
                {["owner", "co_owner"].includes(role) && (
                  <p className="text-[12px] text-slate-400 mt-1">Manage tasks in Settings.</p>
                )}
              </div>
            ) : (
              tasks.map(task => {
                const isCompleted = task.completedByIds.includes(userId);
                const isThisPending = isPending && pendingId === task.id;
                return (
                  <div
                    key={task.id}
                    onClick={() => !isThisPending && handleToggle(task)}
                    className={`rounded-xl border p-3.5 cursor-pointer transition-all duration-150 select-none ${
                      isCompleted
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {isThisPending ? (
                          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                        ) : isCompleted ? (
                          <CheckSquare className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-bold leading-snug ${isCompleted ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            {task.dueTime}
                          </span>
                          {task.completedByIds.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                              <Users className="w-3 h-3" />
                              {task.completedByNames.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* FAB — clipboard button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.18)] flex items-center justify-center transition-all duration-200 ${
          open ? "bg-slate-700 scale-95" : "bg-slate-900 hover:bg-slate-700 hover:scale-105"
        }`}
        aria-label="Daily tasks"
      >
        <ClipboardList className="w-6 h-6 text-white" />
        {remaining > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {remaining}
          </span>
        )}
      </button>
    </div>
  );
}

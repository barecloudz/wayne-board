"use client";

import { useState, useTransition } from "react";
import { CheckSquare, Square, Plus, Clock, Users, Loader2, X, ChevronDown } from "lucide-react";
import { completeTask, uncompleteTask, createTaskTemplate } from "@/lib/actions/tasks";
import type { TaskWithCompletion } from "@/lib/actions/tasks";
import Link from "next/link";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_ROLES = ["bc", "co_owner", "owner", "developer"];
const ROLE_LABELS: Record<string, string> = {
  bc: "Business Contact", co_owner: "Co-Owner", owner: "Owner", developer: "Developer",
};

export default function TasksClient({
  tasks,
  currentUserId,
  currentUserRole,
}: {
  tasks: TaskWithCompletion[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDays, setNewDays] = useState([1, 2, 3, 4, 5, 6]);
  const [newTime, setNewTime] = useState("17:00");
  const [newRoles, setNewRoles] = useState(["bc", "co_owner", "owner"]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAdding, startAddTransition] = useTransition();

  function handleAdd() {
    if (!newTitle.trim()) return;
    startAddTransition(async () => {
      await createTaskTemplate({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        daysOfWeek: newDays,
        dueTime: newTime,
        assignedRoles: newRoles,
      });
      setNewTitle(""); setNewDesc(""); setNewDays([1,2,3,4,5,6]);
      setNewTime("17:00"); setNewRoles(["bc","co_owner","owner"]);
      setShowAdd(false); setShowAdvanced(false);
    });
  }

  const completedCount = tasks.filter(t => t.completedByIds.includes(currentUserId)).length;
  const allDone = tasks.length > 0 && completedCount === tasks.length;

  function handleToggle(task: TaskWithCompletion) {
    const isCompleted = task.completedByIds.includes(currentUserId);
    setPendingId(task.id);
    startTransition(async () => {
      if (isCompleted) {
        await uncompleteTask(task.id);
      } else {
        await completeTask(task.id);
      }
      setPendingId(null);
    });
  }

  return (
    <main className="flex-1 px-4 py-6 max-w-[680px] w-full mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Daily Tasks</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {["owner", "co_owner", "bc", "developer"].includes(currentUserRole) && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Task
          </button>
        )}
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-slate-600">{completedCount} of {tasks.length} completed</span>
            {allDone && <span className="text-[12px] font-bold text-emerald-600">All done! ✓</span>}
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-slate-800"}`}
              style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center">
          <p className="text-[15px] font-semibold text-slate-500">No tasks scheduled for today</p>
          {["owner", "co_owner", "bc", "developer"].includes(currentUserRole) && (
            <p className="text-[13px] text-slate-400 mt-1">
              <Link href="/dashboard/settings#tasks" className="underline">Create tasks</Link> in Settings to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => {
            const isCompleted = task.completedByIds.includes(currentUserId);
            const isThisPending = isPending && pendingId === task.id;
            return (
              <div
                key={task.id}
                onClick={() => !isThisPending && handleToggle(task)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all duration-150 select-none ${
                  isCompleted
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">
                    {isThisPending ? (
                      <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                    ) : isCompleted ? (
                      <CheckSquare className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-bold leading-snug ${isCompleted ? "text-slate-400 line-through" : "text-slate-800"}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-[12px] text-slate-400 mt-0.5">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        Due by {task.dueTime}
                      </span>
                      {task.completedByIds.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                          <Users className="w-3 h-3" />
                          {task.completedByNames.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* ── Add Task Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl shrink-0">
              <p className="text-white font-bold text-[15px]">New Task</p>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Scrollable body */}
            <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="Task title *"
                className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
              />
              <button
                type="button"
                onClick={() => setShowAdvanced(v => !v)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors self-start"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                Advanced options
              </button>
              {showAdvanced && (
                <>
                  <input
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
                  />
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">Days</p>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_LABELS.map((label, i) => (
                        <button key={i} type="button"
                          onClick={() => setNewDays(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                          className={`px-3 py-2 rounded-lg text-[12px] font-bold transition-colors ${newDays.includes(i) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">Due by</p>
                    <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                      className="w-full px-3.5 py-3 rounded-xl border border-slate-200 text-[14px] text-slate-800 outline-none focus:border-slate-400 transition" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-2">Visible to</p>
                    <div className="flex gap-2 flex-wrap">
                      {ALL_ROLES.map(role => (
                        <button key={role} type="button"
                          onClick={() => setNewRoles(prev => prev.includes(role) ? prev.filter(x => x !== role) : [...prev, role])}
                          className={`px-3 py-2 rounded-lg text-[12px] font-bold transition-colors ${newRoles.includes(role) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {ROLE_LABELS[role]}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Sticky footer */}
            <div className="px-6 pb-8 sm:pb-5 pt-3 flex gap-2 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowAdd(false)}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleAdd} disabled={!newTitle.trim() || isAdding}
                className="flex-1 py-3 rounded-xl text-[14px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {isAdding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

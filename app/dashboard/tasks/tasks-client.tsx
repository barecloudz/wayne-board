"use client";

import { useState, useTransition } from "react";
import { CheckSquare, Square, Plus, Clock, Users, Loader2 } from "lucide-react";
import { completeTask, uncompleteTask } from "@/lib/actions/tasks";
import type { TaskWithCompletion } from "@/lib/actions/tasks";
import Link from "next/link";

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
        {["owner", "co_owner"].includes(currentUserRole) && (
          <Link
            href="/dashboard/settings#tasks"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Manage Tasks
          </Link>
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
          {["owner", "co_owner"].includes(currentUserRole) && (
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
    </main>
  );
}

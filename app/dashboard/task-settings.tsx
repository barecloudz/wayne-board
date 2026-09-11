"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, ClipboardList } from "lucide-react";
import { createTaskTemplate, deleteTaskTemplate, updateTaskTemplate } from "@/lib/actions/tasks";
import { setSetting } from "@/lib/actions/settings";
import type { TaskTemplate } from "@/lib/actions/tasks";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL_ROLES = ["bc", "co_owner", "owner", "developer"];
const ROLE_LABELS: Record<string, string> = {
  bc: "Business Contact", co_owner: "Co-Owner", owner: "Owner", developer: "Developer",
};

export default function TaskSettingsCard({
  initialTasks,
  currentUserRole,
  currentUserId,
  initialReminderRecipients,
}: {
  initialTasks: TaskTemplate[];
  currentUserRole: string;
  currentUserId: string;
  initialReminderRecipients: string;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDays, setNewDays] = useState([1, 2, 3, 4, 5, 6]); // Mon-Sat default
  const [newTime, setNewTime] = useState("17:00");
  const [newRoles, setNewRoles] = useState(["bc", "co_owner", "owner"]);

  // Reminder recipients
  const [reminderRecipients, setReminderRecipients] = useState(initialReminderRecipients);
  const [recipientsSaved, setRecipientsSaved] = useState(false);

  function toggleDay(d: number) {
    setNewDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }
  function toggleRole(r: string) {
    setNewRoles(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  function handleAdd() {
    if (!newTitle.trim()) return;
    startTransition(async () => {
      await createTaskTemplate({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        daysOfWeek: newDays,
        dueTime: newTime,
        assignedRoles: newRoles,
      });
      setNewTitle(""); setNewDesc(""); setNewDays([1,2,3,4,5,6]); setNewTime("17:00"); setNewRoles(["bc","co_owner","owner"]);
      setShowAdd(false);
    });
  }

  function handleDelete(id: number) {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteTaskTemplate(id);
      if (!result.success) {
        setDeleteError(result.error ?? "Could not delete task.");
      } else {
        setTasks(prev => prev.filter(t => t.id !== id));
      }
    });
  }

  function handleToggleActive(id: number, current: boolean) {
    startTransition(async () => {
      await updateTaskTemplate(id, { active: !current });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, active: !current } : t));
    });
  }

  function handleSaveRecipients() {
    startTransition(async () => {
      await setSetting("task_reminder_recipients", reminderRecipients);
      setRecipientsSaved(true);
      setTimeout(() => setRecipientsSaved(false), 2000);
    });
  }

  return (
    <div id="tasks" className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <ClipboardList className="w-4 h-4 text-slate-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-extrabold text-slate-900">Daily Tasks</h2>
            <p className="text-[12px] text-slate-400">Recurring checklist for admin users</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </button>
      </div>

      {deleteError && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-[12px] text-red-700 font-semibold">
          {deleteError}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title *"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition bg-white"
          />
          <div>
            <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Days</p>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((label, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${newDays.includes(i) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Due by</p>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 transition" />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Visible to</p>
              <div className="flex gap-1.5 flex-wrap">
                {ALL_ROLES.map(role => (
                  <button key={role} type="button" onClick={() => toggleRole(role)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${newRoles.includes(role) ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={!newTitle.trim() || isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Task
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <p className="text-[13px] text-slate-400 text-center py-4">No tasks created yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map(task => {
            const canDelete = !(currentUserRole === "bc" && task.createdByRole === "owner");
            return (
              <div key={task.id} className={`flex items-start gap-3 p-3.5 rounded-xl border ${task.active ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-slate-800">{task.title}</p>
                  {task.description && <p className="text-[11px] text-slate-400 mt-0.5">{task.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-400">Due {task.dueTime}</span>
                    <span className="text-[10px] text-slate-400">{task.daysOfWeek.map(d => DAY_LABELS[d]).join(", ")}</span>
                    <span className="text-[10px] text-slate-400">{task.assignedRoles.map(r => ROLE_LABELS[r] ?? r).join(", ")}</span>
                    {task.createdByRole === "owner" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Owner</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => handleToggleActive(task.id, task.active)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${task.active ? "bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"}`}>
                    {task.active ? "Active" : "Off"}
                  </button>
                  {canDelete ? (
                    <button onClick={() => handleDelete(task.id)} disabled={isPending}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <div className="p-1.5 opacity-20" title="Created by owner">
                      <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reminder recipients section */}
      <div className="mt-6 pt-5 border-t border-slate-100">
        <h3 className="text-[13px] font-extrabold text-slate-800 mb-1">Reminder Recipients</h3>
        <p className="text-[12px] text-slate-400 mb-3">Email addresses to notify when tasks are overdue (one per line or comma-separated).</p>
        <textarea
          value={reminderRecipients}
          onChange={e => setReminderRecipients(e.target.value)}
          rows={3}
          placeholder="admin@example.com, owner@example.com"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition resize-none"
        />
        <button
          onClick={handleSaveRecipients}
          disabled={isPending}
          className="mt-2 px-4 py-2 rounded-xl text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-2"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {recipientsSaved ? "Saved!" : "Save Recipients"}
        </button>
      </div>
    </div>
  );
}

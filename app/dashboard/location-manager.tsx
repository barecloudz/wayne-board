"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Pencil, Check, X, Loader2 } from "lucide-react";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "@/lib/actions/locations";

type Location = {
  id: number;
  name: string;
  terminalId: string | null;
  gcTerminalId: number | null;
};

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

export default function LocationManager({ initial }: { initial: Location[] }) {
  const [locs, setLocs] = useState<Location[]>(initial);
  const [isPending, startTransition] = useTransition();

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTerminal, setAddTerminal] = useState("");
  const [addGcTerminal, setAddGcTerminal] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editTerminal, setEditTerminal] = useState("");
  const [editGcTerminal, setEditGcTerminal] = useState("");

  function handleAdd() {
    if (!addName.trim()) return;
    startTransition(async () => {
      await createLocation({
        name: addName.trim(),
        terminalId: addTerminal.trim() || undefined,
        gcTerminalId: addGcTerminal ? parseInt(addGcTerminal, 10) : undefined,
      });
      setLocs((prev) =>
        [...prev, { id: Date.now(), name: addName.trim(), terminalId: addTerminal.trim() || null, gcTerminalId: addGcTerminal ? parseInt(addGcTerminal, 10) : null }]
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setAddName("");
      setAddTerminal("");
      setAddGcTerminal("");
      setShowAdd(false);
    });
  }

  function startEdit(loc: Location) {
    setEditId(loc.id);
    setEditName(loc.name);
    setEditTerminal(loc.terminalId ?? "");
    setEditGcTerminal(loc.gcTerminalId != null ? String(loc.gcTerminalId) : "");
  }

  function cancelEdit() {
    setEditId(null);
  }

  function handleSaveEdit(id: number) {
    if (!editName.trim()) return;
    startTransition(async () => {
      await updateLocation(id, {
        name: editName.trim(),
        terminalId: editTerminal.trim() || undefined,
        gcTerminalId: editGcTerminal ? parseInt(editGcTerminal, 10) : undefined,
      });
      setLocs((prev) =>
        prev
          .map((l) =>
            l.id === id
              ? {
                  ...l,
                  name: editName.trim(),
                  terminalId: editTerminal.trim() || null,
                  gcTerminalId: editGcTerminal ? parseInt(editGcTerminal, 10) : null,
                }
              : l,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditId(null);
    });
  }

  function handleDelete(id: number, name: string) {
    if (!confirm(`Delete location "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteLocation(id);
      setLocs((prev) => prev.filter((l) => l.id !== id));
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-extrabold text-slate-900">Locations</h2>
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Location
          </button>
        )}
      </div>
      <p className="text-[12px] text-slate-400 mb-5">
        Delivery stations this organization operates. Used to filter data by station.
      </p>

      {locs.length > 0 && (
        <div className="flex flex-col mb-5 divide-y divide-slate-100">
          {locs.map((loc) =>
            editId === loc.id ? (
              <div key={loc.id} className="py-3 flex flex-col gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Location name"
                  className={INPUT}
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editTerminal}
                    onChange={(e) => setEditTerminal(e.target.value)}
                    placeholder="Terminal ID (e.g. 0259)"
                    className={INPUT}
                  />
                  <input
                    type="number"
                    value={editGcTerminal}
                    onChange={(e) => setEditGcTerminal(e.target.value)}
                    placeholder="GC Terminal ID"
                    className={INPUT}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(loc.id)}
                    disabled={!editName.trim() || isPending}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={isPending}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={loc.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">{loc.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {[
                      loc.terminalId ? `Terminal: ${loc.terminalId}` : null,
                      loc.gcTerminalId != null ? `GC ID: ${loc.gcTerminalId}` : null,
                    ]
                      .filter(Boolean)
                      .join("  ·  ") || "No IDs set"}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(loc)}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-slate-100 transition-colors disabled:opacity-40"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button
                  onClick={() => handleDelete(loc.id, loc.name)}
                  disabled={isPending}
                  className="p-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {locs.length === 0 && !showAdd && (
        <p className="text-[12px] text-slate-300 mb-5">No locations yet. Add one above.</p>
      )}

      {showAdd && (
        <div className="flex flex-col gap-3 pt-4 border-t border-slate-100">
          <p className="text-[12px] font-semibold text-slate-600">New Location</p>
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Location name (e.g. Fletcher - 0259)"
            className={INPUT}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={addTerminal}
              onChange={(e) => setAddTerminal(e.target.value)}
              placeholder="Terminal ID (optional, e.g. 0259)"
              className={INPUT}
            />
            <input
              type="number"
              value={addGcTerminal}
              onChange={(e) => setAddGcTerminal(e.target.value)}
              placeholder="GC Terminal ID (optional)"
              className={INPUT}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addName.trim() || isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Location
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setAddName("");
                setAddTerminal("");
                setAddGcTerminal("");
              }}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { createWorkArea, deleteWorkArea } from "@/lib/actions/work-areas";

type WorkArea = { id: number; name: string; shape: string; color: string; active: boolean };

const SHAPES = ["circle", "square", "diamond", "triangle"] as const;

function ShapePreview({ shape, color, size = 16 }: { shape: string; color: string; size?: number }) {
  if (shape === "triangle") {
    const half = Math.round(size * 0.55);
    return (
      <span style={{
        display: "inline-block", width: 0, height: 0,
        borderLeft: `${half}px solid transparent`,
        borderRight: `${half}px solid transparent`,
        borderBottom: `${size}px solid ${color}`,
      }} />
    );
  }
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      backgroundColor: color,
      borderRadius: shape === "circle" ? "50%" : "2px",
      transform: shape === "diamond" ? "rotate(45deg)" : "none",
      flexShrink: 0,
    }} />
  );
}

export { ShapePreview };

export default function WorkAreaManager({ initial }: { initial: WorkArea[] }) {
  const [areas, setAreas] = useState(initial);
  const [name, setName] = useState("");
  const [shape, setShape] = useState<string>("circle");
  const [color, setColor] = useState("#6366f1");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createWorkArea(name.trim(), shape, color);
      setAreas((p) => [...p, { id: Date.now(), name: name.trim(), shape, color, active: true }]
        .sort((a, b) => {
          const na = parseInt(a.name), nb = parseInt(b.name);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          if (!isNaN(na)) return -1;
          if (!isNaN(nb)) return 1;
          return a.name.localeCompare(b.name);
        }));
      setName("");
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteWorkArea(id);
      setAreas((p) => p.filter((w) => w.id !== id));
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[15px] font-extrabold text-slate-900">Work Areas</h2>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>
      <p className="text-[12px] text-slate-400 mb-5">
        Define work areas with a shape and color. Assign them to drivers from the Coverage screen.
      </p>

      {areas.length > 0 && (
        <div className="flex flex-col mb-5 divide-y divide-slate-100">
          {areas.map((wa) => (
            <div key={wa.id} className="flex items-center gap-3 py-2.5">
              <div className="flex items-center justify-center w-6">
                <ShapePreview shape={wa.shape} color={wa.color} size={16} />
              </div>
              <span className="text-[13px] font-semibold text-slate-800 flex-1">{wa.name}</span>
              <span className="text-[11px] text-slate-400 capitalize">{wa.shape}</span>
              <button
                onClick={() => handleDelete(wa.id)}
                disabled={isPending}
                className="p-1.5 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {areas.length === 0 && (
        <p className="text-[12px] text-slate-300 mb-5">No work areas yet. Create one below.</p>
      )}

      <div className="flex flex-col gap-3 pt-3 border-t border-slate-100">
        <input
          type="text"
          placeholder="Work area name (e.g. Zone A, Route 1, Dock 3)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {SHAPES.map((s) => (
              <button
                key={s}
                onClick={() => setShape(s)}
                title={s}
                className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${
                  shape === s ? "border-slate-900 bg-slate-50 shadow-sm" : "border-slate-200 hover:border-slate-400"
                }`}
              >
                <ShapePreview shape={s} color={shape === s ? color : "#94a3b8"} size={12} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
            />
            <span className="text-[12px] text-slate-500">Color</span>
          </label>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Work Area
          </button>
        </div>
      </div>
    </div>
  );
}

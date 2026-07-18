"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Pencil, X, Check, Trash2, Loader2, MapPin, RefreshCw,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle,
} from "lucide-react";
import {
  type Stop, type DroArea, type DrawnArea,
  sidColor, sidBlock, stopsInsideRing, drawnColor,
} from "./anchor-editor-map";

// ── Dynamic import — no SSR for Leaflet ───────────────────────────────────────
const AnchorEditorMap = dynamic(() => import("./anchor-editor-map"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-50">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  ),
});

// ── SID block labels ──────────────────────────────────────────────────────────
const SID_LABELS: Record<number, string> = {
  1: "1000s", 2: "2000s", 3: "3000s", 4: "4000s", 5: "5000s",
  6: "6000s", 7: "7000s", 8: "8000s", 9: "9000s",
};
const SID_COLORS: Record<number, string> = {
  1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#22c55e", 5: "#06b6d4",
  6: "#3b82f6", 7: "#8b5cf6", 8: "#ec4899", 9: "#a16207",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextSeq(drawn: DrawnArea[]): string {
  const max = drawn.reduce((m, a) => {
    const m2 = a.name.match(/^0326-(\d+)-/);
    return m2 ? Math.max(m, parseInt(m2[1])) : m;
  }, 0);
  return String(max + 1).padStart(2, "0");
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnchorEditorClient() {
  const [stops,        setStops]        = useState<Stop[]>([]);
  const [droAreas,     setDroAreas]     = useState<DroArea[]>([]);
  const [drawnAreas,   setDrawnAreas]   = useState<DrawnArea[]>([]);
  const [loadingStops, setLoadingStops] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(true);

  // Draw state
  const [drawMode,     setDrawMode]     = useState(false);
  const [draftPoints,  setDraftPoints]  = useState<[number, number][]>([]);
  const [draftClosed,  setDraftClosed]  = useState(false);

  // Form state (after polygon is closed)
  const [draftLandmark, setDraftLandmark] = useState("");
  const [draftSeq,      setDraftSeq]      = useState("01");
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Delete state
  const [deleting,      setDeleting]      = useState<number | null>(null);
  const [deleteError,   setDeleteError]   = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // UI state
  const [hoveredAreaId, setHoveredAreaId] = useState<number | null>(null);
  const [toast,         setToast]         = useState<{ ok: boolean; msg: string } | null>(null);
  const [showExisting,  setShowExisting]  = useState(true);

  // ── Load stops ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/stops-326.json")
      .then(r => r.json())
      .then(d => setStops(d.stops ?? []))
      .finally(() => setLoadingStops(false));
  }, []);

  // ── Load DRO areas ──────────────────────────────────────────────────────────
  const loadAreas = useCallback(async () => {
    setLoadingAreas(true);
    try {
      const res = await fetch("/api/anchor-editor");
      const d = await res.json();
      setDroAreas(d.areas ?? []);
    } catch {
      // ignore
    } finally {
      setLoadingAreas(false);
    }
  }, []);
  useEffect(() => { loadAreas(); }, [loadAreas]);

  // ── Map click handler ───────────────────────────────────────────────────────
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (!drawMode || draftClosed) return;
    setDraftPoints(pts => {
      // Close polygon if clicking within ~0.0005deg of first point and 3+ vertices
      if (pts.length >= 3) {
        const [f0, f1] = pts[0];
        const dist = Math.hypot(lat - f0, lng - f1);
        if (dist < 0.0015) {
          setDraftClosed(true);
          setDraftSeq(nextSeq(drawnAreas));
          return pts; // don't add the closing point again
        }
      }
      return [...pts, [lat, lng]];
    });
  }, [drawMode, draftClosed, drawnAreas]);

  function finishPolygon() {
    if (draftPoints.length < 3) return;
    setDraftClosed(true);
    setDraftSeq(nextSeq(drawnAreas));
  }

  function cancelDraw() {
    setDrawMode(false);
    setDraftPoints([]);
    setDraftClosed(false);
    setDraftLandmark("");
    setSaveError(null);
  }

  function undoLastPoint() {
    setDraftPoints(pts => pts.slice(0, -1));
  }

  // ── Save new area ───────────────────────────────────────────────────────────
  async function saveDraftArea() {
    const landmark = draftLandmark.trim();
    if (!landmark) { setSaveError("Enter a landmark name"); return; }
    if (draftPoints.length < 3) { setSaveError("Need at least 3 points"); return; }

    const name = `0326-${draftSeq}-${landmark}`;
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/anchor-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, latlngs: draftPoints }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);

      const colorIdx = drawnAreas.length;
      setDrawnAreas(prev => [...prev, {
        tempId: `tmp-${Date.now()}`,
        anchorAreaId: data.anchorAreaId ?? null,
        name,
        points: draftPoints,
        color: drawnColor(colorIdx),
      }]);

      showToast(true, `Saved "${name}" (ID ${data.anchorAreaId})`);
      cancelDraw();
      loadAreas(); // refresh DRO list
    } catch (err: any) {
      setSaveError(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete area ─────────────────────────────────────────────────────────────
  async function deleteArea(id: number) {
    setDeleting(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/anchor-editor?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDroAreas(prev => prev.filter(a => a.anchorAreaId !== id));
      setDrawnAreas(prev => prev.filter(a => a.anchorAreaId !== id));
      setDeleteConfirm(null);
      showToast(true, "Area deleted");
    } catch (err: any) {
      setDeleteError(err.message ?? "Delete failed");
      showToast(false, `Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  }

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Stops inside draft ──────────────────────────────────────────────────────
  const stopsInDraft = draftPoints.length >= 3
    ? stopsInsideRing(stops.filter(s => s.lat != null), draftPoints)
    : [];

  // ── SID legend (stops loaded, dedup by block) ────────────────────────────────
  const sidBlocks = [...new Set(stops.map(s => sidBlock(s.sid)).filter(b => b > 0))].sort();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 min-h-0 w-full overflow-hidden">

      {/* ── Left Panel ─────────────────────────────────────────────────────── */}
      <div className="w-[320px] shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            Wayne Board · Automation
          </p>
          <h1 className="text-[20px] font-extrabold text-slate-900 tracking-tight">Anchor Editor</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">Work Area 0326 — Mills River</p>
        </div>

        {/* Stats row */}
        <div className="flex border-b border-slate-100">
          {[
            { label: "Stops", val: stops.filter(s => s.lat != null).length, sub: `/ ${stops.length}` },
            { label: "DRO Areas", val: droAreas.length },
            { label: "New Today", val: drawnAreas.filter(a => a.anchorAreaId != null).length },
          ].map(({ label, val, sub }) => (
            <div key={label} className="flex-1 py-3 text-center border-r last:border-r-0 border-slate-100">
              <p className="text-[18px] font-extrabold text-slate-900 leading-none">{val}<span className="text-[11px] font-normal text-slate-400">{sub}</span></p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* SID Legend */}
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">SID Blocks</p>
          <div className="flex flex-wrap gap-1.5">
            {sidBlocks.map(b => (
              <span key={b} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ borderColor: SID_COLORS[b] + "50", background: SID_COLORS[b] + "18", color: SID_COLORS[b] }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: SID_COLORS[b] }} />
                {SID_LABELS[b]}
              </span>
            ))}
          </div>
        </div>

        {/* Draw controls */}
        <div className="px-5 py-4 border-b border-slate-100">
          {!drawMode ? (
            <button
              onClick={() => { setDrawMode(true); setDraftPoints([]); setDraftClosed(false); setDraftLandmark(""); setSaveError(null); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Draw New Area
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-bold text-green-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                  Draw mode — click map to add vertices
                </p>
                <button onClick={cancelDraw} className="text-slate-400 hover:text-slate-700">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Vertex count + stops inside */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[20px] font-extrabold text-slate-900">{draftPoints.length}</p>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Vertices</p>
                </div>
                <div className="flex-1 rounded-lg px-3 py-2 text-center"
                  style={{ background: stopsInDraft.length > 0 ? "#f0fdf4" : "#f8fafc" }}>
                  <p className="text-[20px] font-extrabold" style={{ color: stopsInDraft.length > 0 ? "#16a34a" : "#94a3b8" }}>
                    {stopsInDraft.length}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: stopsInDraft.length > 0 ? "#15803d" : "#94a3b8" }}>
                    Stops inside
                  </p>
                </div>
              </div>

              {/* Draw action buttons */}
              {!draftClosed ? (
                <div className="flex gap-2">
                  <button
                    onClick={undoLastPoint}
                    disabled={draftPoints.length === 0}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    Undo
                  </button>
                  <button
                    onClick={finishPolygon}
                    disabled={draftPoints.length < 3}
                    className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-[12px] font-semibold hover:bg-green-700 disabled:opacity-40 transition"
                  >
                    Close Shape
                  </button>
                </div>
              ) : (
                /* Name + save form */
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-[12px] text-green-700 font-medium">
                    Shape closed — {stopsInDraft.length} stops inside
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                      Sequence #
                    </label>
                    <input
                      type="number" min="1" value={draftSeq}
                      onChange={e => setDraftSeq(e.target.value.padStart(2, "0"))}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Lower = first delivered (front of truck)</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                      Landmark
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mills Gap Rd"
                      value={draftLandmark}
                      onChange={e => setDraftLandmark(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveDraftArea()}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                    />
                    {draftLandmark && (
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">
                        → 0326-{draftSeq}-{draftLandmark}
                      </p>
                    )}
                  </div>

                  {saveError && (
                    <p className="text-[12px] text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{saveError}
                    </p>
                  )}

                  <button
                    onClick={saveDraftArea}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 disabled:opacity-50 transition"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? "Saving…" : "Save to DRO"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* New areas created this session */}
        {drawnAreas.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Created This Session
            </p>
            <div className="flex flex-col gap-2">
              {drawnAreas.map((a, idx) => (
                <div key={a.tempId} className="flex items-center gap-2 rounded-lg px-3 py-2 border"
                  style={{ borderColor: drawnColor(idx) + "40", background: drawnColor(idx) + "0d" }}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: drawnColor(idx) }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-slate-800 truncate">{a.name}</p>
                    {a.anchorAreaId && (
                      <p className="text-[10px] text-slate-400">ID {a.anchorAreaId}</p>
                    )}
                  </div>
                  {a.anchorAreaId && deleteConfirm !== a.anchorAreaId ? (
                    <button
                      onClick={() => setDeleteConfirm(a.anchorAreaId!)}
                      className="text-slate-300 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : a.anchorAreaId && deleteConfirm === a.anchorAreaId ? (
                    <div className="flex gap-1">
                      <button onClick={() => deleteArea(a.anchorAreaId!)} disabled={deleting === a.anchorAreaId}
                        className="text-[11px] px-2 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700">
                        {deleting === a.anchorAreaId ? "…" : "Delete"}
                      </button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        No
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All DRO areas list */}
        <div className="px-5 py-4 flex-1">
          <button
            onClick={() => setShowExisting(v => !v)}
            className="flex items-center justify-between w-full mb-3"
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              All DRO Areas ({droAreas.length})
            </p>
            <div className="flex items-center gap-2">
              <button onClick={e => { e.stopPropagation(); loadAreas(); }}
                className="text-slate-300 hover:text-slate-600 transition">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {showExisting ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />}
            </div>
          </button>

          {showExisting && (
            <>
              {loadingAreas ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {droAreas.map(area => (
                    <div
                      key={area.anchorAreaId}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition cursor-default ${
                        hoveredAreaId === area.anchorAreaId
                          ? "border-slate-300 bg-slate-50"
                          : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
                      }`}
                      onMouseEnter={() => setHoveredAreaId(area.anchorAreaId)}
                      onMouseLeave={() => setHoveredAreaId(null)}
                    >
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-slate-700 truncate">{area.name}</p>
                        <p className="text-[10px] text-slate-400">ID {area.anchorAreaId}</p>
                      </div>
                      {deleteConfirm !== area.anchorAreaId ? (
                        <button
                          onClick={() => setDeleteConfirm(area.anchorAreaId)}
                          className="text-slate-200 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
                          title="Delete from DRO"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => deleteArea(area.anchorAreaId)} disabled={deleting === area.anchorAreaId}
                            className="text-[11px] px-2 py-0.5 rounded bg-red-600 text-white font-semibold hover:bg-red-700 whitespace-nowrap">
                            {deleting === area.anchorAreaId ? "…" : "Delete"}
                          </button>
                          <button onClick={() => setDeleteConfirm(null)}
                            className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            No
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {droAreas.length === 0 && (
                    <p className="text-[12px] text-slate-400 py-3 text-center">No areas in DRO</p>
                  )}
                  {deleteError && (
                    <p className="text-[12px] text-red-600 mt-1">{deleteError}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {(loadingStops || loadingAreas) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 pointer-events-none">
            <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
          </div>
        )}

        <AnchorEditorMap
          stops={stops}
          droAreas={droAreas}
          drawnAreas={drawnAreas}
          draftPoints={draftPoints}
          drawMode={drawMode && !draftClosed}
          onMapClick={handleMapClick}
          hoveredAreaId={hoveredAreaId}
          onAreaHover={setHoveredAreaId}
        />

        {/* Draw mode hint overlay */}
        {drawMode && !draftClosed && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-slate-900/90 text-white text-[12px] font-medium px-4 py-2 rounded-full shadow-lg">
              {draftPoints.length === 0
                ? "Click to start drawing"
                : draftPoints.length < 3
                ? `${draftPoints.length} point${draftPoints.length > 1 ? "s" : ""} — keep clicking`
                : 'Click near the first point to close, or use "Close Shape"'}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[2000] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-[13px] font-semibold border ${
          toast.ok
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {toast.ok
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

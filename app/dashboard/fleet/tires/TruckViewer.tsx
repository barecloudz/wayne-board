"use client";

import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Html } from "@react-three/drei";
import { Suspense, useState } from "react";
import * as THREE from "three";

// ── Tire definitions ───────────────────────────────────────────────────────────
// Positions are placeholders. Enable Debug Mode, click each tire on the model,
// note the logged x/y/z, then update these vectors to match.
const TIRES = [
  { id: "FL", label: "Front Left",  pos: new THREE.Vector3(-1.1,  0.35,  1.8) },
  { id: "FR", label: "Front Right", pos: new THREE.Vector3( 1.1,  0.35,  1.8) },
  { id: "RL", label: "Rear Left",   pos: new THREE.Vector3(-1.1,  0.35, -1.4) },
  { id: "RR", label: "Rear Right",  pos: new THREE.Vector3( 1.1,  0.35, -1.4) },
];

type TireStatus = "ok" | "inspect" | "replace";
interface TireState { status: TireStatus; notes: string; }

const STATUS_COLOR: Record<TireStatus, string> = {
  ok:      "#22c55e",
  inspect: "#f59e0b",
  replace: "#ef4444",
};
const STATUS_LABEL: Record<TireStatus, string> = {
  ok:      "Good",
  inspect: "Needs Inspection",
  replace: "Needs Replacement",
};

// ── Tire hotspot ───────────────────────────────────────────────────────────────
function TireHotspot({
  tire, state, selected, onSelect,
}: {
  tire: typeof TIRES[number];
  state: TireState;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = STATUS_COLOR[state.status];
  return (
    <group position={tire.pos}>
      <mesh
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.7 : 0.25}
        />
      </mesh>

      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.17, 0.22, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
        </mesh>
      )}

      <Html distanceFactor={8} center style={{ pointerEvents: "none" }}>
        <div style={{
          background: "rgba(0,0,0,0.72)",
          color: "#fff",
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 4,
          whiteSpace: "nowrap",
          marginTop: -30,
          border: `1px solid ${color}`,
          fontFamily: "sans-serif",
        }}>
          {tire.label}
        </div>
      </Html>
    </group>
  );
}

// ── Truck mesh ─────────────────────────────────────────────────────────────────
function Truck({ debug, onDebugClick }: { debug: boolean; onDebugClick: (p: THREE.Vector3) => void }) {
  const { scene } = useGLTF("/models/truck.glb");
  return (
    <primitive
      object={scene}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (debug) {
          onDebugClick(e.point.clone());
          console.log("Tire calibration point:", e.point);
        }
      }}
    />
  );
}
useGLTF.preload("/models/truck.glb");

// ── Status panel ───────────────────────────────────────────────────────────────
function StatusPanel({
  tire, state, onChange, onClose,
}: {
  tire: typeof TIRES[number];
  state: TireState;
  onChange: (patch: Partial<TireState>) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-0 right-0 h-full w-72 bg-white shadow-2xl border-l border-slate-200 flex flex-col z-10">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Tire Inspection</p>
          <h2 className="text-[20px] font-extrabold text-slate-900 leading-tight">{tire.label}</h2>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none pb-1">✕</button>
      </div>

      <div className="px-5 py-5 flex flex-col gap-3">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status</p>
        {(["ok", "inspect", "replace"] as TireStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => onChange({ status: s })}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
            style={
              state.status === s
                ? { borderColor: STATUS_COLOR[s], background: STATUS_COLOR[s] + "18" }
                : { borderColor: "#e2e8f0" }
            }
          >
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] }} />
            <span className="text-[13px] font-semibold text-slate-800">{STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>

      <div className="px-5 flex flex-col gap-2">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Notes</label>
        <textarea
          value={state.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="e.g. cracked sidewall, low tread..."
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 resize-none"
        />
      </div>

      <div className="px-5 mt-auto pb-6">
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 transition-all active:scale-[0.98]"
        >
          Save &amp; Close
        </button>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TruckViewer() {
  const [tireStates, setTireStates] = useState<Record<string, TireState>>(
    Object.fromEntries(TIRES.map((t) => [t.id, { status: "ok" as TireStatus, notes: "" }]))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [debugPoint, setDebugPoint] = useState<THREE.Vector3 | null>(null);

  const selectedTire = TIRES.find((t) => t.id === selectedId);

  return (
    <div className="relative w-full h-full bg-slate-100">

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-6 py-3 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center gap-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Wayne Board · Fleet</p>
          <h1 className="text-[18px] font-extrabold text-slate-900 leading-none">Tire Inspector</h1>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {TIRES.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
              className="flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-slate-900 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[tireStates[t.id].status] }} />
              {t.id}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [4, 3, 7], fov: 45 }} style={{ paddingTop: 52 }} shadows>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} />

        <Suspense fallback={null}>
          <Environment preset="city" />
          <Truck debug={debug} onDebugClick={(p) => setDebugPoint(p)} />
          {TIRES.map((t) => (
            <TireHotspot
              key={t.id}
              tire={t}
              state={tireStates[t.id]}
              selected={selectedId === t.id}
              onSelect={() => setSelectedId(selectedId === t.id ? null : t.id)}
            />
          ))}
        </Suspense>

        <OrbitControls enablePan={false} minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>

      {/* Status panel */}
      {selectedId && selectedTire && (
        <StatusPanel
          tire={selectedTire}
          state={tireStates[selectedId]}
          onChange={(patch) => setTireStates((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], ...patch } }))}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Debug mode */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => { setDebug((d) => !d); setDebugPoint(null); }}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            debug
              ? "bg-amber-500 text-white shadow"
              : "bg-white/90 text-slate-600 border border-slate-200 hover:border-slate-300"
          }`}
        >
          {debug ? "Debug ON — click truck to log coords" : "Calibrate Tire Positions"}
        </button>
        {debug && debugPoint && (
          <div className="bg-black/80 text-green-400 font-mono text-[11px] px-3 py-2 rounded-lg leading-relaxed">
            x: {debugPoint.x.toFixed(3)}<br />
            y: {debugPoint.y.toFixed(3)}<br />
            z: {debugPoint.z.toFixed(3)}
          </div>
        )}
      </div>
    </div>
  );
}

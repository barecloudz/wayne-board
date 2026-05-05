"use client";

import { useRef, useState } from "react";
import {
  Camera, X, CheckCircle2, AlertTriangle,
  Loader2, RotateCcw, Flashlight, Keyboard,
} from "lucide-react";
import { updateVehicleVin } from "@/lib/actions/vehicles";

type NHTSAResult = {
  Make: string;
  Model: string;
  ModelYear: string;
  BodyClass: string;
  ErrorCode: string;
};

type ScanState =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "scanning" }
  | { type: "manual" }
  | { type: "decoding"; vin: string }
  | { type: "confirm"; vin: string; nhtsa: NHTSAResult }
  | { type: "saving"; vin: string; nhtsa: NHTSAResult }
  | { type: "error"; message: string };

type Props = {
  vehicleId: number;
  currentVin: string;
  vehicle: { make: string; model: string; year: number; unitNumber: string };
  onVinConfirmed: (vin: string) => void;
};

const INPUT =
  "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 " +
  "font-mono tracking-wider outline-none focus:border-indigo-400 focus:ring-2 " +
  "focus:ring-indigo-400/15 transition bg-white placeholder-slate-300";

export default function VinScanner({ vehicleId, currentVin, vehicle, onVinConfirmed }: Props) {
  const [state, setState] = useState<ScanState>({ type: "idle" });
  const [torchOn, setTorchOn] = useState(false);
  const [torchUnavailable, setTorchUnavailable] = useState(false);
  const [manualVin, setManualVin] = useState("");
  const [manualError, setManualError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const detectingRef = useRef(false);

  const isOpen = state.type !== "idle";

  function stopCamera() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function closeModal() {
    stopCamera();
    detectingRef.current = false;
    setTorchOn(false);
    setTorchUnavailable(false);
    setManualVin("");
    setManualError("");
    setState({ type: "idle" });
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchUnavailable(true);
    }
  }

  async function startScan() {
    stopCamera();
    detectingRef.current = false;
    setTorchOn(false);
    setTorchUnavailable(false);
    setState({ type: "opening" });

    await new Promise((r) => setTimeout(r, 150));

    if (!videoRef.current) {
      setState({ type: "error", message: "Camera could not initialize." });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setState({ type: "scanning" });

      // ── Try native BarcodeDetector first (Chrome, Edge, Android) ──
      if ("BarcodeDetector" in window) {
        const detector = new (window as { BarcodeDetector: new (opts: object) => { detect: (el: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({
          formats: ["code_39", "code_128", "pdf417", "data_matrix"],
        });

        const scanFrame = async () => {
          if (detectingRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              detectingRef.current = true;
              stopCamera();
              handleDetected(codes[0].rawValue);
              return;
            }
          } catch { /* keep scanning */ }
          animFrameRef.current = requestAnimationFrame(scanFrame);
        };

        animFrameRef.current = requestAnimationFrame(scanFrame);

      } else {
        // ── Fall back to ZXing with TRY_HARDER hints ──
        const [{ BrowserMultiFormatReader }, { DecodeHintType }, { BarcodeFormat }] =
          await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
            import("@zxing/library"),
          ]);

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_128,
          BarcodeFormat.PDF_417,
          BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);

        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result) => {
            if (result && !detectingRef.current) {
              detectingRef.current = true;
              controls.stop();
              stopCamera();
              handleDetected(result.getText());
            }
          }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({
        type: "error",
        message: msg.includes("Permission")
          ? "Camera permission denied. Please allow access and try again."
          : `Camera error: ${msg}`,
      });
    }
  }

  async function handleDetected(raw: string) {
    const vin = raw.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (vin.length !== 17) {
      // Not a VIN — keep scanning
      detectingRef.current = false;
      startScan();
      return;
    }
    await decodeAndConfirm(vin);
  }

  async function decodeAndConfirm(vin: string) {
    setState({ type: "decoding", vin });
    try {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
      );
      const data = await res.json();
      setState({ type: "confirm", vin, nhtsa: data.Results[0] });
    } catch {
      setState({
        type: "confirm",
        vin,
        nhtsa: { Make: "—", Model: "—", ModelYear: "—", BodyClass: "—", ErrorCode: "1" },
      });
    }
  }

  function submitManual() {
    const vin = manualVin.trim().toUpperCase();
    if (vin.length !== 17) {
      setManualError("VIN must be exactly 17 characters.");
      return;
    }
    if (/[IOQ]/.test(vin)) {
      setManualError("VINs never contain the letters I, O, or Q.");
      return;
    }
    setManualError("");
    stopCamera();
    decodeAndConfirm(vin);
  }

  async function confirmVin(vin: string, nhtsa: NHTSAResult) {
    setState({ type: "saving", vin, nhtsa });
    try {
      await updateVehicleVin(vehicleId, vin);
      onVinConfirmed(vin);
      closeModal();
    } catch {
      setState({ type: "error", message: "Failed to save VIN. Please try again." });
    }
  }

  function matchBadge(nhtsa: NHTSAResult) {
    if (nhtsa.Make === "—") return null;
    const makeMatch =
      nhtsa.Make.toLowerCase().includes(vehicle.make.toLowerCase()) ||
      vehicle.make.toLowerCase().includes(nhtsa.Make.toLowerCase());
    const yearMatch = nhtsa.ModelYear === String(vehicle.year);
    if (makeMatch && yearMatch)
      return { ok: true, label: `Matches ${vehicle.unitNumber} record ✓` };
    return {
      ok: false,
      label: `Expected ${vehicle.year} ${vehicle.make} — decoded as ${nhtsa.ModelYear} ${nhtsa.Make}`,
    };
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={startScan}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-slate-300
          text-[13px] font-semibold text-slate-500
          hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50
          active:scale-[0.98] transition-all duration-150 w-full justify-center"
      >
        <Camera className="w-4 h-4" />
        {currentVin && currentVin.length === 17 ? "Re-scan VIN" : "Scan VIN Barcode"}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.5)] w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-900">VIN Lookup</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {vehicle.unitNumber} · {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-slate-100 active:scale-90 transition-all">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5">
              {/* ── Camera view ── */}
              {(state.type === "opening" || state.type === "scanning") && (
                <div className="flex flex-col gap-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                    <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

                    {state.type === "opening" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                        <p className="text-white text-[12px] font-medium">Starting camera...</p>
                      </div>
                    )}

                    {state.type === "scanning" && (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="relative w-[75%] h-16">
                            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
                            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
                            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
                            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br" />
                            <div className="absolute left-2 right-2 top-1/2 h-px bg-indigo-400/70" />
                          </div>
                        </div>

                        {!torchUnavailable && (
                          <button
                            type="button"
                            onClick={toggleTorch}
                            title={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
                            className={`absolute bottom-3 right-3 p-2.5 rounded-full transition-all active:scale-90
                              ${torchOn
                                ? "bg-yellow-400 text-slate-900 shadow-[0_0_16px_rgba(250,204,21,0.7)]"
                                : "bg-black/60 text-white hover:bg-black/80"
                              }`}
                          >
                            <Flashlight className="w-5 h-5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 text-center">
                    Hold steady — align the barcode within the frame
                  </p>

                  {/* Manual entry fallback always visible */}
                  <button
                    type="button"
                    onClick={() => { stopCamera(); setState({ type: "manual" }); }}
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg
                      border border-slate-200 text-[12px] font-semibold text-slate-500
                      hover:bg-slate-50 active:scale-[0.98] transition-all"
                  >
                    <Keyboard className="w-3.5 h-3.5" /> Type VIN manually
                  </button>
                </div>
              )}

              {/* ── Manual entry ── */}
              {state.type === "manual" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-[13px] font-bold text-slate-800 mb-1">Enter VIN</p>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Find it on the driver-side door jamb sticker — 17 characters, no I, O, or Q.
                    </p>
                    <input
                      type="text"
                      value={manualVin}
                      onChange={(e) => {
                        setManualVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                        setManualError("");
                      }}
                      maxLength={17}
                      placeholder="1FTBF2B64JEB24765"
                      className={INPUT}
                      autoFocus
                    />
                    <div className="flex items-center justify-between mt-1">
                      {manualError
                        ? <p className="text-[11px] text-red-500">{manualError}</p>
                        : <span />
                      }
                      <p className="text-[11px] text-slate-400">{manualVin.length} / 17</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={startScan}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                        border border-slate-200 text-[13px] font-semibold text-slate-600
                        hover:bg-slate-50 active:scale-[0.98] transition-all"
                    >
                      <Camera className="w-3.5 h-3.5" /> Try Camera
                    </button>
                    <button
                      type="button"
                      onClick={submitManual}
                      disabled={manualVin.length !== 17}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                        text-[13px] font-bold bg-slate-900 text-white
                        hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40
                        transition-all shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Look Up VIN
                    </button>
                  </div>
                </div>
              )}

              {/* ── Decoding ── */}
              {state.type === "decoding" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-slate-800">VIN captured</p>
                    <p className="font-mono text-[12px] text-indigo-600 mt-1 tracking-wider">{state.vin}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Decoding with NHTSA...</p>
                  </div>
                </div>
              )}

              {/* ── Confirm ── */}
              {(state.type === "confirm" || state.type === "saving") && (() => {
                const { vin, nhtsa } = state;
                const badge = matchBadge(nhtsa);
                return (
                  <div className="flex flex-col gap-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">VIN</p>
                      <p className="font-mono text-[14px] font-bold text-slate-900 tracking-widest break-all">{vin}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { label: "Make", value: nhtsa.Make },
                          { label: "Year", value: nhtsa.ModelYear },
                          { label: "Body", value: nhtsa.BodyClass?.split(" ")[0] ?? "—" },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-white rounded-lg px-2 py-2 border border-slate-200 text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                            <p className="text-[12px] font-bold text-slate-800 mt-0.5 truncate">{value || "—"}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {badge && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold border ${
                        badge.ok
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-amber-50 border-amber-200 text-amber-700"
                      }`}>
                        {badge.ok
                          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                        <span className="leading-snug">{badge.label}</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setState({ type: "manual" })}
                        className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                          border border-slate-200 text-[13px] font-semibold text-slate-600
                          hover:bg-slate-50 active:scale-[0.98] transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Try Again
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmVin(vin, nhtsa)}
                        disabled={state.type === "saving"}
                        className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                          text-[13px] font-bold bg-slate-900 text-white
                          hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50
                          transition-all shadow-sm"
                      >
                        {state.type === "saving"
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                          : <><CheckCircle2 className="w-3.5 h-3.5" /> Confirm VIN</>}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── Error ── */}
              {state.type === "error" && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-slate-800">Error</p>
                    <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{state.message}</p>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button type="button" onClick={startScan}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                        border border-slate-200 text-[13px] font-semibold text-slate-600
                        hover:bg-slate-50 active:scale-[0.98] transition-all">
                      <Camera className="w-3.5 h-3.5" /> Try Camera
                    </button>
                    <button type="button" onClick={() => setState({ type: "manual" })}
                      className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                        bg-slate-900 text-white text-[13px] font-semibold active:scale-[0.98] transition-all">
                      <Keyboard className="w-3.5 h-3.5" /> Type VIN
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

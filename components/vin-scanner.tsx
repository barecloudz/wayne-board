"use client";

import { useRef, useState } from "react";
import {
  Camera, X, CheckCircle2, AlertTriangle,
  Loader2, RotateCcw, Flashlight, Keyboard, ScanLine,
} from "lucide-react";
import { updateVehicleVinWithNhtsa } from "@/lib/actions/vehicles";

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
  | { type: "photo" }
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
  const [refocusing, setRefocusing] = useState(false);
  const [manualVin, setManualVin] = useState("");
  const [manualError, setManualError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageCaptureRef = useRef<any>(null);

  const isOpen = state.type !== "idle";

  function stopCamera() {
    scanningRef.current = false;
    if (scanLoopRef.current) {
      clearTimeout(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    imageCaptureRef.current = null;
  }

  function closeModal() {
    stopCamera();
    setTorchOn(false);
    setTorchUnavailable(false);
    setRefocusing(false);
    setManualVin("");
    setManualError("");
    setState({ type: "idle" });
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    let success = false;

    // Method 1: track constraint (standard)
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      success = true;
    } catch { /* try next method */ }

    // Method 2: ImageCapture.setOptions (fallback for some Android browsers)
    if (!success && imageCaptureRef.current) {
      try {
        await imageCaptureRef.current.setOptions({
          fillLightMode: next ? "torch" : "off",
        });
        success = true;
      } catch { /* not supported */ }
    }

    if (success) {
      setTorchOn(next);
    } else {
      setTorchUnavailable(true);
    }
  }

  // Force camera to re-hunt for focus — cycles manual→continuous
  async function triggerRefocus() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || refocusing) return;
    setRefocusing(true);
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "manual" } as MediaTrackConstraintSet] });
      await new Promise((r) => setTimeout(r, 100));
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
    } catch { /* focus constraint not supported */ }
    setTimeout(() => setRefocusing(false), 1200);
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
    if (!file) return;

    stopCamera();
    setState({ type: "photo" });

    // objectURL is temporary — decoded in memory then immediately revoked
    const objectUrl = URL.createObjectURL(file);

    try {
      // Strategy A: native BarcodeDetector on ImageBitmap (no upload, in-memory only)
      if ("BarcodeDetector" in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BD = (window as any).BarcodeDetector;
        const supported: string[] = await BD.getSupportedFormats();
        const formats = (["code_39", "code_128", "pdf417", "data_matrix", "qr_code"] as const)
          .filter((f) => supported.includes(f));
        const detector = new BD({ formats: formats.length > 0 ? formats : ["code_39", "code_128"] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await detector.detect(bitmap);
        bitmap.close();
        if (barcodes.length > 0) {
          URL.revokeObjectURL(objectUrl);
          await handleDetected(barcodes[0].rawValue);
          return;
        }
      }

      // Strategy B: ZXing decodeFromImageUrl (still local — objectURL never sent anywhere)
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import("@zxing/browser"),
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
      const result = await reader.decodeFromImageUrl(objectUrl);
      URL.revokeObjectURL(objectUrl);
      await handleDetected(result.getText());
    } catch {
      URL.revokeObjectURL(objectUrl);
      setState({
        type: "error",
        message: "No barcode found in that photo. Move closer, make sure the barcode is in frame, then try again.",
      });
    }
  }

  async function startScan() {
    stopCamera();
    setTorchOn(false);
    setTorchUnavailable(false);
    setRefocusing(false);
    setState({ type: "opening" });

    await new Promise((r) => setTimeout(r, 100));

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

      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      await videoRef.current.play();

      const track = stream.getVideoTracks()[0];

      // Continuous autofocus
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        });
      } catch { /* not supported */ }

      // Zoom: 2× to fill frame with small stickers
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caps = track.getCapabilities() as any;
        if (caps?.zoom) {
          const targetZoom = Math.min(2, caps.zoom.max);
          if (targetZoom > 1) {
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as MediaTrackConstraintSet] });
          }
        }
      } catch { /* zoom not supported */ }

      // ImageCapture — stored in ref for torch fallback
      if ("ImageCapture" in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          imageCaptureRef.current = new (window as any).ImageCapture(track);
        } catch { /* not available */ }
      }

      // ── Determine best decode strategy ──────────────────────────────────────
      // Strategy A: BarcodeDetector (native Android/Chrome hardware scanner)
      //   - Works directly on video frames, handles blur far better than ZXing
      //   - Available on Chrome 83+ / Android WebView
      // Strategy B: ImageCapture.grabFrame() → ZXing (full sensor resolution)
      // Strategy C: Video element → ZXing (fallback for older browsers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let barcodeDetector: any = null;
      if ("BarcodeDetector" in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const BD = (window as any).BarcodeDetector;
          const supported: string[] = await BD.getSupportedFormats();
          const formats = (["code_39", "code_128", "pdf417", "data_matrix", "qr_code"] as const)
            .filter((f) => supported.includes(f));
          barcodeDetector = new BD({ formats: formats.length > 0 ? formats : ["code_39", "code_128"] });
        } catch { /* BarcodeDetector init failed */ }
      }

      // Load ZXing only if BarcodeDetector unavailable
      let zxingDeps: {
        HTMLCanvasElementLuminanceSource: unknown;
        BinaryBitmap: unknown;
        HybridBinarizer: unknown;
        MultiFormatReader: unknown;
        DecodeHintType: unknown;
        BarcodeFormat: unknown;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mfReader: any = null;
      if (!barcodeDetector) {
        const [browser, lib] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
          lib.BarcodeFormat.CODE_39,
          lib.BarcodeFormat.CODE_128,
          lib.BarcodeFormat.PDF_417,
          lib.BarcodeFormat.DATA_MATRIX,
        ]);
        hints.set(lib.DecodeHintType.TRY_HARDER, true);
        mfReader = new lib.MultiFormatReader();
        mfReader.setHints(hints);
        zxingDeps = { ...browser, ...lib };
      }

      const offscreen = document.createElement("canvas");
      const ctx = offscreen.getContext("2d", { willReadFrequently: true });

      scanningRef.current = true;
      setState({ type: "scanning" });

      async function decodeFrame() {
        if (!scanningRef.current) return;

        try {
          // ── Strategy A: native BarcodeDetector ──────────────────────────────
          if (barcodeDetector && videoRef.current) {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0 && scanningRef.current) {
              scanningRef.current = false;
              handleDetected(barcodes[0].rawValue);
              return;
            }
          }

          // ── Strategy B: ImageCapture.grabFrame() + ZXing ────────────────────
          if (!barcodeDetector && mfReader && zxingDeps && ctx) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { HTMLCanvasElementLuminanceSource, BinaryBitmap, HybridBinarizer } = zxingDeps as any;
            let drew = false;

            if (imageCaptureRef.current) {
              try {
                const bitmap: ImageBitmap = await imageCaptureRef.current.grabFrame();
                offscreen.width = bitmap.width;
                offscreen.height = bitmap.height;
                ctx.drawImage(bitmap, 0, 0);
                bitmap.close();
                drew = true;
              } catch { /* grabFrame failed — fall through to video */ }
            }

            if (!drew && videoRef.current) {
              offscreen.width = videoRef.current.videoWidth || 640;
              offscreen.height = videoRef.current.videoHeight || 480;
              ctx.drawImage(videoRef.current, 0, 0);
              drew = true;
            }

            if (drew) {
              try {
                const luminance = new HTMLCanvasElementLuminanceSource(offscreen);
                const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminance));
                const result = mfReader.decode(binaryBitmap);
                if (result && scanningRef.current) {
                  scanningRef.current = false;
                  handleDetected(result.getText());
                  return;
                }
              } catch { /* no barcode in frame — keep looping */ }
            }
          }
        } catch { /* frame grab error — keep looping */ }

        if (scanningRef.current) {
          scanLoopRef.current = setTimeout(decodeFrame, 150);
        }
      }

      decodeFrame();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setState({
        type: "error",
        message: msg.toLowerCase().includes("permission")
          ? "Camera permission denied. Please allow access and try again."
          : `Camera error: ${msg}`,
      });
    }
  }

  async function handleDetected(raw: string) {
    const vin = raw.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
    if (vin.length !== 17) {
      startScan();
      return;
    }
    await decodeAndConfirm(vin);
  }

  async function decodeAndConfirm(vin: string) {
    stopCamera();
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
    if (vin.length !== 17) { setManualError("VIN must be exactly 17 characters."); return; }
    if (/[IOQ]/.test(vin)) { setManualError("VINs never contain the letters I, O, or Q."); return; }
    setManualError("");
    decodeAndConfirm(vin);
  }

  async function confirmVin(vin: string, nhtsa: NHTSAResult) {
    setState({ type: "saving", vin, nhtsa });
    try {
      const yearNum = parseInt(nhtsa.ModelYear);
      await updateVehicleVinWithNhtsa(vehicleId, vin, {
        make:  nhtsa.Make !== "—" ? nhtsa.Make : undefined,
        model: nhtsa.Model !== "—" ? nhtsa.Model : undefined,
        year:  !isNaN(yearNum) ? yearNum : undefined,
      });
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
    if (makeMatch && yearMatch) return { ok: true, label: `Matches ${vehicle.unitNumber} record ✓` };
    return { ok: false, label: `Expected ${vehicle.year} ${vehicle.make} — decoded as ${nhtsa.ModelYear} ${nhtsa.Make}` };
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
                        {/* Aim reticle */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="relative w-[80%] h-14">
                            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
                            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
                            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
                            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br" />
                            <div className="absolute left-2 right-2 top-1/2 h-px bg-indigo-400/60" />
                          </div>
                        </div>

                        {/* Refocus button — bottom left */}
                        <button
                          type="button"
                          onClick={triggerRefocus}
                          disabled={refocusing}
                          title="Force camera to refocus"
                          className={`absolute bottom-3 left-3 p-2.5 rounded-full transition-all active:scale-90
                            ${refocusing
                              ? "bg-indigo-500 text-white"
                              : "bg-black/60 text-white hover:bg-black/80"
                            }`}
                        >
                          {refocusing
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <ScanLine className="w-4 h-4" />
                          }
                        </button>

                        {/* Torch button — bottom right */}
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
                    Hold barcode in frame · back up if blurry · press <ScanLine className="inline w-3 h-3" /> to refocus
                  </p>

                  <div className="flex gap-2">
                    {/* Take Photo — native camera app handles zoom/focus, image never stored */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg
                        border border-slate-200 text-[12px] font-semibold text-slate-500
                        hover:bg-slate-50 active:scale-[0.98] transition-all"
                    >
                      <Camera className="w-3.5 h-3.5" /> Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => { stopCamera(); setState({ type: "manual" }); }}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg
                        border border-slate-200 text-[12px] font-semibold text-slate-500
                        hover:bg-slate-50 active:scale-[0.98] transition-all"
                    >
                      <Keyboard className="w-3.5 h-3.5" /> Type Manually
                    </button>
                  </div>
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
                    <button type="button" onClick={startScan}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                        border border-slate-200 text-[13px] font-semibold text-slate-600
                        hover:bg-slate-50 active:scale-[0.98] transition-all">
                      <Camera className="w-3.5 h-3.5" /> Try Camera
                    </button>
                    <button type="button" onClick={submitManual} disabled={manualVin.length !== 17}
                      className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                        text-[13px] font-bold bg-slate-900 text-white
                        hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Look Up VIN
                    </button>
                  </div>
                </div>
              )}

              {/* ── Photo processing ── */}
              {state.type === "photo" && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-[13px] font-bold text-slate-800">Analyzing photo...</p>
                    <p className="text-[11px] text-slate-400 mt-1">Photo is processed locally and not stored</p>
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
                          { label: "Make",  value: nhtsa.Make },
                          { label: "Year",  value: nhtsa.ModelYear },
                          { label: "Body",  value: nhtsa.BodyClass?.split(" ")[0] ?? "—" },
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
                      <button type="button" onClick={() => setState({ type: "manual" })}
                        className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                          border border-slate-200 text-[13px] font-semibold text-slate-600
                          hover:bg-slate-50 active:scale-[0.98] transition-all">
                        <RotateCcw className="w-3.5 h-3.5" /> Try Again
                      </button>
                      <button type="button" onClick={() => confirmVin(vin, nhtsa)} disabled={state.type === "saving"}
                        className="flex items-center justify-center gap-1.5 flex-1 py-2.5 rounded-xl
                          text-[13px] font-bold bg-slate-900 text-white
                          hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm">
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
      {/* Hidden file input — capture="environment" opens native camera on mobile.
          accept="image/*" without capture works as gallery fallback on Android 14/15.
          Image is processed locally via objectURL and never uploaded. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoFile}
      />
    </>
  );
}

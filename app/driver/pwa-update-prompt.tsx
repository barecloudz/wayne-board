"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export default function PwaUpdatePrompt() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        return;
      }
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(installing);
          }
        });
      });
    };

    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg) checkForWaiting(reg);
    });

    // Also check on visibility change — catches cases where tab was backgrounded
    const onVisible = () => {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          reg.update().catch(() => {});
          checkForWaiting(reg);
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    waitingWorker.addEventListener("statechange", () => {
      if (waitingWorker.state === "activated") window.location.reload();
    });
    // Fallback reload after short delay
    setTimeout(() => window.location.reload(), 500);
  }

  if (!waitingWorker) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4">
      <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0" />
      <span className="text-[13px] font-semibold">App update available</span>
      <button
        onClick={applyUpdate}
        className="ml-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-[12px] font-bold rounded-lg transition-colors"
      >
        Update now
      </button>
    </div>
  );
}

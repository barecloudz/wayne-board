"use client";

import { useEffect, useState } from "react";
import { X, Share, Plus, Download } from "lucide-react";

const DISMISSED_KEY = "mgops_pwa_install_dismissed";

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    ("standalone" in window.navigator && (window.navigator as any).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export default function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const ios = isIos();
    setIsIosDevice(ios);

    if (ios) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    if (outcome === "accepted") localStorage.setItem(DISMISSED_KEY, "1");
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-w-sm mx-auto">
        <div className="flex items-start justify-between px-4 pt-4 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[14px] font-bold leading-tight">Add to Home Screen</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Quick access right from your phone</p>
            </div>
          </div>
          <button onClick={dismiss} className="p-1 text-slate-500 hover:text-slate-300 transition-colors -mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIosDevice ? (
          <div className="px-4 py-4 space-y-2.5">
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
              <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-black flex-shrink-0">1</span>
              <div className="flex items-center gap-2 flex-wrap text-[12px] text-slate-300">
                Tap the
                <span className="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md font-semibold text-white">
                  <Share className="w-3.5 h-3.5" /> Share
                </span>
                button in Safari
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
              <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-black flex-shrink-0">2</span>
              <div className="flex items-center gap-2 flex-wrap text-[12px] text-slate-300">
                Tap
                <span className="inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-md font-semibold text-white">
                  <Plus className="w-3.5 h-3.5" /> Add to Home Screen
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
              <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-black flex-shrink-0">3</span>
              <p className="text-[12px] text-slate-300">Tap <span className="font-semibold text-white">Add</span> in the top right corner</p>
            </div>
            <button
              onClick={dismiss}
              className="w-full mt-1 py-2.5 rounded-xl bg-white/10 text-[13px] font-semibold text-slate-300 hover:bg-white/15 transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 flex gap-2">
            <button
              onClick={dismiss}
              className="flex-1 py-2.5 rounded-xl bg-white/10 text-[13px] font-semibold text-slate-300 hover:bg-white/15 transition-colors"
            >
              Not now
            </button>
            <button
              onClick={install}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[13px] font-bold text-white transition-colors"
            >
              Install App
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

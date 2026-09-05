"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const STORAGE_KEY = "app_version";
// Baked in at build time via netlify.toml: NEXT_PUBLIC_DEPLOY_ID = "$DEPLOY_ID"
const CURRENT_VERSION = process.env.NEXT_PUBLIC_DEPLOY_ID ?? "dev";

export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (CURRENT_VERSION === "dev") return; // skip in local dev
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    } else if (stored !== CURRENT_VERSION) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function handleUpdate() {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    if ("caches" in window) {
      void caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => location.reload());
    } else {
      location.reload();
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 px-4 pointer-events-none">
      <div
        className="flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] pointer-events-auto"
        style={{
          background: "linear-gradient(135deg, #4D148C, #7B2FC0)",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-bold text-white">New version available</span>
          <span className="text-[11px] text-white/55">Tap update to get the latest</span>
        </div>
        <button
          onClick={handleUpdate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold
            bg-white text-slate-900 hover:bg-white/90 active:scale-[0.97] transition-all shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Update
        </button>
      </div>
    </div>
  );
}

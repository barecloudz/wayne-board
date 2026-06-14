"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const STORAGE_KEY = "app_version";

export default function UpdateBanner() {
  const [show, setShow] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();

        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) {
          // First ever visit — store current version, no banner
          localStorage.setItem(STORAGE_KEY, version);
        } else if (stored !== version) {
          // Version changed since last visit — show banner
          setShow(true);
        }
      } catch {
        // network error — ignore
      }
    }

    if (!checked.current) {
      checked.current = true;
      check();
    }

    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!show) return null;

  function handleUpdate() {
    if ("caches" in window) {
      void caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => {
          localStorage.removeItem(STORAGE_KEY);
          location.reload();
        });
    } else {
      localStorage.removeItem(STORAGE_KEY);
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

"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

export default function BrandingSettings({
  initialLogoUrl,
  initialAccentColor,
}: {
  initialLogoUrl: string | null;
  initialAccentColor: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? "#FF6200");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await fetch("/api/org/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: logoUrl.trim() || null, accentColor }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-[15px] font-extrabold text-slate-900">Branding</h2>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>
      <p className="text-[12px] text-slate-400 mb-5">
        Customize your driver portal with your company logo and brand color.
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Logo URL</label>
          <input
            type="url"
            value={logoUrl}
            onChange={e => setLogoUrl(e.target.value)}
            placeholder="https://your-cdn.com/logo.png"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition"
          />
          {logoUrl && (
            <div className="mt-1 flex items-center gap-3">
              <img src={logoUrl} alt="Logo preview" className="w-10 h-10 object-contain rounded-lg border border-slate-200" onError={e => (e.currentTarget.style.display = "none")} />
              <span className="text-[11px] text-slate-400">Preview</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Shown on the driver login page and portal header. Use a publicly accessible image URL.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Brand Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
            />
            <input
              type="text"
              value={accentColor}
              onChange={e => setAccentColor(e.target.value)}
              className="w-32 px-3.5 py-2.5 rounded-xl border border-slate-200 text-[13px] text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-50 transition font-mono"
              placeholder="#FF6200"
            />
            <div className="w-8 h-8 rounded-lg border border-slate-200" style={{ background: accentColor }} />
          </div>
          <p className="text-[11px] text-slate-400">Used for buttons, active tabs, and accents in the driver portal.</p>
        </div>

        {saved && (
          <p className="text-[13px] font-semibold text-emerald-600">Branding saved.</p>
        )}

        <button
          onClick={handleSave}
          disabled={isPending}
          className="self-start px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
          style={{ background: accentColor || "#FF6200" }}
        >
          Save Branding
        </button>
      </div>
    </div>
  );
}

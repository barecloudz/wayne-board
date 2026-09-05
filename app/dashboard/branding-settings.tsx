"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Upload } from "lucide-react";

async function uploadToR2(file: File, field: "logo" | "og"): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("field", field);
  const res = await fetch("/api/org/upload-url", { method: "POST", body: form });
  const { publicUrl } = await res.json();
  return publicUrl;
}

function ImageUploader({
  label,
  hint,
  currentUrl,
  onUploaded,
  previewClass,
}: {
  label: string;
  hint: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  previewClass?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToR2(file, label === "Logo" ? "logo" : "og");
      onUploaded(url);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl && (
          <img
            src={currentUrl}
            alt={label}
            className={previewClass ?? "w-10 h-10 object-contain rounded-lg border border-slate-200"}
            onError={e => (e.currentTarget.style.display = "none")}
          />
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

export default function BrandingSettings({
  initialLogoUrl,
  initialAccentColor,
  initialOgImageUrl,
}: {
  initialLogoUrl: string | null;
  initialAccentColor: string | null;
  initialOgImageUrl: string | null;
}) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [accentColor, setAccentColor] = useState(initialAccentColor ?? "#FF6200");
  const [ogImageUrl, setOgImageUrl] = useState(initialOgImageUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await fetch("/api/org/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: logoUrl || null, accentColor, ogImageUrl: ogImageUrl || null }),
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

      <div className="flex flex-col gap-5">
        <ImageUploader
          label="Logo"
          hint="Shown on the driver login page and portal header."
          currentUrl={logoUrl}
          onUploaded={url => { setLogoUrl(url); }}
          previewClass="w-12 h-12 object-contain rounded-xl border border-slate-200"
        />

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

        <ImageUploader
          label="Share Image"
          hint="Shown when sharing your login link on iMessage, Slack, social media, etc. Recommended: 1200×630 px."
          currentUrl={ogImageUrl}
          onUploaded={url => { setOgImageUrl(url); }}
          previewClass="w-24 h-14 object-cover rounded-lg border border-slate-200"
        />

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

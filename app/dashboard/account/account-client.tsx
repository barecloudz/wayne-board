"use client";

import { useState, useRef, useTransition } from "react";
import { Camera, Loader2, Check, User } from "lucide-react";
import { updateMyAvatar } from "@/lib/actions/drivers";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", co_owner: "Co-Owner", developer: "Developer", bc: "Business Contact", driver: "Driver",
};
const ROLE_COLORS: Record<string, string> = {
  owner:     "bg-violet-100 text-violet-700",
  co_owner:  "bg-blue-100 text-blue-700",
  developer: "bg-emerald-100 text-emerald-700",
  bc:        "bg-amber-100 text-amber-700",
  driver:    "bg-slate-100 text-slate-600",
};

type Profile = {
  id: number;
  driverId: string;
  name: string;
  username: string | null;
  role: string;
  avatarUrl: string | null;
};

export default function AccountClient({ profile }: { profile: Profile }) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("field", "avatar");
      const res = await fetch("/api/org/upload-url", { method: "POST", body: form });
      const { publicUrl } = await res.json();
      if (publicUrl) {
        setAvatarUrl(publicUrl);
        startTransition(async () => {
          await updateMyAvatar(publicUrl);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        });
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <main className="flex-1 px-6 py-8 max-w-[680px] w-full mx-auto">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
        MyGroundOps · Admin
      </p>
      <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none mb-8">
        My Account
      </h1>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl bg-amber-100 border border-slate-200 overflow-hidden flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-amber-400" />
              )}
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {uploading
                ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                : <Camera className="w-3 h-3 text-white" />}
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-[18px] font-extrabold text-slate-900 leading-none">{profile.name}</h2>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${ROLE_COLORS[profile.role] ?? ROLE_COLORS.driver}`}>
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
            </div>
            {profile.username && (
              <p className="text-[13px] text-slate-400 font-mono">@{profile.username}</p>
            )}
            <p className="text-[12px] text-slate-400 mt-0.5">ID: {profile.driverId}</p>
          </div>
        </div>

        {saved && (
          <div className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-emerald-600">
            <Check className="w-3.5 h-3.5" />
            Profile picture updated.
          </div>
        )}

        <p className="text-[12px] text-slate-400 mt-4">
          Click the camera icon to upload a new profile picture. Square images work best.
        </p>
      </div>
    </main>
  );
}

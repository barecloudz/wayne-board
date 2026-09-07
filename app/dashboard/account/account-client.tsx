"use client";

import { useState, useRef, useTransition } from "react";
import { Camera, Loader2, Check, User, ExternalLink, Download, XCircle } from "lucide-react";
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

const PLAN_LABELS: Record<string, string> = {
  starter:    "Starter",
  pro:        "Pro",
  enterprise: "Enterprise",
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  trialing: { label: "Trial",    className: "bg-amber-100 text-amber-700" },
  active:   { label: "Active",   className: "bg-emerald-100 text-emerald-700" },
  past_due: { label: "Past Due", className: "bg-red-100 text-red-700" },
  canceled: { label: "Canceled", className: "bg-slate-100 text-slate-500" },
};

type Profile = {
  id: number;
  driverId: string;
  name: string;
  username: string | null;
  role: string;
  avatarUrl: string | null;
};

type OrgSubscription = {
  plan: string;
  subscriptionStatus: string;
  hasStripeAccount: boolean;
} | null;

export default function AccountClient({
  profile,
  orgSubscription,
}: {
  profile: Profile;
  orgSubscription: OrgSubscription;
}) {
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        console.error("Billing portal error:", error);
      }
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCancelSubscription() {
    setCancelLoading(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (res.ok) { setCancelDone(true); setShowCancelModal(false); }
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/org/export");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const filename = cd.match(/filename="([^"]+)"/)?.[1] ?? "export.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

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

      {profile.role === "owner" && orgSubscription && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-4">Subscription</h3>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[15px] font-bold text-slate-900">
                {PLAN_LABELS[orgSubscription.plan] ?? orgSubscription.plan} Plan
              </p>
              <div className="flex items-center gap-2 mt-1">
                {(() => {
                  const cfg = STATUS_CONFIG[orgSubscription.subscriptionStatus] ?? { label: orgSubscription.subscriptionStatus, className: "bg-slate-100 text-slate-500" };
                  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${cfg.className}`}>{cfg.label}</span>;
                })()}
                {!orgSubscription.hasStripeAccount && (
                  <span className="text-[11px] text-slate-400">· Managed by MyGroundOps</span>
                )}
              </div>
            </div>
            {orgSubscription.hasStripeAccount && !cancelDone && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Manage Billing
                </button>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 text-[13px] font-semibold hover:bg-red-100 transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            )}
            {cancelDone && (
              <span className="text-[13px] text-slate-500 font-medium">Subscription canceled · access continues until period end.</span>
            )}
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-[16px] font-extrabold text-slate-900 mb-1">Cancel subscription?</h2>
            <p className="text-[13px] text-slate-500 mb-4">You&apos;ll keep access until the end of your current billing period. Type <strong>confirm</strong> to proceed.</p>
            <input
              type="text"
              value={cancelConfirm}
              onChange={e => setCancelConfirm(e.target.value)}
              placeholder="confirm"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCancelModal(false); setCancelConfirm(""); }}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Never mind
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelConfirm.toLowerCase() !== "confirm" || cancelLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {cancelLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Cancel Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download all data */}
      <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)] p-6">
        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-1">Your Data</h3>
        <p className="text-[12px] text-slate-400 mb-4">Download everything — drivers, RYDE scores, routes, schedules, and more — as a JSON file.</p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[13px] font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {downloading ? "Preparing…" : "Download All My Data"}
        </button>
      </div>
    </main>
  );
}

"use client";

import { useState, useRef } from "react";
import { Trophy, Gift, Wrench, User, ChevronRight, CheckCircle2, Lock, Camera, Loader2 } from "lucide-react";
import MaintenanceTab from "./maintenance-tab";

export type MePanelProps = {
  showMilestones: boolean;
  milestones: Array<{
    id: number;
    label: string;
    target: number;
    progress: number;
    unit: string;
    earned: boolean;
    rewardDescription: string | null;
  }>;
  bonuses: Array<{
    id: number;
    label: string;
    amount: number;
    earned: boolean;
    date: string | null;
  }>;
  driverName: string;
  driverUsername: string;
  onChangeUsername: (newUsername: string) => Promise<{ error?: string }>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  driverId: string;
  vehicles: Array<{ id: number; unitNumber: string }>;
  maintenanceRequests: any[];
  avatarUrl?: string | null;
};

type MeSection = "milestones" | "maintenance" | "account";

export default function MePanel({
  showMilestones,
  milestones,
  bonuses,
  driverName,
  driverUsername,
  onChangeUsername,
  onChangePassword,
  driverId,
  vehicles,
  maintenanceRequests,
  avatarUrl,
}: MePanelProps) {
  const defaultSection: MeSection = showMilestones ? "milestones" : "maintenance";
  const [section, setSection] = useState<MeSection>(defaultSection);

  // Avatar upload state
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUrl ?? null);

  async function handleAvatarChange(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/avatar/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.url) setLocalAvatar(data.url);
    setUploading(false);
  }

  // Account form state
  const [newUsername, setNewUsername] = useState("");
  const [usernameMsg, setUsernameMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ error: boolean; text: string } | null>(null);

  const ME_SECTIONS: { key: MeSection; label: string; icon: typeof Trophy }[] = [
    ...(showMilestones ? [{ key: "milestones" as const, label: "Milestones", icon: Trophy }] : []),
    { key: "maintenance", label: "Maintenance", icon: Wrench },
    { key: "account", label: "Account", icon: User },
  ];

  async function handleUsernameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUsernameMsg(null);
    if (!newUsername.trim()) return;
    const result = await onChangeUsername(newUsername.trim());
    if (result.error) {
      setUsernameMsg({ error: true, text: result.error });
    } else {
      setUsernameMsg({ error: false, text: "Username updated!" });
      setNewUsername("");
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ error: true, text: "Passwords don't match" });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ error: true, text: "Password must be at least 8 characters" });
      return;
    }
    const result = await onChangePassword(currentPw, newPw);
    if (result.error) {
      setPwMsg({ error: true, text: result.error });
    } else {
      setPwMsg({ error: false, text: "Password updated!" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  const earnedMilestones = milestones.filter((m) => m.earned);
  const inProgressMilestones = milestones.filter((m) => !m.earned);
  const earnedBonuses = bonuses.filter((b) => b.earned);

  return (
    <div className="flex flex-col">
      {/* Sub-nav pills */}
      <div className="flex gap-2 px-4 pt-4 pb-3 overflow-x-auto no-scrollbar">
        {ME_SECTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
              section === key ? "text-white" : "bg-slate-100 text-slate-500"
            }`}
            style={section === key ? { backgroundColor: "var(--brand)" } : {}}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Milestones section */}
      {section === "milestones" && showMilestones && (
        <div className="px-4 pb-6 flex flex-col gap-4">
          {inProgressMilestones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                In Progress
              </p>
              <div className="flex flex-col gap-2">
                {inProgressMilestones.map((m) => {
                  const pct = Math.min((m.progress / m.target) * 100, 100);
                  return (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border border-slate-200/80 px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[14px] font-bold text-slate-800">{m.label}</p>
                        <span className="text-[12px] font-semibold text-slate-400">
                          {m.progress}/{m.target} {m.unit}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: "var(--brand)" }}
                        />
                      </div>
                      {m.rewardDescription && (
                        <p className="text-[11px] text-slate-400 mt-1.5">🎁 {m.rewardDescription}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {earnedMilestones.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Earned
              </p>
              <div className="flex flex-col gap-2">
                {earnedMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="bg-emerald-50 rounded-2xl border border-emerald-100 px-4 py-3.5 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-emerald-800">{m.label}</p>
                      {m.rewardDescription && (
                        <p className="text-[12px] text-emerald-600 mt-0.5">{m.rewardDescription}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {earnedBonuses.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Bonuses
              </p>
              <div className="flex flex-col gap-2">
                {earnedBonuses.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl border border-slate-200/80 px-4 py-3.5 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <Gift className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-slate-800">{b.label}</p>
                      {b.date && <p className="text-[11px] text-slate-400 mt-0.5">{b.date}</p>}
                    </div>
                    <span className="text-[15px] font-extrabold text-emerald-600">${b.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {milestones.length === 0 && bonuses.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-[15px] font-bold text-slate-700">No milestones yet</p>
              <p className="text-[13px] text-slate-400 mt-1">Keep delivering to unlock rewards</p>
            </div>
          )}
        </div>
      )}

      {/* Maintenance section */}
      {section === "maintenance" && (
        <div className="px-4 pb-6">
          <MaintenanceTab
            initial={maintenanceRequests}
            driverId={driverId}
            driverName={driverName}
            vehicles={vehicles.map((v) => ({ id: v.id, unitNumber: v.unitNumber, model: "" }))}
          />
        </div>
      )}

      {/* Account section */}
      {section === "account" && (
        <div className="px-4 pb-6 flex flex-col gap-5">
          {/* Info */}
          <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-4 mb-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center group shrink-0"
                title="Tap to change photo"
              >
                {localAvatar
                  ? <img src={localAvatar} alt="avatar" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-slate-500">{driverName?.[0] ?? "?"}</span>
                }
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploading
                    ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                    : <Camera className="w-6 h-6 text-white" />
                  }
                </div>
              </button>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                  Signed in as
                </p>
                <p className="text-[18px] font-extrabold text-slate-900">{driverName}</p>
                <p className="text-[13px] text-slate-500 mt-0.5">@{driverUsername}</p>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarChange(f); }}
            />
          </div>

          {/* Change username */}
          <form onSubmit={handleUsernameSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[13px] font-bold text-slate-700 mb-3">Change Username</p>
            <input
              type="text"
              placeholder="New username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
              style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
            />
            {usernameMsg && (
              <p className={`text-[12px] mb-2 ${usernameMsg.error ? "text-red-500" : "text-emerald-600"}`}>
                {usernameMsg.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Update Username
            </button>
          </form>

          {/* Change password */}
          <form onSubmit={handlePasswordSubmit} className="bg-white rounded-2xl border border-slate-200/80 px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <p className="text-[13px] font-bold text-slate-700 mb-3 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Change Password
            </p>
            {[
              { placeholder: "Current password", value: currentPw, onChange: setCurrentPw },
              { placeholder: "New password", value: newPw, onChange: setNewPw },
              { placeholder: "Confirm new password", value: confirmPw, onChange: setConfirmPw },
            ].map(({ placeholder, value, onChange }) => (
              <input
                key={placeholder}
                type="password"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 mb-2"
                style={{ "--tw-ring-color": "var(--brand)" } as React.CSSProperties}
              />
            ))}
            {pwMsg && (
              <p className={`text-[12px] mb-2 ${pwMsg.error ? "text-red-500" : "text-emerald-600"}`}>
                {pwMsg.text}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Update Password
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

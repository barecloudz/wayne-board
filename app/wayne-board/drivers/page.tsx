"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import AppShell from "@/components/app-shell";
import {
  UserPlus, Search, MoreVertical, CheckCircle2,
  XCircle, Eye, EyeOff, Copy, Check, Loader2,
} from "lucide-react";
import {
  getDrivers, createDriver, setDriverActive, resetDriverPassword,
} from "@/lib/actions/drivers";
import { suggestDriverId } from "@/lib/driver-utils";

type Driver = {
  id: number;
  driverId: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: Date | null;
};

const INPUT_CLS = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriverId, setNewDriverId] = useState("");
  const [newTempPassword, setNewTempPassword] = useState("Fedex1234#");
  const [newRole, setNewRole] = useState<"driver" | "management">("driver");
  const [created, setCreated] = useState<{ driverId: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const data = await getDrivers();
    setDrivers(data as Driver[]);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick() { setMenuOpen(null); setMenuPos(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

  const filtered = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.driverId.toLowerCase().includes(search.toLowerCase())
  );

  function openCreate() {
    setNewName("");
    setNewDriverId("");
    setNewTempPassword("Fedex1234#");
    setNewRole("driver");
    setCreated(null);
    setShowNewPassword(false);
    setShowCreate(true);
  }

  function handleNameChange(val: string) {
    setNewName(val);
    // Auto-suggest driver ID from name only if user hasn't manually edited it
    if (val.trim()) {
      setNewDriverId(suggestDriverId(val));
    } else {
      setNewDriverId("");
    }
  }

  function handleCreate() {
    if (!newName.trim() || !newDriverId.trim() || !newTempPassword.trim()) return;
    startTransition(async () => {
      const result = await createDriver(newName.trim(), newRole, newDriverId.trim(), newTempPassword.trim());
      setCreated({ driverId: result.driverId, password: result.tempPassword });
      setShowCreate(false);
      await refresh();
    });
  }

  function handleToggleActive(id: number, active: boolean) {
    startTransition(async () => {
      await setDriverActive(id, !active);
      setMenuOpen(null);
      setMenuPos(null);
      await refresh();
    });
  }

  function handleResetPassword(id: number) {
    startTransition(async () => {
      const result = await resetDriverPassword(id);
      setCreated({ driverId: drivers.find((d) => d.id === id)?.driverId ?? "", password: result.tempPassword });
      setMenuOpen(null);
      setMenuPos(null);
      setShowPassword(false);
    });
  }

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, driverId: number) {
    e.stopPropagation();
    if (menuOpen === driverId) { setMenuOpen(null); setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuOpen(driverId);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const active   = drivers.filter((d) => d.active).length;
  const inactive = drivers.filter((d) => !d.active).length;

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-[1100px] w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              Wayne Board · Admin
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Driver Accounts
            </h1>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold
              bg-slate-900 text-white hover:bg-slate-700 transition-colors mt-1"
          >
            <UserPlus className="w-4 h-4" />
            New Account
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total",    value: drivers.length, color: "text-slate-900" },
            { label: "Active",   value: active,         color: "text-emerald-600" },
            { label: "Inactive", value: inactive,       color: "text-red-500" },
          ].map((s) => (
            <div key={s.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                {s.label}
              </p>
              <span className={`text-[24px] font-extrabold leading-none ${s.color}`}>
                {loading ? "—" : s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Credential card after create/reset */}
        {created && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-[13px] font-bold text-emerald-800">
                Share these credentials with the driver
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CredentialRow
                label="Driver ID"
                value={created.driverId}
                onCopy={() => copyToClipboard(created.driverId, "id")}
                copied={copied === "id"}
              />
              <div className="bg-white rounded-lg border border-emerald-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    Temp Password
                  </p>
                  <p className="text-[14px] font-mono font-semibold text-slate-800 tracking-wide">
                    {showPassword ? created.password : "••••••••••"}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setShowPassword((p) => !p)}
                    className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                    {showPassword
                      ? <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      : <Eye className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                  <button onClick={() => copyToClipboard(created.password, "pw")}
                    className="p-1.5 rounded hover:bg-slate-100 transition-colors">
                    {copied === "pw"
                      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                      : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-emerald-700 mt-3">
              Driver will be prompted to change their password on first login.
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or driver ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-[13px]
              text-slate-800 placeholder-slate-400 bg-white outline-none
              focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80
          shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[13px]">Loading accounts...</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Driver ID</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Role</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">Created</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((driver) => (
                    <tr key={driver.id}
                      className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-[12px] text-slate-500 font-semibold">
                        {driver.driverId}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800">{driver.name}</td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          driver.role === "management"
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                            : "bg-slate-100 text-slate-600 border border-slate-200/80"
                        }`}>
                          {driver.role}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-400 hidden md:table-cell">
                        {driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {driver.active
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                          <span className={`text-[12px] font-semibold ${driver.active ? "text-emerald-600" : "text-red-500"}`}>
                            {driver.active ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={(e) => openMenu(e, driver.id)}
                          className="p-1.5 rounded hover:bg-slate-100 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-400 text-[13px]">
                        {drivers.length === 0 ? "No accounts yet. Create the first one." : "No accounts match your search."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Fixed-position dropdown (outside overflow-hidden) */}
      {menuOpen !== null && menuPos && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded-xl
            shadow-[0_4px_20px_rgba(0,0,0,0.12)] w-44 py-1"
          style={{ top: menuPos.top, right: menuPos.right }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const driver = drivers.find((d) => d.id === menuOpen);
            if (!driver) return null;
            return (
              <>
                <button
                  onClick={() => handleToggleActive(driver.id, driver.active)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  {driver.active
                    ? <><XCircle className="w-3.5 h-3.5 text-red-400" />Deactivate</>
                    : <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Activate</>}
                </button>
                <button
                  onClick={() => handleResetPassword(driver.id)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-400" />Reset Password
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Create Driver Account</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Driver ID and password are pre-filled — edit them as needed.
              </p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {/* Full name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Marcus Webb"
                  value={newName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={INPUT_CLS}
                  autoFocus
                />
              </div>
              {/* Driver ID */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Driver ID</label>
                <input
                  type="text"
                  placeholder="e.g. Marcus742"
                  value={newDriverId}
                  onChange={(e) => setNewDriverId(e.target.value)}
                  className={INPUT_CLS}
                />
                <p className="text-[11px] text-slate-400">Auto-generated from first name — you can edit it.</p>
              </div>
              {/* Temp password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Temp Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newTempPassword}
                    onChange={(e) => setNewTempPassword(e.target.value)}
                    className={INPUT_CLS + " pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">Driver changes this on first login.</p>
              </div>
              {/* Role */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                <div className="flex gap-2">
                  {(["driver", "management"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setNewRole(r)}
                      className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                        newRole === r
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !newDriverId.trim() || !newTempPassword.trim() || isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function CredentialRow({ label, value, onCopy, copied }: {
  label: string; value: string; onCopy: () => void; copied: boolean;
}) {
  return (
    <div className="bg-white rounded-lg border border-emerald-200 px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-[14px] font-mono font-semibold text-slate-800">{value}</p>
      </div>
      <button onClick={onCopy} className="p-1.5 rounded hover:bg-slate-100 transition-colors shrink-0">
        {copied
          ? <Check className="w-3.5 h-3.5 text-emerald-500" />
          : <Copy className="w-3.5 h-3.5 text-slate-400" />}
      </button>
    </div>
  );
}

"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import AppShell from "@/components/app-shell";
import {
  UserPlus, Search, MoreVertical, CheckCircle2,
  XCircle, Eye, EyeOff, Copy, Check, Loader2, Trash2, ShieldCheck, Truck, Clock, ChevronRight, MapPin,
} from "lucide-react";
import {
  getDrivers, createDriver, setDriverActive, setDriverRole, assignDriverVehicle, resetDriverPassword, deleteDriver, terminateDriver, purgeDriverRydeData, updateDriverUsername,
} from "@/lib/actions/drivers";
import { getVehicles } from "@/lib/actions/vehicles";
import { suggestDriverId } from "@/lib/driver-utils";

type Driver = {
  id: number;
  driverId: string;
  name: string;
  username: string | null;
  role: string;
  isAdmin: boolean;
  assignedVehicleId: number | null;
  active: boolean;
  loginDisabled: boolean;
  firstLoginAt: Date | null;
  createdAt: Date | null;
  terminationType: string | null;
  terminationNote: string | null;
  terminatedAt: Date | null;
};

type Vehicle = {
  id: number;
  unitNumber: string;
  make: string;
  model: string;
  year: number;
  active: boolean;
};

const INPUT_CLS = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px] text-slate-800 placeholder-slate-300 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner", co_owner: "Co-Owner", developer: "Developer", bc: "Business Contact", driver: "Driver",
};
const ROLE_COLORS: Record<string, string> = {
  owner:     "bg-violet-50 text-violet-700 border-violet-200/80",
  co_owner:  "bg-blue-50 text-blue-700 border-blue-200/80",
  developer: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  bc:        "bg-amber-50 text-amber-700 border-amber-200/80",
  driver:    "bg-slate-100 text-slate-600 border-slate-200/80",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[role] ?? ROLE_COLORS.driver}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleTarget, setVehicleTarget] = useState<{ id: number; name: string; current: number | null } | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriverId, setNewDriverId] = useState("");
  const [newTempPassword, setNewTempPassword] = useState("Fedex1234#");
  const [newRole, setNewRole] = useState<"driver" | "bc">("driver");
  const [myRole, setMyRole] = useState<string>("bc");
  const [roleMenuOpen, setRoleMenuOpen] = useState<number | null>(null);
  const [created, setCreated] = useState<{ driverId: string; password: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [resetTarget, setResetTarget]   = useState<{ id: number; driverId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; driverId: string; name: string } | null>(null);
  const [terminationType, setTerminationType] = useState<"notice" | "fired" | "mistake" | null>(null);
  const [terminationNote, setTerminationNote] = useState("");
  const [purgeRydeData, setPurgeRydeData] = useState(true);
  const [resetPassword, setResetPassword] = useState("Fedex1234#");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [usernameTarget, setUsernameTarget] = useState<{ id: number; name: string; current: string | null } | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [isPending, startTransition] = useTransition();
  const [locationTarget, setLocationTarget] = useState<{ id: number; driverId: string; name: string } | null>(null);
  const [availableLocations, setAvailableLocations] = useState<{ id: number; name: string }[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  async function refresh() {
    const [driverData, vehicleData] = await Promise.all([getDrivers(), getVehicles()]);
    setDrivers(driverData as Driver[]);
    setVehicles(vehicleData as Vehicle[]);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    fetch("/api/me").then(r => r.json()).then(d => { if (d.role) setMyRole(d.role); }).catch(() => {});
  }, []);

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

  function handleToggleActive(id: number, loginDisabled: boolean) {
    startTransition(async () => {
      await setDriverActive(id, !loginDisabled);
      setMenuOpen(null);
      setMenuPos(null);
      await refresh();
    });
  }

  function handleSetRole(id: number, role: "driver" | "bc" | "co_owner" | "developer") {
    startTransition(async () => {
      await setDriverRole(id, role);
      setMenuOpen(null);
      setMenuPos(null);
      setRoleMenuOpen(null);
      await refresh();
    });
  }

  function openVehicleModal(driver: Driver) {
    setVehicleTarget({ id: driver.id, name: driver.name, current: driver.assignedVehicleId });
    setSelectedVehicleId(driver.assignedVehicleId?.toString() ?? "");
    setMenuOpen(null);
    setMenuPos(null);
  }

  function handleAssignVehicle() {
    if (!vehicleTarget) return;
    startTransition(async () => {
      const vid = selectedVehicleId ? parseInt(selectedVehicleId) : null;
      await assignDriverVehicle(vehicleTarget.id, vid);
      setVehicleTarget(null);
      await refresh();
    });
  }

  function openResetModal(id: number) {
    const driver = drivers.find((d) => d.id === id);
    setResetTarget({ id, driverId: driver?.driverId ?? "" });
    setResetPassword("Fedex1234#");
    setShowResetPassword(false);
    setMenuOpen(null);
    setMenuPos(null);
  }

  function handleResetPassword() {
    if (!resetTarget || !resetPassword.trim()) return;
    startTransition(async () => {
      const result = await resetDriverPassword(resetTarget.id, resetPassword.trim());
      setCreated({ driverId: resetTarget.driverId, password: result.tempPassword });
      setResetTarget(null);
      setShowPassword(false);
    });
  }

  function openUsernameModal(driver: Driver) {
    setUsernameTarget({ id: driver.id, name: driver.name, current: driver.username });
    setNewUsername(driver.username ?? "");
    setMenuOpen(null);
    setMenuPos(null);
  }

  function handleUpdateUsername() {
    if (!usernameTarget) return;
    startTransition(async () => {
      await updateDriverUsername(usernameTarget.id, newUsername.trim());
      setUsernameTarget(null);
      await refresh();
    });
  }

  function openDeleteModal(driver: { id: number; driverId: string; name: string }) {
    setDeleteTarget(driver);
    setTerminationType(null);
    setTerminationNote("");
    setPurgeRydeData(true);
    setMenuOpen(null);
    setMenuPos(null);
  }

  function handleDeleteDriver() {
    if (!deleteTarget || !terminationType) return;
    startTransition(async () => {
      if (terminationType === "mistake") {
        await deleteDriver(deleteTarget.id);
      } else {
        await terminateDriver(deleteTarget.id, terminationType, terminationNote);
        if (purgeRydeData) await purgeDriverRydeData(deleteTarget.id);
      }
      setDeleteTarget(null);
      setTerminationType(null);
      setTerminationNote("");
      setPurgeRydeData(true);
      await refresh();
    });
  }

  async function openLocationModal(driver: Driver) {
    setLocationTarget({ id: driver.id, driverId: driver.driverId, name: driver.name });
    setSelectedLocationIds([]);
    setLocationsLoading(true);
    setMenuOpen(null);
    setMenuPos(null);
    const [locsRes, assignedRes] = await Promise.all([
      fetch("/api/locations"),
      fetch(`/api/user-locations?userId=${encodeURIComponent(driver.driverId)}`),
    ]);
    const locs = await locsRes.json();
    const assigned = await assignedRes.json();
    setAvailableLocations(locs);
    setSelectedLocationIds(Array.isArray(assigned) ? assigned : []);
    setLocationsLoading(false);
  }

  function toggleLocation(id: number) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleSaveLocations() {
    if (!locationTarget) return;
    startTransition(async () => {
      await fetch("/api/user-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: locationTarget.driverId, locationIds: selectedLocationIds }),
      });
      setLocationTarget(null);
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

  const active   = drivers.filter((d) => !d.loginDisabled).length;
  const inactive = drivers.filter((d) => d.loginDisabled).length;

  return (
    <AppShell>
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
              MyGroundOps · Admin
            </p>
            <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
              Accounts
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
              <table className="w-full text-[13px] min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-6 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-[110px]">Driver ID</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell w-[140px]">Role</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell w-[90px]">Created</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell w-[90px]">Vehicle</th>
                    <th className="text-left px-3 py-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider w-[160px]">Status</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((driver) => (
                    <tr key={driver.id}
                      className="border-b border-slate-100/80 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-mono text-[12px] text-slate-500 font-semibold whitespace-nowrap">
                        {driver.driverId}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-800">{driver.name}</p>
                        {driver.username && (
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">@{driver.username}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell">
                        <RoleBadge role={driver.role} />
                      </td>
                      <td className="px-3 py-3 text-slate-400 whitespace-nowrap hidden md:table-cell">
                        {driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {(() => {
                          const v = vehicles.find((v) => v.id === driver.assignedVehicleId);
                          return v ? (
                            <span className="text-[12px] font-semibold text-slate-700 flex items-center gap-1.5">
                              <Truck className="w-3.5 h-3.5 text-slate-400" />
                              {v.unitNumber}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-300">—</span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {driver.loginDisabled
                              ? <XCircle className="w-3.5 h-3.5 text-red-400" />
                              : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                            <span className={`text-[12px] font-semibold whitespace-nowrap ${driver.loginDisabled ? "text-red-500" : "text-emerald-600"}`}>
                              {driver.loginDisabled ? "Login Disabled" : driver.terminationType ? (
                                driver.terminationType === "notice" ? "Gave Notice" :
                                driver.terminationType === "fired" ? "Terminated" : "Removed"
                              ) : "Login Enabled"}
                            </span>
                          </div>
                          {driver.terminationNote && (
                            <p className="text-[11px] text-slate-400 italic truncate max-w-[140px]" title={driver.terminationNote}>
                              {driver.terminationNote}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5">
                            {driver.firstLoginAt
                              ? <Check className="w-3 h-3 text-blue-500" />
                              : <Clock className="w-3 h-3 text-slate-300" />}
                            <span className={`text-[11px] whitespace-nowrap ${driver.firstLoginAt ? "text-blue-600 font-semibold" : "text-slate-300"}`}>
                              {driver.firstLoginAt
                                ? `Logged in ${new Date(driver.firstLoginAt).toLocaleDateString()}`
                                : "Never logged in"}
                            </span>
                          </div>
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
                  onClick={() => handleToggleActive(driver.id, driver.loginDisabled)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  {driver.loginDisabled
                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Enable Login</>
                    : <><XCircle className="w-3.5 h-3.5 text-red-400" />Disable Login</>}
                </button>
                {driver.role !== "owner" && (myRole === "owner" || (myRole === "co_owner" && driver.role !== "co_owner" && driver.role !== "developer")) && (
                  <div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setRoleMenuOpen(roleMenuOpen === driver.id ? null : driver.id); }}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      Set Role
                      <ChevronRight className={`w-3 h-3 text-slate-300 ml-auto transition-transform ${roleMenuOpen === driver.id ? "rotate-90" : ""}`} />
                    </button>
                    {roleMenuOpen === driver.id && (
                      <div className="border-t border-slate-100 bg-slate-50">
                        {(["driver", "bc", ...(myRole === "owner" ? ["co_owner", "developer"] : [])] as Array<"driver" | "bc" | "co_owner" | "developer">).map((r) => (
                          <button
                            key={r}
                            onClick={(e) => { e.stopPropagation(); handleSetRole(driver.id, r); }}
                            className={`w-full text-left pl-8 pr-4 py-2 text-[12px] font-semibold transition-colors hover:bg-slate-100 flex items-center gap-2 ${driver.role === r ? "text-slate-900" : "text-slate-500"}`}
                          >
                            {driver.role === r
                              ? <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              : <span className="w-3 flex-shrink-0" />}
                            {ROLE_LABELS[r]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => openVehicleModal(driver)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Truck className="w-3.5 h-3.5 text-slate-400" />Assign Vehicle
                </button>
                <button
                  onClick={() => openResetModal(driver.id)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-400" />Reset Password
                </button>
                <button
                  onClick={() => openUsernameModal(driver)}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                    hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />Change Username
                </button>
                {driver.role === "bc" && (
                  <button
                    onClick={() => openLocationModal(driver)}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700
                      hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />Manage Locations
                  </button>
                )}
                <button
                  onClick={() => openDeleteModal({ id: driver.id, driverId: driver.driverId, name: driver.name })}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-red-500
                    hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />Remove Account
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Reset Password</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Set a new temporary password for <span className="font-semibold text-slate-600">{resetTarget.driverId}</span>
              </p>
            </div>
            <div className="px-6 py-5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">New Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showResetPassword ? "text" : "password"}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className={INPUT_CLS + " pr-10"}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Driver will be prompted to change this on first login.</p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPassword}
                disabled={!resetPassword.trim() || isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Termination modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Remove Driver Account</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                <span className="font-semibold text-slate-600">{deleteTarget.name}</span> ({deleteTarget.driverId}) — what&apos;s the reason?
              </p>
            </div>

            <div className="px-6 py-5 flex flex-col gap-3">
              {/* Type selection */}
              {(["notice", "fired", "mistake"] as const).map((type) => {
                const labels = {
                  notice:  { title: "Two Weeks Notice", sub: "Driver gave notice — record kept for history" },
                  fired:   { title: "Terminated",       sub: "Let go or fired — record kept with reason" },
                  mistake: { title: "Account Mistake",  sub: "Created in error — permanently deleted" },
                };
                const selected = terminationType === type;
                return (
                  <button
                    key={type}
                    onClick={() => { setTerminationType(type); setTerminationNote(""); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                      selected
                        ? type === "mistake"
                          ? "border-red-400 bg-red-50"
                          : "border-slate-800 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className={`text-[13px] font-bold ${selected ? (type === "mistake" ? "text-red-700" : "text-slate-900") : "text-slate-700"}`}>
                      {labels[type].title}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{labels[type].sub}</p>
                  </button>
                );
              })}

              {/* Detail fields */}
              {terminationType === "notice" && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Last Day / Note (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Last day July 15"
                    value={terminationNote}
                    onChange={(e) => setTerminationNote(e.target.value)}
                    className={INPUT_CLS}
                    autoFocus
                  />
                </div>
              )}
              {terminationType === "fired" && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reason <span className="text-red-400">*</span></label>
                  <textarea
                    rows={2}
                    placeholder="e.g. No call no show on June 30, policy violation..."
                    value={terminationNote}
                    onChange={(e) => setTerminationNote(e.target.value)}
                    className={INPUT_CLS + " resize-none"}
                    autoFocus
                  />
                </div>
              )}
              {(terminationType === "fired" || terminationType === "notice") && (
                <label className="flex items-center gap-3 cursor-pointer select-none mt-1 px-1">
                  <input
                    type="checkbox"
                    checked={purgeRydeData}
                    onChange={(e) => setPurgeRydeData(e.target.checked)}
                    className="w-4 h-4 accent-red-500 cursor-pointer"
                  />
                  <span className="text-[12px] text-slate-600 font-medium">
                    Delete RYDE scores &amp; reviews for this driver
                  </span>
                </label>
              )}
              {terminationType === "mistake" && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[12px] text-red-700">
                  This will permanently delete the account and all associated data. This cannot be undone.
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => { setDeleteTarget(null); setTerminationType(null); setTerminationNote(""); setPurgeRydeData(true); }}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDriver}
                disabled={!terminationType || (terminationType === "fired" && !terminationNote.trim()) || isPending}
                className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40
                  flex items-center justify-center gap-2 ${
                    terminationType === "mistake"
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-slate-900 text-white hover:bg-slate-700"
                  }`}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {terminationType === "mistake" ? "Delete Permanently" : terminationType ? "Confirm & Remove" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign vehicle modal */}
      {vehicleTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Assign Vehicle</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Choose a vehicle for <span className="font-semibold text-slate-600">{vehicleTarget.name}</span>
              </p>
            </div>
            <div className="px-6 py-5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Vehicle</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className={INPUT_CLS + " mt-1.5"}
              >
                <option value="">— None (Coming Soon) —</option>
                {vehicles.filter((v) => v.active).map((v) => (
                  <option key={v.id} value={v.id.toString()}>
                    {v.unitNumber} — {v.year} {v.make} {v.model}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Driver sees vehicle info on their dashboard. &quot;None&quot; shows Coming Soon.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setVehicleTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVehicle}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change username modal */}
      {usernameTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Change Username</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Update login username for <span className="font-semibold text-slate-600">{usernameTarget.name}</span>
              </p>
            </div>
            <div className="px-6 py-5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. marcus.webb"
                className={INPUT_CLS + " mt-1.5"}
                autoFocus
              />
              <p className="text-[11px] text-slate-400 mt-1.5">Leave blank to remove the username.</p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setUsernameTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateUsername}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
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
                  {(["driver", "bc"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setNewRole(r)}
                      className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                        newRole === r
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                      }`}
                    >
                      {ROLE_LABELS[r]}
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
      {/* Location assignment modal */}
      {locationTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.25)] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-[16px] font-extrabold text-slate-900">Manage Locations</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Assign locations for <span className="font-semibold text-slate-600">{locationTarget.name}</span>
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Locations</p>
              {locationsLoading ? (
                <div className="flex items-center gap-2 text-slate-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[13px]">Loading...</span>
                </div>
              ) : availableLocations.length === 0 ? (
                <p className="text-[12px] text-slate-400 italic">
                  No locations set up yet — add them in Settings
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {availableLocations.map((loc) => (
                    <label
                      key={loc.id}
                      className="flex items-center gap-3 cursor-pointer select-none px-1 py-1 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLocationIds.includes(loc.id)}
                        onChange={() => toggleLocation(loc.id)}
                        className="w-4 h-4 accent-amber-500 cursor-pointer"
                      />
                      <span className="text-[13px] text-slate-700 font-medium">{loc.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-4 italic">
                BCs only see data for their assigned locations
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setLocationTarget(null)}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold border border-slate-200
                  text-slate-500 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLocations}
                disabled={isPending || locationsLoading}
                className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold bg-slate-900 text-white
                  hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save
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

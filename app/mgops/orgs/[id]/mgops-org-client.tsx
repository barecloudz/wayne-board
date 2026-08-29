"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Org = {
  id: number;
  name: string;
  slug: string;
  plan: string;
  subscriptionStatus: string;
  logoUrl: string | null;
  demoMode: boolean;
  demoExpiresAt: Date | null;
  superAdminNote: string | null;
  trialEndsAt: Date | null;
  createdAt: Date | null;
};

export default function MgopsOrgClient({ org }: { org: Org }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(org.superAdminNote ?? "");
  const [demoMode, setDemoMode] = useState(org.demoMode);
  const [demoExpiry, setDemoExpiry] = useState(
    org.demoExpiresAt ? new Date(org.demoExpiresAt).toISOString().split("T")[0] : ""
  );
  const [indefinite, setIndefinite] = useState(!org.demoExpiresAt && org.demoMode);
  const [status, setStatus] = useState(org.subscriptionStatus);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: object) {
    setSaving(true);
    await fetch(`/api/mgops/orgs/${org.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleSaveDemo() {
    await patch({
      demoMode,
      demoExpiresAt: demoMode && !indefinite && demoExpiry ? demoExpiry : null,
    });
  }

  async function handleSaveNote() {
    await patch({ superAdminNote: note });
  }

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus);
    await patch({ subscriptionStatus: newStatus });
  }

  async function handleDelete() {
    await fetch(`/api/mgops/orgs/${org.id}`, { method: "DELETE" });
    router.push("/mgops/orgs");
  }

  const card = "rounded-2xl p-5 mb-4";
  const cardStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" };
  const inputStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 13, width: "100%" };
  const btnGreen = { background: "#16A34A", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" };
  const btnGhost = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/mgops/orgs" className="text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>← Orgs</Link>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
        <h1 className="text-[20px] font-extrabold text-white">{org.name}</h1>
      </div>

      {/* Info */}
      <div className={card} style={cardStyle}>
        <h2 className="text-[13px] font-bold mb-3" style={{ color: "#4ADE80" }}>Details</h2>
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          {[
            ["Slug", org.slug],
            ["Plan", org.plan],
            ["Status", org.subscriptionStatus],
            ["Created", org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"],
            ["Trial ends", org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span style={{ color: "rgba(255,255,255,0.35)" }}>{k}</span>
              <span className="text-white font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Access Control */}
      <div className={card} style={cardStyle}>
        <h2 className="text-[13px] font-bold mb-3" style={{ color: "#4ADE80" }}>Access</h2>
        <div className="flex gap-2 flex-wrap">
          {["active", "trialing", "past_due", "canceled"].map(s => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              style={status === s ? btnGreen : btnGhost}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Demo Mode */}
      <div className={card} style={cardStyle}>
        <h2 className="text-[13px] font-bold mb-3" style={{ color: "#4ADE80" }}>Demo Mode</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={demoMode} onChange={e => setDemoMode(e.target.checked)} className="w-4 h-4" />
            <span className="text-[13px] text-white">Enable demo mode (bypasses paywall)</span>
          </label>
          {demoMode && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={indefinite} onChange={e => setIndefinite(e.target.checked)} className="w-4 h-4" />
                <span className="text-[13px] text-white">Until further notice</span>
              </label>
              {!indefinite && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>Expires on</label>
                  <input
                    type="date"
                    value={demoExpiry}
                    onChange={e => setDemoExpiry(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}
            </>
          )}
          <button onClick={handleSaveDemo} style={btnGreen} disabled={saving}>
            {saving ? "Saving…" : "Save Demo Settings"}
          </button>
        </div>
      </div>

      {/* Note */}
      <div className={card} style={cardStyle}>
        <h2 className="text-[13px] font-bold mb-3" style={{ color: "#4ADE80" }}>Internal Note</h2>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="Notes about this contractor..."
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <button onClick={handleSaveNote} style={{ ...btnGreen, marginTop: 10 }} disabled={saving}>
          Save Note
        </button>
      </div>

      {/* Danger */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <h2 className="text-[13px] font-bold mb-3 text-red-400">Danger Zone</h2>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>
            Delete Organization
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-red-400">This cannot be undone. All data deleted.</span>
            <button onClick={handleDelete} style={{ background: "#dc2626", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Confirm Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} style={btnGhost}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

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

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #E2E8F0",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
};
const inputStyle: React.CSSProperties = {
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#0F172A",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 13,
  width: "100%",
  outline: "none",
};
const btnGreen: React.CSSProperties = { background: "#16A34A", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "#fff", border: "1px solid #E2E8F0", color: "#475569", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" };

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
    await patch({ demoMode, demoExpiresAt: demoMode && !indefinite && demoExpiry ? demoExpiry : null });
  }
  async function handleSaveNote() { await patch({ superAdminNote: note }); }
  async function handleStatusChange(newStatus: string) { setStatus(newStatus); await patch({ subscriptionStatus: newStatus }); }
  async function handleDelete() {
    await fetch(`/api/mgops/orgs/${org.id}`, { method: "DELETE" });
    router.push("/mgops/orgs");
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/mgops/orgs" className="text-[13px] font-medium" style={{ color: "#94A3B8" }}>← Orgs</Link>
        <span style={{ color: "#CBD5E1" }}>/</span>
        <h1 className="text-[20px] font-extrabold" style={{ color: "#0F172A" }}>{org.name}</h1>
      </div>

      {/* Details */}
      <div style={cardStyle}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#16A34A" }}>Details</h2>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          {[
            ["Slug", org.slug],
            ["Plan", org.plan],
            ["Status", org.subscriptionStatus],
            ["Created", org.createdAt ? new Date(org.createdAt).toLocaleDateString() : "—"],
            ["Trial ends", org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span style={{ color: "#94A3B8" }}>{k}</span>
              <span className="font-semibold" style={{ color: "#0F172A" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Access */}
      <div style={cardStyle}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#16A34A" }}>Access Control</h2>
        <div className="flex gap-2 flex-wrap">
          {["active", "trialing", "past_due", "canceled"].map(s => (
            <button key={s} onClick={() => handleStatusChange(s)} style={status === s ? btnGreen : btnGhost}>{s}</button>
          ))}
        </div>
      </div>

      {/* Demo Mode */}
      <div style={cardStyle}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#16A34A" }}>Demo Mode</h2>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={demoMode} onChange={e => setDemoMode(e.target.checked)} className="w-4 h-4 accent-green-600" />
            <span className="text-[13px]" style={{ color: "#0F172A" }}>Enable demo mode (bypasses paywall)</span>
          </label>
          {demoMode && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={indefinite} onChange={e => setIndefinite(e.target.checked)} className="w-4 h-4 accent-green-600" />
                <span className="text-[13px]" style={{ color: "#0F172A" }}>Until further notice</span>
              </label>
              {!indefinite && (
                <div className="flex flex-col gap-1">
                  <label className="text-[12px]" style={{ color: "#64748B" }}>Expires on</label>
                  <input type="date" value={demoExpiry} onChange={e => setDemoExpiry(e.target.value)} style={inputStyle} />
                </div>
              )}
            </>
          )}
          <button onClick={handleSaveDemo} style={btnGreen} disabled={saving}>{saving ? "Saving…" : "Save Demo Settings"}</button>
        </div>
      </div>

      {/* Note */}
      <div style={cardStyle}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#16A34A" }}>Internal Note</h2>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Notes about this contractor..." style={{ ...inputStyle, resize: "vertical" }} />
        <button onClick={handleSaveNote} style={{ ...btnGreen, marginTop: 10 }} disabled={saving}>Save Note</button>
      </div>

      {/* Danger */}
      <div style={{ background: "#FFF5F5", border: "1px solid #FED7D7", borderRadius: 16, padding: 20 }}>
        <h2 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "#DC2626" }}>Danger Zone</h2>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ ...btnGhost, borderColor: "#FECACA", color: "#DC2626" }}>Delete Organization</button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px]" style={{ color: "#DC2626" }}>This cannot be undone.</span>
            <button onClick={handleDelete} style={{ background: "#DC2626", color: "#fff", padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Confirm Delete</button>
            <button onClick={() => setConfirmDelete(false)} style={btnGhost}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

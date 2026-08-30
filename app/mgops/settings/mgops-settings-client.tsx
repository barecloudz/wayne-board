"use client";
import { useState } from "react";
import Link from "next/link";

export default function MgopsSettingsClient({ current }: { current: Record<string, string> }) {
  const [amountStarter, setAmountStarter] = useState(current.plan_amount_starter ?? "99");
  const [amountPro, setAmountPro] = useState(current.plan_amount_pro ?? "199");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/mgops/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_amount_starter: amountStarter,
        plan_amount_pro: amountPro,
      }),
    });
    setSaving(false);
    setSaved(true);
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    width: "100%",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = { color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 4, display: "block" };
  const cardStyle: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, marginBottom: 16 };

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/mgops/orgs" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>← Orgs</Link>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
        <h1 className="text-[20px] font-extrabold text-white">Platform Settings</h1>
      </div>

      <form onSubmit={handleSave}>
        <div style={cardStyle}>
          <h2 style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Plan Pricing</h2>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginBottom: 16 }}>
            Prices are created dynamically in Stripe on signup. Change these to update what new subscribers are charged.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Starter ($/mo)</label>
              <input style={inputStyle} type="number" value={amountStarter} onChange={e => setAmountStarter(e.target.value)} placeholder="99" min="1" />
            </div>
            <div>
              <label style={labelStyle}>Pro ($/mo)</label>
              <input style={inputStyle} type="number" value={amountPro} onChange={e => setAmountPro(e.target.value)} placeholder="199" min="1" />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ background: "#16A34A", color: "#fff", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, width: "100%" }}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
        {saved && <p style={{ color: "#4ADE80", fontSize: 13, textAlign: "center", marginTop: 12 }}>✓ Saved</p>}
      </form>
    </div>
  );
}

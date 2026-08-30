"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NewOrgClient() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("starter");
  const [status, setStatus] = useState("trialing");
  const [ownerName, setOwnerName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [indefinite, setIndefinite] = useState(true);
  const [demoExpiry, setDemoExpiry] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleCompanyNameChange(val: string) {
    setCompanyName(val);
    setSlug(toSlug(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/mgops/orgs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName,
        slug,
        plan,
        subscriptionStatus: demoMode ? "trialing" : status,
        ownerName,
        driverId,
        password,
        demoMode,
        demoExpiresAt: demoMode && !indefinite && demoExpiry ? demoExpiry : null,
        superAdminNote: note || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    router.push(`/mgops/orgs/${data.id}`);
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
        <h1 className="text-[20px] font-extrabold text-white">New Organization</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-0">

        {/* Org details */}
        <div style={cardStyle}>
          <h2 style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Organization</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label style={labelStyle}>Company Name</label>
              <input style={inputStyle} value={companyName} onChange={e => handleCompanyNameChange(e.target.value)} placeholder="Acme Logistics LLC" required />
            </div>
            <div>
              <label style={labelStyle}>Login URL Slug</label>
              <input style={inputStyle} value={slug} onChange={e => setSlug(e.target.value)} placeholder="acme-logistics" required />
              {slug && (
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 4 }}>
                  mygroundops.com/login/{slug}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={labelStyle}>Plan</label>
                <select style={inputStyle} value={plan} onChange={e => setPlan(e.target.value)}>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="trialing">Trialing</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Internal Note (optional)</label>
              <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Apparo demo — indefinite access" />
            </div>
          </div>
        </div>

        {/* Demo mode */}
        <div style={cardStyle}>
          <h2 style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Demo Mode</h2>
          <div className="flex flex-col gap-3">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={demoMode} onChange={e => setDemoMode(e.target.checked)} />
              <span style={{ color: "#fff", fontSize: 13 }}>Enable demo mode (bypasses paywall)</span>
            </label>
            {demoMode && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={indefinite} onChange={e => setIndefinite(e.target.checked)} />
                  <span style={{ color: "#fff", fontSize: 13 }}>Until further notice</span>
                </label>
                {!indefinite && (
                  <div>
                    <label style={labelStyle}>Expires on</label>
                    <input type="date" style={inputStyle} value={demoExpiry} onChange={e => setDemoExpiry(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Owner account */}
        <div style={cardStyle}>
          <h2 style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Owner / Admin Account</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Blake Wayne" required />
            </div>
            <div>
              <label style={labelStyle}>FedEx Driver ID</label>
              <input style={inputStyle} value={driverId} onChange={e => setDriverId(e.target.value)} placeholder="1234567" required />
            </div>
            <div>
              <label style={labelStyle}>Password (visible — copy for them)</label>
              <input style={inputStyle} type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="min 8 characters" required />
            </div>
          </div>
        </div>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={saving}
          style={{ background: "#16A34A", color: "#fff", padding: "12px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Creating…" : "Create Organization"}
        </button>
      </form>
    </div>
  );
}

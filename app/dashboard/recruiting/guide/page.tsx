export default function RecruitingGuidePage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; background: white; }
        @media print {
          @page { size: letter; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Print button */}
      <div className="no-print" style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: "#0f172a", color: "white", border: "none", borderRadius: 10,
            padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Save as PDF ↓
        </button>
      </div>

      <div style={{ fontFamily: "Inter, sans-serif", background: "white", maxWidth: 816, margin: "0 auto" }}>

        {/* ── PAGE 1 ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: "64px 72px 56px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

          {/* Header bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 56 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 16, height: 16, border: "2.5px solid white", borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>MyGroundOps</span>
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Recruiting Module — Overview
            </span>
          </div>

          {/* Hero */}
          <div style={{ marginBottom: 48 }}>
            <div style={{
              display: "inline-block", background: "#f1f5f9", borderRadius: 6,
              padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#64748b",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16,
            }}>
              New Feature
            </div>
            <h1 style={{ fontSize: 44, fontWeight: 900, color: "#0f172a", lineHeight: 1.05, letterSpacing: "-1px", marginBottom: 18 }}>
              One screen.<br />Every candidate.
            </h1>
            <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.6, maxWidth: 520 }}>
              The Recruiting module replaces color-coded spreadsheets with a live pipeline
              visible from any phone or computer — so nothing falls through the cracks on a busy morning.
            </p>
          </div>

          {/* Value stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
            {[
              { num: "5", label: "Clear stages", sub: "from first contact to hired driver" },
              { num: "0", label: "Spreadsheets", sub: "everything lives in the dashboard" },
              { num: "Live", label: "Notifications", sub: "banner alerts across all pages" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "#f8fafc", borderRadius: 14, padding: "20px 20px 18px",
                border: "1.5px solid #e2e8f0",
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>{s.num}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginTop: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Pipeline flow */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
              The Hiring Pipeline
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              {[
                { label: "Screening", bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
                { label: "Road Test Ready", bg: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
                { label: "Road Test Scheduled", bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6" },
                { label: "Ride-Alongs", bg: "#f5f3ff", text: "#4c1d95", dot: "#7c3aed" },
                { label: "Hired", bg: "#ecfdf5", text: "#064e3b", dot: "#10b981" },
              ].map((stage, i, arr) => (
                <div key={stage.label} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : "none" }}>
                  <div style={{
                    background: stage.bg, borderRadius: 8, padding: "8px 14px",
                    display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: stage.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: stage.text, whiteSpace: "nowrap" }}>{stage.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: "#e2e8f0", minWidth: 8 }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 20, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#cbd5e1" }}>MyGroundOps — Confidential</span>
            <span style={{ fontSize: 11, color: "#cbd5e1" }}>Page 1 of 2</span>
          </div>
        </div>

        {/* ── PAGE 2 ─────────────────────────────────────────────────────────── */}
        <div className="page-break" style={{ padding: "64px 72px 56px", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>MyGroundOps</span>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Stage Breakdown
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 36 }}>
            {[
              {
                num: "01", label: "Screening", borderColor: "#94a3b8", bg: "#f8fafc",
                what: "Candidate is added to the pipeline.",
                action: "Run the background check. Once it passes, pick a proposed road test date — a notification goes to the manager automatically.",
                badge: { bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" },
              },
              {
                num: "02", label: "Road Test Ready", borderColor: "#f59e0b", bg: "#fffdf5",
                what: "Background check cleared. Road test date has been proposed.",
                action: "Manager logs in, confirms (or adjusts) the date, and adds a note — e.g. \"8am at the station.\" Candidate moves forward.",
                badge: { bg: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
              },
              {
                num: "03", label: "Road Test Scheduled", borderColor: "#3b82f6", bg: "#f8fbff",
                what: "Date is confirmed. Candidate is coming in.",
                action: "After the road test, tap Mark Road Test Passed. They move to ride-alongs automatically.",
                badge: { bg: "#eff6ff", text: "#1e40af", dot: "#3b82f6" },
              },
              {
                num: "04", label: "Ride-Alongs", borderColor: "#7c3aed", bg: "#faf8ff",
                what: "Candidate is shadowing a driver out on route.",
                action: "Mark drug test and medical card as results come in. Once both pass, tap Hire — the system creates a driver account and temporary login automatically.",
                badge: { bg: "#f5f3ff", text: "#4c1d95", dot: "#7c3aed" },
              },
              {
                num: "05", label: "Hired", borderColor: "#10b981", bg: "#f5fdf9",
                what: "Driver account created. They can log in on day one.",
                action: "Hand them the username and temporary password shown on the card. Update their FedEx ID from the driver profile once assigned.",
                badge: { bg: "#ecfdf5", text: "#064e3b", dot: "#10b981" },
              },
            ].map((stage) => (
              <div key={stage.label} style={{
                display: "flex", borderRadius: 12, overflow: "hidden",
                border: "1.5px solid #e2e8f0", background: stage.bg,
              }}>
                <div style={{ width: 4, background: stage.borderColor, flexShrink: 0 }} />
                <div style={{ padding: "14px 18px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#cbd5e1", letterSpacing: "0.06em" }}>STEP {stage.num}</span>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: stage.badge.bg, borderRadius: 20, padding: "3px 10px",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: stage.badge.dot }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: stage.badge.text }}>{stage.label}</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</span>
                      <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, marginTop: 2 }}>{stage.what}</p>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Action</span>
                      <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, marginTop: 2 }}>{stage.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "#0f172a", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "white", marginBottom: 6 }}>Live Notifications</div>
              <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
                A banner slides down at the top of any dashboard page when a new candidate is added or a road test is proposed. Each admin sees and clears their own.
              </p>
            </div>
            <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>Auto Driver Account</div>
              <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
                Hiring a candidate automatically creates their driver login with a temporary password — no manual setup required.
              </p>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 20, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#cbd5e1" }}>MyGroundOps — Confidential</span>
            <span style={{ fontSize: 11, color: "#cbd5e1" }}>Page 2 of 2</span>
          </div>
        </div>

      </div>
    </>
  );
}

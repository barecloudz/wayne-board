"use client";

export default function RecruitingGuidePage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { font-family: 'Inter', -apple-system, sans-serif; background: #f8fafc; color: #0f172a; -webkit-font-smoothing: antialiased; }
        @media print {
          @page { size: letter; margin: 0; }
          html, body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; break-before: page; }
        }
      `}</style>

      {/* Save button */}
      <div className="no-print" style={{ position: "fixed", top: 20, right: 20, zIndex: 100 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: "#0f172a", color: "white", border: "none", borderRadius: 12,
            padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "Inter, sans-serif", letterSpacing: "-0.2px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          }}
        >
          Save as PDF ↓
        </button>
      </div>

      <div style={{ fontFamily: "Inter, sans-serif", maxWidth: 816, margin: "0 auto", background: "white" }}>

        {/* ── PAGE 1 — COVER ─────────────────────────────────────────────── */}
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          background: "white", padding: "56px 64px 48px",
        }}>
          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, background: "#0f172a",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 18, height: 18, border: "2.5px solid white", borderRadius: 5 }} />
              </div>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.4px" }}>MyGroundOps</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Driver Recruiting SOP
              </span>
            </div>
          </div>

          {/* Hero */}
          <div style={{ marginBottom: 56 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#f1f5f9", borderRadius: 8, padding: "6px 14px",
              fontSize: 12, fontWeight: 700, color: "#475569",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 24,
            }}>
              Standard Operating Procedure
            </div>
            <h1 style={{
              fontSize: 52, fontWeight: 900, color: "#0f172a", lineHeight: 1.02,
              letterSpacing: "-1.5px", marginBottom: 20,
            }}>
              Hiring a driver,<br />step by step.
            </h1>
            <p style={{ fontSize: 18, color: "#475569", lineHeight: 1.65, maxWidth: 480, fontWeight: 400 }}>
              Every candidate moves through six clear stages — from application to their first day behind the wheel. No spreadsheets, no lost texts, no guessing where anyone stands.
            </p>
          </div>

          {/* Pipeline visual */}
          <div style={{ marginBottom: 48 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
              The Pipeline
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {[
                { label: "Application", bg: "#f1f5f9", text: "#334155", dot: "#94a3b8" },
                { label: "Clearances",  bg: "#fff7ed", text: "#9a3412", dot: "#f97316" },
                { label: "Training",    bg: "#f0f9ff", text: "#075985", dot: "#0ea5e9" },
                { label: "Road Test",   bg: "#fffbeb", text: "#92400e", dot: "#f59e0b" },
                { label: "Onboarding", bg: "#f5f3ff", text: "#4c1d95", dot: "#7c3aed" },
                { label: "Hired",       bg: "#ecfdf5", text: "#064e3b", dot: "#10b981" },
              ].map((s, i, arr) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : "none" }}>
                  <div style={{
                    background: s.bg, borderRadius: 8, padding: "9px 14px",
                    display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.text, whiteSpace: "nowrap" }}>{s.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: "#e2e8f0", minWidth: 6 }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 48 }}>
            {[
              { num: "6", label: "Stages", sub: "Application through first day" },
              { num: "15", label: "Tracked steps", sub: "Every FedEx requirement covered" },
              { num: "Live", label: "On any device", sub: "Phone, tablet, or computer" },
            ].map((s) => (
              <div key={s.label} style={{
                background: "#f8fafc", borderRadius: 16, padding: "22px 20px",
                border: "1.5px solid #e2e8f0",
              }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.num}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#334155", marginTop: 6 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3, lineHeight: 1.4 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>MyGroundOps — Confidential</span>
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>1 of 2</span>
          </div>
        </div>

        {/* ── PAGE 2 — STAGE BREAKDOWN ───────────────────────────────────── */}
        <div className="page-break" style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          background: "white", padding: "56px 64px 48px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>MyGroundOps</span>
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Stage Breakdown
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {[
              {
                num: "01", label: "Application",
                borderColor: "#94a3b8", bg: "#f8fafc",
                dot: "#94a3b8", pillBg: "#f1f5f9", pillText: "#334155",
                items: "FA Application · Background Check",
                what: "Candidate is added to the system. Collect the FA application and run the background check.",
                next: "When both pass — tap Move to Clearances.",
              },
              {
                num: "02", label: "Clearances",
                borderColor: "#f97316", bg: "#fff8f3",
                dot: "#f97316", pillBg: "#fff7ed", pillText: "#9a3412",
                items: "Drug Test · Physical · MEC Card Copy",
                what: "Medical clearances must be complete before the road test. All three items need to pass.",
                next: "When all three pass — tap Move to Training.",
              },
              {
                num: "03", label: "Training",
                borderColor: "#0ea5e9", bg: "#f7fcff",
                dot: "#0ea5e9", pillBg: "#f0f9ff", pillText: "#075985",
                items: "GC Set Up · GC Training Online · GC Certificate uploaded to FA",
                what: "Candidate completes GroundCloud setup and online training. Certificate is uploaded to FA.",
                next: "When all three pass — pick a road test date and tap Propose.",
              },
              {
                num: "04", label: "Road Test",
                borderColor: "#f59e0b", bg: "#fffdf5",
                dot: "#f59e0b", pillBg: "#fffbeb", pillText: "#92400e",
                items: "Road Test · Road Cert uploaded to FA",
                what: "Date is proposed and confirmed by a manager. Candidate comes in for the road test.",
                next: "After the road test passes — mark it and upload the road cert. Tap Move to Onboarding.",
              },
              {
                num: "05", label: "Onboarding",
                borderColor: "#7c3aed", bg: "#faf8ff",
                dot: "#7c3aed", pillBg: "#f5f3ff", pillText: "#4c1d95",
                items: "Offer Letter · FA Eligible · MBA Eligible · e-Verify · ADP · Gas Card",
                what: "Final paperwork and system access. Once the offer letter is signed, the Hire button appears.",
                next: "Tap Hire — the system creates their driver login with a temporary password automatically.",
              },
              {
                num: "06", label: "Hired",
                borderColor: "#10b981", bg: "#f4fdf8",
                dot: "#10b981", pillBg: "#ecfdf5", pillText: "#064e3b",
                items: "Driver account live",
                what: "Driver account is created. Username and temporary password are shown on screen.",
                next: "Hand them their login. Update their FedEx ID from the driver profile once it's assigned.",
              },
            ].map((stage) => (
              <div key={stage.label} style={{
                display: "flex", borderRadius: 14, overflow: "hidden",
                border: "1.5px solid #e2e8f0", background: stage.bg,
              }}>
                <div style={{ width: 5, background: stage.borderColor, flexShrink: 0 }} />
                <div style={{ padding: "15px 20px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#cbd5e1", letterSpacing: "0.08em" }}>STEP {stage.num}</span>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      background: stage.pillBg, borderRadius: 20, padding: "4px 12px",
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: stage.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: stage.pillText }}>{stage.label}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{stage.items}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 28px" }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>What it means</p>
                      <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{stage.what}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>What to do</p>
                      <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{stage.next}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Feature callouts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <div style={{ background: "#0f172a", borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 7 }}>Live Notifications</div>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.65 }}>
                A banner slides down at the top of any page when a new candidate is added or a road test is scheduled. Every admin sees and clears their own.
              </p>
            </div>
            <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 16, padding: "20px 22px" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 7 }}>Auto Driver Login</div>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65 }}>
                Tapping Hire instantly creates the driver&apos;s login — username and temporary password — no manual setup required.
              </p>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>MyGroundOps — Confidential</span>
            <span style={{ fontSize: 12, color: "#cbd5e1", fontWeight: 500 }}>2 of 2</span>
          </div>
        </div>

      </div>
    </>
  );
}

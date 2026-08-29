import Link from "next/link";
import Image from "next/image";
import {
  Truck, ClipboardList, Map, Users,
  ChevronRight, Check, Star, Shield, Zap
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0A0F1E", color: "#F8FAFC" }}>

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/5">
        <div className="flex items-center">
          <Image src="/logo-full.png" alt="MyGroundOps" width={180} height={48} className="object-contain" />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/driver" className="text-[13px] font-semibold text-white/40 hover:text-white transition-colors px-4 py-2">
            Driver Portal
          </Link>
          <Link href="/sign-in" className="text-[13px] font-semibold text-white/60 hover:text-white transition-colors px-4 py-2">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="text-[13px] font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Get Access
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center px-6 pt-24 pb-20">
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold mb-8 border"
          style={{ borderColor: "#16A34A40", background: "#16A34A15", color: "#4ADE80" }}
        >
          <Star className="w-3.5 h-3.5" />
          Built by a FedEx Ground contractor, for FedEx Ground contractors
        </div>

        <h1 className="text-[48px] md:text-[72px] font-extrabold tracking-tight leading-[1.05] max-w-4xl mb-6">
          Run your operation
          <br />
          <span style={{ color: "#16A34A" }}>like a pro.</span>
        </h1>

        <p className="text-[17px] md:text-[20px] max-w-2xl leading-relaxed mb-10" style={{ color: "rgba(248,250,252,0.5)" }}>
          MyGroundOps is the all-in-one platform built for FedEx Ground ISPs.
          Fleet management, driver scores, compliance forms, route ops — everything in one place.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="#pricing"
            className="flex items-center gap-2 px-7 py-4 rounded-xl text-[15px] font-bold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Get Access <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="#demo"
            className="flex items-center gap-2 px-7 py-4 rounded-xl text-[15px] font-semibold border transition-all hover:border-white/30"
            style={{ borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}
          >
            Watch Demo
          </Link>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-10 mt-16 pt-10 border-t w-full max-w-2xl"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {[
            { value: "17+", label: "Trucks managed" },
            { value: "100%", label: "MMR compliance" },
            { value: "1 platform", label: "Everything you need" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <span className="text-[28px] font-extrabold" style={{ color: "#4ADE80" }}>{s.value}</span>
              <span className="text-[12px] font-medium" style={{ color: "rgba(248,250,252,0.4)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEMO ─────────────────────────────────────────────────────────── */}
      <section id="demo" className="px-6 md:px-12 pb-24">
        <div
          className="max-w-5xl mx-auto rounded-3xl flex items-center justify-center"
          style={{
            background: "rgba(22,163,74,0.05)",
            border: "1px solid rgba(22,163,74,0.12)",
            minHeight: 380,
          }}
        >
          <div className="flex flex-col items-center gap-4 py-24">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(22,163,74,0.15)" }}
            >
              <Zap className="w-8 h-8" style={{ color: "#4ADE80" }} />
            </div>
            <p className="text-[22px] font-bold" style={{ color: "rgba(248,250,252,0.8)" }}>Demo coming soon</p>
            <p className="text-[14px]" style={{ color: "rgba(248,250,252,0.35)" }}>Full platform walkthrough video</p>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 pb-24 max-w-6xl mx-auto w-full">
        <div className="text-center mb-14">
          <p className="text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4ADE80" }}>Platform</p>
          <h2 className="text-[36px] md:text-[48px] font-extrabold tracking-tight">Everything your station needs</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            {
              icon: Truck,
              title: "Fleet Inspection",
              tag: "New",
              desc: "Interactive 3D truck viewer. Click tires, open the hood, log fluid levels and battery status. Every inspection timestamped and saved per unit.",
            },
            {
              icon: ClipboardList,
              title: "MMR Generator",
              tag: null,
              desc: "Auto-generate MGBA-355 Monthly Maintenance Records for all units. Pre-fills from your maintenance tracker. One click, submission-ready PDF.",
            },
            {
              icon: Star,
              title: "Driver Scores",
              tag: null,
              desc: "Drivers log in to see their Ryde scores and delivery stats. You get the full management dashboard with trends and comparisons.",
            },
            {
              icon: Map,
              title: "Route Operations",
              tag: "Beta",
              desc: "Manage daily routes with SID-based stop sequencing, geographic balancing, and dispatch integration.",
            },
            {
              icon: Users,
              title: "Driver Management",
              tag: null,
              desc: "Full driver profiles, FedEx ID tracking, performance history, and leaderboards. Know your top performers at a glance.",
            },
            {
              icon: Shield,
              title: "Compliance Tools",
              tag: null,
              desc: "Stay on top of FedEx compliance. MMR tracking, inspection records, and document management — always audit-ready.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-6 flex flex-col gap-4 border transition-colors"
              style={{ background: "rgba(255,255,255,0.025)", borderColor: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(22,163,74,0.15)" }}
                >
                  <f.icon className="w-5 h-5" style={{ color: "#4ADE80" }} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold text-white">{f.title}</span>
                  {f.tag && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                      style={{ background: "rgba(22,163,74,0.2)", color: "#4ADE80" }}
                    >
                      {f.tag}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[14px] leading-relaxed" style={{ color: "rgba(248,250,252,0.45)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 md:px-12 pb-32 max-w-5xl mx-auto w-full">
        <div className="text-center mb-14">
          <p className="text-[12px] font-bold uppercase tracking-widest mb-3" style={{ color: "#4ADE80" }}>Pricing</p>
          <h2 className="text-[36px] md:text-[48px] font-extrabold tracking-tight mb-3">Simple, flat pricing</h2>
          <p className="text-[16px]" style={{ color: "rgba(248,250,252,0.45)" }}>
            One price per station. No per-driver fees. No surprises.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              name: "Starter",
              price: "$99",
              period: "/mo",
              desc: "Perfect for smaller stations getting started.",
              features: ["Up to 10 vehicles", "MMR Generator", "Driver Portal", "Basic reporting"],
              highlight: false,
              cta: "Get Started",
              href: "/signup",
            },
            {
              name: "Pro",
              price: "$199",
              period: "/mo",
              desc: "Everything you need to run a full operation.",
              features: ["Unlimited vehicles", "3D Fleet Inspector", "Route Operations", "Driver Leaderboards", "Compliance Tools", "Priority support"],
              highlight: true,
              cta: "Get Started",
              href: "/signup",
            },
            {
              name: "Enterprise",
              price: "Custom",
              period: "",
              desc: "Multiple stations, custom integrations, white-glove setup.",
              features: ["Multiple stations", "Custom integrations", "Dedicated support", "Custom reporting", "SLA guarantee"],
              highlight: false,
              cta: "Contact Us",
              href: null,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className="rounded-2xl p-6 flex flex-col gap-5 border relative"
              style={{
                background: plan.highlight ? "rgba(22,163,74,0.08)" : "rgba(255,255,255,0.025)",
                borderColor: plan.highlight ? "#16A34A" : "rgba(255,255,255,0.06)",
              }}
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider"
                  style={{ background: "#16A34A", color: "#fff" }}
                >
                  Most Popular
                </div>
              )}
              <div>
                <p className="text-[13px] font-semibold mb-2" style={{ color: "#4ADE80" }}>{plan.name}</p>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-[40px] font-extrabold text-white leading-none">{plan.price}</span>
                  {plan.period && <span className="text-[14px] mb-1" style={{ color: "rgba(248,250,252,0.4)" }}>{plan.period}</span>}
                </div>
                <p className="text-[13px]" style={{ color: "rgba(248,250,252,0.45)" }}>{plan.desc}</p>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-[13px]" style={{ color: "rgba(248,250,252,0.7)" }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#4ADE80" }} />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.href ? (
                <Link
                  href={plan.href}
                  className="mt-2 block w-full py-3 rounded-xl text-[14px] font-bold text-center transition-all hover:opacity-90 active:scale-[0.98]"
                  style={
                    plan.highlight
                      ? { background: "#16A34A", color: "#fff" }
                      : { background: "rgba(255,255,255,0.06)", color: "rgba(248,250,252,0.75)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  className="mt-2 w-full py-3 rounded-xl text-[14px] font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(248,250,252,0.75)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  {plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer
        className="px-6 md:px-12 py-8 border-t flex flex-col md:flex-row items-center justify-between gap-4 text-[13px]"
        style={{ borderColor: "rgba(255,255,255,0.06)", color: "rgba(248,250,252,0.3)" }}
      >
        <div className="flex items-center gap-3">
          <Image src="/logo-icon.png" alt="MyGroundOps" width={28} height={28} className="object-contain rounded-lg" />
          <span>by Apparo Group INC</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/driver" className="hover:text-white/60 transition-colors">Driver Portal</Link>
          <Link href="/sign-in" className="hover:text-white/60 transition-colors">Sign In</Link>
          <span>&copy; {new Date().getFullYear()} Apparo Group INC</span>
        </div>
      </footer>

    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  Truck, ClipboardList, Map, Users,
  ChevronRight, Check, Star, Shield,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MyGroundOps: FedEx Ground ISP Management",
  description:
    "Driver scores, MMR compliance, fleet inspection, and route ops, one dashboard for FedEx Ground independent service providers.",
  openGraph: {
    title: "MyGroundOps",
    description:
      "Driver scores, MMR compliance, fleet inspection, and route ops, one dashboard for FedEx Ground ISPs.",
    url: "https://mygroundops.com",
    siteName: "MyGroundOps",
    images: [{ url: "/og-image.png", width: 2048, height: 1152, alt: "MyGroundOps: Your operation, under control." }],
    type: "website",
  },
};

const FEATURES = [
  {
    icon: Truck,
    title: "Fleet Inspection",
    desc: "Interactive 3D truck viewer with clickable tire and fluid hotspots. Every inspection is timestamped and stored per vehicle. Audits are never a scramble.",
  },
  {
    icon: ClipboardList,
    title: "MMR Generator",
    desc: "Auto-fill MGBA-355 Monthly Maintenance Records from your fleet data. One click produces a submission-ready PDF. No more manual entry.",
  },
  {
    icon: Star,
    title: "Driver Scores",
    desc: "RYDE, PPODA, ILS, and Spotlight scores in one place. Drivers check their own numbers. You track trends and catch problems before FedEx does.",
  },
  {
    icon: Map,
    title: "Route Operations",
    desc: "SID-based stop sequencing with geographic balancing. Move border stops between neighboring routes without breaking workload balance.",
  },
  {
    icon: Users,
    title: "Driver Management",
    desc: "Full profiles with FedEx ID, performance history, and a leaderboard. Know who's carrying their weight and who needs a conversation.",
  },
  {
    icon: Shield,
    title: "Compliance Tools",
    desc: "MMR tracking, inspection records, and document management in one place. Always ready for a compliance review. No scrambling the night before.",
  },
];

const METRICS = [
  { label: "ILS Impact",  value: "99.3%", sub: "company avg this week"    },
  { label: "Code 85",     value: "0",     sub: "unreported returns today"  },
  { label: "MMR Status",  value: "100%",  sub: "fleet compliance"          },
  { label: "RYDE Score",  value: "4.8 ★", sub: "customer rating"           },
];

const PLANS = [
  {
    name: "Starter",
    price: "$99",
    period: "/mo",
    desc: "For smaller stations getting started.",
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
    features: [
      "Unlimited vehicles",
      "3D Fleet Inspector",
      "Route Operations",
      "Driver Leaderboards",
      "Compliance Tools",
      "Priority support",
    ],
    highlight: true,
    cta: "Get Started",
    href: "/signup",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "Multiple stations, custom integrations.",
    features: [
      "Multiple stations",
      "Custom integrations",
      "Dedicated support",
      "Custom reporting",
      "SLA guarantee",
    ],
    highlight: false,
    cta: "Contact Us",
    href: null,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAFBF8", color: "#0A1A0E" }}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4"
        style={{
          background: "rgba(250,251,248,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #E5E7EB",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-full.png" alt="MyGroundOps" width={160} height={40} className="object-contain" />
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: "#6B7280" }}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all hover:opacity-90 active:scale-[0.97]"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Get Access
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 pt-16 pb-0 max-w-6xl mx-auto w-full">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] mb-7"
          style={{ color: "#16A34A" }}
        >
          Built for FedEx Ground ISPs
        </p>

        <h1
          className="font-black leading-[0.93] tracking-tight mb-6"
          style={{ fontSize: "clamp(42px, 8vw, 80px)", color: "#0A1A0E" }}
        >
          Your operation,
          <br />
          <span style={{ color: "#16A34A" }}>under control.</span>
        </h1>

        <p
          className="text-[16px] md:text-[18px] leading-relaxed mb-8 max-w-lg"
          style={{ color: "#475569" }}
        >
          Driver scores, MMR compliance, fleet inspection, and route ops.
          one dashboard built by an ISP owner who knows exactly what you deal
          with every morning.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-14 max-w-xs sm:max-w-none">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-bold transition-all hover:opacity-90 active:scale-[0.97]"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Get Access <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="#features"
            className="inline-flex items-center justify-center text-[15px] font-semibold px-5 py-3.5 rounded-xl border transition-all hover:border-slate-400"
            style={{ borderColor: "#D1D5DB", color: "#374151" }}
          >
            See what&apos;s inside
          </Link>
        </div>

        {/* ── METRIC STRIP ── Signature element: real FedEx Ground metrics ───── */}
        <div style={{ borderTop: "1px solid #E5E7EB" }}>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {METRICS.map((m, i) => (
              <div
                key={m.label}
                className="flex flex-col gap-1 py-6 px-5 md:px-8"
                style={{
                  borderLeft:   i % 2 === 1 ? "1px solid #E5E7EB" : "none",
                  borderTop:    i >= 2       ? "1px solid #E5E7EB" : "none",
                  borderRight:  "none",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>
                  {m.label}
                </span>
                <span className="text-[26px] md:text-[28px] font-black leading-none tabular-nums" style={{ color: "#0A1A0E" }}>
                  {m.value}
                </span>
                <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{m.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────────────── */}
      <section id="features" className="px-6 md:px-12 py-20 max-w-6xl mx-auto w-full">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: "#16A34A" }}
        >
          Platform
        </p>
        <h2
          className="font-black tracking-tight mb-12"
          style={{ fontSize: "clamp(26px, 4vw, 42px)", color: "#0A1A0E" }}
        >
          Everything your station needs
        </h2>

        {/* Hairline-divided grid — feels like real operational software, not a card deck */}
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ border: "1px solid #E5E7EB" }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={[
                "flex flex-col gap-4 p-6 md:p-7",
                i >= 1           ? "border-t border-[#E5E7EB]" : "",
                i % 2 === 1      ? "md:border-l border-[#E5E7EB]" : "",
              ].join(" ")}
              style={{ background: "#FAFBF8" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "#DCFCE7" }}
                >
                  <f.icon className="w-5 h-5" style={{ color: "#16A34A" }} />
                </div>
                <span className="text-[15px] font-bold" style={{ color: "#0A1A0E" }}>
                  {f.title}
                </span>
              </div>
              <p className="text-[14px] leading-relaxed" style={{ color: "#6B7280" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUST BAND ───────────────────────────────────────────────────────── */}
      <section
        className="px-6 md:px-12 py-14"
        style={{
          background: "#DCFCE7",
          borderTop: "1px solid #BBF7D0",
          borderBottom: "1px solid #BBF7D0",
        }}
      >
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-12">
          <p
            className="font-black leading-tight tracking-tight"
            style={{ fontSize: "clamp(18px, 3vw, 26px)", color: "#0A1A0E", flex: 1 }}
          >
            &ldquo;Built by a FedEx Ground contractor who manages 17+ routes daily.
            not a software company guessing at your problems.&rdquo;
          </p>
          <div className="flex-shrink-0 flex flex-col gap-0.5">
            <span className="text-[14px] font-bold" style={{ color: "#15803D" }}>Blake Nardoni</span>
            <span className="text-[12px]" style={{ color: "#6B7280" }}>FedEx Ground ISP Owner</span>
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 md:px-12 py-20 max-w-5xl mx-auto w-full">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3"
          style={{ color: "#16A34A" }}
        >
          Pricing
        </p>
        <h2
          className="font-black tracking-tight mb-2"
          style={{ fontSize: "clamp(26px, 4vw, 42px)", color: "#0A1A0E" }}
        >
          One price per station.
        </h2>
        <p className="text-[16px] mb-10" style={{ color: "#6B7280" }}>
          No per-driver fees. No surprises.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="rounded-2xl p-6 flex flex-col gap-5 relative"
              style={{
                background: plan.highlight ? "#0A1A0E" : "#ffffff",
                border:     plan.highlight ? "none"    : "1px solid #E5E7EB",
              }}
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap"
                  style={{ background: "#16A34A", color: "#fff" }}
                >
                  Most Popular
                </div>
              )}

              <div>
                <p
                  className="text-[11px] font-bold uppercase tracking-widest mb-3"
                  style={{ color: plan.highlight ? "#4ADE80" : "#16A34A" }}
                >
                  {plan.name}
                </p>
                <div className="flex items-end gap-1 mb-2">
                  <span
                    className="font-black leading-none tabular-nums"
                    style={{ fontSize: 42, color: plan.highlight ? "#fff" : "#0A1A0E" }}
                  >
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span
                      className="text-[14px] mb-1"
                      style={{ color: plan.highlight ? "#6EE7B7" : "#9CA3AF" }}
                    >
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className="text-[13px]" style={{ color: plan.highlight ? "#A7F3D0" : "#6B7280" }}>
                  {plan.desc}
                </p>
              </div>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2.5 text-[13px]"
                    style={{ color: plan.highlight ? "#D1FAE5" : "#374151" }}
                  >
                    <Check
                      className="w-4 h-4 flex-shrink-0"
                      style={{ color: plan.highlight ? "#4ADE80" : "#16A34A" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.href ? (
                <Link
                  href={plan.href}
                  className="block w-full py-3 rounded-xl text-[14px] font-bold text-center transition-all hover:opacity-90 active:scale-[0.97]"
                  style={
                    plan.highlight
                      ? { background: "#16A34A", color: "#fff" }
                      : { background: "#0A1A0E", color: "#fff" }
                  }
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  className="w-full py-3 rounded-xl text-[14px] font-bold transition-all hover:opacity-90"
                  style={{ background: "#fff", color: "#0A1A0E", border: "1px solid #E5E7EB" }}
                >
                  {plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-12 py-20" style={{ background: "#0A1A0E" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="font-black tracking-tight leading-tight mb-4"
            style={{ fontSize: "clamp(28px, 5vw, 50px)", color: "#fff" }}
          >
            Ready to stop managing your operation from a spreadsheet?
          </h2>
          <p className="text-[16px] mb-8" style={{ color: "#6EE7B7" }}>
            Set up in under 10 minutes. No FedEx approval needed.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-[15px] font-bold transition-all hover:opacity-90 active:scale-[0.97]"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            Get Access <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer
        className="px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[12px]"
        style={{ background: "#FAFBF8", borderTop: "1px solid #E5E7EB", color: "#9CA3AF" }}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-full.png" alt="MyGroundOps" width={130} height={34} className="object-contain" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-5">
          <Link href="/sign-in" className="hover:text-slate-600 transition-colors">Driver Login</Link>
          <Link href="/sign-in" className="hover:text-slate-600 transition-colors">Sign In</Link>
          <Link href="/terms"   className="hover:text-slate-600 transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
          <span>&copy; {new Date().getFullYear()} Nardoni Digital LLC</span>
        </div>
      </footer>

    </div>
  );
}

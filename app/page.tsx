import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ClipboardList, Star, Shield,
  ChevronRight, Check, BarChart3,
  Wrench, Users, Lock, Smartphone,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MyGroundOps — Built for FedEx Ground Contractors",
  description:
    "The only operations platform built specifically for FedEx Ground ISPs. Driver scores, MMR compliance, maintenance requests, and a driver portal — all in one place.",
  openGraph: {
    title: "MyGroundOps — Built for FedEx Ground Contractors",
    description:
      "Driver scores, MMR compliance, maintenance requests, and a driver portal. Built for the people actually running the routes.",
    url: "https://mygroundops.com",
    siteName: "MyGroundOps",
    images: [{ url: "/og-image.png", width: 2048, height: 1152, alt: "MyGroundOps: Your operation, under control." }],
    type: "website",
  },
};

const METRICS = [
  { label: "ILS Impact",     value: "99.3%", sub: "company avg this week"   },
  { label: "Code 85",        value: "0",     sub: "unreported returns today" },
  { label: "MMR Compliance", value: "100%",  sub: "fleet compliance"         },
  { label: "RYDE Score",     value: "4.8 ★", sub: "customer rating avg"      },
];

const MANAGER_FEATURES = [
  "Real-time ILS%, PPOD, and RYDE scores per driver",
  "Upload DSW and PPOD files, dashboard updates instantly",
  "Auto-generated MMR reports, one click to PDF",
  "Email alerts when drivers submit maintenance requests",
  "Weekly performance leaderboard with automated badges",
  "Fleet inspection records always audit-ready",
];

const DRIVER_FEATURES = [
  "See your RYDE reviews and customer feedback",
  "Check your ILS%, PPOD, and Spotlight scores",
  "Submit maintenance requests from your phone",
  "View your rank on the team leaderboard",
  "Track your weekly performance trends",
  "No customer names, addresses, or PII stored",
];

const SPOTLIGHT_FEATURES = [
  {
    icon: BarChart3,
    label: "Analytics",
    title: "Scores that actually mean something",
    body: "Upload your DSW and PPOD resource files and every metric populates instantly: ILS%, PPOD Good%, photo quality breakdown, location accuracy, door-to-customer rate. No spreadsheets. No copy-pasting. Color-coded risk flags surface the drivers who need attention before FedEx brings it up first.",
    tags: ["ILS%", "PPOD", "RYDE", "Spotlight", "Photo Quality", "Location Accuracy"],
    dark: true,
  },
  {
    icon: Smartphone,
    label: "Driver Portal",
    title: "Give your drivers their own numbers",
    body: "Every driver gets a login at yourorg.mygroundops.com. They can see their RYDE reviews, their ILS impact score, their PPOD metrics, and where they rank on the leaderboard. When drivers can see their own data, you stop having the same coaching conversation twice.",
    tags: ["RYDE Reviews", "ILS%", "PPOD", "Leaderboard", "Weekly Trends"],
    dark: false,
  },
  {
    icon: Wrench,
    label: "Maintenance",
    title: "No more missed service requests",
    body: "Drivers submit vehicle issues straight from the app. The moment a request comes in, your admin team gets an email notification. Every request is timestamped, tracked, and tied to the vehicle. Nothing falls through the cracks, and you have a paper trail when you need one.",
    tags: ["Email Alerts", "Timestamped", "Per-Vehicle History", "Admin Inbox"],
    dark: true,
  },
  {
    icon: ClipboardList,
    label: "MMR Generator",
    title: "Compliance in one click",
    body: "Your fleet data is already in MyGroundOps. Hit generate and we pre-fill the MGBA-355 Monthly Maintenance Record for every vehicle. Sign, export to PDF, submit. No manual entry, no hunting down inspection dates, no night-before panic.",
    tags: ["MGBA-355", "Auto-fill", "PDF Export", "Per-Vehicle"],
    dark: false,
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "$99",
    period: "/mo",
    desc: "For smaller stations getting organized.",
    features: [
      "Up to 10 vehicles",
      "MMR Generator",
      "Driver Portal (all drivers)",
      "Maintenance requests + email alerts",
      "Basic driver score dashboard",
    ],
    highlight: false,
    cta: "Get Started",
    href: "/signup",
  },
  {
    name: "Pro",
    price: "$199",
    period: "/mo",
    desc: "Everything to run a full operation.",
    features: [
      "Unlimited vehicles",
      "Full analytics dashboard (ILS, PPOD, RYDE)",
      "DSW + PPOD file upload",
      "Driver leaderboard + performance scoring",
      "Weekly leaderboard + badge awards",
      "Notification preferences per event",
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
    desc: "Multiple stations, white-labeled for your team.",
    features: [
      "Multiple station support",
      "Custom branding for your drivers",
      "Dedicated onboarding",
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

      {/* ── NAV ──────────────────────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-4"
        style={{ background: "rgba(250,251,248,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid #E5E7EB" }}
      >
        <Image src="/logo-full.png" alt="MyGroundOps" width={160} height={40} className="object-contain" priority />
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors hover:bg-slate-100" style={{ color: "#6B7280" }}>
            Sign In
          </Link>
          <Link href="/signup" className="text-[13px] font-bold px-5 py-2.5 rounded-xl transition-all hover:opacity-90 active:scale-[0.97]" style={{ background: "#16A34A", color: "#fff" }}>
            Get Access
          </Link>
        </div>
      </nav>

      <main>

        {/* ── HERO ─────────────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-12 pt-16 pb-0 max-w-6xl mx-auto w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-7" style={{ color: "#16A34A" }}>
            Built exclusively for FedEx Ground independent service providers
          </p>

          <h1 className="font-black leading-[0.93] tracking-tight mb-6" style={{ fontSize: "clamp(42px, 8vw, 80px)", color: "#0A1A0E" }}>
            Your drivers.
            <br />
            Your scores.
            <br />
            <span style={{ color: "#16A34A" }}>Your operation.</span>
          </h1>

          <p className="text-[16px] md:text-[18px] leading-relaxed mb-4 max-w-xl" style={{ color: "#475569" }}>
            MyGroundOps is a custom command center built for FedEx Ground contractors. Not generic fleet software retrofitted to fit.
            Driver analytics, maintenance tracking, compliance tools, and a driver-facing portal, all wired for the exact data FedEx sends you.
          </p>
          <p className="text-[14px] mb-8 max-w-lg font-semibold" style={{ color: "#16A34A" }}>
            Your managers get a dashboard. Your drivers get an app. You get control.
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

          {/* Metric strip */}
          <div style={{ borderTop: "1px solid #E5E7EB" }}>
            <div className="grid grid-cols-2 md:grid-cols-4">
              {METRICS.map((m, i) => (
                <div
                  key={m.label}
                  className="flex flex-col gap-1 py-6 px-5 md:px-8"
                  style={{
                    borderLeft: i % 2 === 1 ? "1px solid #E5E7EB" : "none",
                    borderTop:  i >= 2       ? "1px solid #E5E7EB" : "none",
                  }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#6B7280" }}>{m.label}</span>
                  <span className="text-[26px] md:text-[28px] font-black leading-none tabular-nums" style={{ color: "#0A1A0E" }}>{m.value}</span>
                  <span className="text-[11px]" style={{ color: "#6B7280" }}>{m.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TWO AUDIENCES ────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-12 py-20 max-w-6xl mx-auto w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: "#16A34A" }}>
            One platform, two portals
          </p>
          <h2 className="font-black tracking-tight mb-3" style={{ fontSize: "clamp(26px, 4vw, 42px)", color: "#0A1A0E" }}>
            Built for your whole team
          </h2>
          <p className="text-[15px] mb-10 max-w-lg" style={{ color: "#6B7280" }}>
            Your managers get a full admin dashboard. Your drivers get their own login to track their performance.
            Same data. Different views. No back-and-forth.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Managers card */}
            <div className="rounded-2xl p-7 flex flex-col gap-5" style={{ background: "#0A1A0E" }}>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#16A34A22" }}>
                    <Shield className="w-4 h-4" style={{ color: "#4ADE80" }} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#4ADE80" }}>For ISP Owners &amp; Managers</span>
                </div>
                <h3 className="text-[22px] font-extrabold leading-tight mb-2" style={{ color: "#F8FAFC" }}>Admin command center</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "#94A3B8" }}>
                  Upload your DSW and PPOD files, monitor every driver&apos;s scores in real time, generate compliant MMR reports, and get notified the moment something needs your attention.
                </p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {MANAGER_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: "#D1FAE5" }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#4ADE80" }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Drivers card */}
            <div className="rounded-2xl p-7 flex flex-col gap-5" style={{ background: "#fff", border: "1px solid #E5E7EB" }}>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DCFCE7" }}>
                    <Users className="w-4 h-4" style={{ color: "#16A34A" }} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#16A34A" }}>For Your Drivers</span>
                </div>
                <h3 className="text-[22px] font-extrabold leading-tight mb-2" style={{ color: "#0A1A0E" }}>Driver portal</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: "#6B7280" }}>
                  Every driver gets their own login. They can see their scores, their reviews, and where they stand. No more "what's my ILS?" texts.
                </p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {DRIVER_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: "#374151" }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#16A34A" }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── PRIVACY BAND ─────────────────────────────────────────────────────── */}
        <div
          className="px-6 md:px-12 py-5"
          style={{ background: "#DCFCE7", borderTop: "1px solid #BBF7D0", borderBottom: "1px solid #BBF7D0" }}
        >
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "#16A34A" }} />
              <span className="text-[13px] font-bold" style={{ color: "#14532D" }}>No customer PII ever stored</span>
            </div>
            <div className="hidden md:block w-px h-4" style={{ background: "#BBF7D0" }} />
            <span className="text-[12px]" style={{ color: "#166534" }}>
              We process only the operational data FedEx already provides to you. No customer names, addresses, or package contents are ever saved in our system.
            </span>
          </div>
        </div>

        {/* ── FEATURE SPOTLIGHTS ───────────────────────────────────────────────── */}
        <section id="features" className="px-6 md:px-12 py-20 max-w-6xl mx-auto w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: "#16A34A" }}>
            Platform
          </p>
          <h2 className="font-black tracking-tight mb-12" style={{ fontSize: "clamp(26px, 4vw, 42px)", color: "#0A1A0E" }}>
            Everything your station needs
          </h2>

          <div className="flex flex-col gap-5">
            {SPOTLIGHT_FEATURES.map((f) => (
              <div
                key={f.label}
                className="rounded-2xl p-7 md:p-8 flex flex-col md:flex-row gap-6 md:gap-10"
                style={{ background: f.dark ? "#0A1A0E" : "#fff", border: f.dark ? "none" : "1px solid #E5E7EB" }}
              >
                <div className="flex-shrink-0 flex flex-row md:flex-col items-center md:items-start gap-3 md:w-44">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: f.dark ? "#16A34A22" : "#DCFCE7" }}
                  >
                    <f.icon className="w-5 h-5" style={{ color: f.dark ? "#4ADE80" : "#16A34A" }} />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: f.dark ? "#4ADE80" : "#16A34A" }}>
                    {f.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-[20px] md:text-[22px] font-extrabold mb-3 leading-snug"
                    style={{ color: f.dark ? "#F8FAFC" : "#0A1A0E" }}
                  >
                    {f.title}
                  </h3>
                  <p className="text-[14px] leading-relaxed mb-5" style={{ color: f.dark ? "#94A3B8" : "#6B7280" }}>
                    {f.body}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {f.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={
                          f.dark
                            ? { background: "#16A34A18", color: "#4ADE80", border: "1px solid #16A34A30" }
                            : { background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0" }
                        }
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
        <section
          className="px-6 md:px-12 py-20"
          style={{ background: "#F0FDF4", borderTop: "1px solid #BBF7D0", borderBottom: "1px solid #BBF7D0" }}
        >
          <div className="max-w-6xl mx-auto">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: "#16A34A" }}>
              Setup
            </p>
            <h2 className="font-black tracking-tight mb-12" style={{ fontSize: "clamp(22px, 3.5vw, 36px)", color: "#0A1A0E" }}>
              Up and running in under 10 minutes
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {([
                {
                  step: "01",
                  title: "Add your drivers and vehicles",
                  body: "Enter your team with their FedEx IDs. The ID is the universal key and everything ties together automatically when you upload data files.",
                },
                {
                  step: "02",
                  title: "Upload your DSW and PPOD files",
                  body: "Drop in the resource files FedEx already gives you. ILS%, PPOD scores, photo quality, location accuracy all populate instantly. No manual data entry.",
                },
                {
                  step: "03",
                  title: "Share the driver portal link",
                  body: "Send your team the driver portal link. Each driver creates an account and can see their own scores, reviews, and maintenance history immediately.",
                },
              ] as const).map(s => (
                <div key={s.step} className="flex flex-col gap-3">
                  <span className="font-black text-[42px] leading-none tabular-nums" style={{ color: "#BBF7D0" }}>{s.step}</span>
                  <h3 className="text-[16px] font-extrabold" style={{ color: "#0A1A0E" }}>{s.title}</h3>
                  <p className="text-[13px] leading-relaxed" style={{ color: "#6B7280" }}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── TRUST QUOTE ──────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-12 py-14" style={{ background: "#FAFBF8", borderBottom: "1px solid #E5E7EB" }}>
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-12">
            <p
              className="font-black leading-tight tracking-tight"
              style={{ fontSize: "clamp(18px, 3vw, 26px)", color: "#0A1A0E", flex: 1 }}
            >
              &ldquo;I built this because nothing out there was actually built for the people managing these operations.
              Every feature in this platform came from a real problem on a real morning.&rdquo;
            </p>
            <div className="flex-shrink-0 flex flex-col gap-0.5">
              <span className="text-[14px] font-bold" style={{ color: "#15803D" }}>Blake Nardoni</span>
            </div>
          </div>
        </section>

        {/* ── PRICING ──────────────────────────────────────────────────────────── */}
        <section id="pricing" className="px-6 md:px-12 py-20 max-w-5xl mx-auto w-full">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: "#16A34A" }}>
            Pricing
          </p>
          <h2 className="font-black tracking-tight mb-2" style={{ fontSize: "clamp(26px, 4vw, 42px)", color: "#0A1A0E" }}>
            One price per station.
          </h2>
          <p className="text-[16px] mb-10" style={{ color: "#6B7280" }}>
            No per-driver fees. No per-vehicle fees. No surprises.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6 flex flex-col gap-5 relative"
                style={{ background: plan.highlight ? "#0A1A0E" : "#ffffff", border: plan.highlight ? "none" : "1px solid #E5E7EB" }}
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
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: plan.highlight ? "#4ADE80" : "#16A34A" }}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-2">
                    <span className="font-black leading-none tabular-nums" style={{ fontSize: 42, color: plan.highlight ? "#fff" : "#0A1A0E" }}>
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-[14px] mb-1" style={{ color: plan.highlight ? "#6EE7B7" : "#6B7280" }}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px]" style={{ color: plan.highlight ? "#A7F3D0" : "#6B7280" }}>{plan.desc}</p>
                </div>
                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px]" style={{ color: plan.highlight ? "#D1FAE5" : "#374151" }}>
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: plan.highlight ? "#4ADE80" : "#16A34A" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.href ? (
                  <Link
                    href={plan.href}
                    className="block w-full py-3 rounded-xl text-[14px] font-bold text-center transition-all hover:opacity-90 active:scale-[0.97]"
                    style={plan.highlight ? { background: "#16A34A", color: "#fff" } : { background: "#0A1A0E", color: "#fff" }}
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

        {/* ── FINAL CTA ─────────────────────────────────────────────────────────── */}
        <section className="px-6 md:px-12 py-20" style={{ background: "#0A1A0E" }}>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-5" style={{ color: "#4ADE80" }}>
              Made for FedEx Ground ISPs
            </p>
            <h2
              className="font-black tracking-tight leading-tight mb-4"
              style={{ fontSize: "clamp(28px, 5vw, 50px)", color: "#fff" }}
            >
              Stop managing your operation from a group chat and a spreadsheet.
            </h2>
            <p className="text-[15px] mb-8 max-w-xl mx-auto" style={{ color: "#6EE7B7" }}>
              One platform. Your managers get a command center. Your drivers get an app. Set up in under 10 minutes. No FedEx approval required.
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

      </main>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer
        className="px-6 md:px-12 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[12px]"
        style={{ background: "#FAFBF8", borderTop: "1px solid #E5E7EB", color: "#6B7280" }}
      >
        <div className="flex items-center gap-3">
          <Image src="/logo-full.png" alt="MyGroundOps" width={130} height={34} className="object-contain" />
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

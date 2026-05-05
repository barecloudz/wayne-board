import Image from "next/image";
import Link from "next/link";
import { Lock, Star, BarChart2, ChevronRight } from "lucide-react";

export default function Home() {
  return (
    <div
      className="min-h-screen w-full flex flex-col"
      style={{ background: "linear-gradient(160deg, #4D148C 0%, #7B2FC0 50%, #FF6200 100%)" }}
    >
      {/* ── MOBILE layout (< md) ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 md:hidden">
        {/* Header */}
        <header className="flex flex-col items-center pt-10 pb-5 px-6"
          style={{ background: "linear-gradient(180deg, #4D148C 0%, #6B21A8 100%)" }}>
          <div className="bg-white rounded-2xl p-1 mb-3 shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
            <Image
              src="/74slogo.svg"
              alt="742 Logistics"
              width={104}
              height={104}
              className="object-contain"
              priority
            />
          </div>
          <p className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.60)" }}>
            FedEx Ground Contractor
          </p>
        </header>
        <div className="h-[3px] w-full shrink-0" style={{ background: "#FF6200" }} />

        {/* Content */}
        <div className="flex-1 bg-white px-5 pt-6 pb-4 flex flex-col gap-4">
          <div className="text-center mb-1">
            <h1 className="text-[20px] font-extrabold text-slate-900 tracking-tight">Driver Portal</h1>
            <p className="text-[13px] text-slate-500 mt-1">Check your scores, stay informed.</p>
          </div>

          {/* Ryde Score login */}
          <RydeCard />

          {/* Performance tile */}
          <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#FF6200,#ff8c42)" }}>
              <BarChart2 className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-800">Performance</p>
              <p className="text-[12px] text-slate-400">Delivery stats &amp; trends</p>
            </div>
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide shrink-0">
              Coming Soon
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">742 Logistics</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
            <p className="text-[12px] text-slate-500 text-center leading-relaxed">
              Questions? Contact your station manager or
              <span className="font-semibold text-slate-700"> 742 Logistics dispatch</span>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white px-5 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">&copy; {new Date().getFullYear()} 742 Logistics LLC</p>
          <Link
            href="/wayne-board"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
              text-[11px] font-semibold text-slate-500 bg-white hover:bg-slate-50 transition-all"
          >
            <Lock className="w-3 h-3" />
            Management
          </Link>
        </footer>
      </div>

      {/* ── DESKTOP layout (≥ md) ─────────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1">
        {/* Top nav bar */}
        <nav className="flex items-center justify-between px-10 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-0.5 shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
              <Image
                src="/74slogo.svg"
                alt="742 Logistics"
                width={46}
                height={46}
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-extrabold text-white tracking-tight">742 Logistics</span>
              <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                FedEx Ground Contractor
              </span>
            </div>
          </div>
          <Link
            href="/wayne-board"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold
              text-white/80 border border-white/20 hover:bg-white/10 transition-all"
          >
            <Lock className="w-3.5 h-3.5" />
            Management Portal
          </Link>
        </nav>

        {/* Hero split */}
        <div className="flex flex-1 items-center justify-center px-10 py-12 gap-16 max-w-6xl mx-auto w-full">
          {/* Left — branding */}
          <div className="flex-1 flex flex-col gap-6">
            <div>
              <div className="bg-white rounded-3xl p-1 inline-flex mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
                <Image
                  src="/74slogo.svg"
                  alt="742 Logistics"
                  width={150}
                  height={150}
                  className="object-contain"
                />
              </div>
              <h1 className="text-[48px] font-extrabold text-white tracking-tight leading-none mb-3">
                Driver Portal
              </h1>
              <p className="text-[17px] text-white/70 leading-relaxed max-w-sm">
                Sign in to view your Ryde Score, track your performance,
                and stay up to date with 742 Logistics.
              </p>
            </div>

            {/* Feature pills */}
            <div className="flex flex-col gap-2.5">
              {[
                { icon: Star, label: "Ryde Score", desc: "Your customer satisfaction rating" },
                { icon: BarChart2, label: "Performance", desc: "Delivery stats & trends — coming soon" },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 border border-white/10">
                  <Icon className="w-4 h-4 text-white/70 shrink-0" />
                  <div>
                    <span className="text-[13px] font-bold text-white">{label}</span>
                    <span className="text-[12px] text-white/50 ml-2">{desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[12px] text-white/40 mt-2">
              &copy; {new Date().getFullYear()} 742 Logistics LLC &middot; FedEx Ground Contractor
            </p>
          </div>

          {/* Right — login card */}
          <div className="w-full max-w-sm shrink-0">
            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
              {/* Card header */}
              <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center"
                style={{ background: "linear-gradient(135deg, #4D148C 0%, #7B2FC0 100%)" }}>
                <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-[16px] font-extrabold text-white">My Ryde Score</h2>
                <p className="text-[12px] text-white/65 mt-1">Sign in with your driver credentials</p>
              </div>
              <div className="h-[3px]" style={{ background: "#FF6200" }} />

              {/* Form */}
              <div className="px-6 py-6 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Driver ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BN-001"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-[13px]
                      text-slate-800 placeholder-slate-300 outline-none
                      focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-[13px]
                      text-slate-800 placeholder-slate-300 outline-none
                      focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
                  />
                </div>
                <button
                  className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white mt-1
                    transition-all hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}
                >
                  Sign In
                  <ChevronRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-slate-400 mt-1">
                  Driver login coming soon &mdash; check back shortly
                </p>
              </div>
            </div>

            {/* Below card note */}
            <p className="text-center text-[12px] text-white/40 mt-4">
              Contact your station manager if you need access help.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RydeCard() {
  return (
    <div className="rounded-2xl overflow-hidden border border-purple-100"
      style={{ boxShadow: "0 4px 24px rgba(77,20,140,0.12)" }}>
      <div className="px-5 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(135deg, #4D148C 0%, #7B2FC0 100%)" }}>
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
          <Star className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-purple-200">My Ryde Score</p>
          <p className="text-[12px] text-white/75">Sign in to view your score</p>
        </div>
      </div>
      <div className="bg-white px-5 py-4 flex flex-col gap-2">
        <input
          type="text"
          placeholder="Driver ID"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
            text-slate-800 placeholder-slate-400 outline-none
            focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-[13px]
            text-slate-800 placeholder-slate-400 outline-none
            focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
        />
        <button
          className="w-full py-2.5 rounded-lg text-[13px] font-bold text-white mt-0.5
            transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #4D148C, #7B2FC0)" }}
        >
          Sign In
        </button>
        <p className="text-[11px] text-center text-slate-400">Coming soon &mdash; check back shortly</p>
      </div>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { Lock, Star, BarChart2 } from "lucide-react";
import LoginForm from "./login-form";

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
            href="/wayne-board/login"
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
        {/* Top nav */}
        <nav className="flex items-center justify-between px-10 py-5">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-1 shadow-[0_2px_12px_rgba(0,0,0,0.2)]">
              <Image src="/74slogo.svg" alt="742 Logistics" width={40} height={40} className="object-contain" priority />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[16px] font-extrabold text-white tracking-tight">742 Logistics</span>
              <span className="text-[11px] font-medium text-white/50">FedEx Ground Contractor</span>
            </div>
          </div>
          <Link
            href="/wayne-board/login"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold
              text-white/70 border border-white/20 hover:bg-white/10 transition-all"
          >
            <Lock className="w-3.5 h-3.5" />
            Management Portal
          </Link>
        </nav>

        {/* Centered content */}
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-[560px] flex flex-col items-center">
            {/* Logo + title above card */}
            <div className="bg-white rounded-3xl p-3 mb-8 shadow-[0_8px_40px_rgba(0,0,0,0.3)]">
              <Image src="/74slogo.svg" alt="742 Logistics" width={140} height={140} className="object-contain" />
            </div>
            <h1 className="text-[52px] font-extrabold text-white tracking-tight leading-none mb-3 text-center">
              Driver Portal
            </h1>
            <p className="text-[18px] text-white/60 text-center mb-10">
              Sign in to view your Ryde Score and performance.
            </p>

            {/* Login card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)] w-full">
              <div className="h-[5px]" style={{ background: "linear-gradient(90deg, #4D148C, #FF6200)" }} />
              <LoginForm variant="card" />
            </div>

            <p className="text-center text-[14px] text-white/35 mt-6">
              Contact your station manager if you need access help.
            </p>
            <p className="text-center text-[13px] text-white/25 mt-2">
              &copy; {new Date().getFullYear()} 742 Logistics LLC
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
      <LoginForm variant="mobile" />
    </div>
  );
}

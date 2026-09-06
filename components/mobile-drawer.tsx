"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X, LayoutGrid, Truck, DollarSign, Users, Map,
  ClipboardCheck, UserCog, ChevronRight, Star, Wrench,
  CalendarDays, Trophy, WrenchIcon, Settings, Gauge,
  Route, TrendingUp, ClipboardList, Scissors, Zap, GraduationCap,
  ChevronDown, ChevronUp, PenLine,
} from "lucide-react";

const overviewItem = { icon: LayoutGrid, label: "Overview", href: "/dashboard", exact: true };

const adminItems = [
  { icon: UserCog,       label: "Accounts", href: "/dashboard/drivers",      exact: true },
  { icon: CalendarDays,  label: "Scheduling",       href: "/dashboard/scheduling",   exact: true },
  { icon: Gauge,         label: "Fleet Status",     href: "/dashboard/fleet-status", exact: true },
  { icon: WrenchIcon,    label: "Maintenance",      href: "/dashboard/maintenance",  exact: true },
  { icon: TrendingUp,    label: "Performance",      href: "/dashboard/performance",  exact: true },
  { icon: Star,          label: "Ryde Scores",      href: "/dashboard/ryde",         exact: true },
  { icon: Trophy,        label: "Milestones",       href: "/dashboard/milestones",   exact: true },
  { icon: GraduationCap, label: "Trainee Days",     href: "/dashboard/trainees",     exact: true },
  { icon: Settings,      label: "Settings",         href: "/dashboard/settings",     exact: true },
];

const automationItems = [
  { icon: Map,           label: "Route Planner", href: "/dashboard/route-planner", exact: true },
  { icon: Scissors,      label: "Create Routes", href: "/dashboard/create-routes", exact: true },
  { icon: PenLine,       label: "Anchor Editor", href: "/dashboard/anchor-editor", exact: true },
  { icon: Route,         label: "Auto DRO",      href: "/dashboard/auto-dro",      exact: true },
  { icon: TrendingUp,    label: "Auto GC",       href: "/dashboard/auto-gc",       exact: true },
  { icon: ClipboardList, label: "Auto DSW",      href: "/dashboard/auto-dsw",      exact: true },
  { icon: Zap,           label: "Auto Spotlight",href: "/dashboard/auto-spotlight",exact: true },
];

const complianceItems = [
  { icon: ClipboardCheck, label: "Inspections", href: "/fleet",    exact: false },
  { icon: Wrench,         label: "Vehicles",    href: "/vehicles", exact: false },
];

const reportItems = [
  { icon: Truck,      label: "Fleet",   href: "/reports/fleet",   exact: true },
  { icon: DollarSign, label: "Payroll", href: "/reports/payroll", exact: true },
  { icon: Users,      label: "Drivers", href: "/reports/drivers", exact: true },
  { icon: Map,        label: "Routes",  href: "/reports/routes",  exact: true },
];

export default function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const automationActive = automationItems.some(i => pathname === i.href);
  const [autoOpen, setAutoOpen] = useState(automationActive);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  function NavLink({ icon: Icon, label, href, exact }: {
    icon: React.ComponentType<{ className?: string }>; label: string; href: string; exact: boolean;
  }) {
    const active = isActive(href, exact);
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all ${
          active
            ? "bg-slate-950 text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
        {label}
        {!active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-300" />}
      </Link>
    );
  }

  return (
    <>
      {/* ── Mobile header bar ── */}
      <header className="md:hidden flex items-center px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-1 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5 text-slate-700" />
        </button>

        <Link href="/dashboard" className="flex items-center gap-2 mx-auto">
          <Image src="/logo-icon.png" alt="MyGroundOps" width={36} height={22} className="object-contain" />
          <span className="text-[14px] font-bold text-slate-900">MyGroundOps</span>
        </Link>

        {/* spacer to balance hamburger */}
        <div className="w-9" />
      </header>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Drawer ── */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-[280px] bg-white z-50 flex flex-col
          shadow-[4px_0_32px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-in-out
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-icon.png" alt="MyGroundOps" width={40} height={25} className="object-contain" />
            <div className="flex flex-col leading-none">
              <span className="text-[13px] font-bold text-slate-900">MyGroundOps</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Admin Dashboard</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
          <NavLink {...overviewItem} />

          <div className="my-3 border-t border-slate-100" />

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1">Admin</p>
          {adminItems.map((item) => <NavLink key={item.href} {...item} />)}

          <div className="my-3 border-t border-slate-100" />

          {/* Automation · collapsible */}
          <button
            onClick={() => setAutoOpen(v => !v)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-[14px] font-medium transition-all w-full text-left ${
              automationActive ? "text-slate-900 bg-slate-50" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Zap className={`w-4 h-4 shrink-0 ${automationActive ? "text-slate-700" : "text-slate-400"}`} />
            <span className="flex-1">Automation</span>
            {automationActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            {autoOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
            }
          </button>
          {autoOpen && (
            <div className="ml-3 pl-3 border-l border-slate-100 flex flex-col gap-0.5 mt-0.5">
              {automationItems.map((item) => <NavLink key={item.href} {...item} />)}
            </div>
          )}

          <div className="my-3 border-t border-slate-100" />

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1">Compliance</p>
          {complianceItems.map((item) => <NavLink key={item.href} {...item} />)}

          <div className="my-3 border-t border-slate-100" />

          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1">Reports</p>
          {reportItems.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>

        {/* Driver Portal link */}
        <div className="px-3 pb-2">
          <Link
            href="/driver"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 w-full"
          >
            <Truck className="w-4 h-4 text-slate-400 shrink-0" />
            My Driver Portal
          </Link>
        </div>

        {/* Bottom user strip */}
        <div className="p-4 border-t border-slate-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-slate-900">BN</span>
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-[12px] font-semibold text-slate-800 truncate">Blake Nardoni</span>
            <span className="text-[11px] text-slate-400 mt-0.5">Operations Mgr</span>
          </div>
          <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        </div>
      </aside>
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Truck, DollarSign, Users, Map, LayoutGrid, ClipboardCheck,
  UserCog, Star, Wrench, Trophy, CalendarDays, WrenchIcon, Settings,
  Gauge, Route, TrendingUp, ClipboardList, Scissors, GraduationCap,
  Zap, ChevronDown, ChevronUp, PenLine,
} from "lucide-react";

const overviewItem = { icon: LayoutGrid, label: "Overview", href: "/wayne-board", exact: true };

const adminItems = [
  { icon: UserCog,       label: "Driver Accounts", href: "/wayne-board/drivers",      exact: true },
  { icon: CalendarDays,  label: "Scheduling",       href: "/wayne-board/scheduling",   exact: true },
  { icon: Gauge,         label: "Fleet Status",     href: "/wayne-board/fleet-status", exact: true },
  { icon: WrenchIcon,    label: "Maintenance",      href: "/wayne-board/maintenance",  exact: true },
  { icon: TrendingUp,    label: "Performance",      href: "/wayne-board/performance",  exact: true },
  { icon: Star,          label: "Ryde Scores",      href: "/wayne-board/ryde",         exact: true },
  { icon: Trophy,        label: "Milestones",       href: "/wayne-board/milestones",   exact: true },
  { icon: GraduationCap, label: "Trainee Days",     href: "/wayne-board/trainees",     exact: true },
  { icon: Settings,      label: "Settings",         href: "/wayne-board/settings",     exact: true },
];

const automationItems = [
  { icon: Map,           label: "Route Planner",  href: "/wayne-board/route-planner",  exact: true },
  { icon: Scissors,      label: "Create Routes",  href: "/wayne-board/create-routes",  exact: true },
  { icon: PenLine,       label: "Anchor Editor",  href: "/wayne-board/anchor-editor",  exact: true },
  { icon: Route,         label: "Auto DRO",        href: "/wayne-board/auto-dro",        exact: true },
  { icon: TrendingUp,    label: "Auto GC",         href: "/wayne-board/auto-gc",         exact: true },
  { icon: ClipboardList, label: "Auto DSW",        href: "/wayne-board/auto-dsw",        exact: true },
  { icon: Zap,           label: "Auto Spotlight",  href: "/wayne-board/auto-spotlight",  exact: true },
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

export default function Sidebar() {
  const pathname = usePathname();
  const automationActive = automationItems.some(i => pathname === i.href);
  const [autoOpen, setAutoOpen] = useState(automationActive);

  function NavLink({ icon: Icon, label, href, exact }: { icon: React.ElementType; label: string; href: string; exact: boolean }) {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
          active
            ? "bg-slate-950 text-white"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
        {label}
      </Link>
    );
  }

  return (
    <aside className="hidden md:flex flex-col w-[220px] shrink-0 bg-white border-r border-slate-200/70 min-h-screen sticky top-0 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100">
        <Image src="/wayne-logo.png" alt="Wayne" width={52} height={32} className="object-contain" priority />
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-bold text-slate-900 tracking-tight">Wayne Board</span>
          <span className="text-[11px] text-slate-400 mt-0.5">Operations Suite</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 pt-4 overflow-y-auto">
        <NavLink {...overviewItem} />

        <div className="my-3 border-t border-slate-100" />

        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Admin
        </p>
        {adminItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="my-3 border-t border-slate-100" />

        {/* Automation dropdown */}
        <button
          onClick={() => setAutoOpen(v => !v)}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 w-full text-left ${
            automationActive
              ? "text-slate-900 bg-slate-50"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Zap className={`w-4 h-4 flex-shrink-0 ${automationActive ? "text-slate-700" : "text-slate-400"}`} />
          <span className="flex-1">Automation</span>
          {automationActive && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
          )}
          {autoOpen
            ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
            : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
          }
        </button>

        {autoOpen && (
          <div className="ml-3 pl-3 border-l border-slate-100 flex flex-col gap-0.5 mt-0.5">
            {automationItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        )}

        <div className="my-3 border-t border-slate-100" />

        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Compliance
        </p>
        {complianceItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="my-3 border-t border-slate-100" />

        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Reports
        </p>
        {reportItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      {/* Driver Portal link */}
      <div className="px-3 pb-2">
        <Link
          href="/driver"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 w-full"
        >
          <Truck className="w-4 h-4 text-slate-400 flex-shrink-0" />
          My Driver Portal
        </Link>
      </div>

      {/* Bottom */}
      <div className="p-4 border-t border-slate-100 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-bold text-slate-900">BN</span>
        </div>
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-[12px] font-semibold text-slate-800 truncate">Blake Nardoni</span>
          <span className="text-[11px] text-slate-400 mt-0.5">Operations Mgr</span>
        </div>
        <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Demo" />
      </div>
    </aside>
  );
}

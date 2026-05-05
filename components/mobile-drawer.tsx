"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X, LayoutGrid, Truck, DollarSign, Users, Map,
  ClipboardCheck, UserCog, ChevronRight, Star,
} from "lucide-react";

const reportItems = [
  { icon: LayoutGrid, label: "Overview", href: "/wayne-board", exact: true },
  { icon: Truck, label: "Fleet", href: "/reports/fleet", exact: true },
  { icon: DollarSign, label: "Payroll", href: "/reports/payroll", exact: true },
  { icon: Users, label: "Drivers", href: "/reports/drivers", exact: true },
  { icon: Map, label: "Routes", href: "/reports/routes", exact: true },
];

const complianceItems = [
  { icon: ClipboardCheck, label: "Inspections", href: "/fleet", exact: false },
];

const adminItems = [
  { icon: UserCog, label: "Driver Accounts", href: "/wayne-board/drivers", exact: true },
  { icon: Star,    label: "Ryde Scores",     href: "/wayne-board/ryde",    exact: true },
];

export default function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  function NavLink({ icon: Icon, label, href, exact }: {
    icon: React.ElementType; label: string; href: string; exact: boolean;
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

        <Link href="/wayne-board" className="flex items-center gap-2 mx-auto">
          <Image src="/wayne-logo.png" alt="Wayne" width={36} height={22} className="object-contain" />
          <span className="text-[14px] font-bold text-slate-900">Wayne Board</span>
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
            <Image src="/wayne-logo.png" alt="Wayne" width={40} height={25} className="object-contain" />
            <div className="flex flex-col leading-none">
              <span className="text-[13px] font-bold text-slate-900">Wayne Board</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Management</span>
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
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-5">
          {/* Reports */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1.5">
              Reports
            </p>
            <div className="flex flex-col gap-0.5">
              {reportItems.map((item) => <NavLink key={item.href} {...item} />)}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Compliance */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1.5">
              Compliance
            </p>
            <div className="flex flex-col gap-0.5">
              {complianceItems.map((item) => <NavLink key={item.href} {...item} />)}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Admin */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 mb-1.5">
              Admin
            </p>
            <div className="flex flex-col gap-0.5">
              {adminItems.map((item) => <NavLink key={item.href} {...item} />)}
            </div>
          </div>
        </nav>

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

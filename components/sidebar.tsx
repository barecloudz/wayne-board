"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, DollarSign, Users, Map, LayoutGrid, ClipboardCheck, UserCog } from "lucide-react";

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
];

export default function Sidebar() {
  const pathname = usePathname();

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
      <nav className="flex flex-col gap-0.5 p-3 flex-1 pt-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Reports
        </p>
        {reportItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="my-3 border-t border-slate-100" />

        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Compliance
        </p>
        {complianceItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        <div className="my-3 border-t border-slate-100" />

        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Admin
        </p>
        {adminItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

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

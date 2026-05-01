"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Truck, DollarSign, Users, Map, LayoutGrid } from "lucide-react";

const navItems = [
  { icon: LayoutGrid, label: "Overview", href: "/" },
  { icon: Truck, label: "Fleet", href: "/reports/fleet" },
  { icon: DollarSign, label: "Payroll", href: "/reports/payroll" },
  { icon: Users, label: "Drivers", href: "/reports/drivers" },
  { icon: Map, label: "Routes", href: "/reports/routes" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-slate-200 min-h-screen sticky top-0 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <Image
          src="/wayne-logo.png"
          alt="Wayne"
          width={30}
          height={30}
          className="object-contain"
          priority
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-900 tracking-tight">
            Wayne Board
          </span>
          <span className="text-[11px] text-slate-400">Operations Suite</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2 mt-1">
          Reports
        </p>
        {navItems.map(({ icon: Icon, label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom badge */}
      <div className="px-4 py-4 border-t border-slate-100">
        <span className="inline-flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 text-yellow-700 text-[11px] font-semibold px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Demo Preview
        </span>
      </div>
    </aside>
  );
}

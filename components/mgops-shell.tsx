"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Building2, Settings, Plus, LayoutGrid } from "lucide-react";

const navItems = [
  { icon: LayoutGrid, label: "Organizations", href: "/mgops/orgs",     exact: false },
  { icon: Plus,       label: "New Org",        href: "/mgops/orgs/new", exact: true  },
  { icon: Settings,   label: "Settings",       href: "/mgops/settings", exact: true  },
];

function NavLink({
  icon: Icon,
  label,
  href,
  exact,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  exact: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150"
      style={{
        background: active ? "#F0FDF4" : "transparent",
        color: active ? "#16A34A" : "#475569",
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </Link>
  );
}

function Sidebar() {
  return (
    <aside
      className="hidden md:flex flex-col w-[200px] shrink-0 min-h-screen sticky top-0 h-screen"
      style={{ background: "#ffffff", borderRight: "1px solid #E2E8F0" }}
    >
      <div
        className="flex items-center gap-3 px-5 h-16"
        style={{ borderBottom: "1px solid #E2E8F0" }}
      >
        <Image src="/logo-icon.png" alt="MyGroundOps" width={32} height={32} className="object-contain rounded-lg" />
        <div className="flex flex-col leading-none">
          <span className="text-[12px] font-bold tracking-tight" style={{ color: "#0F172A" }}>MyGroundOps</span>
          <span className="text-[10px] mt-0.5" style={{ color: "#94A3B8" }}>Super Admin</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 pt-4 flex-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      <div className="p-3" style={{ borderTop: "1px solid #E2E8F0" }}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all hover:bg-[#F8FAFC]"
          style={{ color: "#94A3B8" }}
        >
          <Building2 className="w-4 h-4 flex-shrink-0" />
          Back to App
        </Link>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header
        className="md:hidden flex items-center px-4 py-3 sticky top-0 z-40"
        style={{ background: "#ffffff", borderBottom: "1px solid #E2E8F0" }}
      >
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-1 rounded-lg"
          style={{ color: "#475569" }}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/mgops/orgs" className="flex items-center gap-2 mx-auto">
          <Image src="/logo-icon.png" alt="MyGroundOps" width={28} height={28} className="object-contain rounded-lg" />
          <span className="text-[14px] font-bold" style={{ color: "#0F172A" }}>Super Admin</span>
        </Link>
        <div className="w-9" />
      </header>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-[240px] z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "#ffffff", borderRight: "1px solid #E2E8F0", boxShadow: "8px 0 32px rgba(0,0,0,0.08)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid #E2E8F0" }}
        >
          <div className="flex items-center gap-2.5">
            <Image src="/logo-icon.png" alt="MyGroundOps" width={32} height={32} className="object-contain rounded-lg" />
            <div className="flex flex-col leading-none">
              <span className="text-[13px] font-bold" style={{ color: "#0F172A" }}>MyGroundOps</span>
              <span className="text-[11px] mt-0.5" style={{ color: "#94A3B8" }}>Super Admin</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#F8FAFC]"
            style={{ color: "#94A3B8" }}
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} onClick={() => setOpen(false)} />
          ))}
        </nav>

        <div className="p-3" style={{ borderTop: "1px solid #E2E8F0" }}>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium hover:bg-[#F8FAFC]"
            style={{ color: "#94A3B8" }}
          >
            <Building2 className="w-4 h-4 flex-shrink-0" />
            Back to App
          </Link>
        </div>
      </aside>
    </>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Login page — no nav
  if (pathname === "/mgops") {
    return (
      <div className="min-h-screen" style={{ background: "#F8FAFC", color: "#0F172A" }}>
        {children}
      </div>
    );
  }
  return (
    <div className="flex min-h-screen" style={{ background: "#F8FAFC", color: "#0F172A" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileNav />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export default function MgopsShell({ children }: { children: React.ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}

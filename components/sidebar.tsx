"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Truck, DollarSign, Users, Map, LayoutGrid, ClipboardCheck,
  UserCog, Star, Wrench, Trophy, CalendarDays, WrenchIcon, Settings,
  Gauge, Route, TrendingUp, ClipboardList, Scissors, GraduationCap,
  Zap, ChevronDown, ChevronUp, PenLine, LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";

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
  { icon: Map,           label: "Route Planner",   href: "/dashboard/route-planner",  exact: true },
  { icon: Scissors,      label: "Create Routes",   href: "/dashboard/create-routes",  exact: true },
  { icon: PenLine,       label: "Anchor Editor",   href: "/dashboard/anchor-editor",  exact: true },
  { icon: Route,         label: "Auto DRO",        href: "/dashboard/auto-dro",       exact: true },
  { icon: TrendingUp,    label: "Auto GC",         href: "/dashboard/auto-gc",        exact: true },
  { icon: ClipboardList, label: "Auto DSW",        href: "/dashboard/auto-dsw",       exact: true },
  { icon: Zap,           label: "Auto Spotlight",  href: "/dashboard/auto-spotlight", exact: true },
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

function CollapsibleSection({
  label,
  open,
  onToggle,
  active,
  iconEl,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  active?: boolean;
  iconEl?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 w-full text-left ${
          active ? "text-slate-900 bg-slate-50" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        }`}
      >
        {iconEl ?? (
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        )}
        {iconEl && <span className="flex-1">{label}</span>}
        {!iconEl && <span className="flex-1" />}
        {active && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />}
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-slate-300" />
          : <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
        }
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-slate-100 flex flex-col gap-0.5 mt-0.5">
          {children}
        </div>
      )}
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  const adminActive  = adminItems.some(i => pathname === i.href);
  const autoActive   = automationItems.some(i => pathname === i.href);
  const compActive   = complianceItems.some(i => pathname.startsWith(i.href));
  const reportActive = reportItems.some(i => pathname === i.href);

  const [adminOpen,  setAdminOpen]  = useState(adminActive || pathname.startsWith("/dashboard"));
  const [autoOpen,   setAutoOpen]   = useState(autoActive);
  const [compOpen,   setCompOpen]   = useState(compActive);
  const [reportOpen, setReportOpen] = useState(reportActive);

  const router = useRouter();
  const [orgLogo,      setOrgLogo]      = useState<string | null>(null);
  const [orgName,      setOrgName]      = useState("MyGroundOps");
  const [orgSlug,      setOrgSlug]      = useState("");
  const [userName,     setUserName]     = useState("");
  const [userInitials, setUserInitials] = useState("?");
  const [userRole,     setUserRole]     = useState("bc");
  const [userAvatar,   setUserAvatar]   = useState<string | null>(null);
  const [accountOpen,  setAccountOpen]  = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const ROLE_LABELS: Record<string, string> = {
    owner: "Owner", co_owner: "Co-Owner", developer: "Developer", bc: "Business Contact", driver: "Driver",
  };

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => {
        if (d.orgLogo)   setOrgLogo(d.orgLogo);
        if (d.orgName)   setOrgName(d.orgName);
        if (d.orgSlug)   setOrgSlug(d.orgSlug);
        if (d.role)      setUserRole(d.role);
        if (d.avatarUrl) setUserAvatar(d.avatarUrl);
        if (d.name) {
          setUserName(d.name);
          setUserInitials(
            d.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(orgSlug ? `/login/${orgSlug}` : "/sign-in");
  }

  function NavLink({ icon: Icon, label, href, exact }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    href: string;
    exact: boolean;
  }) {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
          active ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
        {orgLogo ? (
          <img src={orgLogo} alt={orgName} className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
        ) : (
          <Image src="/logo-icon.png" alt="MyGroundOps" width={32} height={32} className="object-contain rounded-lg flex-shrink-0" priority />
        )}
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-[13px] font-bold text-slate-900 tracking-tight truncate">{orgName}</span>
          <span className="text-[11px] text-slate-400 mt-0.5">Admin Dashboard</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1 pt-4 overflow-y-auto">
        <NavLink {...overviewItem} />

        <div className="my-3 border-t border-slate-100" />

        <CollapsibleSection label="Admin" open={adminOpen} onToggle={() => setAdminOpen(v => !v)}>
          {adminItems.map(item => <NavLink key={item.href} {...item} />)}
        </CollapsibleSection>

        <div className="my-3 border-t border-slate-100" />

        <CollapsibleSection
          label="Automation"
          open={autoOpen}
          onToggle={() => setAutoOpen(v => !v)}
          active={autoActive}
          iconEl={<Zap className={`w-4 h-4 flex-shrink-0 ${autoActive ? "text-slate-700" : "text-slate-400"}`} />}
        >
          {automationItems.map(item => <NavLink key={item.href} {...item} />)}
        </CollapsibleSection>

        <div className="my-3 border-t border-slate-100" />

        <CollapsibleSection label="Compliance" open={compOpen} onToggle={() => setCompOpen(v => !v)}>
          {complianceItems.map(item => <NavLink key={item.href} {...item} />)}
        </CollapsibleSection>

        <div className="my-3 border-t border-slate-100" />

        <CollapsibleSection label="Reports" open={reportOpen} onToggle={() => setReportOpen(v => !v)}>
          {reportItems.map(item => <NavLink key={item.href} {...item} />)}
        </CollapsibleSection>
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

      {/* Bottom — logged-in user with account popover */}
      <div ref={accountRef} className="relative p-3 border-t border-slate-100">
        {accountOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
            <Link
              href="/dashboard/account"
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setAccountOpen(false)}
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              My Account
            </Link>
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setAccountOpen(false)}
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-red-500 hover:bg-red-50 transition-colors w-full text-left"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        )}
        <button
          onClick={() => setAccountOpen(v => !v)}
          className="flex items-center gap-2.5 w-full rounded-lg px-1 py-1 hover:bg-slate-50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-amber-100 border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {userAvatar
              ? <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
              : <span className="text-[11px] font-bold text-amber-700">{userInitials}</span>}
          </div>
          <div className="flex flex-col leading-none min-w-0 text-left">
            <span className="text-[12px] font-semibold text-slate-800 truncate">{userName || "—"}</span>
            <span className="text-[11px] text-slate-400 mt-0.5">{ROLE_LABELS[userRole] ?? userRole}</span>
          </div>
          <ChevronUp className={`ml-auto w-3.5 h-3.5 text-slate-300 transition-transform ${accountOpen ? "" : "rotate-180"}`} />
        </button>
      </div>
    </aside>
  );
}

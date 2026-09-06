import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { organizations } from "@/lib/schema";
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  if (!session) return { title: "Dashboard" };
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, session.organizationId)).limit(1);
  const orgName = org?.name;
  return {
    title: orgName ? `${orgName} Dashboard` : "Dashboard",
    description: "MyGroundOps operations dashboard.",
  };
}
import FleetCard from "@/components/cards/fleet-card";
import PayrollCard from "@/components/cards/payroll-card";
import DriversCard from "@/components/cards/drivers-card";
import RoutesCard from "@/components/cards/routes-card";
import PortalSettings from "./portal-settings";
import WorkAreaManager from "./work-area-manager";
import DswScorecard from "./dsw-scorecard";
import { db } from "@/lib/db";
import { vehicles, drivers, inspections } from "@/lib/schema";
import { count, eq, and } from "drizzle-orm";
import { getSetting } from "@/lib/actions/settings";
import { getActiveLocationId } from "@/lib/active-location";
import { getWorkAreas } from "@/lib/actions/work-areas";
import Link from "next/link";
import {
  UserCog, Star, Gauge, WrenchIcon,
  Trophy, ClipboardList, Map, CalendarDays, ChevronRight,
} from "lucide-react";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const onboardingComplete = await getSetting("onboarding_complete", "");
  if (onboardingComplete !== "true") redirect("/onboarding");

  const locationId = await getActiveLocationId();

  const [[{ vehicleCount }], [{ driverCount }], [{ completedCount }], [{ oosCount }], showRydeSetting, showMilestonesSetting, clockInSetting, showDswSetting, workAreasList] =
    await Promise.all([
      db.select({ vehicleCount: count() }).from(vehicles).where(and(eq(vehicles.active, true), locationId !== null ? eq(vehicles.locationId, locationId) : undefined)),
      db.select({ driverCount: count() }).from(drivers).where(and(eq(drivers.active, true), locationId !== null ? eq(drivers.locationId, locationId) : undefined)),
      db.select({ completedCount: count() }).from(inspections).where(eq(inspections.status, "Complete")),
      db.select({ oosCount: count() }).from(inspections).where(eq(inspections.status, "Out of Service")),
      getSetting("show_ryde", "true"),
      getSetting("show_milestones", "true"),
      getSetting("clock_in_enabled", "false"),
      getSetting("show_dsw", "true"),
      getWorkAreas(),
    ]);

  const showRyde       = showRydeSetting === "true";
  const showMilestones = showMilestonesSetting === "true";
  const clockInEnabled = clockInSetting === "true";
  const showDsw        = showDswSetting === "true";

  return (
    <AppShell>
      <main className="flex-1 px-8 py-8 max-w-[1100px] w-full mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            MyGroundOps · Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Operations Overview
          </h1>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Active Trucks",    value: vehicleCount.toString() },
            { label: "Active Drivers",   value: driverCount.toString() },
            { label: "Q2 Inspections",   value: completedCount.toString() },
            { label: "Out of Service",   value: oosCount.toString() },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-slate-200/80 px-5 py-4
                shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {kpi.label}
              </p>
              <span className="text-[22px] font-extrabold text-slate-900 leading-none tracking-tight">
                {kpi.value}
              </span>
            </div>
          ))}
        </div>

        {/* Scheduling · hero button */}
        <Link
          href="/dashboard/scheduling"
          className="group flex items-center gap-6 bg-slate-900 hover:bg-slate-800 transition-colors
            rounded-2xl px-7 py-6 mb-4 shadow-[0_4px_24px_rgba(0,0,0,0.12)]"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
            <CalendarDays className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[24px] font-extrabold text-white tracking-tight leading-tight">Scheduling</p>
            <p className="text-[13px] text-slate-400 mt-1">Set driver days, log time off, and see who&apos;s working each day</p>
          </div>
          <ChevronRight className="w-6 h-6 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
        </Link>

        {/* Quick Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8">
          {[
            { icon: UserCog,      label: "Drivers",      href: "/dashboard/drivers",      iconBg: "bg-violet-50",  iconColor: "text-violet-600" },
            { icon: Star,         label: "Ryde Scores",  href: "/dashboard/ryde",         iconBg: "bg-amber-50",   iconColor: "text-amber-600"  },
            { icon: Gauge,        label: "Fleet Status", href: "/dashboard/fleet-status", iconBg: "bg-slate-100",  iconColor: "text-slate-600"  },
            { icon: WrenchIcon,   label: "Maintenance",  href: "/dashboard/maintenance",  iconBg: "bg-orange-50",  iconColor: "text-orange-600" },
            { icon: Trophy,       label: "Milestones",   href: "/dashboard/milestones",   iconBg: "bg-emerald-50", iconColor: "text-emerald-600"},
            { icon: ClipboardList,label: "Auto DSW",     href: "/dashboard/auto-dsw",     iconBg: "bg-indigo-50",  iconColor: "text-indigo-600" },
            { icon: Map,          label: "Route Planner",href: "/dashboard/route-planner",iconBg: "bg-teal-50",    iconColor: "text-teal-600"   },
          ].map(({ icon: Icon, label, href, iconBg, iconColor }) => (
            <Link
              key={href}
              href={href}
              className="group bg-white rounded-2xl border border-slate-200/80 px-4 py-5 flex flex-col items-center gap-3
                shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]
                hover:border-slate-300 transition-all duration-150"
            >
              <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
              </div>
              <span className="text-[13px] font-bold text-slate-700 group-hover:text-slate-900 text-center leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* DSW Service Scorecard */}
        {showDsw && <DswScorecard />}

        {/* Report cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <FleetCard vehicleCount={vehicleCount} inspectedCount={completedCount} />
          <PayrollCard />
          <DriversCard driverCount={driverCount} />
          <RoutesCard />
        </div>

        {/* Driver portal feature toggles */}
        <PortalSettings showRyde={showRyde} showMilestones={showMilestones} clockInEnabled={clockInEnabled} showDsw={showDsw} />

        {/* Work Area Manager */}
        <WorkAreaManager initial={workAreasList as any} />
      </main>
    </AppShell>
  );
}

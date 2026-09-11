import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import PortalSettings from "../portal-settings";

export const metadata: Metadata = { title: "Settings" };
import WorkAreaManager from "../work-area-manager";
import GcSyncSettings from "../gc-sync-settings";
import BrandingSettings from "../branding-settings";
import LocationManager from "../location-manager";
import PayrollWeekSettings from "../payroll-week-settings";
import PayrollEmailSettings from "../payroll-email-settings";
import TaskSettingsCard from "../task-settings";
import { getSetting } from "@/lib/actions/settings";
import { getPayrollEmailSettings } from "@/lib/actions/payroll-email";
import { getWorkAreas } from "@/lib/actions/work-areas";
import { getLocations } from "@/lib/actions/locations";
import { getAllTaskTemplates } from "@/lib/actions/tasks";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const [orgRow] = session
    ? await db.select({ logoUrl: organizations.logoUrl, accentColor: organizations.accentColor, ogImageUrl: organizations.ogImageUrl })
        .from(organizations).where(eq(organizations.id, session.organizationId)).limit(1)
    : [null];

  const [showRydeSetting, showMilestonesSetting, clockInSetting, showDswSetting, workAreasList, gcSyncInterval, locationsList, payWeekStartSetting, payrollEmailSettings, taskTemplatesList, taskReminderRecipients] = await Promise.all([
    getSetting("show_ryde", "true"),
    getSetting("show_milestones", "true"),
    getSetting("clock_in_enabled", "false"),
    getSetting("show_dsw", "true"),
    getWorkAreas(),
    getSetting("gc_sync_interval", "daily"),
    getLocations(),
    getSetting("pay_week_start", "6"),
    getPayrollEmailSettings(),
    getAllTaskTemplates(),
    getSetting("task_reminder_recipients", ""),
  ]);

  // Compute most recent completed pay week for Send Now
  const payWeekStartNum = parseInt(payWeekStartSetting, 10);
  const todayD = new Date();
  const todayDow = todayD.getDay();
  const pwEnd = (payWeekStartNum + 6) % 7;
  const daysToEnd = ((todayDow - pwEnd + 7) % 7) || 7;
  const lastEnd = new Date(todayD);
  lastEnd.setDate(todayD.getDate() - daysToEnd);
  const emailWeekEnd = lastEnd.toISOString().slice(0, 10);
  const lastStart = new Date(lastEnd);
  lastStart.setDate(lastEnd.getDate() - 6);
  const emailWeekStart = lastStart.toISOString().slice(0, 10);

  const showRyde       = showRydeSetting === "true";
  const showMilestones = showMilestonesSetting === "true";
  const clockInEnabled = clockInSetting === "true";
  const showDsw        = showDswSetting === "true";

  return (
    <AppShell>
      <main className="flex-1 px-6 py-8 max-w-[800px] w-full mx-auto">
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">MyGroundOps · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Settings</h1>
        </div>

        <div className="flex flex-col gap-6">
          <BrandingSettings initialLogoUrl={orgRow?.logoUrl ?? null} initialAccentColor={orgRow?.accentColor ?? null} initialOgImageUrl={orgRow?.ogImageUrl ?? null} />
          <PortalSettings showRyde={showRyde} showMilestones={showMilestones} clockInEnabled={clockInEnabled} showDsw={showDsw} />
          <WorkAreaManager initial={workAreasList as any} />
          <LocationManager initial={locationsList} />
          <GcSyncSettings initialInterval={gcSyncInterval} />
          <PayrollWeekSettings initialDay={parseInt(payWeekStartSetting, 10)} />
          <PayrollEmailSettings
            initialRecipients={payrollEmailSettings.recipients}
            initialDay={payrollEmailSettings.day}
            initialTime={payrollEmailSettings.time}
            weekStart={emailWeekStart}
            weekEnd={emailWeekEnd}
          />
          <TaskSettingsCard
            initialTasks={taskTemplatesList}
            currentUserRole={session?.role ?? "bc"}
            currentUserId={session?.driverId ?? ""}
            initialReminderRecipients={taskReminderRecipients}
          />
        </div>
      </main>
    </AppShell>
  );
}

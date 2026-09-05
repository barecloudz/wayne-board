import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import PortalSettings from "../portal-settings";

export const metadata: Metadata = { title: "Settings" };
import WorkAreaManager from "../work-area-manager";
import GcSyncSettings from "../gc-sync-settings";
import BrandingSettings from "../branding-settings";
import { getSetting } from "@/lib/actions/settings";
import { getWorkAreas } from "@/lib/actions/work-areas";
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

  const [showRydeSetting, showMilestonesSetting, clockInSetting, showDswSetting, workAreasList, gcSyncInterval] = await Promise.all([
    getSetting("show_ryde", "true"),
    getSetting("show_milestones", "true"),
    getSetting("clock_in_enabled", "false"),
    getSetting("show_dsw", "true"),
    getWorkAreas(),
    getSetting("gc_sync_interval", "daily"),
  ]);

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
          <GcSyncSettings initialInterval={gcSyncInterval} />
        </div>
      </main>
    </AppShell>
  );
}

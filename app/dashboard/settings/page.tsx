import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import PortalSettings from "../portal-settings";

export const metadata: Metadata = { title: "Settings" };
import WorkAreaManager from "../work-area-manager";
import GcSyncSettings from "../gc-sync-settings";
import { getSetting } from "@/lib/actions/settings";
import { getWorkAreas } from "@/lib/actions/work-areas";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Wayne Board · Admin</p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Settings</h1>
        </div>

        <div className="flex flex-col gap-6">
          <PortalSettings showRyde={showRyde} showMilestones={showMilestones} clockInEnabled={clockInEnabled} showDsw={showDsw} />
          <WorkAreaManager initial={workAreasList as any} />
          <GcSyncSettings initialInterval={gcSyncInterval} />
        </div>
      </main>
    </AppShell>
  );
}

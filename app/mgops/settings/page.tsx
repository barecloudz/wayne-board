import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/mgops-auth";

export const metadata: Metadata = { title: "Platform Settings" };
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/schema";
import MgopsSettingsClient from "./mgops-settings-client";

export default async function MgopsSettingsPage() {
  await requireSuperAdmin();
  const rows = await db.select().from(platformSettings);
  const current: Record<string, string> = {};
  rows.forEach(r => { current[r.key] = r.value; });
  return <MgopsSettingsClient current={current} />;
}

"use server";

import { db } from "@/lib/db";
import { vehicles, settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function saveOnboardingLocations(
  locations: { name: string; terminalId?: string }[]
) {
  const orgId = await requireOrg();
  if (locations.length === 0) return;

  // Dynamically import locations to avoid breaking if table doesn't exist yet
  // The locations agent creates this table; we reference it by SQL directly
  // to avoid a hard schema dependency at import time.
  const { sql } = await import("drizzle-orm");
  for (const loc of locations) {
    if (!loc.name.trim()) continue;
    await db.execute(
      sql`INSERT INTO locations (organization_id, name, terminal_id, created_at)
          VALUES (${orgId}, ${loc.name.trim()}, ${loc.terminalId ?? null}, NOW())
          ON CONFLICT DO NOTHING`
    );
  }
}

export async function saveOnboardingVehicles(
  vehicleList: { unitNumber: string; make?: string; model?: string }[]
) {
  const orgId = await requireOrg();
  for (const v of vehicleList) {
    if (!v.unitNumber.trim()) continue;
    try {
      await db.insert(vehicles).values({
        organizationId: orgId,
        unitNumber: v.unitNumber.trim(),
        make: v.make?.trim() || "Unknown",
        model: v.model?.trim() || "Unknown",
        year: new Date().getFullYear(),
        mileage: 0,
        vin: "",
        type: "van",
        ownership: "owned",
        active: true,
      });
    } catch {
      // Skip duplicates silently
    }
  }
}

export async function saveOnboardingGcCredentials(
  username: string,
  password: string
) {
  const orgId = await requireOrg();
  await Promise.all([
    db
      .insert(settings)
      .values({ organizationId: orgId, key: "gc_username", value: username })
      .onConflictDoUpdate({
        target: [settings.organizationId, settings.key],
        set: { value: username },
      }),
    db
      .insert(settings)
      .values({ organizationId: orgId, key: "gc_password", value: password })
      .onConflictDoUpdate({
        target: [settings.organizationId, settings.key],
        set: { value: password },
      }),
  ]);
}

export async function completeOnboarding() {
  const orgId = await requireOrg();
  await db
    .insert(settings)
    .values({ organizationId: orgId, key: "onboarding_complete", value: "true" })
    .onConflictDoUpdate({
      target: [settings.organizationId, settings.key],
      set: { value: "true" },
    });
  redirect("/dashboard");
}

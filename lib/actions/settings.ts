"use server";

import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function getSetting(key: string, defaultValue = "true"): Promise<string> {
  const orgId = await requireOrg();
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, key)))
    .limit(1);
  return row?.value ?? defaultValue;
}

export async function setSetting(key: string, value: string) {
  const orgId = await requireOrg();
  await db
    .insert(settings)
    .values({ organizationId: orgId, key, value })
    .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value } });
  revalidatePath("/driver");
  revalidatePath("/dashboard");
}

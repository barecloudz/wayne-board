import { db } from "@/lib/db";
import { platformSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
}

export async function getPlatformSetting(key: string): Promise<string | null> {
  await requireSession();
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setPlatformSetting(key: string, value: string): Promise<void> {
  await requireSession();
  await db.insert(platformSettings).values({ key, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value } });
}

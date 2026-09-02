import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

async function requireOrg() {
  const session = await getSession();
  if (!session?.organizationId) throw new Error("Unauthorized");
  return session.organizationId;
}

export async function POST(req: Request) {
  const orgId = await requireOrg();
  const { username, password } = await req.json();
  await Promise.all([
    db.insert(settings).values({ organizationId: orgId, key: "gc_username", value: username })
      .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value: username } }),
    db.insert(settings).values({ organizationId: orgId, key: "gc_password", value: password })
      .onConflictDoUpdate({ target: [settings.organizationId, settings.key], set: { value: password } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const orgId = await requireOrg();
  const rows = await db.select().from(settings)
    .where(and(eq(settings.organizationId, orgId), eq(settings.key, "gc_username")));
  return NextResponse.json({ username: rows[0]?.value ?? "" });
}

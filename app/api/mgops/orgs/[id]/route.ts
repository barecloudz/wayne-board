import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  return cookieStore.get("mgops_session")?.value === "authenticated";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orgId = parseInt(id, 10);
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if ("subscriptionStatus" in body) update.subscriptionStatus = body.subscriptionStatus;
  if ("demoMode" in body) update.demoMode = body.demoMode;
  if ("demoExpiresAt" in body) update.demoExpiresAt = body.demoExpiresAt ? new Date(body.demoExpiresAt) : null;
  if ("superAdminNote" in body) update.superAdminNote = body.superAdminNote;

  await db.update(organizations).set(update).where(eq(organizations.id, orgId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const orgId = parseInt(id, 10);
  await db.delete(organizations).where(eq(organizations.id, orgId));
  return NextResponse.json({ ok: true });
}

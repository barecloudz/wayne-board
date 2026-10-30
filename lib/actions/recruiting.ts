"use server";

import { db } from "@/lib/db";
import { prospects, prospectNotifications, notificationDismissals, drivers } from "@/lib/schema";
import { eq, and, notExists } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export type ChecklistStatus = "pending" | "passed" | "failed";

export type Prospect = {
  id: number;
  organizationId: number;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  notes: string | null;
  applicationDone: string;
  interviewDone: string;
  drugTestPassed: string;
  backgroundCheckPassed: string;
  roadTestPassed: string;
  orientationDone: string;
  fedexIdAssigned: string;
  medicalCardPassed: string;
  roadTestProposedDate: Date | null;
  roadTestConfirmedDate: Date | null;
  roadTestManagerNote: string | null;
  discontinuedReason: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type ProspectNotification = {
  id: number;
  organizationId: number;
  prospectId: number;
  prospectName: string;
  type: string;
  createdAt: Date | null;
};

export async function getProspects(): Promise<Prospect[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select()
    .from(prospects)
    .where(eq(prospects.organizationId, orgId))
    .orderBy(prospects.createdAt);
  return rows as Prospect[];
}

export async function createProspect(data: {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  status?: string;
}): Promise<Prospect> {
  const orgId = await requireOrg();
  const [row] = await db.insert(prospects).values({
    organizationId: orgId,
    name: data.name.trim(),
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    notes: data.notes?.trim() || null,
    status: data.status ?? "prospect",
  }).returning();
  await db.insert(prospectNotifications).values({
    organizationId: orgId,
    prospectId: row.id,
    prospectName: row.name,
    type: "new_prospect",
  });
  revalidatePath("/dashboard/recruiting");
  return row as Prospect;
}

const VALID_FIELDS = [
  "applicationDone", "interviewDone", "drugTestPassed",
  "backgroundCheckPassed", "roadTestPassed", "orientationDone",
  "fedexIdAssigned", "medicalCardPassed",
];

export async function updateProspectChecklist(
  id: number,
  field: string,
  status: ChecklistStatus,
): Promise<void> {
  if (!VALID_FIELDS.includes(field)) throw new Error("Invalid field");
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({ [field]: status, updatedAt: new Date() })
    .where(and(eq(prospects.id, id), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

export async function updateProspectNotes(
  id: number,
  notes: string,
): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({ notes: notes.trim() || null, updatedAt: new Date() })
    .where(and(eq(prospects.id, id), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

export async function deleteProspect(id: number): Promise<void> {
  const orgId = await requireOrg();
  await db
    .delete(prospects)
    .where(and(eq(prospects.id, id), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

// ── Pipeline stage actions ────────────────────────────────────────────────────

export async function proposeRoadTestDate(prospectId: number, date: Date): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({ roadTestProposedDate: date, status: "ready_for_road_test", updatedAt: new Date() })
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));
  const [p] = await db.select({ name: prospects.name }).from(prospects)
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));
  if (p) {
    await db.insert(prospectNotifications).values({
      organizationId: orgId,
      prospectId,
      prospectName: p.name,
      type: "ready_for_road_test",
    });
  }
  revalidatePath("/dashboard/recruiting");
}

export async function confirmRoadTestDate(
  prospectId: number,
  confirmedDate: Date,
  note?: string,
): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({
      roadTestConfirmedDate: confirmedDate,
      roadTestManagerNote: note?.trim() || null,
      status: "road_test_scheduled",
      updatedAt: new Date(),
    })
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

export async function markRoadTestPassed(prospectId: number): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({ roadTestPassed: "passed", status: "ride_alongs", updatedAt: new Date() })
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

export async function markDiscontinued(prospectId: number, reason: string): Promise<void> {
  const orgId = await requireOrg();
  await db
    .update(prospects)
    .set({ status: "discontinued", discontinuedReason: reason.trim(), updatedAt: new Date() })
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));
  revalidatePath("/dashboard/recruiting");
}

export async function hireProspect(
  prospectId: number,
): Promise<{ tempPassword: string; username: string }> {
  const session = await requireSession();
  const orgId = session.organizationId;

  const [prospect] = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));

  if (!prospect) throw new Error("Prospect not found");
  if (prospect.status === "hired") throw new Error("Already hired");
  if (prospect.drugTestPassed !== "passed") throw new Error("Drug test not passed");
  if (prospect.medicalCardPassed !== "passed") throw new Error("Medical card not passed");

  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const tempPassword = Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const nameParts = prospect.name.trim().split(/\s+/);
  const firstName = nameParts[0] || "user";
  const lastName = nameParts.slice(1).join("") || "driver";
  const username = `${firstName}.${lastName}-${prospectId}`.toLowerCase().replace(/[^a-z0-9.\-]/g, "");

  await db.insert(drivers).values({
    organizationId: orgId,
    driverId: `PENDING-${prospectId}`,
    username,
    name: prospect.name,
    passwordHash,
    role: "driver",
    isAdmin: false,
    hireDate: new Date().toISOString().split("T")[0],
    ...(prospect.phone ? { phone: prospect.phone } : {}),
    ...(prospect.email ? { email: prospect.email } : {}),
  });

  await db
    .update(prospects)
    .set({ status: "hired", updatedAt: new Date() })
    .where(and(eq(prospects.id, prospectId), eq(prospects.organizationId, orgId)));

  revalidatePath("/dashboard/recruiting");
  revalidatePath("/dashboard");

  return { tempPassword, username };
}

// ── Notification actions ──────────────────────────────────────────────────────

export async function getUnseenNotifications(): Promise<ProspectNotification[]> {
  const session = await getSession();
  if (!session?.isAdmin) return [];
  const orgId = session.organizationId;
  const driverId = session.driverId;

  const rows = await db
    .select()
    .from(prospectNotifications)
    .where(
      and(
        eq(prospectNotifications.organizationId, orgId),
        notExists(
          db
            .select()
            .from(notificationDismissals)
            .where(
              and(
                eq(notificationDismissals.notificationId, prospectNotifications.id),
                eq(notificationDismissals.driverId, driverId),
              )
            )
        )
      )
    )
    .orderBy(prospectNotifications.createdAt);

  return rows as ProspectNotification[];
}

export async function dismissNotification(notificationId: number): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await db
    .insert(notificationDismissals)
    .values({ notificationId, driverId: session.driverId })
    .onConflictDoNothing();
}

export async function isAdminUser(): Promise<boolean> {
  const session = await getSession();
  return !!session?.isAdmin;
}

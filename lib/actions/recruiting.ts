"use server";

import { db } from "@/lib/db";
import { prospects } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function requireOrg() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
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
  createdAt: Date | null;
  updatedAt: Date | null;
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
}): Promise<Prospect> {
  const orgId = await requireOrg();
  const [row] = await db.insert(prospects).values({
    organizationId: orgId,
    name: data.name.trim(),
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    notes: data.notes?.trim() || null,
  }).returning();
  revalidatePath("/dashboard/recruiting");
  return row as Prospect;
}

export async function updateProspectChecklist(
  id: number,
  field: string,
  status: ChecklistStatus,
): Promise<void> {
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

import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/mgops-auth";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Org #${id}` };
}
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import MgopsOrgClient from "./mgops-org-client";

export default async function MgopsOrgPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  const orgId = parseInt(id, 10);
  if (isNaN(orgId)) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) notFound();

  return <MgopsOrgClient org={org} />;
}

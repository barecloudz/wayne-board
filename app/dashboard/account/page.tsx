export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getMyProfile } from "@/lib/actions/drivers";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import AccountClient from "./account-client";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session || !session.isAdmin) redirect("/driver");

  const profile = await getMyProfile();
  if (!profile) redirect("/driver");

  let orgSubscription: { plan: string; subscriptionStatus: string } | null = null;
  if (profile.role === "owner") {
    const [org] = await db
      .select({ plan: organizations.plan, subscriptionStatus: organizations.subscriptionStatus })
      .from(organizations)
      .where(eq(organizations.id, session.organizationId))
      .limit(1);
    orgSubscription = org ?? null;
  }

  return (
    <AppShell>
      <AccountClient profile={profile} orgSubscription={orgSubscription} />
    </AppShell>
  );
}

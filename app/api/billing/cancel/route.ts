import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  if (!session?.organizationId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [org] = await db
    .select({ stripeSubscriptionId: organizations.stripeSubscriptionId })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  if (!org?.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  // Cancel at period end — they keep access until the current billing cycle ends
  await stripe.subscriptions.update(org.stripeSubscriptionId, { cancel_at_period_end: true });

  await db
    .update(organizations)
    .set({ subscriptionStatus: "canceled" })
    .where(eq(organizations.id, session.organizationId));

  return NextResponse.json({ ok: true });
}

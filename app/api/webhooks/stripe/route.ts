export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

function getOrgId(metadata: Stripe.Metadata | null): number | null {
  const id = metadata?.orgId;
  return id ? parseInt(id, 10) : null;
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = getOrgId(session.metadata);
      if (orgId) {
        await db.update(organizations)
          .set({ subscriptionStatus: "trialing", stripeSubscriptionId: session.subscription as string })
          .where(eq(organizations.id, orgId));
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = getOrgId(sub.metadata);
      if (orgId) {
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "trialing",
          past_due: "past_due",
          canceled: "canceled",
          unpaid: "past_due",
          incomplete: "trialing",
          incomplete_expired: "canceled",
          paused: "past_due",
        };
        await db.update(organizations)
          .set({ subscriptionStatus: statusMap[sub.status] ?? "past_due" })
          .where(eq(organizations.id, orgId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = getOrgId(sub.metadata);
      if (orgId) {
        await db.update(organizations)
          .set({ subscriptionStatus: "canceled" })
          .where(eq(organizations.id, orgId));
      }
      break;
    }
    case "invoice.payment_failed": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const subId: string | null = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id ?? null;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const orgId = getOrgId(sub.metadata);
        if (orgId) {
          await db.update(organizations)
            .set({ subscriptionStatus: "past_due" })
            .where(eq(organizations.id, orgId));
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

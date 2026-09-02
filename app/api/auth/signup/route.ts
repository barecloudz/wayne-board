import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, drivers } from "@/lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { stripe } from "@/lib/stripe";
import { getPlatformSetting } from "@/lib/actions/platform-settings";

export async function POST(req: NextRequest) {
  const { companyName, slug, ownerName, driverId, email, password, plan } = await req.json();

  if (!companyName?.trim() || !slug?.trim() || !ownerName?.trim() || !driverId?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugPattern.test(slug)) {
    return NextResponse.json({ error: "Invalid company URL slug." }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "That company URL is already taken." }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 12);

  const [org] = await db
    .insert(organizations)
    .values({
      name: companyName.trim(),
      slug: slug.trim(),
      email: email.trim().toLowerCase(),
      plan: plan === "pro" ? "pro" : "starter",
      subscriptionStatus: "trialing",
    })
    .returning({ id: organizations.id });

  await db.insert(drivers).values({
    organizationId: org.id,
    driverId: driverId.trim(),
    name: ownerName.trim(),
    passwordHash: hash,
    role: "owner",
    isAdmin: true,
    active: true,
  });

  const customer = await stripe.customers.create({
    name: companyName.trim(),
    email: email.trim().toLowerCase(),
    metadata: { orgId: String(org.id), slug: slug.trim() },
  });

  await db.update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));

  const amountKey = plan === "pro" ? "plan_amount_pro" : "plan_amount_starter";
  const planName = plan === "pro" ? "MyGroundOps Pro" : "MyGroundOps Starter";
  const amountStr = await getPlatformSetting(amountKey);
  const amount = amountStr ? Math.round(parseFloat(amountStr) * 100) : (plan === "pro" ? 19900 : 9900);

  const stripePrice = await stripe.prices.create({
    unit_amount: amount,
    currency: "usd",
    recurring: { interval: "month" },
    product_data: { name: planName },
  });

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: stripePrice.id, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { orgId: String(org.id), slug: slug.trim() },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/login/${slug.trim()}?welcome=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/signup?canceled=1`,
    metadata: { orgId: String(org.id), slug: slug.trim() },
  });

  return NextResponse.json({ ok: true, checkoutUrl: checkoutSession.url });
}

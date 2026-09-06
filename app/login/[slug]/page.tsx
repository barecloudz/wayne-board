import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [org] = await db.select({ name: organizations.name, ogImageUrl: organizations.ogImageUrl }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  const orgName = org?.name ?? "Driver Portal";
  return {
    title: orgName,
    description: `Sign in to ${orgName} on MyGroundOps.`,
    manifest: `/api/manifest/${slug}`,
    openGraph: org?.ogImageUrl ? {
      title: orgName,
      description: `Sign in to ${orgName} on MyGroundOps.`,
      images: [{ url: org.ogImageUrl, width: 1200, height: 630 }],
    } : undefined,
  };
}

import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import OrgLoginForm from "./org-login-form";
import Image from "next/image";

export default async function OrgLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, logoUrl: organizations.logoUrl, accentColor: organizations.accentColor, subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) redirect("/");

  const accent = org.accentColor ?? "#FF6200";

  if (org.subscriptionStatus === "canceled") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)" }}
      >
        <div
          className="text-center px-8 py-10 rounded-3xl"
          style={{
            background: "linear-gradient(160deg, #FFFFFF 0%, #EEF2F7 100%)",
            border: "1px solid rgba(203,213,225,0.6)",
            boxShadow: "0 1px 0 0 rgba(255,255,255,0.9) inset, 0 8px 32px rgba(148,163,184,0.2), 0 2px 8px rgba(148,163,184,0.12)",
          }}
        >
          <p className="text-[15px] font-medium" style={{ color: "#64748B" }}>
            This station&apos;s subscription is no longer active.
          </p>
          <a href="/" className="text-[13px] mt-4 inline-block font-semibold hover:underline" style={{ color: accent }}>
            ← MyGroundOps
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{
        background: "linear-gradient(160deg, #F1F5F9 0%, #E8EDF4 50%, #E2E8F0 100%)",
      }}
    >
      {/* Subtle ambient glow from accent color — very faint */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 40% at 50% 10%, ${accent}0A 0%, transparent 70%)`,
        }}
      />

      {/* Glass card */}
      <div
        className="relative w-full max-w-[420px] rounded-[24px] px-8 py-10 flex flex-col items-center"
        style={{
          background: "linear-gradient(160deg, #FFFFFF 0%, #F4F7FB 55%, #EEF2F7 100%)",
          border: "1px solid rgba(203,213,225,0.65)",
          boxShadow: [
            "0 1px 0 0 rgba(255,255,255,0.95) inset",         /* top gloss highlight */
            "0 -1px 0 0 rgba(255,255,255,0.4) inset",
            "0 2px 6px rgba(148,163,184,0.10)",               /* near shadow */
            "0 8px 24px rgba(148,163,184,0.18)",              /* mid shadow */
            "0 24px 64px rgba(100,116,139,0.14)",             /* deep shadow */
          ].join(", "),
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Logo */}
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden mb-5"
          style={{
            background: "linear-gradient(145deg, #FFFFFF 0%, #F0F4F8 100%)",
            border: "1px solid rgba(203,213,225,0.7)",
            boxShadow: [
              "0 1px 0 0 rgba(255,255,255,1) inset",
              "0 4px 12px rgba(148,163,184,0.20)",
              "0 1px 3px rgba(148,163,184,0.15)",
            ].join(", "),
          }}
        >
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt={org.name}
              style={{ width: 52, height: 52, objectFit: "contain" }}
            />
          ) : (
            <Image src="/logo-icon.png" alt="MyGroundOps" width={52} height={52} className="object-contain" />
          )}
        </div>

        {/* Org name */}
        <h1
          className="text-[22px] font-extrabold tracking-tight text-center leading-tight mb-1"
          style={{ color: "#0F172A" }}
        >
          {org.name}
        </h1>
        <p
          className="text-[13px] font-medium text-center mb-8"
          style={{ color: "#94A3B8" }}
        >
          Driver Portal
        </p>

        {/* Divider */}
        <div
          className="w-full mb-7"
          style={{
            height: 1,
            background: "linear-gradient(to right, transparent, rgba(203,213,225,0.7), transparent)",
          }}
        />

        {/* Form */}
        <OrgLoginForm orgSlug={slug} accentColor={accent} />
      </div>

      {/* Powered by */}
      <p className="mt-8 text-[11px] font-medium" style={{ color: "#CBD5E1" }}>
        Powered by{" "}
        <a href="/" className="hover:underline" style={{ color: "#94A3B8" }}>
          MyGroundOps
        </a>
      </p>
    </div>
  );
}

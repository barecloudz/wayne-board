import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  const orgName = org?.name ?? "Driver Portal";
  return {
    title: orgName,
    description: `Sign in to ${orgName} on MyGroundOps.`,
    manifest: `/api/manifest/${slug}`,
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

  if (org.subscriptionStatus === "canceled") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8FAFC" }}>
        <div className="text-center px-6">
          <p className="text-[15px]" style={{ color: "#475569" }}>
            This station&apos;s subscription is no longer active.
          </p>
          <a href="/" className="text-[13px] mt-4 inline-block font-medium" style={{ color: "#FF6200" }}>
            ← MyGroundOps
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5" style={{ background: "#F8FAFC" }}>
      {/* Logo + org name */}
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="rounded-2xl p-1" style={{ background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}>
          {org.logoUrl ? (
            <img src={org.logoUrl} alt={org.name} style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 10 }} />
          ) : (
            <Image src="/logo-icon.png" alt="MyGroundOps" width={60} height={60} className="rounded-xl object-contain" />
          )}
        </div>
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight" style={{ color: "#0F172A" }}>
            {org.name}
          </h1>
          <p className="text-[13px] mt-1 font-medium" style={{ color: "#94A3B8" }}>
            Driver Portal
          </p>
        </div>
      </div>

      {/* Login card */}
      <div
        className="w-full max-w-[400px] rounded-2xl px-7 py-7"
        style={{
          background: "#ffffff",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.06)",
        }}
      >
        {/* Orange accent bar */}
        <div className="h-[3px] -mx-7 -mt-7 mb-6 rounded-t-2xl" style={{ background: org.accentColor ?? "#FF6200" }} />
        <OrgLoginForm orgSlug={slug} />
      </div>

      <p className="mt-8 text-[12px]" style={{ color: "#94A3B8" }}>
        Powered by{" "}
        <a href="/" className="hover:underline" style={{ color: "#94A3B8" }}>
          MyGroundOps
        </a>
      </p>
    </div>
  );
}

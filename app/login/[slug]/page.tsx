import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await params;
  return {
    title: "Sign In",
    description: "Sign in to your MyGroundOps station account.",
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
    .select({ id: organizations.id, name: organizations.name, logoUrl: organizations.logoUrl, subscriptionStatus: organizations.subscriptionStatus })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) redirect("/");

  if (org.subscriptionStatus === "canceled") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#F8FAFC" }}
      >
        <div className="text-center px-6">
          <p className="text-[15px]" style={{ color: "#475569" }}>
            This station&apos;s subscription is no longer active.
          </p>
          <a
            href="/"
            className="text-[13px] mt-4 inline-block font-medium transition-colors"
            style={{ color: "#16A34A" }}
          >
            ← MyGroundOps
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#F8FAFC" }}
    >
      {/* Branding */}
      <div className="mb-8 flex flex-col items-center gap-4">
        {org.logoUrl ? (
          <img src={org.logoUrl} alt={org.name} className="h-16 w-auto object-contain" />
        ) : (
          <Image src="/logo-icon.png" alt="MyGroundOps" width={64} height={64} className="rounded-2xl" />
        )}
        <div className="text-center">
          <h1
            className="text-[24px] font-extrabold tracking-tight leading-tight"
            style={{ color: "#0F172A" }}
          >
            {org.name}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>
            Driver Portal
          </p>
        </div>
      </div>

      {/* Login card */}
      <div
        className="w-full max-w-[400px] rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04)",
        }}
      >
        {/* Green top accent bar */}
        <div className="h-[3px]" style={{ background: "linear-gradient(90deg, #16A34A, #4ADE80)" }} />
        <OrgLoginForm orgSlug={slug} />
      </div>

      <p className="mt-8 text-[12px]" style={{ color: "#94A3B8" }}>
        Powered by{" "}
        <a href="/" className="hover:underline transition-colors" style={{ color: "#94A3B8" }}>
          MyGroundOps
        </a>
      </p>
    </div>
  );
}

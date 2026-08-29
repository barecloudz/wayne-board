import { requireSuperAdmin } from "@/lib/mgops-auth";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";

export default async function MgopsOrgsPage() {
  await requireSuperAdmin();
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-extrabold text-white">Organizations</h1>
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>{orgs.length} total</p>
        </div>
        <Link
          href="/mgops/orgs/new"
          className="px-4 py-2 rounded-xl text-[13px] font-bold"
          style={{ background: "#16A34A", color: "#fff" }}
        >
          + New Org
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {orgs.map(org => (
          <div
            key={org.id}
            className="flex items-center justify-between px-5 py-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-white">{org.name}</span>
                <span className="text-[11px] font-mono text-white/30">{org.slug}</span>
                {org.demoMode && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: "rgba(22,163,74,0.2)", color: "#4ADE80" }}>
                    Demo {org.demoExpiresAt ? `until ${new Date(org.demoExpiresAt).toLocaleDateString()}` : "Indefinite"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{org.plan}</span>
                <span className="text-[11px]" style={{ color: org.subscriptionStatus === "active" ? "#4ADE80" : org.subscriptionStatus === "canceled" ? "#f87171" : "rgba(255,255,255,0.4)" }}>
                  {org.subscriptionStatus}
                </span>
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              {org.superAdminNote && (
                <p className="text-[11px] italic mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{org.superAdminNote}</p>
              )}
            </div>
            <Link
              href={`/mgops/orgs/${org.id}`}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Manage →
            </Link>
          </div>
        ))}
        {orgs.length === 0 && (
          <p className="text-center py-16 text-[14px]" style={{ color: "rgba(255,255,255,0.3)" }}>No organizations yet.</p>
        )}
      </div>
    </div>
  );
}

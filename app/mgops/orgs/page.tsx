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
          <h1 className="text-[24px] font-extrabold" style={{ color: "#0F172A" }}>Organizations</h1>
          <p className="text-[13px] mt-1" style={{ color: "#94A3B8" }}>{orgs.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/mgops/settings"
            className="px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{ background: "#ffffff", border: "1px solid #E2E8F0", color: "#475569" }}
          >
            Settings
          </Link>
          <Link
            href="/mgops/orgs/new"
            className="px-4 py-2 rounded-xl text-[13px] font-bold"
            style={{ background: "#16A34A", color: "#fff" }}
          >
            + New Org
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {orgs.map(org => (
          <div
            key={org.id}
            className="flex items-center justify-between px-5 py-4 rounded-2xl"
            style={{ background: "#ffffff", border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold" style={{ color: "#0F172A" }}>{org.name}</span>
                <span className="text-[11px] font-mono" style={{ color: "#94A3B8" }}>{org.slug}</span>
                {org.demoMode && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: "#F0FDF4", color: "#16A34A" }}>
                    Demo {org.demoExpiresAt ? `until ${new Date(org.demoExpiresAt).toLocaleDateString()}` : "Indefinite"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F1F5F9", color: "#475569" }}>{org.plan}</span>
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      org.subscriptionStatus === "active"
                        ? "#16A34A"
                        : org.subscriptionStatus === "canceled"
                        ? "#DC2626"
                        : "#94A3B8",
                  }}
                >
                  {org.subscriptionStatus}
                </span>
                <span className="text-[11px]" style={{ color: "#CBD5E1" }}>
                  {org.createdAt ? new Date(org.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              {org.superAdminNote && (
                <p className="text-[11px] italic mt-0.5" style={{ color: "#94A3B8" }}>{org.superAdminNote}</p>
              )}
            </div>
            <Link
              href={`/mgops/orgs/${org.id}`}
              className="px-4 py-2 rounded-xl text-[13px] font-semibold"
              style={{ background: "#ffffff", color: "#475569", border: "1px solid #E2E8F0" }}
            >
              Manage →
            </Link>
          </div>
        ))}
        {orgs.length === 0 && (
          <p className="text-center py-16 text-[14px]" style={{ color: "#94A3B8" }}>No organizations yet.</p>
        )}
      </div>
    </div>
  );
}

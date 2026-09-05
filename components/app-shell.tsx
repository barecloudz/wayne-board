import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import Sidebar from "./sidebar";
import MobileDrawer from "./mobile-drawer";

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let orgLogo: string | null = null;
  let orgName = "MyGroundOps";

  if (session) {
    const [org] = await db
      .select({ logoUrl: organizations.logoUrl, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, session.organizationId))
      .limit(1);
    orgLogo = org?.logoUrl ?? null;
    orgName = org?.name ?? "MyGroundOps";
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        orgLogo={orgLogo}
        orgName={orgName}
        userName={session?.name ?? ""}
        userInitials={(session?.name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <MobileDrawer />
        {children}
      </div>
    </div>
  );
}

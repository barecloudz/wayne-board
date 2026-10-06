import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getNotificationPreferences, getAdminsWithoutEmail } from "@/lib/actions/notifications";
import NotificationsClient from "./notifications-client";

export const metadata: Metadata = { title: "Notification Settings" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) return null;

  const organizationId = session.organizationId;

  const [preferences, adminsWithoutEmail] = await Promise.all([
    getNotificationPreferences(organizationId),
    getAdminsWithoutEmail(organizationId),
  ]);

  return (
    <AppShell>
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto">
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">
            MyGroundOps · Admin
          </p>
          <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">
            Notification Settings
          </h1>
          <p className="text-[13px] text-slate-500 mt-2">
            Control which events trigger notifications, who receives them, and how they&apos;re delivered.
          </p>
        </div>

        <NotificationsClient
          initialPreferences={preferences}
          adminsWithoutEmail={adminsWithoutEmail}
          organizationId={organizationId}
        />
      </main>
    </AppShell>
  );
}

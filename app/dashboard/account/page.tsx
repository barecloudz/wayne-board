export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AppShell from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getMyProfile } from "@/lib/actions/drivers";
import AccountClient from "./account-client";

export const metadata: Metadata = { title: "My Account" };

export default async function AccountPage() {
  const session = await getSession();
  if (!session || !session.isAdmin) redirect("/driver");

  const profile = await getMyProfile();
  if (!profile) redirect("/driver");

  return (
    <AppShell>
      <AccountClient profile={profile} />
    </AppShell>
  );
}

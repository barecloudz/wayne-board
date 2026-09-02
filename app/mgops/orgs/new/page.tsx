import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/mgops-auth";
import NewOrgClient from "./new-org-client";

export const metadata: Metadata = { title: "New Organization" };

export default async function NewOrgPage() {
  await requireSuperAdmin();
  return <NewOrgClient />;
}

import { requireSuperAdmin } from "@/lib/mgops-auth";
import NewOrgClient from "./new-org-client";

export default async function NewOrgPage() {
  await requireSuperAdmin();
  return <NewOrgClient />;
}

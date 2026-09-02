import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get("mgops_session");
  if (session?.value !== "authenticated") {
    redirect("/mgops");
  }
}

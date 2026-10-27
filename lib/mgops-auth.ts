import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac } from "crypto";

export async function requireSuperAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get("mgops_session");
  const secret = process.env.MGOPS_SECRET;
  if (!secret || !session?.value) {
    redirect("/mgops");
  }
  const expected = createHmac("sha256", secret)
    .update("mgops-session-v1")
    .digest("hex");
  if (session.value !== expected) {
    redirect("/mgops");
  }
}

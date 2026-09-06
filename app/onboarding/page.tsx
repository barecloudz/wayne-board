import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function OnboardingIndex() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  redirect("/onboarding/location");
}

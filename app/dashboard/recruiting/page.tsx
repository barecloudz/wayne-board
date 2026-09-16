import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import RecruitingClient from "./recruiting-client";
import { getProspects } from "@/lib/actions/recruiting";

export const metadata: Metadata = { title: "Recruiting" };

export default async function RecruitingPage() {
  const prospects = await getProspects();
  return (
    <AppShell>
      <RecruitingClient prospects={prospects} />
    </AppShell>
  );
}

import type { Metadata } from "next";
import AppShell from "@/components/app-shell";
import RoutePlannerClient from "./route-planner-client";

export const metadata: Metadata = { title: "Route Planner" };
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

type Template = {
  id: number;
  name: string;
  dro_plan_id: number | null;
  dro_plan_name: string | null;
  driver_count: number;
  day_of_week: string | null;
  is_default: boolean;
  notes: string | null;
};

export default async function RoutePlannerPage() {
  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

  let templates: Template[] = [];
  try {
    templates = (await sql`
      SELECT id, name, dro_plan_id, dro_plan_name, driver_count, day_of_week, is_default, notes
      FROM route_templates
      ORDER BY is_default DESC, name
    `) as Template[];
  } catch {
    // Table may not exist yet · show empty state
  }

  return (
    <AppShell>
      <RoutePlannerClient templates={templates} />
    </AppShell>
  );
}

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT
      id,
      name,
      dro_plan_id,
      dro_plan_name,
      driver_count,
      day_of_week,
      is_default,
      notes
    FROM route_templates
    ORDER BY is_default DESC, name
  `;

  return NextResponse.json(rows);
}

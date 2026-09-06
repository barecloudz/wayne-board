import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

  const [templateRows, areaRows] = await Promise.all([
    sql`
      SELECT id, name, dro_plan_id, dro_plan_name, driver_count, day_of_week, is_default, notes
      FROM route_templates
      WHERE id = ${templateId}
    `,
    sql`
      SELECT
        rta.id,
        rta.route_slot,
        rta.route_label,
        rta.work_area_number,
        rta.dro_vehicle_name,
        rta.anchor_area_name,
        daa.shape_json,
        daa.wkt_poly
      FROM route_template_areas rta
      LEFT JOIN dro_anchor_areas daa ON daa.name = rta.anchor_area_name
      WHERE rta.template_id = ${templateId}
      ORDER BY rta.route_slot, rta.anchor_area_name
    `,
  ]);

  if (templateRows.length === 0) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const template = templateRows[0];

  // Group areas by route slot
  const slotMap = new Map<
    number,
    { slot: number; label: string; work_area_number: string; areas: object[] }
  >();

  for (const row of areaRows) {
    const slot = row.route_slot as number;
    if (!slotMap.has(slot)) {
      slotMap.set(slot, {
        slot,
        label: row.route_label as string,
        work_area_number: row.work_area_number as string,
        areas: [],
      });
    }
    slotMap.get(slot)!.areas.push({
      id: row.id,
      anchor_area_name: row.anchor_area_name,
      shape_json: row.shape_json ?? "{}",
      wkt_poly: row.wkt_poly ?? null,
      dro_vehicle_name: row.dro_vehicle_name,
    });
  }

  const routes = Array.from(slotMap.values()).sort((a, b) => a.slot - b.slot);

  return NextResponse.json({ template, routes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[areas GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
  }

  const body = await req.json();
  const areas: { id: number; route_slot: number; route_label: string; work_area_number: string }[] =
    body.areas ?? [];

  if (!Array.isArray(areas) || areas.length === 0) {
    return NextResponse.json({ error: "No areas provided" }, { status: 400 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);

    // Bulk update · one query per area (neon serverless doesn't support transactions easily)
    await Promise.all(
      areas.map((a) =>
        sql`
          UPDATE route_template_areas
          SET
            route_slot       = ${a.route_slot},
            route_label      = ${a.route_label},
            work_area_number = ${a.work_area_number}
          WHERE id = ${a.id} AND template_id = ${templateId}
        `
      )
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[areas PUT]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

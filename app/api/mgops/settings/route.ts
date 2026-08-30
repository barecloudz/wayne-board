import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/schema";
import { setPlatformSetting } from "@/lib/actions/platform-settings";

async function checkAuth() {
  const cookieStore = await cookies();
  return cookieStore.get("mgops_session")?.value === "authenticated";
}

export async function GET() {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(platformSettings);
  const result: Record<string, string> = {};
  rows.forEach(r => { result[r.key] = r.value; });
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  if (!await checkAuth()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await Promise.all(
    Object.entries(body).map(([key, value]) => setPlatformSetting(key, String(value)))
  );
  return NextResponse.json({ ok: true });
}

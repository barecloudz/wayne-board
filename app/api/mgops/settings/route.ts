import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { platformSettings } from "@/lib/schema";
import { setPlatformSetting } from "@/lib/actions/platform-settings";

async function checkAuth() {
  const cookieStore = await cookies();
  const val = cookieStore.get("mgops_session")?.value;
  if (!val || !process.env.MGOPS_SECRET) return false;
  const expected = createHmac("sha256", process.env.MGOPS_SECRET)
    .update("mgops-session-v1")
    .digest("hex");
  return val === expected;
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

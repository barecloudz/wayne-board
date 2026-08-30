import { NextResponse } from "next/server";
import { syncGc } from "@/lib/gc-sync";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const result = await syncGc(body.date);
  if (!result.success) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
}

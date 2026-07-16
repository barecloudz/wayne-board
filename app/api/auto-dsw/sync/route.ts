import { NextResponse } from "next/server";
import { syncDsw } from "@/lib/dsw-sync";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await syncDsw(body.date);
  if (!result.success) return NextResponse.json(result, { status: 500 });
  return NextResponse.json(result);
}

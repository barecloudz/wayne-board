export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { syncDro } from "@/lib/dro-sync";

export async function POST() {
  try {
    const result = await syncDro();
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}

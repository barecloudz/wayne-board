import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getNotificationPreferences, upsertNotificationPreference } from "@/lib/actions/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await getNotificationPreferences(session.organizationId);
  return NextResponse.json({ prefs });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, patch } = await req.json();
  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

  const updated = await upsertNotificationPreference(session.organizationId, type, patch);
  return NextResponse.json({ ok: true, pref: updated });
}

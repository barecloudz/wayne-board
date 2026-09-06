import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserLocationIds, setUserLocations } from "@/lib/actions/locations";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const locationIds = await getUserLocationIds(userId);
  return NextResponse.json(locationIds);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, locationIds } = body as { userId: string; locationIds: number[] };
  if (!userId || !Array.isArray(locationIds)) {
    return NextResponse.json({ error: "userId and locationIds required" }, { status: 400 });
  }

  await setUserLocations(userId, locationIds);
  return NextResponse.json({ ok: true });
}

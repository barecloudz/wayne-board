import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  await Promise.all([
    db.insert(settings).values({ key: "gc_username", value: username }).onConflictDoUpdate({ target: settings.key, set: { value: username } }),
    db.insert(settings).values({ key: "gc_password", value: password }).onConflictDoUpdate({ target: settings.key, set: { value: password } }),
  ]);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const rows = await db.select().from(settings).where(eq(settings.key, "gc_username"));
  return NextResponse.json({ username: rows[0]?.value ?? "" });
}

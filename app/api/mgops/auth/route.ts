import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "crypto";

export async function POST(req: Request) {
  const { password } = await req.json();
  const secret = process.env.MGOPS_SECRET;
  if (!secret || password !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = createHmac("sha256", secret)
    .update("mgops-session-v1")
    .digest("hex");
  const cookieStore = await cookies();
  cookieStore.set("mgops_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
    sameSite: "strict",
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("mgops_session");
  return NextResponse.json({ ok: true });
}

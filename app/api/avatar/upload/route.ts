import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const key = `${session.organizationId}/avatars/${session.driverId}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type);

  await db
    .update(drivers)
    .set({ avatarUrl: url })
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, session.driverId)));

  return NextResponse.json({ url });
}

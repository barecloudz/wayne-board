import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { badgeTypes } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/gif", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "driver") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file        = formData.get("file") as File | null;
  const badgeTypeId = formData.get("badgeTypeId");

  if (!file || !badgeTypeId) {
    return NextResponse.json({ error: "Missing file or badgeTypeId" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 512 KB)" }, { status: 400 });
  }

  // Verify badge type belongs to this org
  const [bt] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.id, Number(badgeTypeId)), eq(badgeTypes.organizationId, session.organizationId)))
    .limit(1);
  if (!bt) return NextResponse.json({ error: "Badge type not found" }, { status: 404 });

  const ext = file.type === "image/svg+xml" ? "svg"
    : file.type === "image/gif" ? "gif"
    : file.type === "image/webp" ? "webp"
    : "png";

  const key = `badge-icons/${session.organizationId}/${badgeTypeId}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type);

  // Update iconUrl on badge type
  await db
    .update(badgeTypes)
    .set({ iconUrl: url })
    .where(and(eq(badgeTypes.id, Number(badgeTypeId)), eq(badgeTypes.organizationId, session.organizationId)));

  return NextResponse.json({ url });
}

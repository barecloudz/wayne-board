import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename, contentType, field } = await req.json();
  if (!filename || !contentType || !["logo", "og"].includes(field)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
  const key = `orgs/${session.organizationId}/${field}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 120 });
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  return NextResponse.json({ uploadUrl, publicUrl });
}

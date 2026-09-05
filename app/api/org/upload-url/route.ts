import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const field = form.get("field") as string | null;

  if (!file || !field || !["logo", "og"].includes(field)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const key = `orgs/${session.organizationId}/${field}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }));

  const publicUrl = `${R2_PUBLIC_URL}/${key}`;
  return NextResponse.json({ publicUrl });
}

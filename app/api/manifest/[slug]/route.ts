import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const [org] = await db
    .select({ name: organizations.name, logoUrl: organizations.logoUrl })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const iconUrl = org.logoUrl ?? "/logo-icon.png";

  const manifest = {
    name: org.name,
    short_name: org.name.split(" ")[0],
    description: `${org.name} Driver Portal`,
    start_url: `/login/${slug}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16A34A",
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png" },
      { src: iconUrl, sizes: "512x512", type: "image/png" },
      { src: "/logo-icon.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}

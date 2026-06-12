import { NextResponse } from "next/server";

// Netlify sets DEPLOY_ID per deployment; fallback to build time
const VERSION = process.env.DEPLOY_ID ?? process.env.BUILD_ID ?? Date.now().toString();

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ version: VERSION });
}

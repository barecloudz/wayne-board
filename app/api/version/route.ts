import { NextResponse } from "next/server";

// Baked in at build time by Netlify — stable for the lifetime of a deployment
const VERSION = process.env.NEXT_PUBLIC_DEPLOY_ID ?? "dev";

export function GET() {
  return NextResponse.json({ version: VERSION });
}

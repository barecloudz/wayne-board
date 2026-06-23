import { NextResponse } from "next/server";

export function GET() {
  // DEPLOY_ID is injected by Netlify at runtime into every serverless function.
  // NEXT_PUBLIC_DEPLOY_ID is a fallback for local dev or other hosts.
  const version = process.env.DEPLOY_ID ?? process.env.NEXT_PUBLIC_DEPLOY_ID ?? "dev";
  return NextResponse.json({ version });
}

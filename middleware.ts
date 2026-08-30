import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "changeme-set-SESSION_SECRET-in-env"
);

export async function middleware(req: NextRequest) {
  // For /driver routes — check org access
  if (req.nextUrl.pathname.startsWith("/driver")) {
    const token = req.cookies.get("driver_session")?.value;
    if (!token) return NextResponse.redirect(new URL("/", req.url));
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const status = payload.subscriptionStatus as string;
      const demoMode = payload.demoMode as boolean;
      const demoExpiresAt = payload.demoExpiresAt as string | null;

      if (status === "canceled") return NextResponse.redirect(new URL("/", req.url));
      if (demoMode && demoExpiresAt && new Date(demoExpiresAt) < new Date()) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // For /dashboard routes — require admin
  const token = req.cookies.get("driver_session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.isAdmin) {
      // Valid driver session but not an admin — send back to driver portal
      return NextResponse.redirect(new URL("/driver", req.url));
    }
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/((?!login).*)", "/driver(.*)"],
};

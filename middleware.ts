import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "changeme-set-SESSION_SECRET-in-env"
);

export async function middleware(req: NextRequest) {
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
  matcher: ["/wayne-board/:path*"],
};

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET environment variable is not set");
const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);
const COOKIE = "driver_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  driverId: string;
  organizationId: number;
  name: string;
  role: string;
  isAdmin: boolean;
  subscriptionStatus: string;
  demoMode: boolean;
  demoExpiresAt: string | null;
  mustChangePassword?: boolean;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as unknown as SessionPayload;
    // Live DB check: reject sessions for disabled drivers
    const [driver] = await db
      .select({ loginDisabled: drivers.loginDisabled })
      .from(drivers)
      .where(and(eq(drivers.driverId, session.driverId), eq(drivers.organizationId, session.organizationId)))
      .limit(1);
    if (!driver || driver.loginDisabled) return null;
    return session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function clearPasswordForceChange() {
  const session = await getSession();
  if (!session) return;
  await createSession({ ...session, mustChangePassword: false });
}

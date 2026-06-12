import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drivers } from "../lib/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  const passwordHash = await bcrypt.hash("Changeme", 10);
  await db.update(drivers).set({ isAdmin: true, passwordHash, active: true }).where(eq(drivers.driverId, "blake"));
  console.log("✓ blake -> isAdmin=true, password reset to Changeme");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

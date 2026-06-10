import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drivers } from "../lib/schema";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  const passwordHash = await bcrypt.hash("Changeme", 10);
  await db.insert(drivers).values({
    driverId:     "blake",
    name:         "Blake",
    passwordHash,
    role:         "driver",
    isAdmin:      true,
    active:       true,
  }).onConflictDoNothing();
  console.log("✓ Blake admin account ready — login: blake / Changeme");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

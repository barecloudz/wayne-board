// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");
import { neonConfig, Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

async function run(query: string, params: unknown[] = []) {
  const res = await pool.query(query, params);
  return res;
}

async function main() {
  // 0003: add is_admin column
  await run(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false NOT NULL`);
  console.log("✓ 0003 — is_admin column");

  // 0004: add assigned_vehicle_id column
  await run(`ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "assigned_vehicle_id" integer REFERENCES "vehicles"("id") ON DELETE SET NULL`);
  console.log("✓ 0004 — assigned_vehicle_id column");

  // Seed Blake's admin account
  const passwordHash = await bcrypt.hash("Changeme", 10);
  await run(
    `INSERT INTO "drivers" ("driver_id","name","password_hash","role","is_admin","active")
     VALUES ($1,'Blake',$2,'driver',true,true)
     ON CONFLICT ("driver_id") DO NOTHING`,
    ["blake", passwordHash]
  );
  console.log("✓ Blake admin account — login: blake / Changeme");

  await pool.end();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });

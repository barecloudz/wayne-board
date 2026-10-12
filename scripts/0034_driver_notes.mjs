import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";

const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
let dbUrl = "";
for (const line of raw.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    dbUrl = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
}

const sql = neon(dbUrl);

await sql`
  CREATE TABLE IF NOT EXISTS driver_notes (
    id              SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    driver_db_id    INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    author_name     TEXT NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW() NOT NULL
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS driver_notes_driver_idx ON driver_notes(driver_db_id)
`;

console.log("Migration 0034: driver_notes table created.");

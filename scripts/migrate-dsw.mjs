import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL_POOLER && !process.env.DATABASE_URL) {
  const { readFileSync } = await import("fs");
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS dsw_route_days (
    id                  SERIAL PRIMARY KEY,
    date                DATE NOT NULL,
    driver_id           TEXT REFERENCES drivers(driver_id) ON DELETE SET NULL,
    driver_name_raw     TEXT NOT NULL DEFAULT '',
    wa_name             TEXT NOT NULL DEFAULT '',
    wa_number           TEXT NOT NULL DEFAULT '',
    ils_pct             REAL,
    act_del_stps        INTEGER,
    act_del_pkgs        INTEGER,
    non_delvd_stps      INTEGER,
    all_status_code_pkgs INTEGER,
    miles               INTEGER,
    on_road_hours       TEXT,
    on_duty_hours       TEXT,
    vscan_pkgs          INTEGER,
    del_stps_planned    INTEGER,
    synced_at           TIMESTAMP DEFAULT NOW()
  )
`;
console.log("✅ dsw_route_days table ready");

await sql`CREATE INDEX IF NOT EXISTS dsw_route_days_date_idx      ON dsw_route_days(date)`;
await sql`CREATE INDEX IF NOT EXISTS dsw_route_days_driver_id_idx ON dsw_route_days(driver_id)`;
console.log("✅ Indexes ready");

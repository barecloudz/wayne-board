// 0032_gc_vehicle_mileage.mjs — adds gc_vehicle_mileage table
import { readFileSync } from 'fs';

const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
let url = '';
for (const line of raw.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    url = line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
}

if (!url) {
  console.error('ERROR: DATABASE_URL not found in .env.local');
  process.exit(1);
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(url);

const steps = [
  {
    name: 'gc_vehicle_mileage table',
    ddl: `
      CREATE TABLE IF NOT EXISTS gc_vehicle_mileage (
        id              SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        date            DATE NOT NULL,
        gc_route_day_id INTEGER,
        vehicle_name    TEXT,
        vehicle_id      INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        unit_number     TEXT,
        start_mileage   INTEGER,
        end_mileage     INTEGER,
        is_anomaly      BOOLEAN NOT NULL DEFAULT FALSE,
        anomaly_reason  TEXT,
        pulled_at       TIMESTAMP DEFAULT NOW()
      )
    `,
  },
  {
    name: 'gc_vehicle_mileage_org_date_vehicle_unique index',
    ddl: `
      CREATE UNIQUE INDEX IF NOT EXISTS gc_vehicle_mileage_org_date_vehicle_unique
      ON gc_vehicle_mileage (organization_id, date, vehicle_name)
    `,
  },
];

let passed = 0;
let failed = 0;

for (const { name, ddl } of steps) {
  try {
    await sql.query(ddl);
    console.log(`[OK]   ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${passed} applied, ${failed} failed.`);
if (failed > 0) process.exit(1);

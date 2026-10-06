// apply-indexes.mjs — applies performance indexes to Neon DB
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

const indexes = [
  {
    name: 'inspections_org_vehicle_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS inspections_org_vehicle_idx ON inspections (organization_id, vehicle_id)',
  },
  {
    name: 'ryde_scores_org_week_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS ryde_scores_org_week_idx ON ryde_scores (organization_id, week)',
  },
  {
    name: 'dsw_route_days_org_date_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS dsw_route_days_org_date_idx ON dsw_route_days (organization_id, date)',
  },
  {
    name: 'driver_locations_org_driver_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS driver_locations_org_driver_idx ON driver_locations (organization_id, driver_id)',
  },
  {
    name: 'attendance_log_org_driver_date_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS attendance_log_org_driver_date_idx ON attendance_log (organization_id, driver_id, date)',
  },
  {
    name: 'vehicle_conditions_org_vehicle_idx',
    ddl: 'CREATE INDEX IF NOT EXISTS vehicle_conditions_org_vehicle_idx ON vehicle_conditions (vehicle_id)',
  },
];

let passed = 0;
let failed = 0;

for (const { name, ddl } of indexes) {
  try {
    await sql.query(ddl);
    console.log(`[OK]   ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${passed} created/skipped, ${failed} failed.`);
if (failed > 0) process.exit(1);

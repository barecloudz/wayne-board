// 0033_gc_vehicle_mileage_v2.mjs — alters gc_vehicle_mileage to use odometer fields
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
    name: 'drop gc_route_day_id',
    ddl: `ALTER TABLE gc_vehicle_mileage DROP COLUMN IF EXISTS gc_route_day_id`,
  },
  {
    name: 'drop start_mileage',
    ddl: `ALTER TABLE gc_vehicle_mileage DROP COLUMN IF EXISTS start_mileage`,
  },
  {
    name: 'drop end_mileage',
    ddl: `ALTER TABLE gc_vehicle_mileage DROP COLUMN IF EXISTS end_mileage`,
  },
  {
    name: 'add gc_vehicle_id',
    ddl: `ALTER TABLE gc_vehicle_mileage ADD COLUMN IF NOT EXISTS gc_vehicle_id INTEGER`,
  },
  {
    name: 'add odometer',
    ddl: `ALTER TABLE gc_vehicle_mileage ADD COLUMN IF NOT EXISTS odometer INTEGER`,
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

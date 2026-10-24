// 0036_alt_sat.mjs — adds alt_sat and alt_sat_start columns to driver_schedules
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
    name: 'add alt_sat',
    ddl: `ALTER TABLE driver_schedules ADD COLUMN IF NOT EXISTS alt_sat BOOLEAN NOT NULL DEFAULT FALSE`,
  },
  {
    name: 'add alt_sat_start',
    ddl: `ALTER TABLE driver_schedules ADD COLUMN IF NOT EXISTS alt_sat_start DATE`,
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

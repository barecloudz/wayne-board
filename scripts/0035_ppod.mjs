// 0035_ppod.mjs — creates ppod_days and ppod_name_mappings tables
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
    name: 'create ppod_days',
    ddl: `
      CREATE TABLE IF NOT EXISTS ppod_days (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        driver_id TEXT,
        driver_name_raw TEXT NOT NULL DEFAULT '',
        ppod_pct REAL,
        total_pkgs INTEGER,
        pod_captured INTEGER,
        location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `,
  },
  {
    name: 'create ppod_days_org_date_idx',
    ddl: `CREATE INDEX IF NOT EXISTS ppod_days_org_date_idx ON ppod_days(organization_id, date)`,
  },
  {
    name: 'create ppod_days_org_date_name_unique',
    ddl: `CREATE UNIQUE INDEX IF NOT EXISTS ppod_days_org_date_name_unique ON ppod_days(organization_id, date, driver_name_raw)`,
  },
  {
    name: 'create ppod_name_mappings',
    ddl: `
      CREATE TABLE IF NOT EXISTS ppod_name_mappings (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        ppod_name TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(organization_id, ppod_name)
      )
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

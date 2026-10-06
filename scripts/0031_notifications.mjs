// 0031_notifications.mjs — adds email to drivers, notifications + notification_preferences tables
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
    name: 'drivers.email column',
    ddl: `ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "email" text`,
  },
  {
    name: 'notifications table',
    ddl: `
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" serial PRIMARY KEY NOT NULL,
        "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
        "recipient_id" integer NOT NULL REFERENCES "drivers"("id"),
        "type" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "link_to" text,
        "metadata" json,
        "read_at" timestamp,
        "email_sent_at" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `,
  },
  {
    name: 'notification_preferences table',
    ddl: `
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id" serial PRIMARY KEY NOT NULL,
        "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
        "type" text NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "in_app_enabled" boolean DEFAULT true NOT NULL,
        "email_enabled" boolean DEFAULT false NOT NULL,
        "recipient_roles" json DEFAULT '["owner"]'::json,
        "recipient_ids" json DEFAULT '[]'::json,
        "timing_days" json DEFAULT '[30,7,0]'::json,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `,
  },
  {
    name: 'notifications_recipient_unread_idx',
    ddl: `CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON notifications (recipient_id, read_at)`,
  },
  {
    name: 'notifications_org_created_idx',
    ddl: `CREATE INDEX IF NOT EXISTS notifications_org_created_idx ON notifications (organization_id, created_at)`,
  },
  {
    name: 'notification_preferences_org_type_idx',
    ddl: `CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_org_type_idx ON notification_preferences (organization_id, type)`,
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

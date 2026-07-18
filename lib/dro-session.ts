import { neon } from "@neondatabase/serverless";

export async function getDroSession(): Promise<string | null> {
  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);
  const rows = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookie' LIMIT 1`;
  return (rows[0]?.value as string) ?? null;
}

export async function saveDroSession(cookie: string): Promise<void> {
  const sql = neon(process.env.DATABASE_URL_POOLER ?? process.env.DATABASE_URL!);
  await sql`
    INSERT INTO settings (key, value) VALUES ('dro_session_cookie', ${cookie})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await sql`
    INSERT INTO settings (key, value) VALUES ('dro_session_saved_at', ${new Date().toISOString()})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

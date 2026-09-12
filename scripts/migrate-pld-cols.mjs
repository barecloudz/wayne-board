import { neon } from '@neondatabase/serverless';

const url = "postgresql://neondb_owner:npg_U0kBLf4ayoHi@ep-lucky-river-ae4l98bf-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";
const sql = neon(url);
await sql`ALTER TABLE dsw_route_days ADD COLUMN IF NOT EXISTS pld_impact_pkgs integer, ADD COLUMN IF NOT EXISTS pld_ghost_pkgs integer`;
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='dsw_route_days' AND column_name LIKE 'pld%'`;
console.log('Migration OK, pld columns:', cols.map(r => r.column_name));

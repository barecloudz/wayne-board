import { neon } from "@neondatabase/serverless";

const DATABASE_URL = "postgresql://neondb_owner:npg_U0kBLf4ayoHi@ep-lucky-river-ae4l98bf-pooler.c-2.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

const sql = neon(DATABASE_URL);
await sql`ALTER TABLE dsw_route_days ADD COLUMN IF NOT EXISTS code_breakdown text`;
console.log("Migration done: code_breakdown column added");
process.exit(0);

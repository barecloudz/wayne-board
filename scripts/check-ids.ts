import { neon } from "@neondatabase/serverless";
async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT id, unit_number FROM vehicles ORDER BY id`;
  console.log(rows);
  process.exit(0);
}
main();

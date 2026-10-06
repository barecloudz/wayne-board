/**
 * Local Spotlight sync test — runs with headed Chrome so you can watch every step.
 * Handles MFA OTP via terminal prompt instead of requiring the app UI.
 * Usage: npx tsx scripts/test-spotlight-local.mjs
 */
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0 && !line.startsWith("#")) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

if (!process.env.CHROME_EXECUTABLE_PATH) {
  console.error("CHROME_EXECUTABLE_PATH not set in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);

// Clear any stale OTP from previous runs
await sql`DELETE FROM settings WHERE organization_id = 1 AND key = 'spotlight_otp'`;

const { syncSpotlight } = await import("../lib/spotlight-sync.ts");

console.log("=== Local Spotlight Sync Test ===");
console.log("Chrome:", process.env.CHROME_EXECUTABLE_PATH);
console.log("Credentials: Marcus\n");

try {
  const result = await syncSpotlight({ triggeredByDriverId: "Marcus" });
  console.log("\n=== Result ===");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("\n=== Error ===");
  console.error(err?.message ?? err);
  process.exit(1);
}

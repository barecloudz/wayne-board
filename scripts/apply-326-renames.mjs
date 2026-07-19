/**
 * Applies anchor area renames from scripts/326-rename-plan.json to DRO.
 * Uses PATCH /api/api/anchor-areas/{id} to update the name field.
 *
 * Usage:
 *   node scripts/apply-326-renames.mjs --dry-run
 *   node scripts/apply-326-renames.mjs
 */

import fs from "fs";
import { neon } from "@neondatabase/serverless";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Load env ──────────────────────────────────────────────────────────────────
const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const DRO_BASE = "https://dro.routesmart.com";
const SA_ID    = "3060743";

// ── Load rename plan ──────────────────────────────────────────────────────────
const plan = JSON.parse(fs.readFileSync("./scripts/326-rename-plan.json", "utf8"));
console.log(`${plan.length} renames to apply${DRY_RUN ? " [DRY RUN]" : ""}\n`);

// ── DRO session ───────────────────────────────────────────────────────────────
const sql  = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const [row] = await sql`SELECT value FROM settings WHERE key = 'dro_session_cookies' LIMIT 1`;
if (!row?.value) { console.error("No DRO session — run scripts/refresh-dro-session.mjs"); process.exit(1); }
const headers = { Cookie: row.value, "Content-Type": "application/json" };

if (DRY_RUN) {
  for (const r of plan) {
    console.log(`  ${r.oldName.padEnd(36)} → ${r.newName}`);
  }
  console.log("\n[DRY RUN] Rerun without --dry-run to apply.");
  process.exit(0);
}

// ── Fetch current anchor area details (need full object for PATCH) ────────────
console.log("Fetching anchor areas from DRO...");
const areasRes = await fetch(`${DRO_BASE}/api/api/service-areas/${SA_ID}/anchor-area`, { headers });
const areasRaw = await areasRes.json();

const areaById = Object.fromEntries(areasRaw.map(a => [a.anchorAreaId, a]));

// ── Apply renames ─────────────────────────────────────────────────────────────
let ok = 0, fail = 0;

for (const rename of plan) {
  const area = areaById[rename.id];
  if (!area) {
    console.log(`❌ ID ${rename.id} not found in DRO — skipping`);
    fail++;
    continue;
  }

  // Try PATCH first, fall back to PUT
  const body = JSON.stringify({ ...area, Name: rename.newName, name: rename.newName });

  let res = await fetch(`${DRO_BASE}/api/api/anchor-areas/${rename.id}`, {
    method: "PATCH",
    headers,
    body,
  });

  if (res.status === 405) {
    // PATCH not allowed — try PUT
    res = await fetch(`${DRO_BASE}/api/api/anchor-areas/${rename.id}`, {
      method: "PUT",
      headers,
      body,
    });
  }

  const text = await res.text();
  if (res.ok) {
    console.log(`✅ ${rename.oldName.padEnd(36)} → ${rename.newName}`);
    ok++;
  } else {
    console.log(`❌ ${rename.oldName} — HTTP ${res.status}: ${text.slice(0, 120)}`);
    fail++;
  }

  // Brief pause between requests
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n✅ Renamed: ${ok}   ❌ Failed: ${fail}`);
if (fail > 0) {
  console.log("Note: DRO may not support rename via API. Manual rename may be needed in DRO UI.");
}

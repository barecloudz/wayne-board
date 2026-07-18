// Quick test script for the DRO sync engine
import { readFileSync } from "fs";

// Load .env.local
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const [k, ...v] = line.split("=");
  if (k?.trim() && v.length) process.env[k.trim()] = v.join("=").trim();
}

// Import compiled sync (via tsx/dynamic)
const { syncDro } = await import("../lib/dro-sync.ts");

console.log("Starting DRO sync...");
console.log("Username:", process.env.DRO_USERNAME);
const result = await syncDro();
console.log("\nResult:", JSON.stringify(result, null, 2));

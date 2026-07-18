/**
 * GroundCloud delivery metrics scraper — production version.
 * Uses native fetch (Node 18+). No Puppeteer required.
 *
 * Scrapes ONLY aggregate counts — no customer addresses, driver locations, or PII.
 * Run via GitHub Actions nightly; stores results in Neon PostgreSQL.
 *
 * Env vars required:
 *   GC_USERNAME, GC_PASSWORD
 *   DATABASE_URL or DATABASE_URL_POOLER
 */

import { neon } from "@neondatabase/serverless";

const GC_BASE   = "https://www.groundcloud.io";
const LOGIN_URL = `${GC_BASE}/dashboard/login/`;
const CUSTOMER_ID = 439;

// Stat-type codes discovered via API inspection on 2026-06-30
const STAT_TYPES = {
  stops_total:       { type: 100, source: 1 },
  stops_delivered:   { type: 103, source: 3 }, // GPS-validated
  impacts:           { type: 120, source: 1 },
  exceptions:        { type: 121, source: 1 },
  packages_total:    { type: 200, source: 1 },
  packages_delivered:{ type: 203, source: 3 }, // GPS-validated
};

// ── Cookie jar helpers ─────────────────────────────────────────────────────────
function parseCookies(setCookieHeaders) {
  const jar = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function cookieString(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── Step 1: Login, return session cookies ──────────────────────────────────────
async function login(username, password) {
  // GET login page to get CSRF token
  const getRes = await fetch(LOGIN_URL, { redirect: "follow" });
  const cookies = parseCookies(getRes.headers.getSetCookie?.() || []);
  const html = await getRes.text();

  // Extract csrfmiddlewaretoken from the hidden input
  const csrfMatch = html.match(/name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/);
  if (!csrfMatch) throw new Error("CSRF token not found in login page");
  const csrfToken = csrfMatch[1];
  cookies.csrftoken = cookies.csrftoken || csrfToken;

  // POST credentials
  const body = new URLSearchParams({
    csrfmiddlewaretoken: csrfToken,
    "auth-username": username,
    "auth-password": password,
  });

  const postRes = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieString(cookies),
      "Referer": LOGIN_URL,
    },
    body: body.toString(),
    redirect: "follow",
  });

  const newCookies = parseCookies(postRes.headers.getSetCookie?.() || []);
  const session = { ...cookies, ...newCookies };

  if (!session.sessionid) {
    throw new Error("Login failed — no sessionid cookie received. Check credentials.");
  }

  console.log("✓ Logged in to GroundCloud");
  return session;
}

// ── Step 2: Fetch daily stats from API ────────────────────────────────────────
async function fetchStats(session, date) {
  const statTypeParams = [100, 103, 120, 121, 200, 203]
    .map(t => `stat_type%5B%5D=${t}`)
    .join("&");

  const url = `${GC_BASE}/api/route-day-decimal-stats/?customer=${CUSTOMER_ID}&route_day__day=${date}&${statTypeParams}`;

  const res = await fetch(url, {
    headers: {
      "Cookie": cookieString(session),
      "X-CSRFToken": session.csrftoken || "",
      "Accept": "application/json",
    },
  });

  if (!res.ok) throw new Error(`API error ${res.status} for date ${date}`);
  const data = await res.json();
  return data.results || [];
}

// ── Step 3: Aggregate results by stat_type + source ───────────────────────────
function aggregateStats(results) {
  const sums = {};
  for (const r of results) {
    const key = `${r.stat_type}_${r.source}`;
    sums[key] = (sums[key] || 0) + parseFloat(r.value);
  }

  return {
    stops_total:        Math.round(sums["100_1"] || 0),
    stops_delivered:    Math.round(sums["103_3"] || 0),
    impacts:            Math.round(sums["120_1"] || 0),
    exceptions:         Math.round(sums["121_1"] || 0),
    packages_total:     Math.round(sums["200_1"] || 0),
    packages_delivered: Math.round(sums["203_3"] || 0),
  };
}

// ── Step 4: Upsert into Neon DB ───────────────────────────────────────────────
async function saveToDb(date, metrics) {
  const connStr = process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL;
  if (!connStr) throw new Error("DATABASE_URL not set");

  const sql = neon(connStr);

  await sql`
    INSERT INTO delivery_snapshots
      (date, stops_total, stops_delivered, impacts, exceptions,
       packages_total, packages_delivered, scraped_at)
    VALUES
      (${date}, ${metrics.stops_total}, ${metrics.stops_delivered},
       ${metrics.impacts}, ${metrics.exceptions},
       ${metrics.packages_total}, ${metrics.packages_delivered}, NOW())
    ON CONFLICT (date) DO UPDATE SET
      stops_total        = EXCLUDED.stops_total,
      stops_delivered    = EXCLUDED.stops_delivered,
      impacts            = EXCLUDED.impacts,
      exceptions         = EXCLUDED.exceptions,
      packages_total     = EXCLUDED.packages_total,
      packages_delivered = EXCLUDED.packages_delivered,
      scraped_at         = NOW()
  `;
  console.log("✓ Saved to DB:", date, metrics);
}

// ── Main ───────────────────────────────────────────────────────────────────────
const username = process.env.GC_USERNAME;
const password = process.env.GC_PASSWORD;
if (!username || !password) {
  console.error("GC_USERNAME and GC_PASSWORD env vars required");
  process.exit(1);
}

// Default: yesterday (so we capture the completed day's data)
const targetDate = process.env.GC_DATE || (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
})();

console.log("Scraping GroundCloud for date:", targetDate);

const session = await login(username, password);
const results = await fetchStats(session, targetDate);
console.log(`Fetched ${results.length} stat records for ${targetDate}`);

if (results.length === 0) {
  console.log("No data for this date — skipping DB write.");
  process.exit(0);
}

const metrics = aggregateStats(results);
console.log("Aggregated:", metrics);

await saveToDb(targetDate, metrics);
console.log("Done.");

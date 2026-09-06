/**
 * Spotlight RYDE sync.
 *
 * Flow:
 *  1. Headless Puppeteer → login to spotlight.fedex.com → intercept Bearer JWT
 *  2. MFA via api.dataworks.fedex.com (EMAIL OTP)
 *  3. Poll DB settings.spotlight_otp (written by Resend inbound webhook)
 *  4. Verify OTP → get EmbedToken from spoi powerbi/dashboard
 *  5. Power BI executeQueries (DAX) → raw RYDE Detail rows
 *  6. Aggregate per-driver per-week → upsert ryde_scores
 *  7. Store individual reviews (stars + comment) → ryde_reviews
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { neon } from "@neondatabase/serverless";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const SPOTLIGHT_URL = "https://spotlight.fedex.com/csp";
const MFA_BASE      = "https://api.dataworks.fedex.com/mfa-api/mfa/v1";
const SPOI_BASE     = "https://api.dataworks.fedex.com/spoi-api/spoi/v1";
const WABI_BASE     = "https://wabi-us-north-central-e-primary-redirect.analysis.windows.net";
const RYDE_REPORT_ID  = "8dc4a4f1-561f-4a04-a947-628cea03ee2d";
const RYDE_DATASET_ID = "16d67ff6-ea2d-42ba-8650-a7983b9f6262";
const CSA_ID          = "304169";
const USER_ID         = "6367044";

export type SpotlightSyncResult = {
  success: boolean;
  error?: string;
  drivers?: number;
  weeks?: number;
  reviews?: number;
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function syncSpotlight(): Promise<SpotlightSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('spotlight_username','spotlight_password')`;
  const credsMap  = Object.fromEntries(credsRows.map((r: any) => [r.key, r.value]));
  const username  = credsMap["spotlight_username"] || USER_ID;
  const password  = credsMap["spotlight_password"] || process.env.SPOTLIGHT_PASSWORD;

  if (!password) throw new Error("Spotlight password not configured. Add spotlight_password to settings.");

  // ── 1. Puppeteer login + capture Bearer JWT ───────────────────────────────
  console.log("[spotlight] Launching headless browser...");

  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(CHROMIUM_PACK),
    headless:       true,
    args:           [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
  });

  let bearerToken = "";

  try {
    const page = await browser.newPage();
    page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

    // Intercept Bearer from any api.dataworks.fedex.com request
    page.on("request", (req) => {
      if (req.url().includes("api.dataworks.fedex.com")) {
        const auth = req.headers()["authorization"];
        if (auth?.startsWith("Bearer ") && !bearerToken) {
          bearerToken = auth;
          console.log("[spotlight] Bearer token captured");
        }
      }
    });

    // Navigate → triggers Okta redirect
    await page.goto(SPOTLIGHT_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});

    // Wait for Okta username field
    await page.waitForSelector('input[name="identifier"], input[id="username"]', { timeout: 20000 });

    // Fill username
    await page.type('input[name="identifier"]', username);
    await (await page.$('input[type="submit"], button[type="submit"]'))?.click();

    // Fill password
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.type('input[type="password"]', password);
    const pwBtn = await page.$('input[type="submit"], button[type="submit"], input[value="Verify"]');
    if (pwBtn) await pwBtn.click(); else await page.keyboard.press("Enter");

    // Wait up to 30s for Bearer token
    const deadline = Date.now() + 30000;
    while (!bearerToken && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (!bearerToken) throw new Error("Spotlight login failed · Bearer token not captured after 30s");

    // ── 2. Ask user to choose OTP delivery method ─────────────────────────────
    console.log("[spotlight] Waiting for user to choose OTP delivery method...");

    await sql`DELETE FROM settings WHERE key IN ('spotlight_otp', 'spotlight_otp_at', 'spotlight_mfa_method')`;
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_sync_status', 'choosing_mfa')
      ON CONFLICT (key) DO UPDATE SET value = 'choosing_mfa'
    `;

    let mfaMethod = "";
    const mfaDeadline = Date.now() + 2 * 60 * 1000;
    while (!mfaMethod && Date.now() < mfaDeadline) {
      await new Promise(r => setTimeout(r, 3000));
      const rows = await sql`SELECT value FROM settings WHERE key = 'spotlight_mfa_method'`;
      if (rows[0]?.value) mfaMethod = rows[0].value as string;
    }
    if (!mfaMethod) mfaMethod = "EMAIL"; // default if user doesn't respond

    console.log("[spotlight] OTP delivery method chosen:", mfaMethod);

    // ── 3. Send OTP via chosen method (in browser context, cookies included) ──
    console.log("[spotlight] Sending OTP via", mfaMethod, "...");

    const genResult: any = await page.evaluate(
      async (mfaBase: string, bearer: string, userId: string, method: string) => {
        const h = { Authorization: bearer, "Content-Type": "application/json" };

        await fetch(`${mfaBase}/csrftoken?`, { credentials: "include", headers: h });
        await fetch(`${mfaBase}/user/details?userId=${userId}?withCredentials=true`, {
          method: "POST", credentials: "include", headers: h, body: "{}",
        });

        const r = await fetch(`${mfaBase}/passcode/generate?withCredentials=true`, {
          method: "POST",
          credentials: "include",
          headers: h,
          body: JSON.stringify({
            userPreference: { userId, userPreferredChoice: method },
            regenerateCount: 0,
          }),
        });
        return r.json();
      },
      MFA_BASE, bearerToken, USER_ID, mfaMethod
    );

    console.log("[spotlight] OTP generate result:", JSON.stringify(genResult));
    if (!genResult?.passcodeSent) {
      throw new Error("OTP send failed: " + JSON.stringify(genResult));
    }

    // ── 4. Poll DB for OTP (user enters it in the app UI) ───────────────────
    console.log("[spotlight] Waiting for OTP · signalling UI...");

    // Clear stale keys, signal UI to show OTP input
    await sql`DELETE FROM settings WHERE key IN ('spotlight_otp', 'spotlight_otp_at', 'spotlight_mfa_method')`;
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_sync_status', 'waiting_for_otp')
      ON CONFLICT (key) DO UPDATE SET value = 'waiting_for_otp'
    `;

    let otp = "";
    const otpDeadline = Date.now() + 5 * 60 * 1000;
    while (!otp && Date.now() < otpDeadline) {
      await new Promise(r => setTimeout(r, 10000));
      const rows = await sql`SELECT value FROM settings WHERE key = 'spotlight_otp'`;
      if (rows[0]?.value) {
        otp = rows[0].value as string;
        console.log("[spotlight] OTP received from DB:", otp);
      }
    }

    if (!otp) {
      throw new Error("OTP not received within 5 minutes. Enter the code sent to your FedEx email/phone in the Auto Spotlight page.");
    }

    // ── 4. Verify OTP + get EmbedToken ────────────────────────────────────────
    console.log("[spotlight] Verifying OTP and fetching EmbedToken...");

    const embedResult: any = await page.evaluate(
      async (mfaBase: string, spoiBase: string, bearer: string, userId: string, csaId: string, reportId: string, passcode: string) => {
        const h = { Authorization: bearer, "Content-Type": "application/json" };

        // Verify
        const vr = await fetch(`${mfaBase}/passcode/verify?withCredentials=true`, {
          method: "POST", credentials: "include", headers: h,
          body: JSON.stringify({ userId, passcode, verifyCount: 1 }),
        });
        const vd = await vr.json();
        if (!vd.passcodeVerified) return { __error: "OTP verify failed: " + JSON.stringify(vd) };

        // SPOI CSRF
        await fetch(`${spoiBase}/csrftoken?`, { credentials: "include", headers: h });

        // Get EmbedToken
        const dr = await fetch(`${spoiBase}/powerbi/dashboard?withCredentials=true`, {
          method: "POST", credentials: "include", headers: h,
          body: JSON.stringify({ userId, selectedCSAId: csaId, reportId }),
        });
        return dr.json();
      },
      MFA_BASE, SPOI_BASE, bearerToken, USER_ID, CSA_ID, RYDE_REPORT_ID, otp
    );

    if (embedResult?.__error) throw new Error(embedResult.__error);

    const embedToken = embedResult?.embedToken?.token;
    if (!embedToken) {
      throw new Error("No EmbedToken in dashboard response: " + JSON.stringify(embedResult).slice(0, 300));
    }

    console.log("[spotlight] EmbedToken acquired, closing browser...");
    await browser.close();

    // ── 5. Power BI executeQueries ────────────────────────────────────────────
    async function pbiFetch(query: string) {
      const res = await fetch(
        `${WABI_BASE}/v1.0/myorg/datasets/${RYDE_DATASET_ID}/executeQueries`,
        {
          method: "POST",
          headers: { Authorization: `EmbedToken ${embedToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ queries: [{ query }], serializerSettings: { includeNulls: true } }),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Power BI query failed (${res.status}): ${t.slice(0, 400)}`);
      }
      const data = await res.json();
      return data.results?.[0]?.tables?.[0]?.rows ?? [];
    }

    console.log("[spotlight] Querying RYDE Detail...");
    const rydeRows: any[] = await pbiFetch(`
      EVALUATE
      SELECTCOLUMNS(
        'RYDE Detail',
        "driver_id",        'RYDE Detail'[driver_id],
        "week_ending",      'RYDE Detail'[WEEK_ENDING],
        "star",             'RYDE Detail'[star],
        "why",              'RYDE Detail'[WHY_RATE_DESC],
        "neg_late",         'RYDE Detail'[NEG_LATE_DELIVERY],
        "neg_damage",       'RYDE Detail'[NEG_DAMAGE_PKG],
        "neg_instructions", 'RYDE Detail'[NEG_INSTRUCTIONS_NOT_FOLLOWED],
        "neg_placement",    'RYDE Detail'[NEG_BAD_PKG_PLACEMENT],
        "neg_knock",        'RYDE Detail'[NEG_NO_KNOCK_BELL],
        "neg_disrupt",      'RYDE Detail'[NEG_DISRUPT_DAY]
      )
      ORDER BY 'RYDE Detail'[WEEK_ENDING] DESC, 'RYDE Detail'[driver_id]
    `);

    console.log(`[spotlight] ${rydeRows.length} RYDE Detail rows`);

    console.log("[spotlight] Querying Resource Names...");
    const resourceRows: any[] = await pbiFetch(`
      EVALUATE
      SELECTCOLUMNS(
        'Resource Names',
        "fdxid", 'Resource Names'[FDXID],
        "name",  'Resource Names'[NAME]
      )
    `);

    // Build FDXID → name map (column names may have table prefix)
    function col(row: any, key: string): string {
      return (
        row[`RYDE Detail[${key}]`] ??
        row[`Resource Names[${key}]`] ??
        row[`[${key}]`] ??
        row[key] ??
        ""
      );
    }

    const fdxToName: Record<string, string> = {};
    for (const r of resourceRows) {
      const id   = col(r, "fdxid");
      const name = col(r, "name");
      if (id && name) fdxToName[id] = name;
    }

    // ── 6. Load our drivers · match by fedex_id (primary) or name (fallback) ──
    const dbDrivers = await sql`SELECT driver_id, name, fedex_id FROM drivers WHERE active = true`;

    // Primary: fedex_id → driver_id
    const fedexToDriverId: Record<string, string> = {};
    for (const d of dbDrivers) {
      if (d.fedex_id) fedexToDriverId[String(d.fedex_id)] = d.driver_id;
    }
    // Fallback: normalized name → driver_id
    const nameToDriverId: Record<string, string> = {};
    for (const d of dbDrivers) {
      nameToDriverId[normName(d.name)] = d.driver_id;
    }

    function resolveDriver(fdxId: string): string | null {
      // 1. Direct FedEx ID match
      if (fedexToDriverId[fdxId]) return fedexToDriverId[fdxId];
      // 2. Name match via Resource Names lookup
      const name = fdxToName[fdxId];
      if (name) return nameToDriverId[normName(name)] ?? null;
      return null;
    }

    // ── 7. Aggregate per driver+week, store scores + reviews ─────────────────
    type WeekEntry = {
      fdxId: string; week: string;
      stars: number[]; comments: string[];
    };
    const buckets = new Map<string, WeekEntry>();

    for (const row of rydeRows) {
      const fdxId = col(row, "driver_id");
      const rawWeek = col(row, "week_ending");
      if (!fdxId || !rawWeek) continue;

      const week  = dateToWeekStr(rawWeek);
      const bKey  = `${fdxId}::${week}`;
      if (!buckets.has(bKey)) {
        buckets.set(bKey, { fdxId, week, stars: [], comments: [] });
      }
      const bucket = buckets.get(bKey)!;

      const star = parseInt(col(row, "star"), 10);
      if (!isNaN(star) && star >= 1 && star <= 5) bucket.stars.push(star);

      const why = col(row, "why")?.trim();
      if (why) bucket.comments.push(why);
    }

    let scoreCount = 0;
    let reviewCount = 0;
    const weeksSeen = new Set<string>();

    for (const [, bucket] of buckets) {
      const ourId = resolveDriver(bucket.fdxId);
      if (!ourId) continue; // driver not in our system

      weeksSeen.add(bucket.week);

      const total     = bucket.stars.length;
      const avgStar   = total > 0 ? bucket.stars.reduce((s, x) => s + x, 0) / total : 0;
      const posReviews = bucket.stars.filter(s => s >= 4).length;

      // Upsert weekly score
      await sql`
        INSERT INTO ryde_scores (driver_id, score, week, deliveries, positive_reviews)
        VALUES (${ourId}, ${avgStar}, ${bucket.week}, ${total}, ${posReviews})
        ON CONFLICT (driver_id, week) DO UPDATE SET
          score           = EXCLUDED.score,
          deliveries      = EXCLUDED.deliveries,
          positive_reviews = EXCLUDED.positive_reviews
      `;
      scoreCount++;
    }

    // Store individual reviews (stars + comment only, no customer PII)
    for (const row of rydeRows) {
      const fdxId = col(row, "driver_id");
      const rawWeek = col(row, "week_ending");
      if (!fdxId || !rawWeek) continue;

      const ourId = resolveDriver(fdxId);
      if (!ourId) continue;

      const star    = parseInt(col(row, "star"), 10);
      const why     = col(row, "why")?.trim() || "";
      const week    = dateToWeekStr(rawWeek);
      const type    = star >= 4 ? "positive" : "negative";

      // Build category from neg flags
      const negFlags: string[] = [];
      if (Number(col(row, "neg_late")))         negFlags.push("late_delivery");
      if (Number(col(row, "neg_damage")))        negFlags.push("damaged_package");
      if (Number(col(row, "neg_instructions")))  negFlags.push("instructions_not_followed");
      if (Number(col(row, "neg_placement")))     negFlags.push("bad_placement");
      if (Number(col(row, "neg_knock")))         negFlags.push("no_knock_bell");
      if (Number(col(row, "neg_disrupt")))       negFlags.push("disruption");

      const category = negFlags.length > 0 ? negFlags.join(",") : (type === "positive" ? "positive_feedback" : "general");
      const content  = why || category;

      await sql`
        INSERT INTO ryde_reviews (driver_id, type, stars, category, content, week, at_fault)
        VALUES (${ourId}, ${type}, ${star}, ${category}, ${content}, ${week}, false)
      `;
      reviewCount++;
    }

    console.log(`[spotlight] Done · ${scoreCount} scores, ${reviewCount} reviews, ${weeksSeen.size} weeks`);
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_sync_status', 'idle')
      ON CONFLICT (key) DO UPDATE SET value = 'idle'
    `;
    return { success: true, drivers: scoreCount, weeks: weeksSeen.size, reviews: reviewCount };

  } catch (err) {
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_sync_status', 'idle')
      ON CONFLICT (key) DO UPDATE SET value = 'idle'
    `.catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts a date value (string or Date) to ISO week string "YYYY-Wnn". */
function dateToWeekStr(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((utc.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

/** Lowercase, letters only · for fuzzy name matching. */
function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

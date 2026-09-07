/**
 * Spotlight RYDE sync.
 *
 * Flow:
 *  1. Headless Puppeteer → login to MyBiz → click SPOTlight link → new tab opens
 *  2. Click LOGIN in Spotlight tab → Okta credentials → MFA radio buttons
 *  3. User selects MFA method in UI, enters OTP code; this code types it into browser
 *  4. EmbedToken captured from network traffic once authenticated
 *  5. Power BI executeQueries (DAX) → raw RYDE Detail rows
 *  6. Aggregate per-driver per-week → upsert ryde_scores
 *  7. Store individual reviews (stars + comment only, no customer PII) → ryde_reviews
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { neon } from "@neondatabase/serverless";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

const MYBIZ_BASE  = "https://mybizaccount.fedex.com";
const SPOI_BASE   = "https://api.dataworks.fedex.com/spoi-api/spoi/v1";
const WABI_BASE   = "https://wabi-us-north-central-e-primary-redirect.analysis.windows.net";

// These are FedEx Spotlight's internal Power BI IDs — same for all orgs using Spotlight
const RYDE_REPORT_ID  = "8dc4a4f1-561f-4a04-a947-628cea03ee2d";
const RYDE_DATASET_ID = "16d67ff6-ea2d-42ba-8650-a7983b9f6262";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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

  const credsRows = await sql`
    SELECT organization_id, key, value FROM settings
    WHERE key IN ('spotlight_username','spotlight_password','spotlight_lookback_weeks','spotlight_csa_id')
    LIMIT 4
  `;
  const orgId    = (credsRows[0]?.organization_id as number) ?? 1;
  const credsMap = Object.fromEntries(credsRows.map((r: any) => [r.key, r.value]));
  const username    = credsMap["spotlight_username"];
  const password    = credsMap["spotlight_password"] || process.env.SPOTLIGHT_PASSWORD;
  const csaId       = credsMap["spotlight_csa_id"] || process.env.SPOTLIGHT_CSA_ID || "";
  // 0 = all data, otherwise limit to N weeks back from today
  const lookbackWeeks = parseInt(credsMap["spotlight_lookback_weeks"] ?? "0", 10);

  if (!username || !password) {
    throw new Error("Spotlight credentials not configured. Add spotlight_username and spotlight_password in Settings.");
  }
  if (!csaId) {
    throw new Error("Spotlight CSA ID not configured. Add your FedEx Contract Service Area ID in Settings.");
  }

  async function upsertSetting(key: string, value: string) {
    await sql`
      INSERT INTO settings (organization_id, key, value) VALUES (${orgId}, ${key}, ${value})
      ON CONFLICT (organization_id, key) DO UPDATE SET value = ${value}
    `;
  }

  async function deleteSetting(...keys: string[]) {
    for (const key of keys) {
      await sql`DELETE FROM settings WHERE organization_id = ${orgId} AND key = ${key}`;
    }
  }

  async function setStatus(value: string) {
    await upsertSetting("spotlight_sync_status", value);
  }

  // ── 1. Launch browser ─────────────────────────────────────────────────────
  await setStatus("launching");
  await upsertSetting("spotlight_sync_started_at", new Date().toISOString());
  console.log("[spotlight] Launching browser...");

  const localChrome    = process.env.CHROME_EXECUTABLE_PATH;
  const executablePath = localChrome || await chromium.executablePath(CHROMIUM_PACK);
  const browser = await puppeteer.launch({
    executablePath,
    // Use headed mode for local testing so we can watch; headless for serverless
    headless: localChrome ? false : true,
    args: localChrome
      ? [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--start-maximized",
          "--disable-features=IsolateOrigins,site-per-process",
        ]
      : [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
  });

  let bearerToken = "";
  let embedToken  = "";

  // Attach request/response interceptors to any page so we capture tokens passively
  function attachListeners(p: any) {
    p.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });
    p.on("request", (req: any) => {
      const url  = req.url();
      const auth = req.headers()["authorization"] ?? "";
      if (url.includes("api.dataworks.fedex.com") && auth.startsWith("Bearer ") && !bearerToken) {
        bearerToken = auth;
        console.log("[spotlight] Bearer token captured");
      }
      if ((url.includes("analysis.windows.net") || url.includes("powerbi.com")) && auth.startsWith("EmbedToken ") && !embedToken) {
        embedToken = auth.replace("EmbedToken ", "");
        console.log("[spotlight] EmbedToken captured from outgoing Power BI request");
      }
    });
    p.on("response", async (res: any) => {
      try {
        if (res.url().includes("powerbi/dashboard") && res.status() === 200) {
          const json = await res.json().catch(() => null);
          if (json?.embedToken?.token && !embedToken) {
            embedToken = json.embedToken.token;
            console.log("[spotlight] EmbedToken captured from /powerbi/dashboard response");
          }
        }
      } catch {}
    });
  }

  try {
    const page = await browser.newPage();
    attachListeners(page);

    // Attach listeners to any new tabs that open (Spotlight opens in a new tab)
    (browser as any).on("targetcreated", async (t: any) => {
      const p = await t.page().catch(() => null);
      if (p) attachListeners(p);
    });

    // ── 2. MyBiz login ────────────────────────────────────────────────────────
    await setStatus("logging_in");
    console.log("[spotlight] Navigating to MyBiz...");
    await page.goto(`${MYBIZ_BASE}/my.policy`, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(2000);

    // Click "Sign In" button if present on landing page
    const signInBtn = await page.$('input[value="Sign In"], input[type="submit"]').catch(() => null);
    if (signInBtn) {
      await (signInBtn as any).click();
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
      await sleep(2000);
    }

    // Fill Okta username + password
    try {
      await page.waitForSelector('input[name="identifier"]', { timeout: 15000 });
      console.log("[spotlight] Filling MyBiz Okta credentials...");
      const uf = await page.$('input[name="identifier"]') as any;
      await uf.click({ clickCount: 3 });
      await uf.type(username, { delay: 40 });
      const nb = await page.$('input[type="submit"], button[type="submit"]') as any;
      if (nb) await nb.click(); else await page.keyboard.press("Enter");
      await sleep(3000);
      await page.waitForSelector('input[type="password"]', { timeout: 15000 });
      const pf = await page.$('input[type="password"]') as any;
      await pf.click({ clickCount: 3 });
      await pf.type(password, { delay: 40 });
      const sb = await page.$('input[type="submit"], button[type="submit"]') as any;
      if (sb) await sb.click(); else await page.keyboard.press("Enter");
      console.log("[spotlight] Credentials submitted, waiting for MyBiz dashboard...");
      await sleep(15000);
    } catch {
      console.log("[spotlight] Okta form not found — already authenticated to MyBiz");
    }
    console.log("[spotlight] MyBiz ready");

    // ── 3. Find and click SPOTlight link in frames ────────────────────────────
    console.log("[spotlight] Searching for SPOTlight link in page frames...");
    let clickedSpotlight = false;
    for (const frame of page.frames()) {
      try {
        const el = await frame.$('a::-p-text(SPOTlight)');
        if (el) {
          console.log("[spotlight] Found SPOTlight link, clicking...");
          await (el as any).click();
          clickedSpotlight = true;
          break;
        }
      } catch {}
    }
    if (!clickedSpotlight) {
      throw new Error("SPOTlight link not found in MyBiz — login may have failed or SPOTlight is not listed in your account");
    }

    // ── 4. Find Spotlight tab ─────────────────────────────────────────────────
    // SPOTlight opens in a new browser window/tab
    await sleep(5000);
    let spotPage: any = null;
    for (const t of (browser as any).targets()) {
      if (t.url().includes("spotlight.fedex.com")) {
        spotPage = await t.page().catch(() => null);
        break;
      }
    }
    if (!spotPage) {
      throw new Error("Spotlight tab did not open — check that your browser allows pop-ups or new tabs");
    }
    console.log("[spotlight] Spotlight tab found:", spotPage.url().slice(0, 70));

    // ── 5. Click LOGIN button on Spotlight landing page ───────────────────────
    try {
      const loginBtn = await spotPage.$(
        'button.fdx-c-button--primary, button::-p-text(Login), button::-p-text(LOGIN)'
      ).catch(() => null);
      if (loginBtn) {
        console.log("[spotlight] Clicking LOGIN in Spotlight...");
        await loginBtn.click();
        await sleep(3000);
      }
    } catch (e: any) { console.log("[spotlight] LOGIN click:", e.message); }

    // ── 6. Fill Okta credentials again in Spotlight tab ──────────────────────
    try {
      await spotPage.waitForSelector('input[name="identifier"]', { timeout: 15000 });
      console.log("[spotlight] Filling Spotlight Okta credentials...");
      const uf = await spotPage.$('input[name="identifier"]') as any;
      await uf.click({ clickCount: 3 });
      await uf.type(username, { delay: 40 });
      const nb = await spotPage.$('input[type="submit"], button[type="submit"]') as any;
      if (nb) await nb.click(); else await spotPage.keyboard.press("Enter");
      await sleep(3000);
      await spotPage.waitForSelector('input[type="password"]', { timeout: 15000 });
      const pf = await spotPage.$('input[type="password"]') as any;
      await pf.click({ clickCount: 3 });
      await pf.type(password, { delay: 40 });
      const sb = await spotPage.$('input[type="submit"], button[type="submit"]') as any;
      if (sb) await sb.click(); else await spotPage.keyboard.press("Enter");
      console.log("[spotlight] Spotlight Okta submitted, waiting for MFA page...");
      await sleep(3000);
    } catch (e: any) { console.log("[spotlight] Spotlight Okta fill:", e.message); }

    // ── 7. Detect available MFA methods from radio buttons ────────────────────
    await setStatus("detecting_mfa");
    console.log("[spotlight] Waiting for MFA preference page...");

    let availableMethods: string[] = [];
    try {
      await spotPage.waitForSelector('input[type="radio"]', { timeout: 20000 });
      const radios = await spotPage.$$eval(
        'input[type="radio"]',
        (els: any[]) => els.map(el => ({ value: el.value, id: el.id }))
      );
      console.log("[spotlight] MFA radios found:", JSON.stringify(radios));
      availableMethods = radios
        .filter((r: any) => r.value)
        .map((r: any) => r.value.toUpperCase());
    } catch (e: any) {
      console.log("[spotlight] Could not detect MFA radio buttons:", e.message);
    }
    if (availableMethods.length === 0) availableMethods = ["EMAIL"];

    console.log("[spotlight] Available MFA methods:", availableMethods);
    await deleteSetting("spotlight_otp", "spotlight_otp_at", "spotlight_mfa_method", "spotlight_mfa_options", "spotlight_otp_error");
    await upsertSetting("spotlight_mfa_options", availableMethods.join(","));

    // ── 8. Choose MFA method ──────────────────────────────────────────────────
    let mfaMethod: string;
    if (availableMethods.length === 1) {
      mfaMethod = availableMethods[0];
      console.log("[spotlight] Auto-selecting sole MFA method:", mfaMethod);
    } else {
      await setStatus("choosing_mfa");
      console.log("[spotlight] Waiting for user to choose MFA method in UI...");
      let chosen = "";
      const choiceDeadline = Date.now() + 2 * 60 * 1000;
      while (!chosen && Date.now() < choiceDeadline) {
        await sleep(3000);
        const rows = await sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'spotlight_mfa_method'`;
        if (rows[0]?.value) chosen = rows[0].value as string;
      }
      mfaMethod = chosen || availableMethods[0];
      console.log("[spotlight] MFA method selected:", mfaMethod);
    }

    // ── 9. Click radio button for chosen method + Send Passcode ───────────────
    try {
      const radioValue = mfaMethod.toLowerCase(); // "email" or "phone"
      // Angular-style MFA forms require clicking the label, not the input
      const label = await spotPage.$(`label[for="${radioValue}"]`).catch(() => null);
      if (label) {
        await label.click();
      } else {
        await spotPage.$eval(
          `input[type="radio"][value="${radioValue}"]`,
          (el: any) => el.click()
        ).catch(async () => {
          // Fallback: click by matching partial value
          await spotPage.$eval(
            `input[type="radio"]`,
            (el: any, v: string) => { if (el.value?.toLowerCase().includes(v)) el.click(); },
            radioValue
          ).catch(() => {});
        });
      }
      await sleep(500);

      // "Send Passcode" button — FedEx uses class sr-pref-card-btn-login
      const sendBtn = await spotPage.$('button.sr-pref-card-btn-login').catch(() => null)
        ?? await spotPage.$('button::-p-text(Send Passcode)').catch(() => null)
        ?? await spotPage.$('button[type="submit"]').catch(() => null);
      if (sendBtn) {
        console.log("[spotlight] Clicking Send Passcode...");
        await sendBtn.click();
      }
    } catch (e: any) {
      console.log("[spotlight] MFA radio/send error:", e.message);
    }

    // ── 10. Poll DB for OTP, type into browser (retry up to 3 times) ──────────
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await deleteSetting("spotlight_otp", "spotlight_otp_at", "spotlight_resend_otp");
      await setStatus("waiting_for_otp");
      console.log(`[spotlight] Waiting for OTP from user (attempt ${attempt}/${MAX_ATTEMPTS})...`);

      let otp = "";
      let resendRequested = false;
      const otpDeadline = Date.now() + 10 * 60 * 1000; // 10 min — enough time to receive + enter code

      while (!otp && !resendRequested && Date.now() < otpDeadline) {
        await sleep(5000);
        const [otpRow, resendRow] = await Promise.all([
          sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'spotlight_otp'`,
          sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'spotlight_resend_otp'`,
        ]);
        if (otpRow[0]?.value) otp = otpRow[0].value as string;
        if (resendRow[0]?.value === "1") resendRequested = true;
      }

      if (resendRequested) {
        console.log("[spotlight] Resend requested by user...");
        await deleteSetting("spotlight_resend_otp");
        // Try clicking a resend link if present, otherwise re-click Send Passcode
        try {
          const resendLink = await spotPage.$('a::-p-text(Resend), button::-p-text(Resend)').catch(() => null);
          if (resendLink) {
            await resendLink.click();
          } else {
            const sendBtn = await spotPage.$('button.sr-pref-card-btn-login, button::-p-text(Send Passcode)').catch(() => null);
            if (sendBtn) await sendBtn.click();
          }
        } catch (e: any) { console.log("[spotlight] Resend click error:", e.message); }
        attempt--; // don't count resend as an attempt
        continue;
      }

      if (!otp) throw new Error("OTP not entered within 5 minutes.");

      // Type OTP into the Spotlight browser page's OTP input
      console.log("[spotlight] Typing OTP into browser OTP field...");
      try {
        await spotPage.waitForSelector(
          'input[type="tel"], input[type="text"][maxlength], input[name*="pass"], input[placeholder*="code"], input[placeholder*="passcode"]',
          { timeout: 30000 }
        );
        const otpInput = await spotPage.$(
          'input[type="tel"], input[type="text"][maxlength="6"], input[name*="pass"]'
        ) as any ?? await spotPage.$('input[type="text"]') as any;

        if (otpInput) {
          await otpInput.click({ clickCount: 3 });
          await otpInput.type(otp, { delay: 80 });
          await sleep(300);
          const verifyBtn = await spotPage.$(
            'button[type="submit"], input[type="submit"], button::-p-text(Verify), button::-p-text(Submit), button::-p-text(Continue)'
          ).catch(() => null);
          if (verifyBtn) await (verifyBtn as any).click();
          else await spotPage.keyboard.press("Enter");
        } else {
          console.log("[spotlight] OTP input field not found — pressing Enter");
          await spotPage.keyboard.press("Enter");
        }
      } catch (e: any) {
        console.log("[spotlight] OTP input error:", e.message);
      }

      // Give Spotlight a moment to process the OTP and redirect
      await sleep(4000);

      // Check for error on page BEFORE navigation (wrong code shows error immediately)
      const errText: string = await spotPage.evaluate(() => {
        const el = document.querySelector('[class*="error"], [class*="invalid"], [role="alert"], .sr-error-message');
        return el?.textContent?.trim() ?? "";
      }).catch(() => "");

      if (errText) {
        const errMsg = errText;
        console.log("[spotlight] OTP error on page:", errMsg);
        if (attempt < MAX_ATTEMPTS) {
          await deleteSetting("spotlight_otp");
          await setStatus("otp_failed");
          await upsertSetting("spotlight_otp_error", errMsg);
          console.log("[spotlight] Waiting for user to re-enter code...");
        } else {
          throw new Error(`Verification failed after ${MAX_ATTEMPTS} attempts: ${errMsg}`);
        }
        continue;
      }

      // OTP accepted — navigate toward RYDE report to trigger EmbedToken in network traffic
      console.log("[spotlight] OTP accepted, navigating to RYDE report to capture EmbedToken...");
      await setStatus("pulling_data");

      // Try UI navigation: U.S. Pickup & Delivery -> Report Selection -> P&D Cust Exp -> RYDE
      try {
        const uspd = await spotPage.waitForSelector(
          'button::-p-text(U.S. Pickup & Delivery), a::-p-text(U.S. Pickup & Delivery)',
          { timeout: 10000 }
        ).catch(() => null);
        if (uspd) { await (uspd as any).click(); await sleep(1500); }

        const reportSel = await spotPage.$('button::-p-text(Report Selection), a::-p-text(Report Selection)').catch(() => null);
        if (reportSel) { await (reportSel as any).click(); await sleep(1000); }

        const pdNav = await spotPage.$('[class*="dropdown"]::-p-text(P&D Customer Experience), a::-p-text(P&D Customer Experience)').catch(() => null);
        if (pdNav) { await (pdNav as any).click(); await sleep(800); }

        const rydeNav = await spotPage.$('a::-p-text(RYDE), button::-p-text(RYDE), li::-p-text(RYDE)').catch(() => null);
        if (rydeNav) { await (rydeNav as any).click(); await sleep(3000); }
      } catch (e: any) { console.log("[spotlight] Nav error:", e.message); }

      // Wait up to 60s for EmbedToken from network traffic as Power BI loads
      console.log("[spotlight] Waiting for EmbedToken in network traffic...");
      const verifyDeadline = Date.now() + 60000;
      while (!embedToken && Date.now() < verifyDeadline) await sleep(1000);

      // Fallback: if still no EmbedToken, try SPOI API directly with Bearer + browser session cookies
      if (!embedToken && bearerToken) {
        console.log("[spotlight] Trying SPOI API fallback to get EmbedToken...");
        try {
          const embedResult: any = await spotPage.evaluate(
            async (spoiBase: string, bearer: string, userId: string, csaId: string, reportId: string) => {
              const h = { Authorization: bearer, "Content-Type": "application/json" };
              await fetch(`${spoiBase}/csrftoken?`, { credentials: "include", headers: h });
              const dr = await fetch(`${spoiBase}/powerbi/dashboard?withCredentials=true`, {
                method: "POST", credentials: "include", headers: h,
                body: JSON.stringify({ userId, selectedCSAId: csaId, reportId }),
              });
              return dr.ok ? dr.json() : { error: `HTTP ${dr.status}` };
            },
            SPOI_BASE, bearerToken, username, csaId, RYDE_REPORT_ID
          );
          if (embedResult?.embedToken?.token) {
            embedToken = embedResult.embedToken.token;
            console.log("[spotlight] EmbedToken obtained via SPOI API fallback");
          } else {
            console.log("[spotlight] SPOI API fallback result:", JSON.stringify(embedResult).slice(0, 200));
          }
        } catch (e: any) { console.log("[spotlight] SPOI API fallback error:", e.message); }
      }

      if (embedToken) {
        console.log("[spotlight] Authentication complete, EmbedToken captured!");
        break;
      }

      const errMsg = `OTP verified but could not reach Power BI report (attempt ${attempt})`;
      console.log("[spotlight] OTP verify error:", errMsg);

      if (attempt < MAX_ATTEMPTS) {
        await deleteSetting("spotlight_otp");
        await setStatus("otp_failed");
        await upsertSetting("spotlight_otp_error", errMsg);
        console.log("[spotlight] Waiting for user to re-enter code...");
      } else {
        throw new Error(`Verification failed after ${MAX_ATTEMPTS} attempts: ${errMsg}`);
      }
    }

    if (!embedToken) throw new Error("EmbedToken not captured — authentication did not complete.");

    await setStatus("pulling_data");
    console.log("[spotlight] Closing browser, querying Power BI...");
    await browser.close();

    // ── 11. Power BI executeQueries ───────────────────────────────────────────
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
    const allRydeRows: any[] = await pbiFetch(`
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

    console.log(`[spotlight] ${allRydeRows.length} total RYDE Detail rows from Power BI`);

    // Apply lookback filter if configured
    let rydeRows = allRydeRows;
    if (lookbackWeeks > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - lookbackWeeks * 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      rydeRows = allRydeRows.filter(row => {
        const rawWeek = col(row, "week_ending");
        if (!rawWeek) return false;
        const d = new Date(rawWeek);
        return !isNaN(d.getTime()) && d >= cutoff;
      });
      console.log(`[spotlight] After ${lookbackWeeks}-week lookback filter: ${rydeRows.length} rows (cutoff ${cutoffStr})`);
    }

    console.log("[spotlight] Querying Resource Names...");
    const resourceRows: any[] = await pbiFetch(`
      EVALUATE
      SELECTCOLUMNS(
        'Resource Names',
        "fdxid", 'Resource Names'[FDXID],
        "name",  'Resource Names'[NAME]
      )
    `);

    // Build FDXID → name map (column names may carry table prefix from Power BI)
    const fdxToName: Record<string, string> = {};
    for (const r of resourceRows) {
      const id   = col(r, "fdxid");
      const name = col(r, "name");
      if (id && name) fdxToName[id] = name;
    }

    // ── 12. Match against our drivers ─────────────────────────────────────────
    const dbDrivers = await sql`SELECT driver_id, name, fedex_id FROM drivers WHERE active = true`;

    const fedexToDriverId: Record<string, string> = {};
    const nameToDriverId:  Record<string, string> = {};
    for (const d of dbDrivers) {
      if (d.fedex_id) fedexToDriverId[String(d.fedex_id)] = d.driver_id;
      nameToDriverId[normName(d.name)] = d.driver_id;
    }

    function resolveDriver(fdxId: string): string | null {
      if (fedexToDriverId[fdxId]) return fedexToDriverId[fdxId];
      const name = fdxToName[fdxId];
      if (name) return nameToDriverId[normName(name)] ?? null;
      return null;
    }

    // ── 13. Aggregate per driver+week, upsert scores ──────────────────────────
    type WeekEntry = { fdxId: string; week: string; stars: number[]; };
    const buckets = new Map<string, WeekEntry>();

    for (const row of rydeRows) {
      const fdxId   = col(row, "driver_id");
      const rawWeek = col(row, "week_ending");
      if (!fdxId || !rawWeek) continue;

      const week = dateToWeekStr(rawWeek);
      const bKey = `${fdxId}::${week}`;
      if (!buckets.has(bKey)) buckets.set(bKey, { fdxId, week, stars: [] });

      const star = parseInt(col(row, "star"), 10);
      if (!isNaN(star) && star >= 1 && star <= 5) buckets.get(bKey)!.stars.push(star);
    }

    let scoreCount = 0;
    const weeksSeen = new Set<string>();

    for (const [, bucket] of buckets) {
      const ourId = resolveDriver(bucket.fdxId);
      if (!ourId) continue;

      weeksSeen.add(bucket.week);
      const total      = bucket.stars.length;
      const avgStar    = total > 0 ? bucket.stars.reduce((s, x) => s + x, 0) / total : 0;
      const posReviews = bucket.stars.filter(s => s >= 4).length;

      await sql`
        INSERT INTO ryde_scores (driver_id, score, week, deliveries, positive_reviews, organization_id)
        VALUES (${ourId}, ${avgStar}, ${bucket.week}, ${total}, ${posReviews}, ${orgId})
        ON CONFLICT (driver_id, week) DO UPDATE SET
          score            = EXCLUDED.score,
          deliveries       = EXCLUDED.deliveries,
          positive_reviews = EXCLUDED.positive_reviews
      `;
      scoreCount++;
    }

    // ── 14. Store individual reviews (stars + category only, no customer PII) ──
    let reviewCount = 0;

    for (const row of rydeRows) {
      const fdxId   = col(row, "driver_id");
      const rawWeek = col(row, "week_ending");
      if (!fdxId || !rawWeek) continue;

      const ourId = resolveDriver(fdxId);
      if (!ourId) continue;

      const star = parseInt(col(row, "star"), 10);
      const why  = col(row, "why")?.trim() || "";
      const week = dateToWeekStr(rawWeek);
      const type = star >= 4 ? "positive" : "negative";

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
        INSERT INTO ryde_reviews (organization_id, driver_id, type, stars, category, content, week, at_fault)
        VALUES (${orgId}, ${ourId}, ${type}, ${star}, ${category}, ${content}, ${week}, false)
      `;
      reviewCount++;
    }

    console.log(`[spotlight] Done — ${scoreCount} scores, ${reviewCount} reviews, ${weeksSeen.size} weeks`);
    await upsertSetting("spotlight_sync_status", "idle");
    return { success: true, drivers: scoreCount, weeks: weeksSeen.size, reviews: reviewCount };

  } catch (err) {
    await upsertSetting("spotlight_sync_status", "idle").catch(() => {});
    await (browser as any).close().catch(() => {});
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function col(row: any, key: string): string {
  return (
    row[`RYDE Detail[${key}]`] ??
    row[`Resource Names[${key}]`] ??
    row[`[${key}]`] ??
    row[key] ??
    ""
  );
}

/** Converts a date value to ISO week string "YYYY-Wnn". */
function dateToWeekStr(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const wk   = Math.ceil(((utc.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

/** Lowercase, letters only — for fuzzy name matching. */
function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

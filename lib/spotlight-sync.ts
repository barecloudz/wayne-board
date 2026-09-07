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

export async function syncSpotlight(
  { triggeredByDriverId }: { triggeredByDriverId?: string | null } = {}
): Promise<SpotlightSyncResult> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Resolve org (cron/background — no session; always use first org until multi-org support added)
  const orgRows = await sql`SELECT id FROM organizations LIMIT 1`;
  const orgId = orgRows[0]?.id as number;
  if (!orgId) throw new Error("No organization found");

  // Load credentials from user_settings (per-user) when we know who triggered the sync
  let username: string | undefined;
  let password: string | undefined;
  if (triggeredByDriverId) {
    const userCredsRows = await sql`
      SELECT key, value FROM user_settings
      WHERE driver_id = ${triggeredByDriverId} AND key IN ('spotlight_username', 'spotlight_password')
    `;
    const map = Object.fromEntries((userCredsRows as any[]).map(r => [r.key, r.value]));
    username = map["spotlight_username"];
    password = map["spotlight_password"];
  }

  // Fallback to org-level settings or env (cron jobs, legacy)
  if (!username || !password) {
    const orgCredsRows = await sql`
      SELECT key, value FROM settings
      WHERE organization_id = ${orgId} AND key IN ('spotlight_username', 'spotlight_password')
    `;
    const map = Object.fromEntries((orgCredsRows as any[]).map(r => [r.key, r.value]));
    username = username || map["spotlight_username"];
    password = password || map["spotlight_password"] || process.env.SPOTLIGHT_PASSWORD;
  }

  // Org-level settings: CSA ID (one-time per org) and lookback range
  const orgSettingsRows = await sql`
    SELECT key, value FROM settings
    WHERE organization_id = ${orgId} AND key IN ('spotlight_lookback_weeks', 'spotlight_csa_id')
  `;
  const orgMap = Object.fromEntries((orgSettingsRows as any[]).map(r => [r.key, r.value]));
  let csaId         = orgMap["spotlight_csa_id"] || process.env.SPOTLIGHT_CSA_ID || "";
  const lookbackWeeks = parseInt(orgMap["spotlight_lookback_weeks"] ?? "0", 10);

  if (!username || !password) {
    throw new Error("Spotlight credentials not configured. Go to Auto Spotlight → Credentials and save your FedEx login.");
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
          "--disable-popup-blocking",
          "--disable-features=IsolateOrigins,site-per-process",
          "--user-data-dir=C:/tmp/puppeteer-spotlight-clean",
        ]
      : [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-popup-blocking"],
  });

  let bearerToken = "";
  let embedToken  = "";
  // QES = Power BI Query Execution Service responses (pbidedicated.windows.net)
  // These contain the actual RYDE rows in DSR format — we capture all of them.
  const qesResponses: any[] = [];

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
    });
    p.on("response", async (res: any) => {
      try {
        const url = res.url();
        // Capture SPOI powerbi/dashboard response → embedToken
        if (url.includes("powerbi/dashboard") && res.status() === 200) {
          const json = await res.json().catch(() => null);
          if (json?.embedToken?.token && !embedToken) {
            embedToken = json.embedToken.token;
            console.log("[spotlight] EmbedToken captured from /powerbi/dashboard response");
          }
        }
        // Capture QES query responses — these contain the actual RYDE rows
        if (url.includes("pbidedicated.windows.net") && url.includes("QueryExecutionService") && res.status() === 200) {
          const json = await res.json().catch(() => null);
          if (json?.results?.[0]?.result?.data?.dsr) {
            qesResponses.push(json);
            console.log(`[spotlight] QES response captured (#${qesResponses.length})`);
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

    // ── 5b. Handle second Okta credentials form on Spotlight tab ─────────────
    // When the Spotlight session is cold, clicking LOGIN navigates to Okta credentials.
    // Fill username+password if the form appears (same credentials as MyBiz Okta).
    try {
      const hasOktaForm = await spotPage.waitForSelector('input[name="identifier"]', { timeout: 8000 }).then(() => true).catch(() => false);
      if (hasOktaForm) {
        console.log("[spotlight] Second Okta credentials form detected — filling credentials...");
        const uf = await spotPage.$('input[name="identifier"]') as any;
        if (uf) { await uf.click({ clickCount: 3 }); await uf.type(username, { delay: 40 }); }
        const nb = await spotPage.$('input[type="submit"], button[type="submit"]') as any;
        if (nb) await nb.click(); else await spotPage.keyboard.press("Enter");
        await sleep(3000);
        const pf = await spotPage.$('input[type="password"]') as any;
        if (pf) { await pf.click({ clickCount: 3 }); await pf.type(password, { delay: 40 }); }
        const sb = await spotPage.$('input[type="submit"], button[type="submit"]') as any;
        if (sb) await sb.click(); else await spotPage.keyboard.press("Enter");
        console.log("[spotlight] Spotlight Okta credentials submitted, waiting...");
        await sleep(5000);
      }
    } catch {}

    // ── 6. Spotlight MFA preference page ─────────────────────────────────────
    // After clicking LOGIN (and optionally re-authenticating via Okta), Spotlight
    // redirects to /csp/login-preference — its own MFA selector (phone/email).
    await setStatus("detecting_mfa");
    console.log("[spotlight] Waiting for Spotlight MFA preference page...");

    let availableMethods: string[] = [];
    try {
      await spotPage.waitForSelector(
        'button, input[type="radio"]',
        { timeout: 20000 }
      );
      // Detect phone vs email options by scanning label/sibling text
      const labelTexts: string[] = await spotPage.$$eval(
        'label, [class*="pref"] *, [class*="card"] *',
        (els: any[]) => els.map(el => el.textContent?.trim() ?? "").filter(Boolean)
      ).catch(() => [] as string[]);
      for (const t of labelTexts) {
        if (/\*{3,}\d{4}/.test(t) || t.toLowerCase().includes("phone")) {
          if (!availableMethods.includes("PHONE")) availableMethods.push("PHONE");
        } else if (t.includes("@") || t.toLowerCase().includes("email")) {
          if (!availableMethods.includes("EMAIL")) availableMethods.push("EMAIL");
        }
      }
      if (availableMethods.length === 0) availableMethods = ["PHONE"];
    } catch (e: any) {
      console.log("[spotlight] MFA pref page wait:", e.message);
      availableMethods = ["PHONE"];
    }

    console.log("[spotlight] Available MFA methods:", availableMethods);
    await deleteSetting("spotlight_otp", "spotlight_otp_at", "spotlight_mfa_method", "spotlight_mfa_options", "spotlight_otp_error");
    await upsertSetting("spotlight_mfa_options", availableMethods.join(","));

    // ── 8. Choose MFA method ──────────────────────────────────────────────────
    // Check for a persistent preferred method (never cleared between runs)
    const preferredRows = await sql`SELECT value FROM settings WHERE organization_id = ${orgId} AND key = 'spotlight_mfa_preferred'`;
    const preferred = (preferredRows[0]?.value as string | undefined)?.toUpperCase();

    let mfaMethod: string;
    if (availableMethods.length === 1) {
      mfaMethod = availableMethods[0];
      console.log("[spotlight] Auto-selecting sole MFA method:", mfaMethod);
    } else if (preferred && availableMethods.map(m => m.toUpperCase()).includes(preferred)) {
      mfaMethod = preferred;
      console.log("[spotlight] Using persistent MFA preference:", mfaMethod);
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

    // ── 9. Select radio for chosen method + click Send Passcode ─────────────
    try {
      const wantPhone = mfaMethod.toUpperCase() === "PHONE";
      // Find the radio whose nearby text matches phone (masked number) or email (@)
      const radios = await spotPage.$$('input[type="radio"]').catch(() => [] as any[]);
      for (const radio of radios) {
        const nearbyText: string = await spotPage.evaluate((el: any) => {
          const parent = el.closest('label') ?? el.parentElement?.parentElement ?? el.parentElement;
          return parent?.textContent?.trim() ?? "";
        }, radio).catch(() => "");
        const isPhone = /\*{3,}\d+/.test(nearbyText) || nearbyText.toLowerCase().includes("phone");
        const isEmail = nearbyText.includes("@") || nearbyText.toLowerCase().includes("email");
        if ((wantPhone && isPhone) || (!wantPhone && isEmail)) {
          await radio.click().catch(() => {});
          console.log("[spotlight] Selected MFA radio:", nearbyText.slice(0, 40));
          break;
        }
      }
      await sleep(400);

      // Send Passcode button — class varies; match by text
      const sendBtn = await spotPage.$(
        'button::-p-text(Send Passcode), button::-p-text(SEND PASSCODE)'
      ).catch(() => null) ?? await spotPage.$('button[type="submit"]').catch(() => null);
      if (sendBtn) {
        console.log("[spotlight] Clicking Send Passcode...");
        await sendBtn.click();
      } else {
        console.log("[spotlight] ⚠ Send Passcode button not found");
      }
    } catch (e: any) {
      console.log("[spotlight] MFA radio/send error:", e.message);
    }

    // ── 10. Poll DB for OTP, type into browser (retry up to 3 times) ──────────
    // This loop ONLY handles authentication. Contract selection and RYDE nav run once after.
    const MAX_ATTEMPTS = 3;
    let authenticated = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !authenticated; attempt++) {
      // Refresh spotPage at start of each attempt — previous navigation may have made it stale
      for (const t of (browser as any).targets()) {
        if (t.url().includes("spotlight.fedex.com")) {
          const p = await t.page().catch(() => null);
          if (p) { spotPage = p; break; }
        }
      }

      await deleteSetting("spotlight_otp", "spotlight_otp_at", "spotlight_resend_otp");
      await setStatus("waiting_for_otp");
      console.log(`[spotlight] Waiting for OTP from user (attempt ${attempt}/${MAX_ATTEMPTS})...`);

      let otp = "";
      let resendRequested = false;
      const otpDeadline = Date.now() + 10 * 60 * 1000;

      let browserAlreadyAuthenticated = false;
      while (!otp && !resendRequested && Date.now() < otpDeadline) {
        await sleep(2000);
        // Safely get URL — refresh spotPage if stale
        let currentUrl = "";
        try {
          currentUrl = spotPage.url();
        } catch {
          for (const t of (browser as any).targets()) {
            if (t.url().includes("spotlight.fedex.com")) {
              const p = await t.page().catch(() => null);
              if (p) { spotPage = p; try { currentUrl = spotPage.url(); } catch {} break; }
            }
          }
        }
        if (currentUrl.includes("/csp/contracts") || currentUrl.includes("/csp/reports") || currentUrl.includes("/csp/select")) {
          console.log("[spotlight] Browser already authenticated, URL:", currentUrl);
          browserAlreadyAuthenticated = true;
          break;
        }
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
        try {
          const resendLink = await spotPage.$('a::-p-text(Resend), button::-p-text(Resend)').catch(() => null);
          if (resendLink) {
            await resendLink.click();
          } else {
            const sendBtn = await spotPage.$('button.sr-pref-card-btn-login, button::-p-text(Send Passcode)').catch(() => null);
            if (sendBtn) await sendBtn.click();
          }
        } catch (e: any) { console.log("[spotlight] Resend click error:", e.message); }
        attempt--;
        continue;
      }

      if (!otp && !browserAlreadyAuthenticated) throw new Error("OTP not entered within 10 minutes.");

      if (!browserAlreadyAuthenticated) {
        // Type OTP — browser is still on the OTP page
        console.log("[spotlight] Typing OTP into browser OTP field...");
        const OTP_INPUT_SEL = [
          'input[placeholder*="Passcode" i]',
          'input[placeholder*="code" i]',
          'input[type="tel"]',
          'input[type="number"]',
          'input[maxlength="6"]',
          'input[maxlength="8"]',
        ].join(", ");
        let otpInput: any = null;
        const otpInputDeadline = Date.now() + 15000;
        while (!otpInput && Date.now() < otpInputDeadline) {
          otpInput = await spotPage.$(OTP_INPUT_SEL).catch(() => null);
          if (!otpInput) await sleep(1000);
        }

        if (otpInput) {
          console.log("[spotlight] OTP input found — typing code");
          try { await otpInput.click({ clickCount: 3 }); } catch {}
          await otpInput.type(otp, { delay: 80 });
          await sleep(400);
        } else {
          console.log("[spotlight] OTP input not found — pressing Enter");
        }

        // Click the Verify button by text match
        const verifyClicked: string = await spotPage.evaluate(() => {
          const candidates = Array.from(document.querySelectorAll("button, input[type='submit']"));
          const VERIFY_TEXTS = ["verify", "log in", "login", "submit", "continue", "next"];
          const btn = candidates.find(el => {
            const txt = (el.textContent ?? (el as HTMLInputElement).value ?? "").trim().toLowerCase();
            return VERIFY_TEXTS.some(v => txt === v || txt.startsWith(v));
          }) as HTMLElement | undefined;
          if (btn) { btn.click(); return "clicked: " + btn.textContent?.trim(); }
          return "not found";
        }).catch(() => "error");
        console.log("[spotlight] Verify button:", verifyClicked);
        if (verifyClicked === "not found" || verifyClicked === "error") {
          await spotPage.keyboard.press("Enter");
        }

        await sleep(4000);

        // Check for error on page (wrong code shows error immediately)
        const errText: string = await spotPage.evaluate(() => {
          const el = document.querySelector('[class*="error"], [class*="invalid"], [role="alert"], .sr-error-message');
          return el?.textContent?.trim() ?? "";
        }).catch(() => "");

        if (errText) {
          console.log("[spotlight] OTP error on page:", errText);
          if (attempt < MAX_ATTEMPTS) {
            await deleteSetting("spotlight_otp");
            await setStatus("otp_failed");
            await upsertSetting("spotlight_otp_error", errText);
          } else {
            throw new Error(`Verification failed after ${MAX_ATTEMPTS} attempts: ${errText}`);
          }
          continue;
        }
      } else {
        console.log("[spotlight] Skipping OTP entry — browser already past MFA");
      }

      authenticated = true;
      console.log("[spotlight] Authentication complete, proceeding to contract selection...");
      await setStatus("pulling_data");
    }

    if (!authenticated) throw new Error("Authentication failed — OTP not accepted.");

    // ── Contract selection page (/csp/contracts) ──────────────────────────
    // Runs once after authentication. Flow: click "U.S. Pickup & Delivery" tab →
    // dropdown auto-opens → click contract option → REPORT SELECTION button.
    try {
      // Wait for Spotlight to be on /csp/contracts (up to 20s)
      const contractsDeadline = Date.now() + 20000;
      while (Date.now() < contractsDeadline) {
        let u = "";
        try { u = spotPage.url(); } catch {}
        if (u.includes("/csp/contracts")) break;
        await sleep(1000);
      }
      let contractUrl = "";
      try { contractUrl = spotPage.url(); } catch {}
      console.log("[spotlight] Contracts page URL:", contractUrl.slice(0, 80));
      await sleep(3000);

      // Step 1: Click U.S. Pickup & Delivery — dropdown auto-opens after this click
      const uspdBtn = await spotPage.waitForSelector(
        'button::-p-text(U.S. Pickup & Delivery), a::-p-text(U.S. Pickup & Delivery)',
        { timeout: 15000 }
      ).catch(() => null);
      if (uspdBtn) {
        await (uspdBtn as any).click();
        await sleep(2000); // wait for ng-select panel to render
        console.log("[spotlight] ✓ Clicked U.S. Pickup & Delivery");
      } else {
        console.log("[spotlight] ⚠ U.S. Pickup & Delivery not found");
      }

      // Step 2: Wait for ng-select panel then click the contract option
      // ng-select renders options as <li> elements inside .ng-dropdown-panel
      await spotPage.waitForSelector('.ng-dropdown-panel, .ng-option', { timeout: 5000 }).catch(() => {});
      const contractOpt = await spotPage.$(`li::-p-text(${csaId})`).catch(() => null)
        ?? await spotPage.$(`div.ng-option::-p-text(${csaId})`).catch(() => null)
        ?? await spotPage.$(`.ng-option::-p-text(${csaId})`).catch(() => null);
      if (contractOpt) {
        await (contractOpt as any).click();
        await sleep(1000);
        console.log("[spotlight] ✓ Clicked contract option");
      } else {
        console.log("[spotlight] ⚠ Contract option not found for CSA:", csaId);
      }

      // Step 3: Zoom to 80% so the REPORT SELECTION button clears any footer overlay
      await spotPage.bringToFront();
      await sleep(300);
      await spotPage.keyboard.down("Control");
      await spotPage.keyboard.press("-");
      await spotPage.keyboard.up("Control");
      await sleep(300);
      await spotPage.keyboard.down("Control");
      await spotPage.keyboard.press("-");
      await spotPage.keyboard.up("Control");
      await sleep(800);
      console.log("[spotlight] Zoomed out to ~80%");

      // Step 4: Try clicking REPORT SELECTION automatically
      const btn = await spotPage.$(".contract-card__button").catch(() => null)
        ?? await spotPage.$('button::-p-text(REPORT SELECTION)').catch(() => null);
      if (btn) {
        await spotPage.evaluate((el: any) => el.scrollIntoView({ block: "center" }), btn);
        await sleep(400);
        const box = await (btn as any).boundingBox();
        if (box) {
          await spotPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log("[spotlight] ✓ Auto-clicked REPORT SELECTION at", Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
        } else {
          await (btn as any).click();
          console.log("[spotlight] ✓ Auto-clicked REPORT SELECTION (no box)");
        }
      } else {
        console.log("[spotlight] ⚠ REPORT SELECTION button not found — waiting for manual click");
      }

      // Wait up to 90s for URL to leave /csp/contracts (auto OR manual click)
      await upsertSetting("spotlight_status", "awaiting_report_selection");
      console.log("[spotlight] Waiting up to 90s for navigation away from contracts page...");
      const reportNavDeadline = Date.now() + 90000;
      while (Date.now() < reportNavDeadline) {
        let u = "";
        try { u = spotPage.url(); } catch {}
        if (!u.includes("/csp/contracts")) break;
        await sleep(1000);
      }
      let postContractUrl = "";
      try { postContractUrl = spotPage.url(); } catch {}
      console.log("[spotlight] Post-contract URL:", postContractUrl.slice(0, 80));
      await sleep(2000);
    } catch (e: any) { console.log("[spotlight] Contract selection error:", e.message); }

    // ── Navigate to RYDE → Package Detail ────────────────────────────────
    try {
      await sleep(8000);
      let reportsUrl = "";
      try { reportsUrl = spotPage.url(); } catch {}
      console.log("[spotlight] Reports page URL:", reportsUrl.slice(0, 80));

      // Retry up to 20x (40s): expand Customer Experience then click RYDE
      let rydeResult = "not found";
      for (let i = 0; i < 20 && rydeResult === "not found"; i++) {
        rydeResult = await spotPage.evaluate(() => {
          // 1) Check if RYDE submenulink already visible
          const links = Array.from(document.querySelectorAll("a.submenulink, .submenulink"));
          const ryde = links.find(l => l.textContent?.includes("RYDE") || l.textContent?.includes("Rate Your"));
          if (ryde) { (ryde as HTMLElement).click(); return "clicked: " + ryde.textContent?.trim(); }

          // 2) Look for exact "Customer Experience" text node
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let textNode = walker.nextNode();
          while (textNode) {
            if (textNode.textContent?.trim() === "Customer Experience") {
              const parent = textNode.parentElement;
              if (parent) { parent.click(); return "expanding-ce-text"; }
            }
            textNode = walker.nextNode();
          }

          // 3) Any visible element whose text is exactly "Customer Experience"
          const ce = Array.from(document.querySelectorAll("li, span, a, div, button")).find(el => {
            const t = el.textContent?.trim() ?? "";
            return (t === "Customer Experience" || t === "CUSTOMER EXPERIENCE") && (el as HTMLElement).offsetParent !== null;
          });
          if (ce) { (ce as HTMLElement).click(); return "expanding-ce-el"; }

          return "not found";
        }).catch(() => "error");

        if (i === 0 || i === 5 || i === 10) {
          const navInfo: string = await spotPage.evaluate(() => {
            const links = Array.from(document.querySelectorAll("a, button")).slice(0, 20).map(el => el.textContent?.trim()).filter(Boolean);
            return links.join(" | ");
          }).catch(() => "");
          console.log(`[spotlight] RYDE retry #${i} — nav elements: ${navInfo.slice(0, 200)}`);
        }

        const needRetry = rydeResult === "not found" || rydeResult.startsWith("expanding");
        if (needRetry) { rydeResult = "not found"; await sleep(2000); }
      }
      console.log("[spotlight] RYDE nav:", rydeResult);

      await sleep(8000);

      // Log frame URLs to understand what Power BI renders in
      const frameUrls = spotPage.frames().map((f: any) => f.url().slice(0, 80));
      console.log("[spotlight] Active frames:", frameUrls.join(" | ").slice(0, 300));

      // Package Detail tab — find the app.powerbi.com embed frame where the report tabs live.
      // Architecture: Spotlight SPA → iframe(spotlight.fedex.com/csp/powerbi/...) → iframe(app.powerbi.com)
      // The Package Detail tab is a DIV inside the app.powerbi.com embed frame.
      // Using Puppeteer's real mouse click (via ElementHandle.click()) is required because
      // Power BI uses React event handlers that require real mouse events, not synthetic JS click().
      const pbiEmbedFrame = spotPage.frames().find((f: any) =>
        f.url().includes("app.powerbi.com")
      );
      console.log("[spotlight] PBI embed frame:", pbiEmbedFrame ? pbiEmbedFrame.url().slice(0, 80) : "not found");

      const pdBaseCount = qesResponses.length;
      let pdClicked = false;

      if (pbiEmbedFrame) {
        // Find the Package Detail tab element in the embed frame
        // PBI renders page tabs as DIV elements with the page name as exact text content
        let pdHandle: any = null;
        for (let attempt = 0; attempt < 10 && !pdHandle; attempt++) {
          pdHandle = await (pbiEmbedFrame as any).$(`::-p-text(Package Detail)`).catch(() => null);
          if (!pdHandle) {
            // Also try by evaluating and getting coordinates from a text search
            const info: { x: number; y: number; found: boolean } = await (pbiEmbedFrame as any).evaluate(() => {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              let node = walker.nextNode();
              while (node) {
                if (node.textContent?.trim() === "Package Detail") {
                  const el = node.parentElement;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                  }
                }
                node = walker.nextNode();
              }
              return { found: false, x: 0, y: 0 };
            }).catch(() => ({ found: false, x: 0, y: 0 }));
            if (info.found) {
              console.log(`[spotlight] Package Detail tab found via TreeWalker at (${Math.round(info.x)}, ${Math.round(info.y)})`);
              // Use CDP mouse click at frame-relative coords via spotPage.mouse after getting absolute coords
              // Frame offset: find the iframe element in the wrapper frame to get its page-level position
              let iframeBox: any = null;
              const pbiWrapperFrame = spotPage.frames().find((f: any) => f.url().includes("spotlight.fedex.com/csp/powerbi/"));
              if (pbiWrapperFrame) {
                const iframeEl = await (pbiWrapperFrame as any).$("iframe").catch(() => null);
                if (iframeEl) iframeBox = await iframeEl.boundingBox().catch(() => null);
              }
              if (!iframeBox) {
                // Try from main page
                const iframes = await spotPage.$$("iframe");
                for (const iframe of iframes) {
                  const box = await iframe.boundingBox().catch(() => null);
                  if (box && box.width > 400) { iframeBox = box; break; }
                }
              }
              if (iframeBox) {
                const absX = iframeBox.x + info.x;
                const absY = iframeBox.y + info.y;
                await spotPage.mouse.click(absX, absY);
                console.log(`[spotlight] Package Detail: CDP mouse click at absolute (${Math.round(absX)}, ${Math.round(absY)})`);
                pdClicked = true;
                break;
              }
            }
            await sleep(2000);
          }
        }

        if (pdHandle && !pdClicked) {
          // Use Puppeteer's ElementHandle.click() — sends real mouse events through Chrome's input pipeline
          try {
            await pdHandle.click();
            console.log("[spotlight] Package Detail: Puppeteer ElementHandle click sent");
            pdClicked = true;
          } catch (e: any) {
            console.log("[spotlight] Package Detail ElementHandle click error:", e.message);
            // Fallback: get bounding box and use spotPage.mouse.click
            const box = await pdHandle.boundingBox().catch(() => null);
            if (box) {
              await spotPage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              console.log("[spotlight] Package Detail: mouse click at", Math.round(box.x + box.width/2), Math.round(box.y + box.height/2));
              pdClicked = true;
            }
          }
        }
      }

      console.log(`[spotlight] Package Detail tab: ${pdClicked ? "clicked" : "not found"} (base QES: ${pdBaseCount})`);

      // Wait for Package Detail QES queries to fire
      console.log(`[spotlight] Waiting up to 90s for Package Detail QES data...`);
      const pdWaitDeadline = Date.now() + 90000;
      while (qesResponses.length === pdBaseCount && Date.now() < pdWaitDeadline) await sleep(2000);
      console.log(`[spotlight] Package Detail fired: ${qesResponses.length - pdBaseCount} new QES responses (total: ${qesResponses.length})`);

      // Give extra time for remaining pages to load
      await sleep(5000);
      console.log("[spotlight] ✓ Navigated to RYDE Package Detail");
    } catch (e: any) { console.log("[spotlight] RYDE navigation error:", e.message); }

    // Wait up to 30s for any last QES responses to arrive
    console.log("[spotlight] Final wait for any remaining Power BI data...");
    const verifyDeadline = Date.now() + 30000;
    const lastCount = qesResponses.length;
    await sleep(5000);
    // Wait for no new responses for 5s
    let stableCount = qesResponses.length;
    while (Date.now() < verifyDeadline) {
      await sleep(2000);
      if (qesResponses.length === stableCount) break;
      stableCount = qesResponses.length;
    }
    console.log(`[spotlight] Network wait done — embedToken: ${!!embedToken}, QES: ${qesResponses.length} (${qesResponses.length - lastCount} new in final wait)`);

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

    if (qesResponses.length === 0 && !embedToken) {
      throw new Error("No data captured — Power BI did not load after authentication.");
    }

    await setStatus("pulling_data");
    console.log(`[spotlight] Closing browser — ${qesResponses.length} QES responses captured`);
    await browser.close();

    // ── 11. Decode QES DSR responses into flat rows ───────────────────────────
    // Power BI uses DSR (compressed) format. Column layout confirmed from Package Detail:
    // G0=trackid  G1=deliveryDate  G2=RecordedDate  G3=address  G4=release_location
    // G5=work_area  G6=Resource Names.RESOURCE  G7=star  G8=WHY_RATE_DESC
    // G9=ANY_PROBLEMS_Y_N  G10=SELECTED  G11=COMMENTS
    const RESOURCE_COL = "G6";
    const DATE_COL     = "G2"; // RecordedDate (survey date)
    const STAR_COL     = "G7";
    const WHY_COL      = "G8";
    const SELECTED_COL = "G10";
    const COMMENTS_COL = "G11";

    function decodeDsrResponse(pbiJson: any): Record<string, any>[] {
      const result = pbiJson?.results?.[0]?.result?.data;
      if (!result) return [];
      const descriptor: any[] = result.descriptor?.Select ?? [];
      const ds = result.dsr?.DS?.[0];
      if (!ds) return [];
      const vd: Record<string, any[]> = ds.ValueDicts ?? {};
      const rows: any[] = ds.PH?.[0]?.DM0 ?? [];

      // Map select index → { name, dictKey }
      // Primary: use DN field if the descriptor supplies it.
      // Fallback: Power BI positionally assigns ValueDicts (D0, D1, ...) to G-columns that
      //   have no Format field (date/numeric columns carry a Format; dict-encoded ones don't).
      //   M-columns (measures) are always direct numeric values — never dict-encoded.
      const sortedDictKeys = Object.keys(vd).sort(); // ["D0","D1","D2",...]
      let dictPos = 0;
      const cols = descriptor.map((s: any) => {
        const name = (s?.Value ?? "") as string;
        let dict: string | undefined = s?.DN as string | undefined;
        if (!dict && name.startsWith("G") && !s?.Format) {
          // Positional dict assignment for non-formatted G-columns
          dict = dictPos < sortedDictKeys.length ? sortedDictKeys[dictPos++] : undefined;
        }
        return { name, dict };
      });

      const numCols = cols.length;
      const current: any[] = new Array(numCols).fill(null);
      const decoded: Record<string, any>[] = [];

      for (const row of rows) {
        if (row.S) continue; // schema row
        const c: any[] = row.C ?? [];
        const r: number = row.R ?? 0;
        let ci = 0;
        for (let i = 0; i < numCols; i++) {
          if (r & (1 << i)) {
            // repeated — keep current
          } else {
            if (ci < c.length) current[i] = c[ci++];
          }
        }
        const rec: Record<string, any> = {};
        for (let i = 0; i < numCols; i++) {
          const val = current[i];
          const { name, dict } = cols[i];
          rec[name] = (dict && val !== null && vd[dict]) ? (vd[dict][val] ?? val) : val;
        }
        decoded.push(rec);
      }
      return decoded;
    }


    // Decode all captured QES responses — accept responses with star column M0 (aggregate) or G6/G7 (detail)
    const seenTrackIds = new Set<string>();
    const allRydeRows: any[] = [];
    for (const qes of qesResponses) {
      const rows = decodeDsrResponse(qes);
      if (rows.length === 0) continue;
      const colKeys = Object.keys(rows[0]);
      // Accept Package Detail (has G6+G7) OR aggregated summary (has G0+M0 where M0 might be avg_star)
      const hasDetail = colKeys.includes("G6") && rows[0]["G6"] !== undefined;
      if (!hasDetail) continue;
        for (const row of rows) {
        const trackid = String(row["G0"] ?? "");
        if (trackid && seenTrackIds.has(trackid)) continue;
        if (trackid) seenTrackIds.add(trackid);
        allRydeRows.push(row);
      }
    }
    console.log(`[spotlight] Decoded ${allRydeRows.length} unique RYDE rows from ${qesResponses.length} QES responses`);

    console.log(`[spotlight] ${allRydeRows.length} total RYDE Detail rows from Power BI`);

    // Apply lookback filter if configured
    let rydeRows = allRydeRows;
    if (lookbackWeeks > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - lookbackWeeks * 7);
      rydeRows = allRydeRows.filter(row => {
        const d = msToDate(row[DATE_COL]);
        return d !== null && d >= cutoff;
      });
      console.log(`[spotlight] After ${lookbackWeeks}-week lookback: ${rydeRows.length} rows`);
    }

    // ── 12. Match against our drivers ─────────────────────────────────────────
    // Power BI resource format: "M. LASTNAME (NUMERIC_FEDEX_ID)"
    // Our driver_id is custom text (e.g. "Marcus", "AP.Britt"), NOT numeric FedEx ID.
    // Match by first-initial + last-name (case-insensitive).
    function parseResource(resource: string): { fdxId: string; pbiName: string } | null {
      if (!resource) return null;
      const m = resource.match(/^(.+?)\s*\((\d+)\)\s*$/);
      if (!m) return null;
      return { pbiName: m[1].trim(), fdxId: m[2] };
    }

    // "M. WILLIAMS" → "MWILLIAMS"
    function initLastKey(name: string): string {
      const parts = name.trim().toUpperCase().replace(/\./g, " ").split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return parts[0].charAt(0) + parts[parts.length - 1];
      return parts.join("");
    }

    // "Marcus Williams" → "MWILLIAMS"
    function fullNameToInitLastKey(fullName: string): string {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[parts.length - 1]).toUpperCase();
      }
      return fullName.toUpperCase().replace(/\s+/g, "");
    }

    const dbDrivers = await sql`SELECT driver_id, name FROM drivers WHERE active = true`;
    const initLastToDriverId: Record<string, string> = {};
    const nameToDriverId:  Record<string, string> = {};
    for (const d of dbDrivers) {
      const key = fullNameToInitLastKey(d.name);
      initLastToDriverId[key] = d.driver_id;
      nameToDriverId[normName(d.name)] = d.driver_id;
    }

    function resolveDriver(resource: string): string | null {
      const parsed = parseResource(resource);
      if (!parsed) return null;
      // Try first-initial + last-name match
      const key = initLastKey(parsed.pbiName);
      if (initLastToDriverId[key]) return initLastToDriverId[key];
      // Fallback: full name normalization
      return nameToDriverId[normName(parsed.pbiName)] ?? null;
    }

    // ── 13. Aggregate per driver+week, upsert scores ──────────────────────────
    type WeekEntry = { resource: string; week: string; stars: number[]; };
    const buckets = new Map<string, WeekEntry>();

    for (const row of rydeRows) {
      const resource = String(row[RESOURCE_COL] ?? "");
      if (!resource) continue;
      // G2 (RecordedDate) is often null in Package Detail view; fall back to current date
      const dateObj = msToDate(row[DATE_COL]) ?? new Date();

      const week = dateToWeekStr(dateObj);
      const bKey = `${resource}::${week}`;
      if (!buckets.has(bKey)) buckets.set(bKey, { resource, week, stars: [] });

      const star = parseInt(String(row[STAR_COL] ?? ""), 10);
      if (!isNaN(star) && star >= 1 && star <= 5) buckets.get(bKey)!.stars.push(star);
    }

    let scoreCount = 0;
    const weeksSeen = new Set<string>();

    for (const [, bucket] of buckets) {
      const ourId = resolveDriver(bucket.resource);
      if (!ourId) continue;

      weeksSeen.add(bucket.week);
      const total      = bucket.stars.length;
      const avgStar    = total > 0 ? bucket.stars.reduce((s, x) => s + x, 0) / total : 0;
      const posReviews = bucket.stars.filter(s => s >= 4).length;

      await sql`
        INSERT INTO ryde_scores (driver_id, score, week, deliveries, positive_reviews, organization_id)
        VALUES (${ourId}, ${avgStar}, ${bucket.week}, ${total}, ${posReviews}, ${orgId})
        ON CONFLICT (driver_id, week, organization_id) DO UPDATE SET
          score            = EXCLUDED.score,
          deliveries       = EXCLUDED.deliveries,
          positive_reviews = EXCLUDED.positive_reviews
      `;
      scoreCount++;
    }

    // ── 14. Store individual reviews (stars + category only, no customer PII) ──
    let reviewCount = 0;

    for (const row of rydeRows) {
      const resource = String(row[RESOURCE_COL] ?? "");
      if (!resource) continue;

      const ourId = resolveDriver(resource);
      if (!ourId) continue;

      const star = parseInt(String(row[STAR_COL] ?? ""), 10);
      if (isNaN(star) || star < 1 || star > 5) continue; // skip unrated deliveries

      const dateObj  = msToDate(row[DATE_COL]) ?? new Date();
      const why      = String(row[WHY_COL] ?? "").trim();
      const comments = String(row[COMMENTS_COL] ?? "").trim();
      const selected = String(row[SELECTED_COL] ?? "").trim();
      const trackId  = String(row["G0"] ?? "").trim() || null;
      const week     = dateToWeekStr(dateObj);
      const type     = star >= 4 ? "positive" : "negative";
      const category = selected || (type === "positive" ? "positive_feedback" : "general");
      const content  = why || comments || category;

      await sql`
        INSERT INTO ryde_reviews (organization_id, driver_id, type, stars, category, content, week, at_fault, track_id)
        VALUES (${orgId}, ${ourId}, ${type}, ${star}, ${category}, ${content}, ${week}, false, ${trackId})
        ON CONFLICT (organization_id, track_id) DO NOTHING
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
  // Try direct key first
  if (row[key] !== undefined && row[key] !== null) return String(row[key]);
  // Try common Power BI table-prefixed variants
  for (const alias of (COL_ALIASES[key] ?? [])) {
    if (row[alias] !== undefined && row[alias] !== null) return String(row[alias]);
  }
  return (
    row[`RYDE Detail[${key}]`] ??
    row[`Resource Names[${key}]`] ??
    row[`[${key}]`] ??
    ""
  );
}

// Alias mappings for column name variations Power BI may emit
const COL_ALIASES: Record<string, string[]> = {
  resource:    ["[_resource]", "Resource Names[RESOURCE]", "_resource"],
  survey_date: ["RYDE Detail[RecordedDate]", "RecordedDate", "[RecordedDate]"],
  star:        ["RYDE Detail[star]", "[star]"],
  why:         ["RYDE Detail[WHY_RATE_DESC]", "WHY_RATE_DESC", "[WHY_RATE_DESC]"],
  problems:    ["RYDE Detail[ANY_PROBLEMS_Y_N]", "ANY_PROBLEMS_Y_N"],
  selected:    ["RYDE Detail[SELECTED]", "SELECTED"],
  comments:    ["RYDE Detail[COMMENTS]", "RYDE Detail[COMMENTS 2]", "COMMENTS"],
  work_area:   ["RYDE Detail[work_area]", "work_area"],
};

/**
 * Converts a Power BI DSR date value (ms since Unix epoch) to a Date, or null.
 * Power BI returns RecordedDate as a numeric ms timestamp.
 */
function msToDate(val: any): Date | null {
  if (val === null || val === undefined || val === "") return null;
  const n = Number(val);
  if (!isNaN(n)) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback: try parsing as string (ISO date, etc.)
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

/** Converts a Date to ISO week string "YYYY-Wnn". */
function dateToWeekStr(d: Date): string {
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

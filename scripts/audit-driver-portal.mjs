// playwright is installed globally — resolve from global node_modules
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Blake/AppData/Roaming/npm/node_modules/playwright");
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;

// ── JWT helpers (HS256, mirrors jose SignJWT) ────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + 7 * 24 * 3600 }));
  const signingInput = `${header}.${body}`;
  const sig = b64url(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );
  return `${signingInput}.${sig}`;
}

// ── Read SESSION_SECRET from .env.local ──────────────────────────────────────
function readSecret() {
  try {
    const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
    const m = env.match(/^SESSION_SECRET\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (m && m[1].trim()) {
      console.log("Using SESSION_SECRET from .env.local");
      return m[1].trim();
    }
  } catch {}
  console.log("SESSION_SECRET not set — using fallback");
  return "changeme-set-SESSION_SECRET-in-env";
}

// ── Screenshot helper ────────────────────────────────────────────────────────
async function shot(page, name, label) {
  const file = path.join(OUT, `driver-audit-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[screenshot] ${label}`);
  console.log(`             → ${file}`);
  return file;
}

// ── Click a dock/sheet tab button by its label text (JS click bypasses overlays)
async function clickTab(page, text) {
  const found = await page.evaluate((label) => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn = btns.find(b => b.textContent?.trim() === label);
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  return found;
}

// ── Per-viewport audit ───────────────────────────────────────────────────────
async function audit(browser, viewportWidth, prefix, token) {
  const isMobile = viewportWidth <= 430;
  const label = isMobile ? `mobile (${viewportWidth}px)` : `desktop (${viewportWidth}px)`;

  const ctx = await browser.newContext({
    viewport: { width: viewportWidth, height: isMobile ? 844 : 900 },
  });

  // Inject session cookie
  await ctx.addCookies([{
    name: "driver_session",
    value: token,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  }]);

  const page = await ctx.newPage();
  console.log(`\n=== ${label.toUpperCase()} ===`);

  await page.goto("http://localhost:3000/driver", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const landingUrl = page.url();
  console.log("Landed on:", landingUrl);

  if (!landingUrl.includes("/driver")) {
    await shot(page, `${prefix}-00-redirect`, `Auth redirect (${label})`);
    console.warn("  Did not reach /driver — auth may have failed");
    await ctx.close();
    return;
  }

  // Wait for full hydration
  await page.waitForTimeout(2000);

  // 1. Full page on load (default is Schedule tab)
  await shot(page, `${prefix}-01-load`, `Page on load / Schedule tab default (${label})`);

  // 2. Explicitly click Schedule tab
  await clickTab(page, "Schedule");
  await page.waitForTimeout(500);
  await shot(page, `${prefix}-02-schedule`, `Schedule tab (${label})`);

  // 3. Score/Ryde tab
  if (await clickTab(page, "Score")) {
    await page.waitForTimeout(600);
    await shot(page, `${prefix}-03-score`, `Score / Ryde tab (${label})`);
  } else {
    console.log("  Score tab not in dock (showRyde=false)");
  }

  // 4. Gate Codes tab
  if (await clickTab(page, "Codes")) {
    await page.waitForTimeout(600);
    await shot(page, `${prefix}-04-codes`, `Gate Codes tab (${label})`);
  }

  // JS helpers that bypass overlay interception
  async function jsClickByText(text) {
    return page.evaluate((t) => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find(b => b.textContent?.trim() === t);
      if (btn) { btn.click(); return true; }
      return false;
    }, text);
  }

  async function jsClickByPattern(pattern) {
    return page.evaluate((re) => {
      const regex = new RegExp(re);
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find(b => regex.test(b.textContent?.trim() ?? ""));
      if (btn) { btn.click(); return true; }
      return false;
    }, pattern);
  }

  async function closeSheet() {
    await page.evaluate(() => {
      const backdrop = document.querySelector(".fixed.inset-0.z-40");
      if (backdrop) backdrop.click();
    });
    await page.waitForTimeout(350);
  }

  async function openMore() {
    await closeSheet();
    await jsClickByText("More");
    await page.waitForTimeout(600);
  }

  // 5. Open More sheet
  const hasMore = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    return btns.some(b => b.textContent?.trim() === "More");
  });

  if (hasMore) {
    await openMore();
    await shot(page, `${prefix}-05-more`, `More sheet open (${label})`);

    // 6. Service tab
    const serviceClicked = await jsClickByText("Service");
    if (serviceClicked) {
      await page.waitForTimeout(600);
      await shot(page, `${prefix}-06-service`, `Service / DSW tab (${label})`);
    } else {
      console.log("  Service tab not in More sheet (showDsw=false)");
      await closeSheet();
    }

    // 7. Maintenance tab
    await openMore();
    const maintClicked = await jsClickByText("Maintenance");
    if (maintClicked) {
      await page.waitForTimeout(600);
      await shot(page, `${prefix}-07-maintenance`, `Maintenance tab (${label})`);
    }

    // 8. Reviews tab (label includes count like "Reviews (0)")
    await openMore();
    const reviewsClicked = await jsClickByPattern("^Reviews");
    if (reviewsClicked) {
      await page.waitForTimeout(600);
      await shot(page, `${prefix}-08-reviews`, `Reviews tab (${label})`);
    } else {
      console.log("  Reviews not in More sheet (showRyde=false)");
      await closeSheet();
    }

    // 9. Milestones tab
    await openMore();
    const msClicked = await jsClickByText("Milestones");
    if (msClicked) {
      await page.waitForTimeout(600);
      await shot(page, `${prefix}-09-milestones`, `Milestones tab (${label})`);
    } else {
      console.log("  Milestones not in More sheet (showMilestones=false)");
      await closeSheet();
    }

    // 10. Leaderboard tab
    await openMore();
    const lbClicked = await jsClickByText("Leaderboard");
    if (lbClicked) {
      await page.waitForTimeout(600);
      await shot(page, `${prefix}-10-leaderboard`, `Leaderboard tab (${label})`);
    } else {
      console.log("  Leaderboard not in More sheet (showRyde=false)");
      await closeSheet();
    }
  } else {
    console.log("  More button not found");
  }

  // 11. Account tab via custom event
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("mgops:goto-driver-tab", { detail: "account" }));
  });
  await page.waitForTimeout(600);
  await shot(page, `${prefix}-11-account`, `Account tab (${label})`);

  await ctx.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const secret = readSecret();

  const driverPayload = {
    driverId: "TEST-DRIVER-001",
    organizationId: 1,
    name: "Test Driver",
    role: "driver",
    isAdmin: false,
    subscriptionStatus: "active",
    demoMode: false,
    demoExpiresAt: null,
    mustChangePassword: false,
  };

  const token = makeJwt(driverPayload, secret);
  console.log("JWT created, length:", token.length);

  const browser = await chromium.launch({ headless: true });

  // Desktop
  await audit(browser, 1280, "desk", token);

  // Mobile
  await audit(browser, 375, "mob", token);

  await browser.close();
  console.log("\nAll done. Screenshots saved to:", OUT);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

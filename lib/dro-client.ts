/**
 * DRO API client with session caching.
 * Handles Puppeteer login and caches session headers in the settings table.
 * All other modules should use this instead of embedding login logic.
 *
 * Auth approach: intercept a real DRO API request from within Puppeteer to
 * capture the FULL set of request headers (Cookie + Authorization + any other
 * headers the React app adds from localStorage/memory). Store these headers in
 * the DB and reuse them for subsequent Node.js fetch() calls.
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { neon } from "@neondatabase/serverless";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export const DRO_BASE = "https://dro.routesmart.com";
export const SA_ID = process.env.DRO_SERVICE_AREA_ID || "3060743";
export const STATION_ID = process.env.DRO_STATION_ID || "259";

// Headers we DON'T want to forward (browser-only, cause issues in Node.js)
const SKIP_HEADERS = new Set([
  "host", "content-length", "connection", "accept-encoding",
  "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest",
  "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "upgrade-insecure-requests",
  "withcredentials",  // XHR property mistakenly serialized as header name
]);

async function loginAndCaptureHeaders(): Promise<Record<string, string>> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const credsRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_username','dro_password')`;
  const credsMap = Object.fromEntries(credsRows.map((r: any) => [r.key, r.value]));
  const username = credsMap["dro_username"] || process.env.DRO_USERNAME;
  const password = credsMap["dro_password"] || process.env.DRO_PASSWORD;

  if (!username || !password) {
    throw new Error("DRO credentials not configured. Set them in Auto DRO settings.");
  }

  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(CHROMIUM_PACK),
    headless: true,
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-features=WebBluetooth,WebUSB"],
  });

  try {
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(DRO_BASE, []);

    const page = await browser.newPage();
    page.on("dialog", async (d) => { try { await d.dismiss(); } catch {} });

    // Set up interception BEFORE navigation to catch ALL requests
    await page.setRequestInterception(true);
    let capturedHeaders: Record<string, string> | null = null;

    page.on("request", (req: any) => {
      const url: string = req.url();
      // Capture headers from the first authenticated DRO API call (not static assets)
      if (
        url.includes("dro.routesmart.com/api/api/") &&
        !capturedHeaders
      ) {
        const hdrs: Record<string, string> = req.headers();
        // Only keep forwarding-safe headers
        const safe: Record<string, string> = {};
        for (const [k, v] of Object.entries(hdrs)) {
          if (!SKIP_HEADERS.has(k.toLowerCase())) safe[k] = v;
        }
        capturedHeaders = safe;
        console.log("[dro-client] Intercepted headers from:", url.slice(0, 80));
        console.log("[dro-client] Header keys:", Object.keys(safe).join(", "));
      }
      req.continue();
    });

    await page.goto(DRO_BASE, { waitUntil: "networkidle2" });

    // Click "Service Provider" → opens Okta popup
    const popupPromise = new Promise<any>(resolve =>
      browser.once("targetcreated", (t: any) => resolve(t.page()))
    );

    await page.click('button::-p-text(Service Provider)');
    const popup = await popupPromise;
    await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    popup.on("dialog", async (d: any) => { try { await d.dismiss(); } catch {} });

    // Dismiss passkey dialog if present
    try {
      await popup.waitForSelector('button::-p-text(Block)', { timeout: 4000 });
      await popup.click('button::-p-text(Block)');
    } catch {}

    // Fill username
    await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await popup.type('input[name="identifier"]', username);
    await popup.click('input[type="submit"]');

    // Fill password
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    await popup.type('input[type="password"]', password);
    const pwSubmit = await popup.$('input[type="submit"], button[type="submit"], input[value="Verify"]');
    if (pwSubmit) await pwSubmit.click();
    else await popup.keyboard.press("Enter");

    // Wait for redirect back to DRO · this triggers API calls we'll intercept
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Select the single service area · triggers more authenticated API calls
    await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
    const stationEls = await page.$$('[class*="station" i]');
    if (stationEls.length > 0) await stationEls[0].click();

    // Wait for intercepted headers (up to 20s after station click)
    for (let i = 0; i < 4 && !capturedHeaders; i++) {
      await new Promise(r => setTimeout(r, 5000));
      console.log(`[dro-client] Waiting for intercepted API request (${(i+1)*5}s)...`);
    }

    // Read localStorage/sessionStorage · DRO's React app may store JWT there
    // that gets added via an HTTP interceptor (not visible in plain fetch/cookies)
    const storageData = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        out["local:" + k] = localStorage.getItem(k) ?? "";
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!;
        out["session:" + k] = sessionStorage.getItem(k) ?? "";
      }
      return out;
    }).catch(() => ({} as Record<string, string>));

    const storageKeys = Object.keys(storageData);
    console.log("[dro-client] Storage keys:", storageKeys.join(", "));
    await sql`INSERT INTO settings (key, value) VALUES ('dro_storage_keys', ${JSON.stringify(storageKeys)})
              ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(storageKeys)}`;

    // Find auth token in storage
    let authToken = "";
    for (const [k, v] of Object.entries(storageData)) {
      const lk = k.toLowerCase();
      if ((lk.includes("token") || lk.includes("auth") || lk.includes("jwt") || lk.includes("okta")) && v && v.length > 20) {
        authToken = v;
        console.log("[dro-client] Found potential auth token in storage key:", k);
        break;
      }
    }

    // If interception never fired, build headers from cookies
    if (!capturedHeaders) {
      console.log("[dro-client] No request intercepted · building headers from cookies");
      const allCookies = await browser.defaultBrowserContext().cookies();
      const droCookies = allCookies.filter((c: any) => c.domain.includes("routesmart.com"));
      const cookieStr = droCookies.length > 0
        ? droCookies.map((c: any) => `${c.name}=${c.value}`).join("; ")
        : allCookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
      capturedHeaders = {
        cookie: cookieStr,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        origin: DRO_BASE,
        referer: `${DRO_BASE}/`,
        accept: "application/json, text/plain, */*",
      };
    }

    // Inject Authorization if found in storage and not already captured
    if (authToken && !capturedHeaders["authorization"]) {
      capturedHeaders["authorization"] = authToken.startsWith("Bearer ") ? authToken : `Bearer ${authToken}`;
      console.log("[dro-client] Injected Authorization from storage");
    }

    await browser.close();

    // Ensure Content-Type is set for JSON API calls
    capturedHeaders["content-type"] = "application/json";
    console.log("[dro-client] Final header keys:", Object.keys(capturedHeaders).join(", "));
    const keyLog = JSON.stringify(Object.keys(capturedHeaders));
    await sql`INSERT INTO settings (key, value) VALUES ('dro_captured_header_keys', ${keyLog})
              ON CONFLICT (key) DO UPDATE SET value = ${keyLog}`;

    // Cache headers in DB (expires in 6 hours)
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const headersJson = JSON.stringify(capturedHeaders);
    await sql`INSERT INTO settings (key, value) VALUES ('dro_session_headers', ${headersJson})
              ON CONFLICT (key) DO UPDATE SET value = ${headersJson}`;
    await sql`INSERT INTO settings (key, value) VALUES ('dro_session_expires_at', ${expiresAt})
              ON CONFLICT (key) DO UPDATE SET value = ${expiresAt}`;
    // Keep dro_session_cookies for backwards compat with diagnose endpoint
    const cookieHeader = capturedHeaders["cookie"] ?? "";
    if (cookieHeader) {
      await sql`INSERT INTO settings (key, value) VALUES ('dro_session_cookies', ${cookieHeader})
                ON CONFLICT (key) DO UPDATE SET value = ${cookieHeader}`;
    }

    return capturedHeaders;
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

// ── Session · use cached headers if valid, otherwise run Puppeteer login ───────

export async function getDroHeaders(): Promise<Record<string, string>> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  // Check for a cached valid session before running expensive Puppeteer login
  const cacheRows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_session_headers','dro_session_expires_at')`;
  const cache = Object.fromEntries(cacheRows.map((r: any) => [r.key, r.value]));
  const cachedHeadersJson = cache["dro_session_headers"] ?? "";
  const expiresAt = cache["dro_session_expires_at"] ?? "";

  if (cachedHeadersJson && expiresAt && new Date(expiresAt) > new Date()) {
    console.log("[dro-client] Using cached session headers (expires:", expiresAt, ")");
    try {
      return JSON.parse(cachedHeadersJson) as Record<string, string>;
    } catch {
      console.warn("[dro-client] Cached headers JSON is corrupt, re-logging in");
    }
  }

  console.log("[dro-client] No valid cached session · running Puppeteer login");
  return loginAndCaptureHeaders();
}

/** @deprecated · use getDroHeaders(). */
export async function getDroHeadersStrict(): Promise<Record<string, string>> {
  return getDroHeaders();
}

// ── Low-level fetch wrapper ────────────────────────────────────────────────────

export type DroFetchResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

export async function droFetch<T = unknown>(
  path: string,
  opts: RequestInit = {}
): Promise<DroFetchResult<T>> {
  const headers = await getDroHeadersStrict();
  const res = await fetch(`${DRO_BASE}${path}`, {
    ...opts,
    headers: {
      ...headers,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });

  let data: T;
  const text = await res.text();
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }

  return { ok: res.ok, status: res.status, data };
}

// ── DRO API methods ────────────────────────────────────────────────────────────

export const dro = {
  // Schedule
  async getSchedule() {
    return droFetch(`/api/api/service-areas/${SA_ID}/active-plan`);
  },

  async saveSchedule(body: unknown) {
    await droFetch(`/api/api/service-areas/${SA_ID}/ValidateActivePlans`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return droFetch(`/api/api/service-areas/${SA_ID}/active-plan2`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  // Plans
  async getPlans() {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans`);
  },

  async copyPlan(planId: number, newName: string) {
    return droFetch(`/api/api/service-areas/${SA_ID}/CopyRoutePlan/${planId}`, {
      method: "POST",
      body: JSON.stringify({ RoutePlanId: planId, NewName: newName }),
    });
  },

  async deletePlan(planId: number) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/`, {
      method: "DELETE",
      body: JSON.stringify({ planId }),
    });
  },

  // Vehicles
  async getVehicleSet(planId: number) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/vehicle-set`);
  },

  async getAdvancedVehicleSet(planId: number) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/advanced-vehicle-set`);
  },

  async addVehicles(planId: number, vehicles: unknown[]) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/vehicle-set`, {
      method: "POST",
      body: JSON.stringify(vehicles),
    });
  },

  async removeVehicles(planId: number, vehicleSetIds: number[]) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/vehicle-set`, {
      method: "DELETE",
      body: JSON.stringify(vehicleSetIds.map(id => ({ vehicleSetId: id }))),
    });
  },

  // Anchor areas
  async getAvailableAnchors(planId: number, vehicleSetId: number) {
    return droFetch(
      `/api/api/service-areas/${SA_ID}/routeplan/${planId}/vehicle-set/${vehicleSetId}/available-anchor-areas`
    );
  },

  async updateVehicleAnchors(planId: number, vehicleData: unknown) {
    return droFetch(`/api/api/service-areas/${SA_ID}/route-plans/${planId}/advanced-vehicle-set`, {
      method: "PUT",
      body: JSON.stringify(vehicleData),
    });
  },

  // Fleet
  async getFleet() {
    return droFetch(`/api/api/service-areas/${SA_ID}/fleet-al`);
  },

  async updateFleetVehicle(vehicle: unknown) {
    return droFetch(`/api/api/service-areas/${SA_ID}/fleet-al`, {
      method: "PUT",
      body: JSON.stringify(vehicle),
    });
  },
};

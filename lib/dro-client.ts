/**
 * DRO API client with session caching.
 * Handles Puppeteer login and caches session cookies in the settings table.
 * All other modules should use this instead of embedding login logic.
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { neon } from "@neondatabase/serverless";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

export const DRO_BASE = "https://dro.routesmart.com";
export const SA_ID = process.env.DRO_SERVICE_AREA_ID || "3060743";
export const STATION_ID = process.env.DRO_STATION_ID || "259";

// ── Session login (copied exactly from dro-sync.ts lines 52-110) ──────────────

async function loginAndGetCookies(): Promise<string> {
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
    // Okta password page uses input[type="submit"] with value "Verify"
    const pwSubmit = await popup.$('input[type="submit"], button[type="submit"], input[value="Verify"]');
    if (pwSubmit) await pwSubmit.click();
    else await popup.keyboard.press("Enter");

    // Wait for redirect back to DRO
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Select the single service area
    await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
    const stationEls = await page.$$('[class*="station" i]');
    if (stationEls.length > 0) await stationEls[0].click();
    await new Promise(r => setTimeout(r, 4000));

    // Extract session cookies from the main page
    const cookies = await page.cookies();
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

    await browser.close();

    // Cache cookies in settings table (expires in 23 hours)
    const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
    await sql`
      INSERT INTO settings (key, value) VALUES ('dro_session_cookies', ${cookieHeader})
      ON CONFLICT (key) DO UPDATE SET value = ${cookieHeader}
    `;
    await sql`
      INSERT INTO settings (key, value) VALUES ('dro_session_expires_at', ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET value = ${expiresAt}
    `;

    return cookieHeader;
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

// ── Session cache ──────────────────────────────────────────────────────────────

export async function getDroHeaders(): Promise<Record<string, string>> {
  const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);

  const rows = await sql`SELECT key, value FROM settings WHERE key IN ('dro_session_cookies','dro_session_expires_at')`;
  const cache = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));

  const cookies: string = cache["dro_session_cookies"] ?? "";
  const expiresAt: string = cache["dro_session_expires_at"] ?? "";

  const isValid = cookies && expiresAt && new Date(expiresAt) > new Date();

  const cookieHeader = isValid ? cookies : await loginAndGetCookies();

  return {
    Cookie: cookieHeader,
    "Content-Type": "application/json",
  };
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
  const headers = await getDroHeaders();
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
    // First validate, then save
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

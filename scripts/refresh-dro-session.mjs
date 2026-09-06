/**
 * Logs into DRO headlessly and saves fresh session cookie to DB.
 * Run this whenever the session expires (every ~23 hours).
 */
import puppeteer from "puppeteer-core";
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, "");
}

const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL);
const CHROME = process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const DRO_BASE = "https://dro.routesmart.com";
const username = process.env.DRO_USERNAME;
const password = process.env.DRO_PASSWORD;

console.log("Logging in to DRO...");
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  page.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  await page.goto(DRO_BASE, { waitUntil: "networkidle2" });
  const popupPromise = new Promise(resolve => browser.once("targetcreated", t => resolve(t.page())));
  await page.click("button::-p-text(Service Provider)");
  const popup = await popupPromise;
  await popup.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  popup.on("dialog", async d => { try { await d.dismiss(); } catch {} });
  try { await popup.waitForSelector("button::-p-text(Block)", { timeout: 4000 }); await popup.click("button::-p-text(Block)"); } catch {}
  await popup.waitForSelector('input[name="identifier"]', { timeout: 10000 });
  await popup.type('input[name="identifier"]', username);
  await popup.click('input[type="submit"]');
  await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
  await popup.type('input[type="password"]', password);
  const btn = await popup.$('input[type="submit"], button[type="submit"]');
  if (btn) await btn.click(); else await popup.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector('[class*="station" i]', { timeout: 10000 });
  const stations = await page.$$('[class*="station" i]');
  if (stations.length) await stations[0].click();
  await new Promise(r => setTimeout(r, 3000));
  const cookies = await page.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const expiresAt = new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO settings (key, value) VALUES ('dro_session_cookies', ${cookieHeader}) ON CONFLICT (key) DO UPDATE SET value = ${cookieHeader}`;
  await sql`INSERT INTO settings (key, value) VALUES ('dro_session_expires_at', ${expiresAt}) ON CONFLICT (key) DO UPDATE SET value = ${expiresAt}`;
  console.log("✅ Session saved. Expires:", expiresAt);
} finally {
  await browser.close();
}

import type { NextConfig } from "next";
// next-pwa is CJS — import via createRequire
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // Cache strategy per resource type
  runtimeCaching: [
    {
      // Gate codes page — most critical for offline use
      urlPattern: /^https:\/\/.*\/driver(\/.*)?$/,
      handler: "NetworkFirst",
      options: {
        cacheName: "driver-portal",
        expiration: { maxAgeSeconds: 24 * 60 * 60 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      // Gate code API data
      urlPattern: /^https:\/\/.*\/api\/gate-codes.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "gate-codes-api",
        expiration: { maxAgeSeconds: 24 * 60 * 60 },
        networkTimeoutSeconds: 8,
      },
    },
    {
      // Driver API calls
      urlPattern: /^https:\/\/.*\/api\/driver.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "driver-api",
        expiration: { maxAgeSeconds: 24 * 60 * 60 },
        networkTimeoutSeconds: 8,
      },
    },
    {
      // Static assets — cache first, always fast
      urlPattern: /\.(png|jpg|jpeg|svg|ico|woff2?)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "static-assets",
        expiration: { maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    {
      // Next.js JS/CSS chunks
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  turbopack: {},
};

export default withPWA(nextConfig);

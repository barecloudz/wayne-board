# Badges & Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Award top-3 ILS% drivers each week with accumulating trophy badges, visible on the driver portal leaderboard alongside profile pictures.

**Architecture:** New `badgeTypes` and `driverBadges` tables in Drizzle schema; R2 storage for badge icons and avatars; admin Leaderboard page with 3-tab UI; driver portal score panel extended with badge shelf and avatar chips on leaderboard rows.

**Tech Stack:** Next.js App Router, Drizzle ORM + PostgreSQL, Cloudflare R2 via `@aws-sdk/client-s3`, React `useTransition`, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-09-23-badges-leaderboard-design.md`

## Global Constraints

- Every DB query must include `organizationId` filter — multi-tenant, no exceptions
- R2 env vars: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME=mgops-avatars`, `R2_PUBLIC_URL`
- `@aws-sdk/client-s3` already installed
- Run migrations via `npm run db:migrate` — never ask user to run SQL manually
- `revalidatePath` on every server action write
- Max badge icon size: 512 KB; supported types: PNG, SVG, GIF, WebP
- Max avatar size: 2 MB; supported types: PNG, JPG, WebP
- Animated GIF/WebP must play natively (no CSS override)
- Shine toggle: CSS `@keyframes` gold shimmer, 2s loop, applied as `::after` pseudo-element overlay
- Default badge icon: built-in gold/silver/bronze trophy SVG (inline, no upload required)

---

### Task 1: Schema + Migration

**Files:**
- Modify: `lib/schema.ts`
- Create: run `npx drizzle-kit generate` → migration file appears in `drizzle/`
- Run: `npm run db:migrate`

**Interfaces:**
- Produces:
  - `badgeTypes` table export from `lib/schema.ts`
  - `driverBadges` table export from `lib/schema.ts`
  - TypeScript types inferred by Drizzle: `BadgeType`, `DriverBadge`

- [ ] **Step 1: Read current schema tail to find insertion point**

```bash
# Read the last ~80 lines to see existing table pattern
```
Read `lib/schema.ts` lines 1–50 to understand imports, then find end of file for insertion point.

- [ ] **Step 2: Add badgeTypes and driverBadges tables to lib/schema.ts**

Append after the last existing table definition:

```ts
// ── Badge Types ──────────────────────────────────────────────────────────────
export const badgeTypes = pgTable("badgeTypes", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull().references(() => organizations.id),
  rank:           integer("rank"),                       // 1,2,3 for weekly; null for special
  name:           text("name").notNull(),
  iconUrl:        text("iconUrl"),                       // null = default trophy SVG
  shine:          boolean("shine").notNull().default(false),
  category:       text("category").notNull(),            // "weekly" | "special"
  createdAt:      timestamp("createdAt").notNull().defaultNow(),
}, (t) => ({
  orgRankUniq: uniqueIndex("badgeTypes_orgId_rank_uniq")
    .on(t.organizationId, t.rank)
    .where(sql`${t.rank} IS NOT NULL`),
}));

// ── Driver Badges (award log, never deleted) ─────────────────────────────────
export const driverBadges = pgTable("driverBadges", {
  id:             serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull().references(() => organizations.id),
  driverId:       text("driverId").notNull().references(() => drivers.driverId),
  badgeTypeId:    integer("badgeTypeId").notNull().references(() => badgeTypes.id),
  weekStart:      date("weekStart").notNull(),
  awardedAt:      timestamp("awardedAt").notNull().defaultNow(),
}, (t) => ({
  orgBadgeWeekUniq: uniqueIndex("driverBadges_org_badgeType_week_uniq")
    .on(t.organizationId, t.badgeTypeId, t.weekStart),
}));
```

Check if `sql` is already imported from `drizzle-orm` in `lib/schema.ts`. If not, add it to the import.

- [ ] **Step 3: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: new file in `drizzle/` with `CREATE TABLE "badgeTypes"` and `CREATE TABLE "driverBadges"`.

- [ ] **Step 4: Run migration**

```bash
npm run db:migrate
```

Expected: "Migration applied successfully" or similar — no errors.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/schema.ts drizzle/
git commit -m "feat: add badgeTypes and driverBadges tables"
```

---

### Task 2: R2 Utility Module

**Files:**
- Modify or create: `lib/r2.ts` (check if it exists first; if so, append exports)

**Interfaces:**
- Produces:
  - `uploadToR2(key: string, body: Buffer, contentType: string): Promise<string>` — returns public URL
  - `deleteFromR2(key: string): Promise<void>`

- [ ] **Step 1: Check if lib/r2.ts already exists**

```bash
ls lib/r2.ts 2>/dev/null && echo "exists" || echo "missing"
```

- [ ] **Step 2: Create or update lib/r2.ts**

If missing, create. If exists, ensure these two functions are exported (add if missing):

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "mgops-avatars";
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `${PUBLIC_URL}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/r2.ts
git commit -m "feat: add R2 upload/delete utility"
```

---

### Task 3: Badge Server Actions

**Files:**
- Create: `lib/actions/badges.ts`

**Interfaces:**
- Consumes:
  - `badgeTypes`, `driverBadges`, `drivers`, `dswRouteDays` from `lib/schema.ts`
  - `uploadToR2`, `deleteFromR2` from `lib/r2.ts`
  - `getSession` from `lib/session`
  - `db` from `lib/db`
- Produces (all exported server actions):
  - `getBadgeTypes(): Promise<BadgeTypeRow[]>`
    - `BadgeTypeRow = { id: number; rank: number|null; name: string; iconUrl: string|null; shine: boolean; category: string }`
  - `upsertBadgeType(data: { id?: number; rank?: number|null; name: string; iconUrl?: string|null; shine: boolean; category: string }): Promise<void>`
  - `deleteBadgeType(id: number): Promise<void>`
  - `computeTopDrivers(weekStart: string, weekEnd: string): Promise<TopDriverRow[]>`
    - `TopDriverRow = { driverId: string; driverName: string; avgIls: number; dayCount: number; unmappedCount: number }`
  - `awardBadgesForWeek(weekStart: string, awards: Array<{ driverId: string; badgeTypeId: number }>): Promise<{ inserted: number; skipped: number }>`
  - `awardSpecialBadge(driverId: string, badgeTypeId: number, weekStart: string): Promise<void>`
  - `getBadgeHistory(limit?: number): Promise<BadgeHistoryRow[]>`
    - `BadgeHistoryRow = { id: number; weekStart: string; driverName: string; driverId: string; avatarUrl: string|null; badgeName: string; iconUrl: string|null; shine: boolean; awardedAt: Date }`
  - `getDriverBadges(driverId: string): Promise<DriverBadgeRow[]>`
    - `DriverBadgeRow = { id: number; weekStart: string; badgeName: string; iconUrl: string|null; shine: boolean; category: string; awardedAt: Date }`
  - `getDriverBadgeCounts(): Promise<Array<{ driverId: string; badgeCount: number }>>`
  - `isWeekAwarded(weekStart: string): Promise<boolean>`

- [ ] **Step 1: Check dswRouteDays schema to confirm column names**

Read `lib/schema.ts` and grep for `dswRouteDays` to find the exact column names for `driverId`, `ilsPercent` (or similar), and `routeDate`.

- [ ] **Step 2: Create lib/actions/badges.ts**

```ts
"use server";

import { db } from "@/lib/db";
import { badgeTypes, driverBadges, drivers, dswRouteDays } from "@/lib/schema";
import { eq, and, gte, lte, isNotNull, sql, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

async function requireOrg(): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session.organizationId;
}

export type BadgeTypeRow = {
  id: number;
  rank: number | null;
  name: string;
  iconUrl: string | null;
  shine: boolean;
  category: string;
};

export type TopDriverRow = {
  driverId: string;
  driverName: string;
  avgIls: number;
  dayCount: number;
  unmappedCount: number;
};

export type BadgeHistoryRow = {
  id: number;
  weekStart: string;
  driverName: string;
  driverId: string;
  avatarUrl: string | null;
  badgeName: string;
  iconUrl: string | null;
  shine: boolean;
  awardedAt: Date;
};

export type DriverBadgeRow = {
  id: number;
  weekStart: string;
  badgeName: string;
  iconUrl: string | null;
  shine: boolean;
  category: string;
  awardedAt: Date;
};

export async function getBadgeTypes(): Promise<BadgeTypeRow[]> {
  const orgId = await requireOrg();
  return db
    .select({
      id:       badgeTypes.id,
      rank:     badgeTypes.rank,
      name:     badgeTypes.name,
      iconUrl:  badgeTypes.iconUrl,
      shine:    badgeTypes.shine,
      category: badgeTypes.category,
    })
    .from(badgeTypes)
    .where(eq(badgeTypes.organizationId, orgId))
    .orderBy(badgeTypes.category, badgeTypes.rank);
}

export async function upsertBadgeType(data: {
  id?: number;
  rank?: number | null;
  name: string;
  iconUrl?: string | null;
  shine: boolean;
  category: string;
}): Promise<void> {
  const orgId = await requireOrg();
  if (data.id) {
    await db
      .update(badgeTypes)
      .set({ name: data.name, iconUrl: data.iconUrl ?? null, shine: data.shine })
      .where(and(eq(badgeTypes.id, data.id), eq(badgeTypes.organizationId, orgId)));
  } else {
    await db.insert(badgeTypes).values({
      organizationId: orgId,
      rank:           data.rank ?? null,
      name:           data.name,
      iconUrl:        data.iconUrl ?? null,
      shine:          data.shine,
      category:       data.category,
    });
  }
  revalidatePath("/dashboard/leaderboard");
}

export async function deleteBadgeType(id: number): Promise<void> {
  const orgId = await requireOrg();
  // Only allow deleting special badges (category = "special")
  const [row] = await db
    .select({ category: badgeTypes.category })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.id, id), eq(badgeTypes.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("Badge type not found.");
  if (row.category !== "special") throw new Error("Weekly rank badge types cannot be deleted.");
  await db.delete(badgeTypes).where(and(eq(badgeTypes.id, id), eq(badgeTypes.organizationId, orgId)));
  revalidatePath("/dashboard/leaderboard");
}

export async function computeTopDrivers(
  weekStart: string,
  weekEnd: string,
): Promise<TopDriverRow[]> {
  const orgId = await requireOrg();
  // Get rows for this org's drivers in date range with a driverId mapped
  // dswRouteDays has: driverId (mapped), driverName (raw), ilsPercent, routeDate, organizationId
  // Unmapped rows have driverId = null
  const rows = await db
    .select({
      driverId:   dswRouteDays.driverId,
      driverName: drivers.name,
      ilsPercent: dswRouteDays.ilsPercent,
    })
    .from(dswRouteDays)
    .innerJoin(drivers, and(
      eq(drivers.driverId, dswRouteDays.driverId),
      eq(drivers.organizationId, orgId),
    ))
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.routeDate, weekStart),
        lte(dswRouteDays.routeDate, weekEnd),
        isNotNull(dswRouteDays.driverId),
      )
    );

  // Count unmapped rows
  const [{ unmapped }] = await db
    .select({ unmapped: count() })
    .from(dswRouteDays)
    .where(
      and(
        eq(dswRouteDays.organizationId, orgId),
        gte(dswRouteDays.routeDate, weekStart),
        lte(dswRouteDays.routeDate, weekEnd),
        sql`${dswRouteDays.driverId} IS NULL`,
      )
    );

  // Aggregate by driverId
  const map = new Map<string, { driverName: string; total: number; days: number }>();
  for (const row of rows) {
    if (!row.driverId) continue;
    const prev = map.get(row.driverId);
    const ils = row.ilsPercent != null ? Number(row.ilsPercent) : null;
    if (ils === null) continue;
    if (prev) {
      prev.total += ils;
      prev.days  += 1;
    } else {
      map.set(row.driverId, { driverName: row.driverName ?? row.driverId, total: ils, days: 1 });
    }
  }

  const result: TopDriverRow[] = Array.from(map.entries())
    .map(([driverId, v]) => ({
      driverId,
      driverName:    v.driverName,
      avgIls:        parseFloat((v.total / v.days).toFixed(2)),
      dayCount:      v.days,
      unmappedCount: Number(unmapped),
    }))
    .sort((a, b) => b.avgIls - a.avgIls)
    .slice(0, 3);

  // Attach unmappedCount to each row (for the warning banner)
  return result.map(r => ({ ...r, unmappedCount: Number(unmapped) }));
}

export async function isWeekAwarded(weekStart: string): Promise<boolean> {
  const orgId = await requireOrg();
  const rows = await db
    .select({ id: driverBadges.id })
    .from(driverBadges)
    .where(and(eq(driverBadges.organizationId, orgId), eq(driverBadges.weekStart, weekStart)))
    .limit(1);
  return rows.length > 0;
}

export async function awardBadgesForWeek(
  weekStart: string,
  awards: Array<{ driverId: string; badgeTypeId: number }>,
): Promise<{ inserted: number; skipped: number }> {
  const orgId = await requireOrg();
  let inserted = 0;
  let skipped  = 0;
  for (const { driverId, badgeTypeId } of awards) {
    const result = await db
      .insert(driverBadges)
      .values({ organizationId: orgId, driverId, badgeTypeId, weekStart })
      .onConflictDoNothing()
      .returning({ id: driverBadges.id });
    if (result.length > 0) inserted++;
    else skipped++;
  }
  revalidatePath("/dashboard/leaderboard");
  revalidatePath("/driver");
  return { inserted, skipped };
}

export async function awardSpecialBadge(
  driverId: string,
  badgeTypeId: number,
  weekStart: string,
): Promise<void> {
  const orgId = await requireOrg();
  await db
    .insert(driverBadges)
    .values({ organizationId: orgId, driverId, badgeTypeId, weekStart })
    .onConflictDoNothing();
  revalidatePath("/dashboard/leaderboard");
  revalidatePath("/driver");
}

export async function getBadgeHistory(limit = 50): Promise<BadgeHistoryRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:          driverBadges.id,
      weekStart:   driverBadges.weekStart,
      driverName:  drivers.name,
      driverId:    driverBadges.driverId,
      avatarUrl:   drivers.avatarUrl,
      badgeName:   badgeTypes.name,
      iconUrl:     badgeTypes.iconUrl,
      shine:       badgeTypes.shine,
      awardedAt:   driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(drivers,     and(eq(drivers.driverId, driverBadges.driverId), eq(drivers.organizationId, orgId)))
    .innerJoin(badgeTypes,  and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)))
    .where(eq(driverBadges.organizationId, orgId))
    .orderBy(desc(driverBadges.awardedAt))
    .limit(limit);
  return rows.map(r => ({ ...r, weekStart: String(r.weekStart).slice(0, 10) }));
}

export async function getDriverBadges(driverId: string): Promise<DriverBadgeRow[]> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      id:        driverBadges.id,
      weekStart: driverBadges.weekStart,
      badgeName: badgeTypes.name,
      iconUrl:   badgeTypes.iconUrl,
      shine:     badgeTypes.shine,
      category:  badgeTypes.category,
      awardedAt: driverBadges.awardedAt,
    })
    .from(driverBadges)
    .innerJoin(badgeTypes, and(eq(badgeTypes.id, driverBadges.badgeTypeId), eq(badgeTypes.organizationId, orgId)))
    .where(and(eq(driverBadges.organizationId, orgId), eq(driverBadges.driverId, driverId)))
    .orderBy(desc(driverBadges.awardedAt));
  return rows.map(r => ({ ...r, weekStart: String(r.weekStart).slice(0, 10) }));
}

export async function getDriverBadgeCounts(): Promise<Array<{ driverId: string; badgeCount: number }>> {
  const orgId = await requireOrg();
  const rows = await db
    .select({
      driverId:   driverBadges.driverId,
      badgeCount: count(),
    })
    .from(driverBadges)
    .where(eq(driverBadges.organizationId, orgId))
    .groupBy(driverBadges.driverId);
  return rows.map(r => ({ driverId: r.driverId, badgeCount: Number(r.badgeCount) }));
}
```

> **Note:** Before writing, grep for the exact column names in `dswRouteDays` in `lib/schema.ts` — specifically `driverId`, `ilsPercent`, and `routeDate`. Adjust the field references in `computeTopDrivers` to match the actual column names found.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/badges.ts
git commit -m "feat: badge server actions (getBadgeTypes, computeTopDrivers, awardBadgesForWeek, etc.)"
```

---

### Task 4: Upload API Routes

**Files:**
- Create: `app/api/badge-icons/upload/route.ts`
- Create: `app/api/avatar/upload/route.ts`
- Create: `app/api/avatar/remove/route.ts`

**Interfaces:**
- Consumes: `uploadToR2`, `deleteFromR2` from `lib/r2.ts`; `getSession` from `lib/session`; `db`, `drivers`, `badgeTypes` from schema
- Produces:
  - `POST /api/badge-icons/upload` → `{ url: string }` (badge icon R2 URL)
  - `POST /api/avatar/upload` → `{ url: string }` (driver avatar R2 URL)
  - `POST /api/avatar/remove` admin route → `{ ok: true }`

- [ ] **Step 1: Create app/api/badge-icons/upload/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { badgeTypes } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_TYPES = ["image/png", "image/svg+xml", "image/gif", "image/webp"];
const MAX_BYTES = 512 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file        = formData.get("file") as File | null;
  const badgeTypeId = formData.get("badgeTypeId");

  if (!file || !badgeTypeId) {
    return NextResponse.json({ error: "Missing file or badgeTypeId" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 512 KB)" }, { status: 400 });
  }

  // Verify badge type belongs to this org
  const [bt] = await db
    .select({ id: badgeTypes.id })
    .from(badgeTypes)
    .where(and(eq(badgeTypes.id, Number(badgeTypeId)), eq(badgeTypes.organizationId, session.organizationId)))
    .limit(1);
  if (!bt) return NextResponse.json({ error: "Badge type not found" }, { status: 404 });

  const ext = file.type === "image/svg+xml" ? "svg"
    : file.type === "image/gif" ? "gif"
    : file.type === "image/webp" ? "webp"
    : "png";

  const key = `badge-icons/${session.organizationId}/${badgeTypeId}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type);

  // Update iconUrl on badge type
  await db
    .update(badgeTypes)
    .set({ iconUrl: url })
    .where(and(eq(badgeTypes.id, Number(badgeTypeId)), eq(badgeTypes.organizationId, session.organizationId)));

  return NextResponse.json({ url });
}
```

- [ ] **Step 2: Create app/api/avatar/upload/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 2 MB)" }, { status: 400 });
  }

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const key = `${session.organizationId}/avatars/${session.driverId}.${ext}`;
  const url = await uploadToR2(key, buffer, file.type);

  await db
    .update(drivers)
    .set({ avatarUrl: url })
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, session.driverId)));

  return NextResponse.json({ url });
}
```

- [ ] **Step 3: Create app/api/avatar/remove/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { drivers } from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import { deleteFromR2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "driver") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driverId } = await req.json() as { driverId?: string };
  if (!driverId) return NextResponse.json({ error: "Missing driverId" }, { status: 400 });

  const [driver] = await db
    .select({ avatarUrl: drivers.avatarUrl })
    .from(drivers)
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, driverId)))
    .limit(1);
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  if (driver.avatarUrl) {
    // Extract key from URL: strip PUBLIC_URL prefix
    const publicUrl = process.env.R2_PUBLIC_URL ?? "";
    const key = driver.avatarUrl.replace(`${publicUrl}/`, "");
    try { await deleteFromR2(key); } catch { /* already gone */ }
  }

  await db
    .update(drivers)
    .set({ avatarUrl: null })
    .where(and(eq(drivers.organizationId, session.organizationId), eq(drivers.driverId, driverId)));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/badge-icons/ app/api/avatar/
git commit -m "feat: R2 upload routes for badge icons and driver avatars"
```

---

### Task 5: Admin Leaderboard Page

**Files:**
- Create: `app/dashboard/leaderboard/page.tsx`
- Create: `app/dashboard/leaderboard/leaderboard-client.tsx`
- Modify: admin sidebar/nav component (find the nav file first — likely `app/dashboard/layout.tsx` or a `Sidebar` component)

**Interfaces:**
- Consumes:
  - `getBadgeTypes()`, `getBadgeHistory()`, `computeTopDrivers()`, `isWeekAwarded()`, `awardBadgesForWeek()`, `awardSpecialBadge()`, `upsertBadgeType()`, `deleteBadgeType()` from `lib/actions/badges.ts`
  - `getDrivers()` from `lib/actions/drivers.ts`
- Produces: `/dashboard/leaderboard` route with 3-tab UI (Award / Badge Setup / History)

- [ ] **Step 1: Find nav/sidebar component**

```bash
grep -r "Leaderboard\|/dashboard/scheduling\|nav.*dashboard" app/dashboard --include="*.tsx" -l | head -5
```

Read the file to find how nav items are structured (icon + label + href pattern).

- [ ] **Step 2: Add Leaderboard nav item**

In the sidebar/nav component, add after the existing nav items (match the existing pattern):

```tsx
{ href: "/dashboard/leaderboard", label: "Leaderboard", icon: <Trophy className="w-4 h-4" /> }
```

Import `Trophy` from `lucide-react` if not already imported.

- [ ] **Step 3: Create app/dashboard/leaderboard/page.tsx**

```tsx
import { getBadgeTypes, getBadgeHistory } from "@/lib/actions/badges";
import { getDrivers } from "@/lib/actions/drivers";
import LeaderboardClient from "./leaderboard-client";

export default async function LeaderboardPage() {
  const [badgeTypes, history, allDrivers] = await Promise.all([
    getBadgeTypes(),
    getBadgeHistory(100),
    getDrivers(),
  ]);
  return (
    <LeaderboardClient
      initialBadgeTypes={badgeTypes}
      initialHistory={history}
      allDrivers={allDrivers}
    />
  );
}
```

- [ ] **Step 4: Create app/dashboard/leaderboard/leaderboard-client.tsx**

This is the largest component. Build it with 3 tabs: Award, Badge Setup, History.

```tsx
"use client";

import { useState, useTransition, useRef } from "react";
import { Trophy, Settings, Clock, Loader2, Upload, X, Star } from "lucide-react";
import {
  computeTopDrivers, awardBadgesForWeek, awardSpecialBadge,
  upsertBadgeType, deleteBadgeType, isWeekAwarded,
  type BadgeTypeRow, type TopDriverRow, type BadgeHistoryRow,
} from "@/lib/actions/badges";
import { useRouter } from "next/navigation";
import type { BadgeTypeRow, TopDriverRow, BadgeHistoryRow } from "@/lib/actions/badges";

// ── Default trophy SVGs ───────────────────────────────────────────────────────
function DefaultTrophySvg({ rank }: { rank: number }) {
  const color = rank === 1 ? "#F59E0B" : rank === 2 ? "#9CA3AF" : "#B45309";
  return (
    <svg viewBox="0 0 24 24" fill={color} className="w-8 h-8">
      <path d="M12 2C9.79 2 8 3.79 8 6v2H5a1 1 0 0 0-1 1c0 2.76 2.08 5.04 4.8 5.44A6.01 6.01 0 0 0 11 16.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A6.01 6.01 0 0 0 15.2 14.44C17.92 14.04 20 11.76 20 9a1 1 0 0 0-1-1h-3V6c0-2.21-1.79-4-4-4zm-5 9.86A4.01 4.01 0 0 1 5.07 9H8v2a6.07 6.07 0 0 1-1 .86zM16 11V9h2.93A4.01 4.01 0 0 1 17 11.86 6.07 6.07 0 0 1 16 11z" />
    </svg>
  );
}

// ── Shine CSS ─────────────────────────────────────────────────────────────────
const shineStyle = `
  @keyframes shine-sweep {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .badge-shine {
    position: relative;
    display: inline-block;
  }
  .badge-shine::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,215,0,0.55) 50%, transparent 60%);
    background-size: 200% 100%;
    animation: shine-sweep 2s linear infinite;
    pointer-events: none;
    border-radius: inherit;
  }
`;

// ── Badge icon display ────────────────────────────────────────────────────────
function BadgeIcon({ badge, size = 32 }: { badge: BadgeTypeRow; size?: number }) {
  if (!badge.iconUrl) return <DefaultTrophySvg rank={badge.rank ?? 0} />;
  return (
    <span className={badge.shine ? "badge-shine" : ""} style={{ display: "inline-block" }}>
      <img src={badge.iconUrl} alt={badge.name} width={size} height={size} style={{ objectFit: "contain" }} />
    </span>
  );
}

// ── Week picker helpers ───────────────────────────────────────────────────────
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function getSundayOf(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d;
}
function prevMonday(): Date {
  const today = new Date();
  const thisMonday = getMondayOfWeek(today);
  const prev = new Date(thisMonday);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

type Driver = { driverId: string; name: string; avatarUrl?: string | null };

type Props = {
  initialBadgeTypes: BadgeTypeRow[];
  initialHistory:    BadgeHistoryRow[];
  allDrivers:        Driver[];
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeaderboardClient({ initialBadgeTypes, initialHistory, allDrivers }: Props) {
  const router   = useRouter();
  const [tab, setTab] = useState<"award" | "setup" | "history">("award");

  const [badgeTypes, setBadgeTypes] = useState(initialBadgeTypes);
  const [history]                   = useState(initialHistory);

  // ── Award Tab State ──────────────────────────────────────────────────────
  const weeklyBadges = badgeTypes.filter(b => b.category === "weekly").sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const specialBadges = badgeTypes.filter(b => b.category === "special");

  const [weekStart, setWeekStart] = useState(() => toDateStr(prevMonday()));
  const weekEnd = toDateStr(getSundayOf(new Date(weekStart + "T00:00:00")));

  const [topDrivers, setTopDrivers] = useState<TopDriverRow[] | null>(null);
  const [weekAwarded, setWeekAwarded] = useState(false);
  const [loadingWeek, startLoadWeek] = useTransition();
  const [awarding, startAward] = useTransition();

  const [specialDriverId, setSpecialDriverId] = useState("");
  const [specialBadgeTypeId, setSpecialBadgeTypeId] = useState("");
  const [specialAwarding, startSpecialAward] = useTransition();

  function loadWeek() {
    startLoadWeek(async () => {
      const [drivers, awarded] = await Promise.all([
        computeTopDrivers(weekStart, weekEnd),
        isWeekAwarded(weekStart),
      ]);
      setTopDrivers(drivers);
      setWeekAwarded(awarded);
    });
  }

  function handleAward() {
    if (!topDrivers) return;
    startAward(async () => {
      const awards = topDrivers
        .map((d, i) => ({ driverId: d.driverId, badgeTypeId: weeklyBadges[i]?.id }))
        .filter(a => a.badgeTypeId != null) as Array<{ driverId: string; badgeTypeId: number }>;
      await awardBadgesForWeek(weekStart, awards);
      setWeekAwarded(true);
      router.refresh();
    });
  }

  function handleSpecialAward() {
    if (!specialDriverId || !specialBadgeTypeId) return;
    startSpecialAward(async () => {
      await awardSpecialBadge(specialDriverId, Number(specialBadgeTypeId), weekStart);
      setSpecialDriverId("");
      setSpecialBadgeTypeId("");
      router.refresh();
    });
  }

  // ── Badge Setup Tab State ────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName]   = useState("");
  const [editShine, setEditShine] = useState(false);
  const [saving, startSave]       = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startEdit(bt: BadgeTypeRow) {
    setEditingId(bt.id);
    setEditName(bt.name);
    setEditShine(bt.shine);
  }

  function handleSaveBadgeType(bt: BadgeTypeRow) {
    startSave(async () => {
      await upsertBadgeType({ id: bt.id, rank: bt.rank, name: editName, iconUrl: bt.iconUrl, shine: editShine, category: bt.category });
      setEditingId(null);
      router.refresh();
    });
  }

  async function handleIconUpload(badgeTypeId: number, file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("badgeTypeId", String(badgeTypeId));
    const res  = await fetch("/api/badge-icons/upload", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.url) router.refresh();
  }

  const [newSpecialName, setNewSpecialName]   = useState("");
  const [newSpecialShine, setNewSpecialShine] = useState(false);
  const [addingSpecial, startAddSpecial]      = useTransition();
  const [deletingId, startDelete]             = useTransition();

  function handleAddSpecial() {
    if (!newSpecialName.trim()) return;
    startAddSpecial(async () => {
      await upsertBadgeType({ name: newSpecialName.trim(), shine: newSpecialShine, category: "special" });
      setNewSpecialName("");
      setNewSpecialShine(false);
      router.refresh();
    });
  }

  function handleDeleteSpecial(id: number) {
    startDelete(async () => {
      await deleteBadgeType(id);
      router.refresh();
    });
  }

  const unmappedCount = topDrivers?.[0]?.unmappedCount ?? 0;

  return (
    <>
      <style>{shineStyle}</style>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Leaderboard</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {([["award", "Award", Trophy], ["setup", "Badge Setup", Settings], ["history", "History", Clock]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === key
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Award Tab ───────────────────────────────────────────────────── */}
        {tab === "award" && (
          <div className="flex flex-col gap-6">
            {/* Week picker */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-700">Week of</label>
              <input
                type="date"
                value={weekStart}
                onChange={e => { setWeekStart(e.target.value); setTopDrivers(null); setWeekAwarded(false); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
              />
              <span className="text-sm text-slate-400">→ {weekEnd}</span>
              <button
                onClick={loadWeek}
                disabled={loadingWeek}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                {loadingWeek && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Load
              </button>
            </div>

            {unmappedCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                ⚠ {unmappedCount} unmapped DSW route{unmappedCount !== 1 ? "s" : ""} for this week — fix driver mappings in DSW Upload for accurate rankings.
              </div>
            )}

            {topDrivers && topDrivers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Rank</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Driver</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500">Avg ILS%</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-500">Days</th>
                      <th className="px-4 py-3 text-center font-semibold text-slate-500">Badge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDrivers.map((d, i) => {
                      const badge = weeklyBadges[i];
                      return (
                        <tr key={d.driverId} className="border-b border-slate-50 last:border-0">
                          <td className="px-4 py-3 font-bold text-slate-800">#{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-800">{d.driverName}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{d.avgIls.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right text-slate-500">{d.dayCount}</td>
                          <td className="px-4 py-3 flex justify-center">
                            {badge ? <BadgeIcon badge={badge} size={28} /> : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {topDrivers && topDrivers.length === 0 && (
              <p className="text-slate-500 text-sm">No mapped DSW data found for this week.</p>
            )}

            {topDrivers && !weekAwarded && (
              <button
                onClick={handleAward}
                disabled={awarding || topDrivers.length === 0}
                className="self-start px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {awarding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Award Badges for This Week
              </button>
            )}

            {weekAwarded && (
              <p className="text-sm font-semibold text-emerald-600">✓ Badges awarded for this week</p>
            )}

            {/* Special badge award */}
            {specialBadges.length > 0 && (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
                <p className="text-sm font-bold text-slate-700">Award Special Badge</p>
                <div className="flex gap-2 flex-wrap">
                  <select
                    value={specialDriverId}
                    onChange={e => setSpecialDriverId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]"
                  >
                    <option value="">Select driver…</option>
                    {allDrivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
                  </select>
                  <select
                    value={specialBadgeTypeId}
                    onChange={e => setSpecialBadgeTypeId(e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]"
                  >
                    <option value="">Select badge…</option>
                    {specialBadges.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button
                    onClick={handleSpecialAward}
                    disabled={specialAwarding || !specialDriverId || !specialBadgeTypeId}
                    className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {specialAwarding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Award
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Badge Setup Tab ─────────────────────────────────────────────── */}
        {tab === "setup" && (
          <div className="flex flex-col gap-8">
            {/* Weekly badges */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-3">Weekly Badges (Ranks 1–3)</p>
              <div className="flex flex-col gap-3">
                {weeklyBadges.length === 0 && (
                  <p className="text-sm text-slate-400">No weekly badge types configured yet.</p>
                )}
                {weeklyBadges.map(bt => (
                  <div key={bt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                    <div className="w-10 flex justify-center">
                      <BadgeIcon badge={bt} size={32} />
                    </div>
                    {editingId === bt.id ? (
                      <div className="flex-1 flex items-center gap-3 flex-wrap">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-40"
                          placeholder="Badge name"
                        />
                        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={editShine} onChange={e => setEditShine(e.target.checked)} className="rounded" />
                          Shine
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/svg+xml,image/gif,image/webp"
                          className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleIconUpload(bt.id, f); }}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                          Upload Icon
                        </button>
                        <button
                          onClick={() => handleSaveBadgeType(bt)}
                          disabled={saving}
                          className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1"
                        >
                          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700">Rank {bt.rank} — {bt.name}</span>
                        {bt.shine && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Shine</span>}
                        <button onClick={() => startEdit(bt)} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-900 border border-slate-200 px-3 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {/* Add missing weekly rank slots */}
                {[1,2,3].filter(r => !weeklyBadges.find(b => b.rank === r)).map(rank => (
                  <button
                    key={rank}
                    onClick={async () => {
                      const label = rank === 1 ? "Gold" : rank === 2 ? "Silver" : "Bronze";
                      await upsertBadgeType({ rank, name: label, shine: false, category: "weekly" });
                      router.refresh();
                    }}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors text-center"
                  >
                    + Add Rank {rank} badge
                  </button>
                ))}
              </div>
            </div>

            {/* Special badges */}
            <div>
              <p className="text-base font-bold text-slate-800 mb-3">Special Badges</p>
              <div className="flex flex-col gap-3">
                {specialBadges.map(bt => (
                  <div key={bt.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                    <BadgeIcon badge={bt} size={28} />
                    <span className="flex-1 text-sm font-semibold text-slate-700">{bt.name}</span>
                    {bt.shine && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Shine</span>}
                    <button
                      onClick={() => handleDeleteSpecial(bt.id)}
                      disabled={!!deletingId}
                      className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {/* Add special badge */}
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    value={newSpecialName}
                    onChange={e => setNewSpecialName(e.target.value)}
                    placeholder="Badge name (e.g. Driver of the Month)"
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[220px]"
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={newSpecialShine} onChange={e => setNewSpecialShine(e.target.checked)} className="rounded" />
                    Shine
                  </label>
                  <button
                    onClick={handleAddSpecial}
                    disabled={addingSpecial || !newSpecialName.trim()}
                    className="px-4 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {addingSpecial && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ─────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <p className="text-slate-400 text-sm">No badges awarded yet.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Week</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Driver</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Badge</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500">Awarded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-600">{h.weekStart}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.avatarUrl
                              ? <img src={h.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                              : <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">{h.driverName[0]}</div>
                            }
                            <span className="font-semibold text-slate-800">{h.driverName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {h.iconUrl
                              ? <span className={h.shine ? "badge-shine" : ""}><img src={h.iconUrl} alt="" className="w-6 h-6 object-contain" /></span>
                              : <Trophy className="w-5 h-5 text-amber-500" />
                            }
                            <span className="text-slate-700">{h.badgeName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {new Date(h.awardedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/leaderboard/
git commit -m "feat: admin leaderboard page with Award/Setup/History tabs"
```

---

### Task 6: Driver Me Tab — Avatar Upload

**Files:**
- Modify: `app/driver/me-panel.tsx` (or whatever the Me/Account tab component is — search for it)

**Interfaces:**
- Consumes: `POST /api/avatar/upload`; `getMyProfile()` from `lib/actions/drivers.ts`
- Produces: avatar upload UI in driver portal Me tab — tap avatar circle → file picker → instant upload

- [ ] **Step 1: Find the Me tab component**

```bash
grep -r "me.*panel\|account.*panel\|me-panel\|me_panel\|MePanel\|AccountPanel" app/driver --include="*.tsx" -l | head -5
```

Read the file to understand the current layout.

- [ ] **Step 2: Add avatar upload UI**

Find the section where the driver's profile/name is displayed. Add a clickable avatar circle with a hidden file input:

```tsx
// At the top of the component, inside the profile section:
const fileRef = useRef<HTMLInputElement>(null);
const [uploading, setUploading] = useState(false);
const [localAvatar, setLocalAvatar] = useState(profile?.avatarUrl ?? null);

async function handleAvatarChange(file: File) {
  setUploading(true);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/avatar/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (data.url) setLocalAvatar(data.url);
  setUploading(false);
}
```

Avatar display element — replace the existing avatar or initials display with a clickable version:

```tsx
<button
  onClick={() => fileRef.current?.click()}
  className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-200 flex items-center justify-center group"
  title="Tap to change photo"
>
  {localAvatar
    ? <img src={localAvatar} alt="avatar" className="w-full h-full object-cover" />
    : <span className="text-2xl font-bold text-slate-500">{profile?.name?.[0] ?? "?"}</span>
  }
  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
    {uploading
      ? <Loader2 className="w-6 h-6 text-white animate-spin" />
      : <Camera className="w-6 h-6 text-white" />
    }
  </div>
</button>
<input
  ref={fileRef}
  type="file"
  accept="image/png,image/jpeg,image/webp"
  className="hidden"
  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarChange(f); }}
/>
```

Add `Camera` and `Loader2` to lucide-react imports if not already present.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/driver/
git commit -m "feat: driver avatar upload from Me tab"
```

---

### Task 7: Admin — Remove Driver Avatar

**Files:**
- Modify: admin driver account/detail view (search for where admin views a driver's profile)

**Interfaces:**
- Consumes: `POST /api/avatar/remove` with `{ driverId }`
- Produces: "Remove Image" button visible on driver account view when `avatarUrl` is set; clears it on click

- [ ] **Step 1: Find the admin driver detail component**

```bash
grep -r "avatarUrl\|remove.*image\|driver.*account\|driver.*detail" app/dashboard --include="*.tsx" -l | head -5
```

Read the relevant file to understand the current driver detail/account layout.

- [ ] **Step 2: Add Remove Image button**

In the driver detail section, after the avatar display, add (client-side):

```tsx
const [removing, setRemoving] = useState(false);

async function handleRemoveAvatar() {
  setRemoving(true);
  await fetch("/api/avatar/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverId: driver.driverId }),
  });
  setRemoving(false);
  router.refresh();
}

// In JSX, only render if driver.avatarUrl is set:
{driver.avatarUrl && (
  <button
    onClick={handleRemoveAvatar}
    disabled={removing}
    className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 flex items-center gap-1.5"
  >
    {removing && <Loader2 className="w-3 h-3 animate-spin" />}
    Remove Image
  </button>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/
git commit -m "feat: admin remove driver avatar from account view"
```

---

### Task 8: Driver Portal — Score Tab Badges + Leaderboard Rows

**Files:**
- Modify: `app/driver/score-panel.tsx` (or the score/leaderboard tab component)

**Interfaces:**
- Consumes:
  - `getDriverBadges(driverId)` from `lib/actions/badges.ts`
  - `getDriverBadgeCounts()` from `lib/actions/badges.ts`
  - `getDrivers()` from `lib/actions/drivers.ts` (for avatarUrl)
- Produces:
  - Badge shelf above leaderboard (driver's own badges, max 8, "View all" expander)
  - Leaderboard rows updated: circular avatar + driver name + score + badge count chip
  - Badge chip click → popover with full badge history

- [ ] **Step 1: Read score-panel.tsx**

Read the full component to understand the current leaderboard row structure and data fetching.

- [ ] **Step 2: Update server data loading (page or layout)**

In the server component that loads score tab data, add parallel fetches:

```ts
const [myBadges, badgeCounts, drivers] = await Promise.all([
  getDriverBadges(session.driverId),
  getDriverBadgeCounts(),
  getDrivers(),
]);
```

Pass these as props to the score panel client component.

- [ ] **Step 3: Add badge shelf above leaderboard**

```tsx
// Badge shelf — hidden if zero badges
const shineStyle = `/* same @keyframes shine-sweep CSS as admin page */`;

{myBadges.length > 0 && (
  <div className="mb-4">
    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Badges</p>
    <div className="flex gap-2 flex-wrap">
      {(showAllBadges ? myBadges : myBadges.slice(0, 8)).map(b => (
        <div key={b.id} className="flex flex-col items-center gap-1">
          <span className={b.shine ? "badge-shine" : ""}>
            {b.iconUrl
              ? <img src={b.iconUrl} alt={b.badgeName} className="w-8 h-8 object-contain" />
              : <Trophy className="w-7 h-7 text-amber-500" />
            }
          </span>
          <span className="text-[9px] text-slate-400 text-center max-w-[52px] leading-tight">{b.weekStart.slice(0, 7)}</span>
        </div>
      ))}
      {myBadges.length > 8 && (
        <button onClick={() => setShowAllBadges(v => !v)} className="text-xs text-slate-400 hover:text-slate-700 self-center">
          {showAllBadges ? "Show less" : `+${myBadges.length - 8} more`}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Update leaderboard rows with avatar + badge chip**

In the existing leaderboard rows (where driver name is rendered), update to:

```tsx
<div className="flex items-center gap-2">
  {/* Avatar or initials */}
  <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 flex-shrink-0 flex items-center justify-center">
    {driverAvatarUrl
      ? <img src={driverAvatarUrl} alt="" className="w-full h-full object-cover" />
      : <span className="text-xs font-bold text-slate-500">{driverName[0]}</span>
    }
  </div>
  <span className="font-semibold text-slate-800">{driverName}</span>
  {/* Badge count chip */}
  {badgeCount > 0 && (
    <button
      onClick={() => setPopoverDriver(driverId)}
      className="flex items-center gap-0.5 bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-xs font-bold hover:bg-amber-200 transition-colors"
    >
      🏆 ×{badgeCount}
    </button>
  )}
</div>
```

- [ ] **Step 5: Add badge history popover**

```tsx
{popoverDriver && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
    onClick={() => setPopoverDriver(null)}
  >
    <div
      className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 flex flex-col gap-3"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold text-slate-800">Badge History</p>
        <button onClick={() => setPopoverDriver(null)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
      </div>
      {popoverBadges.length === 0
        ? <p className="text-sm text-slate-400">No badges yet.</p>
        : popoverBadges.map(b => (
          <div key={b.id} className="flex items-center gap-3">
            {b.iconUrl
              ? <img src={b.iconUrl} alt={b.badgeName} className="w-7 h-7 object-contain" />
              : <Trophy className="w-6 h-6 text-amber-500" />
            }
            <div>
              <p className="text-sm font-semibold text-slate-700">{b.badgeName}</p>
              <p className="text-xs text-slate-400">{b.weekStart}</p>
            </div>
          </div>
        ))
      }
    </div>
  </div>
)}
```

The `popoverBadges` can be derived from the full badge history or fetched on-click. Simplest approach: pass all badge data down from the server component, keyed by driverId.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add app/driver/
git commit -m "feat: driver score tab badge shelf, leaderboard avatars + badge chips"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1    | `badgeTypes` + `driverBadges` tables migrated |
| 2    | `lib/r2.ts` upload/delete utility |
| 3    | All badge server actions in `lib/actions/badges.ts` |
| 4    | R2 upload API routes (badge icons, avatar upload/remove) |
| 5    | Admin `/dashboard/leaderboard` with 3-tab UI + nav entry |
| 6    | Driver Me tab avatar upload |
| 7    | Admin driver account "Remove Image" |
| 8    | Driver score panel: badge shelf + avatar + badge chips |

"use server";

import { db } from "@/lib/db";
import { notifications, notificationPreferences, drivers } from "@/lib/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { NOTIFICATION_TYPES, DEFAULT_PREFERENCES } from "@/lib/notifications";
import type { NotificationType } from "@/lib/notifications";

// ── Get all notification preferences for an org, seeding defaults for missing rows ──

export async function getNotificationPreferences(organizationId: number) {
  const existing = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.organizationId, organizationId));

  const existingTypes = new Set(existing.map((r) => r.type));
  const allTypes = Object.values(NOTIFICATION_TYPES) as NotificationType[];
  const missing = allTypes.filter((t) => !existingTypes.has(t));

  if (missing.length > 0) {
    const insertRows = missing.map((type) => ({
      organizationId,
      type,
      ...DEFAULT_PREFERENCES[type],
    }));
    const inserted = await db
      .insert(notificationPreferences)
      .values(insertRows)
      .returning();
    return [...existing, ...inserted];
  }

  return existing;
}

// ── Upsert a single notification preference row ──

export async function upsertNotificationPreference(
  organizationId: number,
  type: string,
  patch: Partial<{
    enabled: boolean;
    inAppEnabled: boolean;
    emailEnabled: boolean;
    recipientRoles: string[];
    recipientIds: number[];
    timingDays: number[];
  }>
) {
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.organizationId, organizationId),
        eq(notificationPreferences.type, type)
      )
    );

  if (!existing) {
    const defaults = DEFAULT_PREFERENCES[type as NotificationType] ?? {
      enabled: true,
      inAppEnabled: true,
      emailEnabled: false,
      recipientRoles: ["owner"],
      recipientIds: [],
      timingDays: [],
    };
    const [inserted] = await db
      .insert(notificationPreferences)
      .values({ organizationId, type, ...defaults, ...patch })
      .returning();
    return inserted;
  }

  const [updated] = await db
    .update(notificationPreferences)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(notificationPreferences.organizationId, organizationId),
        eq(notificationPreferences.type, type)
      )
    )
    .returning();

  return updated;
}

// ── Paginated notifications history for an org ──

export async function getNotificationsHistory(
  organizationId: number,
  opts: { page?: number; limit?: number; type?: string } = {}
) {
  const { page = 1, limit = 20, type } = opts;
  const offset = (page - 1) * limit;

  const conditions = type
    ? and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.type, type)
      )
    : eq(notifications.organizationId, organizationId);

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(conditions)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(notifications)
      .where(conditions),
  ]);

  return { notifications: rows, total: Number(total) };
}

// ── Admins without email addresses ──

export async function getAdminsWithoutEmail(organizationId: number) {
  const rows = await db
    .select({ id: drivers.id, name: drivers.name, role: drivers.role, email: drivers.email })
    .from(drivers)
    .where(
      and(
        eq(drivers.organizationId, organizationId),
        inArray(drivers.role, ["owner", "co_owner", "bc"])
      )
    );

  return rows
    .filter((d) => !d.email)
    .map(({ email: _email, ...rest }) => rest);
}

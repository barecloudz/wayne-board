import { Resend } from "resend";
import { db } from "@/lib/db";
import { notifications, notificationPreferences, drivers } from "@/lib/schema";
import { eq, and, inArray } from "drizzle-orm";

const resend = new Resend(process.env.RESEND_API_KEY);

export const NOTIFICATION_TYPES = {
  MAINTENANCE_REQUEST:        "maintenance_request",
  MAINTENANCE_RESOLVED:       "maintenance_resolved",
  VEHICLE_EXPIRY:             "vehicle_expiry",
  VEHICLE_CONDITION_CRITICAL: "vehicle_condition_critical",
  TASK_OVERDUE:               "task_overdue",
  PAYROLL_READY:              "payroll_ready",
  MMR_REPORT:                 "mmr_report",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export const DEFAULT_PREFERENCES: Record<NotificationType, {
  enabled: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  recipientRoles: string[];
  recipientIds: number[];
  timingDays: number[];
}> = {
  maintenance_request:        { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: ["owner", "co_owner", "bc"], recipientIds: [], timingDays: [] },
  maintenance_resolved:       { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: [], recipientIds: [], timingDays: [] },
  vehicle_expiry:             { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner", "co_owner", "bc"], recipientIds: [], timingDays: [60, 30, 7, 0] },
  vehicle_condition_critical: { enabled: true, inAppEnabled: true, emailEnabled: false, recipientRoles: ["owner", "co_owner", "bc"], recipientIds: [], timingDays: [] },
  task_overdue:               { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner"], recipientIds: [], timingDays: [] },
  payroll_ready:              { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner"], recipientIds: [], timingDays: [] },
  mmr_report:                 { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner", "co_owner"], recipientIds: [], timingDays: [] },
};

interface CreateNotificationArgs {
  organizationId: number;
  type: NotificationType;
  title: string;
  body: string;
  linkTo?: string;
  metadata?: Record<string, unknown>;
  recipientIds?: number[]; // explicit override — skips role resolution
}

export async function createNotification({
  organizationId,
  type,
  title,
  body,
  linkTo,
  metadata,
  recipientIds: explicitRecipientIds,
}: CreateNotificationArgs) {
  // 1. Load or seed preferences
  let [pref] = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.organizationId, organizationId), eq(notificationPreferences.type, type)));

  if (!pref) {
    const defaults = DEFAULT_PREFERENCES[type];
    [pref] = await db
      .insert(notificationPreferences)
      .values({ organizationId, type, ...defaults })
      .returning();
  }

  if (!pref.enabled) return;

  // 2. Resolve recipients
  let recipientIds: number[] = explicitRecipientIds ?? [];

  if (!explicitRecipientIds && pref.recipientRoles && (pref.recipientRoles as string[]).length > 0) {
    const roleDrivers = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(
        and(
          eq(drivers.organizationId, organizationId),
          inArray(drivers.role, pref.recipientRoles as string[])
        )
      );
    recipientIds = [...new Set([...recipientIds, ...roleDrivers.map((d) => d.id)])];
  }

  if (pref.recipientIds && (pref.recipientIds as number[]).length > 0) {
    recipientIds = [...new Set([...recipientIds, ...(pref.recipientIds as number[])])];
  }

  if (recipientIds.length === 0) return;

  // 3. Insert notifications
  const now = new Date();
  const rows = recipientIds.map((recipientId) => ({
    organizationId,
    recipientId,
    type,
    title,
    body,
    linkTo: linkTo ?? null,
    metadata: metadata ?? null,
    createdAt: now,
  }));

  const inserted = await db.insert(notifications).values(rows).returning();

  // 4. Send emails if enabled
  if (pref.emailEnabled) {
    for (const row of inserted) {
      const [recipient] = await db
        .select({ email: drivers.email, name: drivers.name })
        .from(drivers)
        .where(eq(drivers.id, row.recipientId));

      if (!recipient?.email) continue;

      try {
        await sendNotificationEmail({
          to: recipient.email,
          name: recipient.name,
          title,
          body,
          linkTo: linkTo ?? "/dashboard",
        });

        await db
          .update(notifications)
          .set({ emailSentAt: new Date() })
          .where(eq(notifications.id, row.id));
      } catch (err) {
        console.error("Failed to send notification email", err);
        // Don't throw — in-app notification still created
      }
    }
  }
}

async function sendNotificationEmail({
  to,
  name,
  title,
  body,
  linkTo,
}: {
  to: string;
  name: string;
  title: string;
  body: string;
  linkTo: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com";
  const actionUrl = linkTo.startsWith("http") ? linkTo : `${baseUrl}${linkTo}`;

  await resend.emails.send({
    from: "MyGroundOps <alerts@mygroundops.com>",
    to,
    subject: title,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
        <h2 style="font-size:20px;font-weight:800;color:#0f172a;margin:0 0 8px;">${title}</h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 8px;">Hi ${name},</p>
        <p style="font-size:14px;color:#374151;margin:0 0 24px;">${body}</p>
        <a href="${actionUrl}" style="display:inline-block;background:#0f172a;color:#fff;font-size:13px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">
          View Details &rarr;
        </a>
        <p style="font-size:11px;color:#94a3b8;margin-top:32px;">Sent by MyGroundOps &middot; <a href="${baseUrl}" style="color:#94a3b8;">mygroundops.com</a></p>
      </div>
    `,
  });
}

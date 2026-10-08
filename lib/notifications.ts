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
          type,
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

function getAccentColor(type: string): string {
  switch (type) {
    case "maintenance_request":
    case "maintenance_resolved":
      return "#f97316"; // orange
    case "vehicle_expiry":
    case "vehicle_condition_critical":
      return "#3b82f6"; // blue
    case "task_overdue":
      return "#a855f7"; // purple
    case "payroll_ready":
    case "mmr_report":
      return "#10b981"; // green
    default:
      return "#64748b"; // slate
  }
}

async function sendNotificationEmail({
  to,
  name,
  title,
  body,
  linkTo,
  type,
}: {
  to: string;
  name: string;
  title: string;
  body: string;
  linkTo: string;
  type: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com";
  const actionUrl = linkTo.startsWith("http") ? linkTo : `${baseUrl}${linkTo}`;
  const accent = getAccentColor(type);

  await resend.emails.send({
    from: "MyGroundOps <alerts@mygroundops.com>",
    to,
    subject: title,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px 24px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;">MyGroundOps &middot; Alerts</p>
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#f8fafc;line-height:1.3;">${title}</h1>
      <p style="margin:0;font-size:13px;color:#94a3b8;">For: ${name}</p>
    </div>

    <!-- Accent banner -->
    <div style="height:4px;background:${accent};"></div>

    <!-- Body card -->
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#0f172a;">Hi ${name},</p>
      <p style="margin:0 0 28px;font-size:14px;color:#374151;line-height:1.6;">${body}</p>

      <!-- CTA button -->
      <a href="${actionUrl}"
         style="display:inline-block;background:${accent};color:#ffffff;font-size:13px;font-weight:700;padding:13px 28px;border-radius:8px;text-decoration:none;letter-spacing:0.02em;">
        View Details &rarr;
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
        MyGroundOps &middot; Apparo Group INC &middot;
        <a href="${baseUrl}" style="color:#94a3b8;text-decoration:none;">mygroundops.com</a>
      </p>
    </div>

  </div>
</body>
</html>`,
  });
}

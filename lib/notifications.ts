import { Resend } from "resend";
import { db } from "@/lib/db";
import { notifications, notificationPreferences, drivers, organizations } from "@/lib/schema";
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
  maintenance_request:        { enabled: true, inAppEnabled: true, emailEnabled: true,  recipientRoles: ["owner", "co_owner", "bc"], recipientIds: [], timingDays: [] },
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

  // Look up org slug for login link
  const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId));
  const orgSlug = org?.slug ?? "";

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
          orgSlug,
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
    case "maintenance_request":        return "#f97316";
    case "maintenance_resolved":       return "#10b981";
    case "vehicle_expiry":             return "#3b82f6";
    case "vehicle_condition_critical": return "#ef4444";
    case "task_overdue":               return "#a855f7";
    case "payroll_ready":              return "#10b981";
    case "mmr_report":                 return "#6366f1";
    default:                           return "#64748b";
  }
}

function getTypeIcon(type: string): string {
  switch (type) {
    case "maintenance_request":        return "🔧";
    case "maintenance_resolved":       return "✅";
    case "vehicle_expiry":             return "📋";
    case "vehicle_condition_critical": return "⚠️";
    case "task_overdue":               return "⏰";
    case "payroll_ready":              return "💰";
    case "mmr_report":                 return "📄";
    default:                           return "🔔";
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "maintenance_request":        return "Maintenance Request";
    case "maintenance_resolved":       return "Maintenance Resolved";
    case "vehicle_expiry":             return "Vehicle Expiry Notice";
    case "vehicle_condition_critical": return "Vehicle Condition Alert";
    case "task_overdue":               return "Task Overdue";
    case "payroll_ready":              return "Payroll Ready";
    case "mmr_report":                 return "MMR Report";
    default:                           return "Alert";
  }
}

function getCtaText(type: string): string {
  switch (type) {
    case "maintenance_request":        return "View Maintenance Request";
    case "maintenance_resolved":       return "View Resolution Details";
    case "vehicle_expiry":             return "View Vehicle Records";
    case "vehicle_condition_critical": return "View Fleet Status";
    case "task_overdue":               return "View Daily Tasks";
    case "payroll_ready":              return "Open Payroll Report";
    case "mmr_report":                 return "View MMR Report";
    default:                           return "View Details";
  }
}

async function sendNotificationEmail({
  to,
  name,
  title,
  body,
  linkTo,
  type,
  orgSlug,
}: {
  to: string;
  name: string;
  title: string;
  body: string;
  linkTo: string;
  type: string;
  orgSlug: string;
}) {
  const baseUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com";
  // Link to org-specific login page with redirect, so admins land in the right place
  const loginBase = orgSlug ? `${baseUrl}/login/${orgSlug}` : `${baseUrl}/sign-in`;
  const actionUrl = linkTo.startsWith("http") ? linkTo : `${loginBase}?redirect=${encodeURIComponent(linkTo)}`;
  const accent    = getAccentColor(type);
  const icon      = getTypeIcon(type);
  const label     = getTypeLabel(type);
  const ctaText   = getCtaText(type);
  const firstName = name.split(" ")[0];
  const sentAt    = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  await resend.emails.send({
    from: "MyGroundOps <alerts@mygroundops.com>",
    to,
    subject: `${title}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Wordmark -->
        <tr><td style="padding:0 0 32px;">
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">MyGroundOps</p>
        </td></tr>

        <!-- Title -->
        <tr><td style="padding:0 0 8px;">
          <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">${label}</p>
        </td></tr>
        <tr><td style="padding:0 0 24px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#0f172a;line-height:1.25;letter-spacing:-0.03em;">${title}</h1>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 0 24px;"><div style="height:1px;background:#e2e8f0;"></div></td></tr>

        <!-- Content -->
        <tr><td style="padding:0 0 24px;">
          <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">Hi ${firstName},</p>
          <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">${body}</p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 0 40px;">
          <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#0f172a;">
            <a href="${actionUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:-0.01em;">${ctaText}</a>
          </td></tr></table>
        </td></tr>

        <!-- Divider -->
        <tr><td style="padding:0 0 20px;"><div style="height:1px;background:#e2e8f0;"></div></td></tr>

        <!-- Footer -->
        <tr><td>
          <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.8;">
            MyGroundOps &middot; Apparo Group INC<br/>
            You&apos;re receiving this as an admin in your organization.<br/>
            <a href="https://mygroundops.com" style="color:#cbd5e1;text-decoration:none;">mygroundops.com</a>
          </p>
        </td></tr>

        <tr><td style="height:48px;"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

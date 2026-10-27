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
}: {
  to: string;
  name: string;
  title: string;
  body: string;
  linkTo: string;
  type: string;
}) {
  const baseUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mygroundops.com";
  const actionUrl = linkTo.startsWith("http") ? linkTo : `${baseUrl}${linkTo}`;
  const accent    = getAccentColor(type);
  const icon      = getTypeIcon(type);
  const label     = getTypeLabel(type);
  const ctaText   = getCtaText(type);
  const firstName = name.split(" ")[0];
  const sentAt    = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  await resend.emails.send({
    from: "MyGroundOps <alerts@mygroundops.com>",
    to,
    subject: `${icon} ${title}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

        <!-- Wordmark -->
        <tr><td style="padding:0 0 20px;">
          <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#475569;">MyGroundOps &middot; Apparo Group</p>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- Top accent line -->
          <div style="height:5px;background:${accent};"></div>

          <!-- Dark header -->
          <div style="background:#111827;padding:28px 32px 24px;">
            <div style="display:inline-block;background:${accent}22;border:1px solid ${accent}55;border-radius:20px;padding:5px 14px;margin-bottom:14px;">
              <span style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${accent};">${icon}&nbsp;&nbsp;${label}</span>
            </div>
            <h1 style="margin:0 0 8px;font-size:21px;font-weight:800;color:#f8fafc;line-height:1.25;letter-spacing:-0.01em;">${title}</h1>
            <p style="margin:0;font-size:12px;color:#475569;">${sentAt}</p>
          </div>

          <!-- Body -->
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#0f172a;">Hi ${firstName},</p>
            <!-- Accent message block -->
            <div style="background:#f8fafc;border-left:4px solid ${accent};border-radius:0 10px 10px 0;padding:16px 20px;margin:0 0 28px;">
              <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.65;">${body}</p>
            </div>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${actionUrl}" style="display:inline-block;background:${accent};color:#ffffff;font-size:13px;font-weight:800;padding:14px 30px;border-radius:10px;text-decoration:none;letter-spacing:0.02em;">${ctaText} &rarr;</a>
            </td></tr></table>
          </div>

          <!-- Footer -->
          <div style="border-top:1px solid #e2e8f0;padding:18px 32px;background:#f8fafc;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;line-height:1.7;">
              Sent by <strong style="color:#64748b;">MyGroundOps</strong> &middot; Apparo Group INC<br/>
              <a href="${baseUrl}" style="color:#94a3b8;text-decoration:none;">mygroundops.com</a>
              &nbsp;&middot;&nbsp;You&apos;re receiving this because you&apos;re an admin in your organization.
            </p>
          </div>

        </td></tr>
        <tr><td style="height:32px;"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

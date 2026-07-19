/**
 * POST /api/inbound/resend
 * Resend calls this webhook when an email arrives at *@742logistics.com.
 * We fetch the full email body, extract any 6-digit OTP, and store it
 * in settings as `spotlight_otp` + `spotlight_otp_at` (timestamp).
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Resend sends { type: "email.received", data: { email_id: "..." } }
    const emailId = body?.data?.email_id ?? body?.email_id;
    if (!emailId) {
      return NextResponse.json({ ok: false, reason: "no email_id" });
    }

    // Fetch full email content
    const { data: email, error } = await resend.emails.receiving.get(emailId);
    if (error || !email) {
      return NextResponse.json({ ok: false, reason: "fetch failed", error });
    }

    // Extract 6-digit OTP from subject or body
    const text = `${email.subject ?? ""} ${(email as any).text ?? ""} ${(email as any).html ?? ""}`;
    const match = text.match(/\b(\d{6})\b/);
    if (!match) {
      return NextResponse.json({ ok: false, reason: "no OTP found in email" });
    }

    const otp = match[1];
    const sql = neon(process.env.DATABASE_URL_POOLER || process.env.DATABASE_URL!);
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_otp', ${otp})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    await sql`
      INSERT INTO settings (key, value) VALUES ('spotlight_otp_at', ${new Date().toISOString()})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    console.log(`Spotlight OTP stored: ${otp} from ${email.from}`);
    return NextResponse.json({ ok: true, otp });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

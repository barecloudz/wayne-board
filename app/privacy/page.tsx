import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MyGroundOps",
  description: "Privacy Policy for MyGroundOps, a product of Nardoni Digital LLC.",
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2
        className="font-bold"
        style={{ fontSize: 18, color: "#0F172A" }}
      >
        {title}
      </h2>
      <div
        className="flex flex-col gap-3"
        style={{ color: "#334155", fontSize: 15, lineHeight: 1.8 }}
      >
        {children}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen" style={{ background: "#F8FAFC" }}>
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-6 py-4"
        style={{ background: "#ffffff", borderBottom: "1px solid #E2E8F0" }}
      >
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <Image
            src="/logo-icon.png"
            alt="MyGroundOps"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span
            className="font-bold text-[16px]"
            style={{ color: "#0F172A" }}
          >
            MyGroundOps
          </span>
        </Link>
        <Link
          href="/"
          className="text-[14px] font-medium no-underline transition-colors hover:opacity-70"
          style={{ color: "#94A3B8" }}
        >
          ← Back
        </Link>
      </nav>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-16">
        {/* Header */}
        <div className="mb-12 flex flex-col gap-3">
          <h1
            className="font-extrabold leading-tight"
            style={{ fontSize: 36, color: "#0F172A" }}
          >
            Privacy Policy
          </h1>
          <p style={{ color: "#64748B", fontSize: 14 }}>
            Effective Date: August 30, 2026 &nbsp;·&nbsp; Nardoni Digital LLC, North Carolina
          </p>
        </div>

        {/* Intro */}
        <p
          className="mb-10"
          style={{ color: "#334155", fontSize: 15, lineHeight: 1.8 }}
        >
          Nardoni Digital LLC (&ldquo;Nardoni Digital,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates MyGroundOps, a software
          platform for FedEx Ground independent service providers. We take the privacy
          of our customers and their teams seriously. This Privacy Policy describes what
          information we collect, how we use it, and your rights with respect to that
          information.
        </p>

        {/* Sections */}
        <div className="flex flex-col gap-10">
          <Section title="1. Overview">
            <p>
              MyGroundOps is a business-to-business platform. The primary users of our
              Service are contractors (ISP owners and their authorized staff) who manage
              operational data on behalf of their companies. We collect and process
              information to provide, maintain, and improve the Service. We do not sell
              personal information. We do not use Customer Data for advertising.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>
              <strong>Account Information.</strong> When you register for MyGroundOps, we
              collect information about your company, including: company name, owner name,
              FedEx Driver IDs used to identify account holders, and email address if
              provided. We also collect a password (stored only as an irreversible
              cryptographic hash — we never store your plaintext password), your selected
              subscription plan, and a URL-safe identifier derived from your company name
              that becomes part of your login address. This information is used to create
              and manage your account.
            </p>
            <p>
              <strong>Operational Data.</strong> As you use the Service, you and your
              authorized users input and generate operational data, which may include: driver
              records and profiles, route assignments, stop counts and delivery metrics,
              driver performance scores, vehicle information, pre/post-trip inspection data,
              and vehicle maintenance records. This data belongs to you and is used only to
              provide the Service.
            </p>
            <p>
              <strong>Usage Data.</strong> We automatically collect certain technical
              information when you access the Service, including: server log files, IP
              addresses, browser type and version, device information, and data about how
              features are accessed and used. This information helps us diagnose technical
              issues, monitor security, and understand how the Service is used at an
              aggregate level.
            </p>
            <p>
              <strong>Payment Information.</strong> Billing and payment processing is handled
              entirely by Stripe, Inc. We do not store credit card numbers, bank account
              numbers, or other sensitive payment instrument details on our servers. We
              receive and store non-sensitive payment metadata from Stripe (such as the last
              four digits of a card, billing address, and subscription status) for account
              management purposes. Your payment information is subject to{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#16A34A" }}
              >
                Stripe&rsquo;s Privacy Policy
              </a>
              .
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 flex flex-col gap-1.5">
              <li>Provide, operate, maintain, and improve the Service;</li>
              <li>Process your subscription and manage billing;</li>
              <li>Respond to your support requests and inquiries;</li>
              <li>Monitor and enforce compliance with our Terms of Service;</li>
              <li>Detect, investigate, and prevent security incidents or misuse;</li>
              <li>
                Generate aggregate, anonymized analytics about how the Service is used — this
                data does not identify individual users or companies;
              </li>
              <li>Comply with applicable legal obligations.</li>
            </ul>
            <p>
              We will never sell your information. We will never use your Customer Data to
              target you with advertising or share it with data brokers.
            </p>
          </Section>

          <Section title="4. Data Isolation">
            <p>
              Each contractor&rsquo;s data is fully isolated from every other tenant on the
              platform. We enforce strict row-level data separation so that no account can
              access another account&rsquo;s data. Your drivers, routes, vehicles, and
              operational records are visible only to your authorized users.
            </p>
            <p>
              Our engineering and support staff may access data in the course of providing
              support or maintaining the platform, but only to the minimum extent necessary
              and subject to confidentiality obligations.
            </p>
          </Section>

          <Section title="5. How We Share Your Information">
            <p>
              We do not sell your information. We share it only in the following limited
              circumstances:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-1.5">
              <li>
                <strong>Stripe.</strong> We share billing information with Stripe to process
                payments and manage subscriptions.
              </li>
              <li>
                <strong>Hosting and Infrastructure Providers.</strong> We use Neon (database hosting) and Netlify (application hosting) to operate the Service. These providers process data on our behalf and are contractually required to protect it. We also use Stripe, Inc. for payment processing (described separately above).
              </li>
              <li>
                <strong>Legal Requirements.</strong> We may disclose information if required
                to do so by law, subpoena, court order, or other governmental request, or if
                we believe in good faith that disclosure is necessary to protect our rights,
                protect your safety or the safety of others, or investigate fraud.
              </li>
              <li>
                <strong>Business Transfers.</strong> If Nardoni Digital is involved in a
                merger, acquisition, or sale of all or substantially all of its assets, your
                information may be transferred as part of that transaction. We will notify you
                via email or prominent notice on the Service before your information becomes
                subject to a different privacy policy.
              </li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <p>
              <strong>Active Accounts.</strong> We retain your Customer Data for as long as
              your account remains active and as necessary to provide the Service.
            </p>
            <p>
              <strong>Canceled Accounts.</strong> Upon cancellation or termination of your
              account, we retain your Customer Data for thirty (30) days to allow you to
              export it if needed. After this period, your data is deleted from our active
              systems.
            </p>
            <p>
              <strong>Backup Copies.</strong> Backup copies of data may persist in encrypted
              backup storage for up to ninety (90) days following deletion from active
              systems, after which they are purged.
            </p>
            <p>
              We may retain certain non-operational records (such as billing records and
              correspondence) for longer periods as required by law or for legitimate
              business purposes such as dispute resolution.
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              We implement industry-standard security measures to protect your information,
              including:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-1.5">
              <li>Encryption of data in transit using TLS (Transport Layer Security);</li>
              <li>Encryption of sensitive data at rest;</li>
              <li>Access controls limiting data access to authorized personnel only;</li>
              <li>Regular automated backups to support data recovery.</li>
            </ul>
            <p>
              However, no system is completely secure. We cannot guarantee the absolute
              security of your information, and we are not responsible for unauthorized
              access resulting from factors outside of our reasonable control. If you believe
              your account has been compromised, please contact us immediately at{" "}
              <a href="mailto:privacy@nardonidigital.com" style={{ color: "#16A34A" }}>
                privacy@nardonidigital.com
              </a>
              .
            </p>
            <p>
              In the event we discover a confirmed breach of security that affects your
              Customer Data, we will notify you within thirty (30) days of that discovery by
              email to the address associated with your account, or by prominent notice within
              the Service if email notification is not feasible.
            </p>
          </Section>

          <Section title="8. Your Rights">
            <p>
              Subject to applicable law, you have the following rights with respect to your
              information:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-1.5">
              <li>
                <strong>Access.</strong> You may request a copy of the information we hold
                about your account.
              </li>
              <li>
                <strong>Correction.</strong> You may request that we correct inaccurate or
                incomplete information.
              </li>
              <li>
                <strong>Export.</strong> You may request an export of your Customer Data in a machine-readable format. We will fulfill export requests within ten (10) business days of a verified request.
              </li>
              <li>
                <strong>Deletion.</strong> You may request deletion of your account and
                associated data. We will fulfill deletion requests subject to any legal
                obligations requiring us to retain certain records.
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:privacy@nardonidigital.com" style={{ color: "#16A34A" }}>
                privacy@nardonidigital.com
              </a>
              . We will respond to verified requests within a reasonable timeframe.
            </p>
          </Section>

          <Section title="9. Driver Data">
            <p>
              Driver personal information — including names, FedEx Driver IDs, performance
              data, and other records — is entered into the Service by the contractor (ISP
              owner) who employs or engages those drivers. In this context, the contractor is
              the data controller with respect to driver personal data, and Nardoni Digital
              acts as a data processor, processing that data only on behalf of and under the
              instructions of the contractor.
            </p>
            <p>
              Contractors are responsible for ensuring they have an appropriate legal basis
              for collecting and processing driver personal data, and for complying with any
              applicable employment, privacy, or data protection laws in their jurisdiction.
            </p>
          </Section>

          <Section title="10. Cookies">
            <p>
              MyGroundOps uses session cookies to maintain your authenticated session. These
              cookies are strictly necessary for the Service to function. Session cookies
              expire after 7 days of inactivity or when you log out, whichever comes first.
            </p>
            <p>
              We do not use advertising cookies, tracking pixels, or third-party analytics
              cookies that follow you across websites. We do not participate in behavioral
              advertising networks.
            </p>
          </Section>

          <Section title="11. Children's Privacy">
            <p>
              The Service is not directed at individuals under the age of 18, and we do not
              knowingly collect personal information from anyone under 18. If we become aware
              that we have inadvertently collected personal information from a minor, we will
              take steps to delete that information promptly. If you believe a minor has
              provided us with personal information, please contact us at{" "}
              <a href="mailto:privacy@nardonidigital.com" style={{ color: "#16A34A" }}>
                privacy@nardonidigital.com
              </a>
              .
            </p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. For material changes, we
              will provide at least fourteen (14) days&rsquo; advance notice by email to the
              address associated with your account or by prominent notice within the Service.
              The effective date at the top of this page will always reflect when the policy
              was last updated.
            </p>
            <p>
              Your continued use of the Service after the effective date of a revised Privacy
              Policy constitutes your acceptance of the changes.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              If you have questions, concerns, or requests regarding this Privacy Policy or
              our data practices, please contact us at:
            </p>
            <address
              className="not-italic flex flex-col gap-1"
              style={{ color: "#334155", fontSize: 15, lineHeight: 1.8 }}
            >
              <span className="font-semibold">Nardoni Digital LLC</span>
              <span>North Carolina</span>
              <span>
                Email:{" "}
                <a href="mailto:privacy@nardonidigital.com" style={{ color: "#16A34A" }}>
                  privacy@nardonidigital.com
                </a>
              </span>
            </address>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="flex items-center justify-between px-6 py-5"
        style={{ background: "#ffffff", borderTop: "1px solid #E2E8F0" }}
      >
        <p style={{ color: "#94A3B8", fontSize: 13 }}>
          &copy; {new Date().getFullYear()} Nardoni Digital LLC. All rights reserved.
        </p>
        <div className="flex items-center gap-5">
          <Link
            href="/terms"
            className="no-underline transition-colors hover:opacity-70"
            style={{ color: "#94A3B8", fontSize: 13 }}
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="no-underline transition-colors hover:opacity-70"
            style={{ color: "#94A3B8", fontSize: 13 }}
          >
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}

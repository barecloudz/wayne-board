import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — MyGroundOps",
  description: "Terms of Service for MyGroundOps, a product of Nardoni Digital LLC.",
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

export default function TermsPage() {
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
            Terms of Service
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
          Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using
          MyGroundOps. By creating an account or using the Service, you agree to be bound
          by these Terms on behalf of yourself and the company you represent. If you do not
          agree, do not access or use the Service.
        </p>

        {/* Sections */}
        <div className="flex flex-col gap-10">
          <Section title="1. Agreement">
            <p>
              These Terms constitute a legally binding agreement between Nardoni Digital LLC
              (&ldquo;Nardoni Digital,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo;), a North Carolina limited liability company, and you, the
              FedEx Ground independent service provider or other business entity accessing
              the Service (&ldquo;Customer,&rdquo; &ldquo;you,&rdquo; or &ldquo;your&rdquo;).
            </p>
            <p>
              If you are entering into these Terms on behalf of a company or other legal
              entity, you represent that you have the authority to bind that entity. If you
              lack such authority, do not use the Service.
            </p>
          </Section>

          <Section title="2. The Service">
            <p>
              MyGroundOps is a software-as-a-service platform designed for FedEx Ground
              independent service providers (&ldquo;ISPs&rdquo;). The Service provides tools
              for fleet operations management, driver management, daily scheduling,
              performance tracking, compliance documentation, and related operational
              functions.
            </p>
            <p>
              We reserve the right to modify, expand, or discontinue features of the Service
              at any time. We will endeavor to provide reasonable advance notice of material
              changes that adversely affect core functionality.
            </p>
            <p>
              MyGroundOps is an independent product. It is not affiliated with, endorsed by,
              or sponsored by FedEx Corporation or any of its subsidiaries.
            </p>
            <p>
              Your use of MyGroundOps does not affect, modify, or supersede any obligations
              you have under your agreement with FedEx Corporation as an independent service
              provider. You are solely responsible for ensuring your use of the Service
              complies with your FedEx ISP agreement and all applicable FedEx operational
              requirements. FedEx may have the right to audit certain operational data under
              your ISP agreement; we will comply with any legally binding requests we receive
              from FedEx relating to your account.
            </p>
          </Section>

          <Section title="3. Accounts and Access">
            <p>
              To use the Service, you must create an account and provide accurate, complete,
              and current information about your company. You are responsible for maintaining
              the accuracy of your account information and for all activity that occurs under
              your account.
            </p>
            <p>
              Authorized users are individuals you designate to access the Service on your
              behalf, including drivers and staff. You are solely responsible for managing
              authorized users, their permissions, and ensuring they comply with these Terms.
            </p>
            <p>
              Each account is intended for a single station or operational unit. You may not
              create multiple accounts to circumvent plan limitations or for purposes not
              contemplated by these Terms.
            </p>
            <p>
              You are responsible for safeguarding your account credentials. You must notify
              us immediately at{" "}
              <a href="mailto:legal@nardonidigital.com" style={{ color: "#16A34A" }}>
                legal@nardonidigital.com
              </a>{" "}
              if you become aware of any unauthorized use of or access to your account.
            </p>
          </Section>

          <Section title="4. Subscription and Payment">
            <p>
              <strong>Free Trial.</strong> New accounts receive a fourteen (14) day free
              trial. No payment is required during the trial period. At the end of the trial,
              your account will be automatically converted to a paid subscription and you will
              be charged the applicable monthly fee unless you cancel before the trial expires.
            </p>
            <p>
              <strong>Billing.</strong> Subscriptions are billed monthly in advance via
              Stripe. By providing a payment method, you authorize us to charge that method
              for all fees incurred under your account. All fees are stated in U.S. dollars.
            </p>
            <p>
              <strong>No Refunds.</strong> All fees are non-refundable. If you cancel your
              subscription, you will retain access to the Service until the end of your
              current billing period, after which your account will be deactivated.
            </p>
            <p>
              <strong>Failed Payments.</strong> If a payment fails, we will notify you and
              attempt to retry the charge. If payment remains outstanding after a reasonable
              period, we may suspend or terminate your account without further notice.
            </p>
            <p>
              <strong>Taxes.</strong> You are responsible for any taxes, levies, or duties
              imposed in connection with your purchase, excluding taxes based on our net income.
            </p>
            <p>
              We reserve the right to change our pricing at any time. We will provide at
              least thirty (30) days&rsquo; notice before any price change takes effect for
              existing subscribers.
            </p>
          </Section>

          <Section title="5. Acceptable Use">
            <p>You agree not to use the Service:</p>
            <ul className="list-disc pl-6 flex flex-col gap-1.5">
              <li>For any unlawful purpose or in violation of any applicable federal, state, or local laws or regulations;</li>
              <li>To share, sell, resell, sublicense, or provide access to the Service to any third party not authorized under your account;</li>
              <li>To reverse engineer, decompile, disassemble, or attempt to derive the source code, algorithms, or underlying structure of the Service;</li>
              <li>To interfere with, disrupt, or damage the integrity or performance of the Service or its underlying infrastructure;</li>
              <li>To upload or transmit any viruses, malware, or other harmful code;</li>
              <li>To scrape, crawl, or extract data from the Service by automated means without our written consent;</li>
              <li>To impersonate any person or entity or misrepresent your affiliation with any person or entity.</li>
            </ul>
            <p>
              We reserve the right to suspend or terminate access to any account that we
              reasonably believe is in violation of this section.
            </p>
          </Section>

          <Section title="6. Data Ownership">
            <p>
              <strong>Your Data.</strong> You retain all right, title, and interest in and
              to the data you input into the Service, including driver records, route data,
              vehicle information, and operational metrics (&ldquo;Customer Data&rdquo;).
            </p>
            <p>
              <strong>License to Us.</strong> You grant Nardoni Digital a limited,
              non-exclusive, worldwide license to access, process, store, and use Customer
              Data solely to the extent necessary to provide and improve the Service for you.
              We do not sell Customer Data or use it for purposes unrelated to providing the
              Service.
            </p>
            <p>
              <strong>Data Export.</strong> You may request an export of your Customer Data
              at any time during your active subscription by contacting support. We will
              provide a machine-readable export within ten (10) business days of a verified request.
            </p>
            <p>
              <strong>Post-Cancellation Retention.</strong> Upon termination or cancellation
              of your account for any reason, we will retain your Customer Data for thirty
              (30) days, during which time you may request an export. After thirty (30) days,
              we will delete your Customer Data from our systems, except as required by law
              or retained in anonymized form for aggregate analytics. Backup copies may
              persist for up to ninety (90) days before being purged.
            </p>
          </Section>

          <Section title="7. Privacy">
            <p>
              Our collection and use of personal information in connection with the Service
              is described in our{" "}
              <Link href="/privacy" style={{ color: "#16A34A" }}>
                Privacy Policy
              </Link>
              , which is incorporated into these Terms by reference. By using the Service,
              you consent to the data practices described in our Privacy Policy.
            </p>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              The Service, including all software, user interfaces, text, graphics, logos,
              and documentation (&ldquo;Nardoni Digital Content&rdquo;), is owned by or
              licensed to Nardoni Digital LLC and is protected by intellectual property laws.
              These Terms do not grant you any right, title, or interest in the Service or
              Nardoni Digital Content except for the limited right to use the Service as
              permitted by these Terms.
            </p>
            <p>
              Any feedback, suggestions, or ideas you provide to us regarding the Service
              (&ldquo;Feedback&rdquo;) are provided on a non-confidential basis and may be
              used by us without restriction and without any obligation to compensate you.
            </p>
          </Section>

          <Section title="9. Confidentiality">
            <p>
              Each party may have access to information that is confidential to the other
              party (&ldquo;Confidential Information&rdquo;). Each party agrees to hold the
              other&rsquo;s Confidential Information in confidence using at least the same
              degree of care it uses to protect its own confidential information (but no less
              than reasonable care), and not to disclose such Confidential Information to
              third parties without the other party&rsquo;s prior written consent, except as
              required by law.
            </p>
            <p>
              Our platform features, pricing, and technical architecture constitute our
              Confidential Information. Your Customer Data, business operations, and driver
              information constitute your Confidential Information.
            </p>
          </Section>

          <Section title="10. Warranties and Disclaimers">
            <p>
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
              WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT
              LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              TITLE, AND NON-INFRINGEMENT.
            </p>
            <p>
              WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR
              COMPLETELY SECURE. WE MAKE NO GUARANTEES REGARDING UPTIME, AVAILABILITY, OR
              SUITABILITY OF THE SERVICE FOR ANY PARTICULAR OPERATIONAL REQUIREMENT.
              WE DO NOT PROVIDE A SERVICE LEVEL AGREEMENT (SLA) OR UPTIME GUARANTEE.
              SCHEDULED MAINTENANCE AND UNPLANNED OUTAGES MAY OCCUR WITHOUT PRIOR NOTICE.
            </p>
            <p>
              You acknowledge that your use of the Service is at your sole risk. We are not
              responsible for any errors or omissions in data you enter into the Service or
              for decisions you make based on information displayed by the Service.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, NARDONI DIGITAL LLC AND
              ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND LICENSORS WILL NOT BE LIABLE
              FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE
              DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, LOSS OF DATA, LOSS OF
              GOODWILL, BUSINESS INTERRUPTION, OR COST OF SUBSTITUTE SERVICES, EVEN IF WE
              HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p>
              IN NO EVENT WILL NARDONI DIGITAL&rsquo;S AGGREGATE LIABILITY TO YOU ARISING
              OUT OF OR RELATED TO THESE TERMS OR YOUR USE OF THE SERVICE EXCEED THE GREATER
              OF (A) THE TOTAL FEES PAID BY YOU IN THE TWELVE (12) MONTHS IMMEDIATELY
              PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ONE HUNDRED DOLLARS
              ($100.00).
            </p>
            <p>
              Some jurisdictions do not allow the exclusion of certain warranties or the
              limitation of certain types of liability. In those jurisdictions, our liability
              is limited to the maximum extent permitted by applicable law.
            </p>
          </Section>

          <Section title="12. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless Nardoni Digital LLC and its
              officers, directors, employees, agents, and licensors from and against any
              claims, liabilities, damages, losses, costs, and expenses (including reasonable
              attorneys&rsquo; fees) arising out of or in any way connected with: (a) your
              use of or access to the Service; (b) your violation of these Terms; (c) your
              violation of any applicable law or regulation; (d) your Customer Data or any
              content you submit to the Service; or (e) any dispute between you and a third
              party, including your drivers or staff.
            </p>
          </Section>

          <Section title="13. Termination">
            <p>
              <strong>By You.</strong> You may cancel your subscription at any time through
              your account settings or by contacting support. Cancellation takes effect at
              the end of your current billing period.
            </p>
            <p>
              <strong>By Us.</strong> We may suspend or terminate your access to the Service
              at any time, with or without cause, upon reasonable notice. We may terminate
              immediately and without notice if we determine that you have violated these
              Terms or that continued access would pose a risk to the Service or other users.
            </p>
            <p>
              <strong>Effect of Termination.</strong> Upon termination, your right to access
              and use the Service will immediately cease. Provisions that by their nature
              should survive termination will survive, including without limitation: Data
              Ownership (Section 6), Intellectual Property (Section 8), Confidentiality
              (Section 9), Warranties and Disclaimers (Section 10), Limitation of Liability
              (Section 11), Indemnification (Section 12), Governing Law (Section 14), and
              General (Section 16).
            </p>
          </Section>

          <Section title="14. Governing Law and Dispute Resolution">
            <p>
              These Terms and any dispute arising out of or related to them or the Service
              will be governed by the laws of the State of North Carolina, without regard
              to its conflict of laws principles.
            </p>
            <p>
              <strong>Binding Arbitration.</strong> Any dispute, claim, or controversy
              arising out of or relating to these Terms or the use of the Service that cannot
              be resolved informally shall be resolved by binding arbitration administered in
              Mecklenburg County, North Carolina, in accordance with the arbitration rules
              of the American Arbitration Association (&ldquo;AAA&rdquo;). The arbitrator&rsquo;s
              decision shall be final and binding and may be entered as a judgment in any
              court of competent jurisdiction.
            </p>
            <p>
              <strong>Class Action Waiver.</strong> You agree that any arbitration or
              proceeding shall be limited to the dispute between us individually. To the
              fullest extent permitted by law, no arbitration or proceeding will be joined
              with another, and there is no right to arbitrate any dispute as a class action
              or to utilize class action procedures.
            </p>
            <p>
              Nothing in this section prevents either party from seeking emergency injunctive
              relief from a court of competent jurisdiction where necessary to prevent
              irreparable harm.
            </p>
          </Section>

          <Section title="15. Changes to These Terms">
            <p>
              We may update these Terms from time to time. For material changes, we will
              provide at least fourteen (14) days&rsquo; advance notice by email to the
              address associated with your account or by prominent notice within the Service.
              Your continued use of the Service after the effective date of revised Terms
              constitutes your acceptance of those changes.
            </p>
            <p>
              We will maintain a history of material changes to these Terms. If you object to
              any changes, your sole remedy is to cancel your subscription before the new
              Terms take effect.
            </p>
          </Section>

          <Section title="16. General">
            <p>
              <strong>Entire Agreement.</strong> These Terms, together with our Privacy Policy
              and any order forms or supplemental agreements you execute with us, constitute
              the entire agreement between you and Nardoni Digital with respect to the Service
              and supersede all prior agreements, representations, and understandings.
            </p>
            <p>
              <strong>Severability.</strong> If any provision of these Terms is found to be
              invalid or unenforceable, that provision will be modified to the minimum extent
              necessary to make it enforceable, and the remaining provisions will continue in
              full force and effect.
            </p>
            <p>
              <strong>No Waiver.</strong> Our failure to enforce any provision of these Terms
              will not be construed as a waiver of our right to do so in the future.
            </p>
            <p>
              <strong>No Assignment.</strong> You may not assign or transfer these Terms or
              your rights under them, by operation of law or otherwise, without our prior
              written consent. We may freely assign these Terms in connection with a merger,
              acquisition, or sale of substantially all of our assets.
            </p>
            <p>
              <strong>Force Majeure.</strong> Neither party will be liable for delays or
              failures in performance resulting from events beyond their reasonable control,
              including natural disasters, internet outages, or government actions.
            </p>
            <p>
              <strong>Data Breach Notification.</strong> If Nardoni Digital discovers a
              confirmed breach of security affecting your Customer Data, we will notify you
              within thirty (30) days of that discovery by email to the address associated
              with your account.
            </p>
          </Section>

          <Section title="17. Contact">
            <p>
              If you have questions about these Terms, please contact us at:
            </p>
            <address
              className="not-italic flex flex-col gap-1"
              style={{ color: "#334155", fontSize: 15, lineHeight: 1.8 }}
            >
              <span className="font-semibold">Nardoni Digital LLC</span>
              <span>North Carolina</span>
              <span>
                Email:{" "}
                <a href="mailto:legal@nardonidigital.com" style={{ color: "#16A34A" }}>
                  legal@nardonidigital.com
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

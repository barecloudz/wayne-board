import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Your Free Trial",
  description: "Create your MyGroundOps account. 14-day free trial · no credit card required until your trial ends.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

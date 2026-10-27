"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Reads the stored org slug from localStorage and silently redirects
 * returning users to their login page. Renders nothing.
 */
export default function OrgSlugRedirect() {
  const router = useRouter();

  useEffect(() => {
    const slug = localStorage.getItem("mgops_org_slug");
    if (slug) router.replace(`/login/${slug}`);
  }, [router]);

  return null;
}

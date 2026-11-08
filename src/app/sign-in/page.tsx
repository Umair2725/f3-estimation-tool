import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getEnv } from "@/lib/env";
import { devLoginEnabled } from "@/server/auth/auth";
import { safeNextPath } from "@/server/auth/policy";
import { getCurrentUser } from "@/server/auth/session";
import { ProductTour } from "./product-tour";
import { SignInPanel } from "./sign-in-panel";

/** Who people ask for access (product owner's decision of 2026-11-09). */
const ACCESS_CONTACT = "khanumair@folio3.com";

// Reads the session and query string, so it renders per request (never prerendered).
export const instant = false;

const ERROR_MESSAGES: Record<string, string> = {
  domain: "Only @folio3.com accounts can sign in. Please use your Folio3 Google account.",
  deactivated: "Your access has been turned off. Contact an Admin.",
};
const GENERIC_ERROR = "Sign-in didn't work. Please try again.";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  const user = await getCurrentUser();
  if (user?.status === "ACTIVE") redirect(next);

  const errorCode = typeof params.error === "string" ? params.error.toLowerCase() : null;
  const error = errorCode ? (ERROR_MESSAGES[errorCode] ?? GENERIC_ERROR) : null;
  const env = getEnv();

  // Half and half on wide screens: the product tour on the left, sign-in on the right. On
  // narrower screens only the sign-in half shows.
  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex">
        <ProductTour />
      </div>
      <div className="flex min-w-0 flex-col bg-surface px-4 py-6 sm:px-14 sm:py-10">
        <Brand />
        <main className="flex flex-1 items-center justify-center py-12">
          <SignInPanel
            next={next}
            error={error}
            googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
            devLogin={devLoginEnabled(env)}
          />
        </main>
        <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>© {new Date().getFullYear()} Folio3 Software</span>
          <span>
            Need access? Reach out at{" "}
            <a
              href={`mailto:${ACCESS_CONTACT}`}
              className="font-semibold text-brand-strong no-underline hover:underline"
            >
              {ACCESS_CONTACT}
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}

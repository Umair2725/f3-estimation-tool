import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/brand";
import { getEnv } from "@/lib/env";
import { devLoginEnabled } from "@/server/auth/auth";
import { safeNextPath } from "@/server/auth/policy";
import { getCurrentUser } from "@/server/auth/session";
import { SignInPanel } from "./sign-in-panel";

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

  return (
    <>
      <PublicHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <SignInPanel
          next={next}
          error={error}
          googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
          devLogin={devLoginEnabled(env)}
        />
      </main>
    </>
  );
}

import { PublicHeader } from "@/components/brand";
import { AppShell } from "@/components/shell/app-shell";
import { navFor } from "@/components/shell/nav";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";

// Every page in this group needs a signed-in person, so it renders per request.
export const instant = false;

export default async function SignedInLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  // specs/user-roles: people without a role see only the waiting page.
  if (!user.role) return <WaitingForAccess name={user.name} email={user.email} />;

  return (
    <AppShell
      nav={navFor(user.role)}
      person={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role] }}
    >
      {children}
    </AppShell>
  );
}

function WaitingForAccess({ name, email }: { name: string; email: string }) {
  return (
    <>
      <PublicHeader>
        <SignOutButton />
      </PublicHeader>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-14">
        <h1 className="text-2xl font-bold tracking-tight">Waiting for access</h1>
        <p className="mt-3 text-foreground-2">
          Hi {name || email}, you&apos;re signed in as <strong>{email}</strong>, but you don&apos;t
          have a role yet. An Admin needs to assign one before you can use the tool.
        </p>
        <p className="mt-6 rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info" role="status">
          Ask the tool owner (PMO) to give you a role. Once they do, refresh this page.
        </p>
      </main>
    </>
  );
}

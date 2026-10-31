import type { Metadata } from "next";
import { lastActiveLabel } from "@/lib/relative-time";
import { can } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { listPeople } from "@/server/people";
import { PeopleManager } from "./people-manager";

export const metadata: Metadata = { title: "People and roles · F3 Estimation Tool" };

export default async function PeoplePage() {
  const user = await requireUser("/settings/people");

  if (!can(user.role, "people.manage")) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          You don&apos;t have access to this page
        </h1>
        <p className="mt-2 text-foreground-2">Only Admins can manage people and roles.</p>
      </div>
    );
  }

  const { people, invitations } = await listPeople(user);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          Settings <span aria-hidden="true">/</span> People and roles
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">People and roles</h1>
        <p className="mt-1.5 text-foreground-2">
          Everyone who has signed in. Role changes apply on the person&apos;s next page load.
        </p>
      </div>
      <PeopleManager
        currentUserId={user.id}
        people={people.map((p) => ({ ...p, lastActive: lastActiveLabel(p.lastActiveAt, now) }))}
        invitations={invitations.map((i) => ({ email: i.email, role: i.role }))}
      />
    </div>
  );
}

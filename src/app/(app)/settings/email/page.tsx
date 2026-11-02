import type { Metadata } from "next";
import { lastActiveLabel } from "@/lib/relative-time";
import { can } from "@/server/auth/permissions";
import { requireRole } from "@/server/auth/session";
import { listEmails } from "@/server/email/admin";
import { emailSettingsSummary } from "@/server/email/transport";
import { EmailPanel } from "./email-panel";

export const metadata: Metadata = { title: "Email · F3 Estimation Tool" };

// The Email page for Admins (specs/email-notifications "Email page for Admins"). The settings
// layout already refuses other roles; listEmails checks again.
export default async function EmailPage() {
  const user = await requireRole("/settings/email");
  // The settings layout shows the no-access page; skip the query it would refuse anyway.
  if (!user || !can(user.role, "settings.manage")) return null;
  const emails = await listEmails(user);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          Settings <span aria-hidden="true">/</span> Email
        </nav>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Email</h1>
        <p className="mt-1.5 max-w-3xl text-foreground-2">
          Invitations, access and review updates are emailed as well as shown in the app. A failed
          email never stops the action; it is retried and listed here.
        </p>
      </div>
      <EmailPanel
        settings={emailSettingsSummary()}
        emails={emails.map((e) => ({
          id: e.id,
          to: e.to,
          subject: e.subject,
          status: e.status,
          attempts: e.attempts,
          lastError: e.lastError,
          when: lastActiveLabel(e.sentAt ?? e.createdAt, now),
        }))}
      />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { retryEmailAction, sendTestEmailAction, type ActionResult } from "./actions";

// The Email page body (specs/email-notifications "Email page for Admins"): set-up state, the
// test button and the latest emails with Retry on failed ones.

export type EmailRow = {
  id: string;
  to: string;
  subject: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "NOT_SENT";
  attempts: number;
  lastError: string | null;
  when: string;
};

const STATUS_LABELS: Record<EmailRow["status"], string> = {
  QUEUED: "Queued",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  NOT_SENT: "Not sent, email isn't set up",
};

const STATUS_CLASSES: Record<EmailRow["status"], string> = {
  QUEUED: "text-muted",
  SENDING: "text-muted",
  SENT: "text-ok",
  FAILED: "text-err",
  NOT_SENT: "text-muted",
};

export function EmailPanel(props: {
  settings: { configured: boolean; host: string; from: string };
  emails: EmailRow[];
}) {
  const { settings, emails } = props;
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function perform(key: string, action: () => Promise<ActionResult>) {
    setBusy(key);
    start(async () => {
      setNotice(await action());
      setBusy(null);
    });
  }

  return (
    <>
      <div aria-live="polite">
        {notice && (
          <p
            role={notice.ok ? "status" : "alert"}
            className={`rounded-lg px-3.5 py-3 text-sm ${
              notice.ok ? "bg-ok-bg text-ok" : "bg-err-bg text-err"
            }`}
          >
            {notice.message}
          </p>
        )}
      </div>

      <section aria-labelledby="setup-title" className={`${ui.card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="setup-title" className="text-lg font-bold">
              {settings.configured ? "Email is set up" : "Email isn't set up"}
            </h2>
            {settings.configured ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">From</dt>
                <dd className="break-all">{settings.from}</dd>
                <dt className="text-muted">Server</dt>
                <dd className="break-all">{settings.host}</dd>
              </dl>
            ) : (
              <p className="mt-2 max-w-2xl text-sm text-foreground-2">
                Add <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> and{" "}
                <code>MAIL_FROM</code> to <code>.env</code> and restart the app. See
                &ldquo;Email&rdquo; in the README for a Gmail app password. Until then, emails are
                listed below as not sent.
              </p>
            )}
          </div>
          <button
            type="button"
            className={ui.primaryButton}
            disabled={!settings.configured || pending}
            onClick={() => perform("test", sendTestEmailAction)}
          >
            {busy === "test" ? "Sending…" : "Send test email"}
          </button>
        </div>
      </section>

      <section aria-labelledby="emails-title" className={ui.card}>
        <div className={ui.cardHead}>
          <h2 id="emails-title" className="text-lg font-bold">
            Latest emails
          </h2>
          <span className="text-sm text-muted">{emails.length}</span>
        </div>
        {emails.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No emails yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="email-table">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">To</th>
                  <th className="px-2 py-2 text-left font-semibold">Subject</th>
                  <th className="px-2 py-2 text-left font-semibold">Status</th>
                  <th className="px-2 py-2 text-left font-semibold">When</th>
                  <th className="px-4 py-2 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="break-all px-4 py-2">{e.to}</td>
                    <td className="px-2 py-2">{e.subject}</td>
                    <td className="px-2 py-2" data-testid="email-status">
                      <span className={`font-semibold ${STATUS_CLASSES[e.status]}`}>
                        {STATUS_LABELS[e.status]}
                      </span>
                      {e.attempts > 1 && (
                        <span className="text-muted"> · {e.attempts} attempts</span>
                      )}
                      {e.status === "FAILED" && e.lastError && (
                        <div className="mt-0.5 break-words text-xs text-err">{e.lastError}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted">{e.when}</td>
                    <td className="px-4 py-2 text-right">
                      {e.status === "FAILED" && settings.configured && (
                        <button
                          type="button"
                          className={ui.smallButton}
                          disabled={pending}
                          aria-label={`Retry the email to ${e.to}`}
                          onClick={() => perform(e.id, () => retryEmailAction(e.id))}
                        >
                          {busy === e.id ? "Sending…" : "Retry"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

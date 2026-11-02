import "server-only";
import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

// The SMTP connection (specs/email-notifications "Email settings"). Built once from settings;
// tests swap in a fake that captures or fails.

export type OutgoingEmail = { to: string; subject: string; text: string; html: string };
export type MailTransport = { send(email: OutgoingEmail): Promise<void> };

let override: MailTransport | null | undefined;
let smtp: MailTransport | undefined;

/** `undefined` restores the settings; `null` acts as if email isn't set up. */
export function setMailTransportForTests(transport: MailTransport | null | undefined) {
  override = transport;
}

export function emailConfigured(): boolean {
  if (override !== undefined) return override !== null;
  return !!getEnv().SMTP_HOST;
}

/** What the Email page may show: never the user or password. */
export function emailSettingsSummary(): { configured: boolean; host: string; from: string } {
  const env = getEnv();
  return { configured: emailConfigured(), host: env.SMTP_HOST ?? "", from: env.MAIL_FROM ?? "" };
}

export function getMailTransport(): MailTransport | null {
  if (override !== undefined) return override;
  const env = getEnv();
  if (!env.SMTP_HOST) return null;
  if (!smtp) {
    const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : env.SMTP_PORT === 465;
    const client = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    const from = { name: "F3 Estimation Tool", address: env.MAIL_FROM! };
    smtp = {
      async send(email) {
        await client.sendMail({ from, ...email });
      },
    };
  }
  return smtp;
}

/** Replaces each secret in a message and shortens it to 500 characters. */
export function redact(message: string, secrets: (string | undefined)[]): string {
  let safe = message;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("***");
  }
  return safe.slice(0, 500);
}

/** An error message that is safe to store and show: short, with no credentials in it. */
export function safeError(err: unknown): string {
  const env = getEnv();
  return redact(err instanceof Error ? err.message : String(err), [
    env.SMTP_PASSWORD,
    env.SMTP_USER,
  ]);
}

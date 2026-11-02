// The text of every email (specs/email-notifications "Review and reference-hours emails",
// "Invitation and access emails"). Pure: inputs are names, labels and links only, so an email
// can never carry hours, rates or totals.
import { updateLink, updateText, type UpdateKind } from "@/lib/notifications/texts";

export type EmailContent =
  | { kind: "INVITATION"; inviterName: string; roleLabel: string }
  | { kind: "ACCESS_GRANTED"; roleLabel: string }
  | { kind: "TEST"; adminName: string }
  | {
      kind: UpdateKind;
      actorName: string;
      projectName: string;
      requestId: string;
      /** The changes comment or the decline reason. */
      detail?: string | null;
    };

export type RenderedEmail = { subject: string; text: string; html: string };

const PRODUCT = "F3 Estimation Tool";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Joins the app address and a path without doubling or dropping the slash. */
export function absoluteLink(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

type Parts = {
  subject: string;
  lines: string[];
  quote?: { label: string; text: string };
  button: { label: string; href: string };
};

function parts(content: EmailContent, baseUrl: string): Parts {
  const signIn = absoluteLink(baseUrl, "/sign-in");
  switch (content.kind) {
    case "INVITATION":
      return {
        subject: `${content.inviterName} invited you to the ${PRODUCT} as ${content.roleLabel}`,
        lines: [
          `${content.inviterName} invited you to the ${PRODUCT} as ${content.roleLabel}.`,
          "Sign in with your @folio3.com Google account. There's no password to set up.",
        ],
        button: { label: "Sign in with Google", href: signIn },
      };
    case "ACCESS_GRANTED":
      return {
        subject: `You now have access to the ${PRODUCT} as ${content.roleLabel}`,
        lines: [
          `You now have access to the ${PRODUCT} as ${content.roleLabel}.`,
          "Sign in with your @folio3.com Google account to start.",
        ],
        button: { label: "Sign in", href: signIn },
      };
    case "TEST":
      return {
        subject: `Test email from the ${PRODUCT}`,
        lines: [
          `${content.adminName} sent this test from Settings → Email.`,
          "Email is set up and working.",
        ],
        button: { label: `Open the ${PRODUCT}`, href: absoluteLink(baseUrl, "/") },
      };
    default: {
      const subject = updateText(content);
      const detail = content.detail?.trim();
      const label =
        content.kind === "CHANGES_REQUESTED"
          ? "Comment"
          : content.kind === "REFERENCE_DECLINED"
            ? "Reason"
            : null;
      return {
        subject,
        lines: [`${subject}.`],
        quote: label && detail ? { label, text: detail } : undefined,
        button: {
          label: content.kind === "SUBMITTED" ? "Open the review" : "Open in the tool",
          href: absoluteLink(baseUrl, updateLink(content)),
        },
      };
    }
  }
}

const FOOTER = `You get this email because of your role in the ${PRODUCT}.`;

export function renderEmail(content: EmailContent, baseUrl: string): RenderedEmail {
  const p = parts(content, baseUrl);
  const text = [
    ...p.lines,
    ...(p.quote ? ["", `${p.quote.label}: ${p.quote.text}`] : []),
    "",
    `${p.button.label}: ${p.button.href}`,
    "",
    "--",
    FOOTER,
  ].join("\n");

  const paragraphs = p.lines
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("");
  const quote = p.quote
    ? `<p style="margin:0 0 4px;font-weight:600">${escapeHtml(p.quote.label)}</p>` +
      `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #cbd5e1;white-space:pre-wrap">${escapeHtml(p.quote.text)}</blockquote>`
    : "";
  const button =
    `<p style="margin:16px 0"><a href="${escapeHtml(p.button.href)}" ` +
    `style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(p.button.label)}</a></p>`;
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc">` +
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">` +
    `<p style="margin:0 0 16px;font-weight:700">${PRODUCT}</p>` +
    paragraphs +
    quote +
    button +
    `<p style="margin:24px 0 0;font-size:12px;color:#64748b">${escapeHtml(FOOTER)}</p>` +
    `</div></body></html>`;

  return { subject: p.subject, text, html };
}

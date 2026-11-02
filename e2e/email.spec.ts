import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";

// specs/email-notifications and specs/user-roles "Invite by email". The e2e server has no SMTP
// settings, so every email is recorded as not sent and the Admin is told to share the link.

test("an invitation is saved when its email can't be sent, and shows on the Email page", async ({
  browser,
}) => {
  const admin = await (await browser.newContext({ storageState: authFile("admin") })).newPage();
  const email = `e2e.invite.${Date.now()}@folio3.com`;

  await admin.goto("/settings/people");
  await admin.getByLabel("Email").fill(email);
  await admin.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(admin.getByRole("status").and(admin.locator("p"))).toHaveText(
    "Invitation saved. The email couldn't be sent, so share the sign-in link with them",
  );
  await admin.getByRole("button", { name: `Resend invitation email to ${email}` }).click();
  await expect(admin.getByRole("alert").and(admin.locator("p"))).toHaveText(
    "The email couldn't be sent. Check Settings → Email.",
  );

  await admin.getByRole("link", { name: "Email", exact: true }).click();
  await expect(admin).toHaveURL("/settings/email");
  await expect(admin.getByRole("heading", { name: "Email isn't set up" })).toBeVisible();
  await expect(admin.getByRole("button", { name: "Send test email" })).toBeDisabled();
  const rows = admin.getByTestId("email-table").locator("tbody tr").filter({ hasText: email });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("invited you to the F3 Estimation Tool as Estimator");
  await expect(rows.first().getByTestId("email-status")).toHaveText("Not sent, email isn't set up");

  // Clean up the pending invitation.
  await admin.goto("/settings/people");
  await admin.getByRole("button", { name: `Cancel invitation for ${email}` }).click();
  await expect(
    admin.getByRole("button", { name: `Cancel invitation for ${email}` }),
  ).not.toBeVisible();
});

test("only Admins see the Email page", async ({ browser }) => {
  const lead = await (await browser.newContext({ storageState: authFile("techlead") })).newPage();
  await lead.goto("/settings/email");
  await expect(
    lead.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
});

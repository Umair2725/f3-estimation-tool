import { expect, test, type Browser } from "@playwright/test";
import { apiSignIn, authFile, PASSWORD, seed, USERS } from "./helpers";

// specs/user-roles: waiting for access, assigning a role and deactivation (task 6.2). These
// steps change the dev newcomer, so they run in order on freshly seeded data.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => seed());
test.afterAll(() => seed());

async function newcomerPage(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  expect((await apiSignIn(page.request, USERS.newcomer)).status()).toBe(200);
  return page;
}

test("a person without a role sees only the waiting page, and APIs answer 403", async ({
  browser,
}) => {
  const page = await newcomerPage(browser);
  for (const path of ["/", "/settings/people"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Waiting for access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  }
  expect((await page.request.get("/api/people")).status()).toBe(403);
});

test("an Admin assigns a role, then deactivates and reactivates the person", async ({
  browser,
}) => {
  const admin = await (await browser.newContext({ storageState: authFile("admin") })).newPage();
  const person = await newcomerPage(browser);

  // Assign a role: the person's next page load shows the app.
  await admin.goto("/settings/people");
  const row = admin.locator(`[data-testid="person-row"][data-email="${USERS.newcomer}"]`);
  await expect(row).toContainText("Waiting for a role");
  await row.getByLabel("Role for Dev Newcomer").selectOption("ESTIMATOR");
  await expect(admin.getByRole("status")).toHaveText("Dev Newcomer is now Estimator.");
  await person.goto("/");
  await expect(person.getByTestId("person-role")).toHaveText("Estimator");

  // Deactivate: the session ends and signing in again is refused.
  await row.getByRole("button", { name: "Deactivate Dev Newcomer" }).click();
  await row.getByRole("button", { name: "Confirm deactivate" }).click();
  await expect(row).toContainText("Deactivated");
  await person.goto("/");
  await expect(person).toHaveURL(/\/sign-in/);
  await person.getByLabel("Test user").selectOption(USERS.newcomer);
  await person.getByLabel("Password").fill(PASSWORD);
  await person.getByRole("button", { name: "Sign in as test user" }).click();
  await expect(person.getByRole("alert").and(person.locator("p"))).toHaveText(
    "Your access has been turned off. Contact an Admin.",
  );

  // Reactivate: they can sign in again with their previous role.
  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row).not.toContainText("Deactivated");
  await person.getByRole("button", { name: "Sign in as test user" }).click();
  await expect(person).toHaveURL("/");
  await expect(person.getByTestId("person-role")).toHaveText("Estimator");
});

test("invites accept only @folio3.com addresses", async ({ browser }) => {
  const admin = await (await browser.newContext({ storageState: authFile("admin") })).newPage();
  await admin.goto("/settings/people");
  await admin.getByLabel("Email").fill("someone@gmail.com");
  await admin.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(admin.getByRole("alert").and(admin.locator("p"))).toHaveText(
    "Only @folio3.com addresses can be invited",
  );
});

import { expect, test } from "@playwright/test";
import { apiSignIn, PASSWORD, USERS } from "./helpers";

// specs/authentication, starting signed out.

test("signed-out visitors are sent to sign-in and back to the page they asked for", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);

  await page.goto("/settings/people");
  await expect(page).toHaveURL("/sign-in?next=%2Fsettings%2Fpeople");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(
    page.getByText("Only @folio3.com accounts can sign in", { exact: false }),
  ).toBeVisible();

  await page.getByLabel("Test user").selectOption(USERS.admin);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in as test user" }).click();
  await expect(page).toHaveURL("/settings/people");
  await expect(page.getByRole("heading", { level: 1, name: "People and roles" })).toBeVisible();
});

test("a wrong password shows a plain message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Test user").selectOption(USERS.estimator);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in as test user" }).click();
  await expect(page.getByRole("alert").and(page.locator("p"))).toHaveText(
    "Email or password is wrong.",
  );
  await expect(page).toHaveURL(/\/sign-in/);
});

test("protected APIs answer 401 when signed out; health stays public", async ({ request }) => {
  const people = await request.get("/api/people");
  expect(people.status()).toBe(401);
  expect(await people.json()).toMatchObject({ error: "unauthorized" });
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("sign-out ends the session", async ({ page }) => {
  // A fresh session, so signing out doesn't affect the saved ones other tests use.
  expect((await apiSignIn(page.request, USERS.estimator)).status()).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("sign-in page fits a phone and follows dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  // The product tour is for wide screens only.
  await expect(page.getByRole("region", { name: "Product tour" })).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    "rgb(20, 21, 23)",
  );
});

test("the sign-in page shows an interactive product tour on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/sign-in");
  const tour = page.getByRole("region", { name: "Product tour" });
  await expect(tour).toBeVisible();

  await tour.getByRole("tab", { name: "Mobile (Flutter)" }).click();
  await expect(tour.getByRole("tab", { name: "Mobile (Flutter)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await tour.getByRole("row", { name: /Offline sync/ }).click();
  await expect(tour.getByText("Benchmark", { exact: true }).last()).toBeVisible();

  await tour.getByRole("row", { name: /Work orders/ }).click();
  await expect(tour.getByText("AI-generated, no historical reference")).toBeVisible();
  await tour.getByRole("slider", { name: "Minutes per round" }).fill("90");
  await expect(tour.getByText("90 min")).toBeVisible();
  await expect(tour.getByRole("row", { name: /Work orders/ })).toContainText("20–26 h");

  await tour.getByRole("button", { name: /Review & export/ }).click();
  await expect(tour.getByText("Export to Excel ↓")).toBeVisible();

  await expect(page.getByRole("link", { name: "khanumair@folio3.com" })).toHaveAttribute(
    "href",
    "mailto:khanumair@folio3.com",
  );
});

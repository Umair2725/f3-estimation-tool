import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";

// specs/app-shell, signed in as the dev Admin.
test.use({ storageState: authFile("admin") });

test("home page shows the header, greeting, drafts and request list", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header).toContainText("F3 Estimation Tool");
  await expect(header).toContainText("Folio3");
  await expect(page.getByTestId("person-name")).toHaveText("Dev Admin");
  await expect(page.getByTestId("person-role")).toHaveText("Admin");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), Dev$/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "New estimation request" })).toBeVisible();
  await expect(page.getByTestId("my-drafts")).toContainText("My drafts");
  await expect(page.getByRole("heading", { name: "Estimation requests" })).toBeVisible();
});

test("unknown path returns 404 with a friendly page and a link home", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.locator("header")).toContainText("F3 Estimation Tool");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("a rendering error shows a friendly page without internal details", async ({ page }) => {
  await page.goto("/test-error");
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator("header")).toContainText("F3 Estimation Tool");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Intentional test error");
  expect(text).not.toMatch(/at \S+ \(/); // no stack trace lines
});

test("at phone width the navigation hides behind a menu button, without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/", "/settings/people"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }

  const settings = page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Settings" });
  await expect(settings).not.toBeInViewport();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(settings).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeInViewport();
});

test("layout follows the dark color scheme preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).toBe("rgb(20, 21, 23)");
  expect(colors.color).toBe("rgb(241, 241, 242)");

  await page.emulateMedia({ colorScheme: "light" });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).toBe("rgb(250, 250, 250)");
});

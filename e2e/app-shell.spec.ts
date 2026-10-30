import { expect, test } from "@playwright/test";

// specs/app-shell

test("home page shows the header, title, purpose and coming-soon notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("header")).toContainText("F3 Estimation Tool");
  await expect(page.locator("header")).toContainText("Folio3");
  await expect(page.getByRole("heading", { level: 1, name: "F3 Estimation Tool" })).toBeVisible();
  await expect(page.getByText(/reusing Folio3's past estimates/)).toBeVisible();
  await expect(page.getByRole("status")).toContainText("coming soon");
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

test("home page has no horizontal scroll at phone width (375 px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("layout follows the dark color scheme preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(colors.background).toBe("rgb(18, 18, 22)");
  expect(colors.color).toBe("rgb(236, 236, 241)");

  await page.emulateMedia({ colorScheme: "light" });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(light).toBe("rgb(247, 247, 248)");
});

import { expect, test } from "@playwright/test";
import { authFile, BASE_URL } from "./helpers";

// specs/user-roles and the app-shell "Role-aware navigation" requirement.

const ROLES = [
  { role: "estimator", label: "Estimator", settings: false, reviews: false },
  { role: "techlead", label: "Tech Lead", settings: false, reviews: true },
  { role: "architect", label: "Architect", settings: false, reviews: true },
  { role: "admin", label: "Admin", settings: true, reviews: false },
] as const;

for (const want of ROLES) {
  test.describe(`as ${want.label}`, () => {
    test.use({ storageState: authFile(want.role) });

    test("navigation shows only what the role may use", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("person-role")).toHaveText(want.label);
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await expect(nav.getByText(/^Settings/)).toHaveCount(want.settings ? 1 : 0);
      await expect(nav.getByText(/^Reviews/)).toHaveCount(want.reviews ? 1 : 0);
    });

    if (want.role !== "admin") {
      test("the people API and page are refused", async ({ page }) => {
        expect((await page.request.get("/api/people")).status()).toBe(403);
        const change = await page.request.patch("/api/people/anyone", {
          data: { role: "ADMIN" },
          headers: { Origin: BASE_URL },
        });
        expect(change.status()).toBe(403);
        await page.goto("/settings/people");
        await expect(
          page.getByRole("heading", { name: "You don't have access to this page" }),
        ).toBeVisible();
      });
    }
  });
}

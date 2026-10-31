import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/estimation-requests, specs/home-screen, specs/tech-stack-catalog.

const unique = (base: string) =>
  `${base} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function startRequest(page: Page, projectName: string, client = "Northwind Clinics") {
  await page.goto("/");
  await page.getByRole("link", { name: "New estimation request" }).first().click();
  await expect(page).toHaveURL("/estimates/new");
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Client", { exact: true }).fill(client);
  await page.getByRole("button", { name: "Next: Platforms & stack" }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+\/edit\?step=2$/);
}

function part(page: Page, value: string) {
  return page.getByTestId(`part-${value}`).filter({ visible: true });
}

test.describe("as an Estimator", () => {
  test.use({ storageState: authFile("estimator") });

  test("creates a request through all four steps, leaving and resuming on the way", async ({
    page,
  }) => {
    const name = unique("Clinic booking");
    await startRequest(page, name);
    await expect(page.getByTestId("saved-status").filter({ visible: true })).toContainText(
      "Draft saved",
    );

    // Step 2, then leave.
    await page.getByLabel("Web", { exact: true }).check();
    await part(page, "BACKEND").getByLabel("Backend").check();
    await part(page, "BACKEND").getByLabel("Node.js").check();
    await part(page, "MOBILE").getByLabel("Mobile", { exact: true }).check();
    await part(page, "MOBILE").getByLabel("React Native").check();
    await page.getByRole("button", { name: "Save & exit" }).click();
    await expect(page).toHaveURL("/");

    // Resume from home at the step last saved.
    const resume = page.getByRole("region", { name: "Continue where you left off" });
    await expect(resume).toContainText(name);
    await expect(resume).toContainText("Step 2 of 4");
    await resume.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/edit\?step=2$/);
    await expect(part(page, "MOBILE").getByLabel("React Native")).toBeChecked();

    // Step 3.
    await page.getByRole("button", { name: "Next: Environment & compliance" }).click();
    await page.getByLabel("HIPAA").check();
    await page.getByLabel("Security", { exact: true }).check();
    await page.getByLabel("Note for Security").fill("Pen test before launch");
    await page.getByRole("button", { name: "Next: Requirements" }).click();
    await expect(page.getByText("Document upload (PDF or DOCX) is coming soon")).toBeVisible();

    // Finish lists what's missing.
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Before you finish" })).toContainText(
      "Add at least one feature",
    );

    // A feature needs a part.
    await page.getByRole("button", { name: "Add a feature" }).click();
    await page.getByLabel("Feature name").fill("Appointment booking");
    await page.getByLabel("Short description").fill("Doctor availability, reminders");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(
      page
        .getByTestId("feature-row")
        .filter({ visible: true })
        .getByText("Choose at least one part"),
    ).toBeVisible();
    await page
      .getByRole("group", { name: "Parts for Appointment booking" })
      .getByLabel("Backend")
      .check();
    await page
      .getByRole("group", { name: "Parts for Appointment booking" })
      .getByLabel("Mobile")
      .check();
    await page.getByRole("button", { name: "Finish" }).click();

    // The request page shows every answer.
    await expect(page).toHaveURL(/\/estimates\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(
      page.getByText("Northwind Clinics").filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("HIPAA").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Pen test before launch").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Requirements" })).toContainText(
      "Appointment booking",
    );

    // Removing a part warns which features lose it.
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByRole("button", { name: "Platforms & stack" }).click();
    await part(page, "MOBILE").getByLabel("Mobile", { exact: true }).uncheck();
    await expect(page.getByRole("alert").filter({ hasText: "Removing" })).toContainText(
      "Removing Mobile also removes it from: Appointment booking",
    );
  });

  test("step 1 needs a project name", async ({ page }) => {
    await page.goto("/estimates/new");
    await page.getByRole("button", { name: "Next: Platforms & stack" }).click();
    await expect(page.getByText("Enter a project name").first()).toBeVisible();
    await expect(page).toHaveURL("/estimates/new");
  });

  test("home filters live in the address", async ({ page }) => {
    await page.goto("/?status=DRAFT");
    await expect(page.getByLabel("Status")).toHaveValue("DRAFT");

    await page.goto("/");
    await page.getByRole("button", { name: "Mine" }).click();
    await expect(page).toHaveURL(/view=mine/);
    for (const row of await page.getByTestId("request-row").filter({ visible: true }).all()) {
      await expect(row).toContainText("Dev Estimator");
    }

    await page.getByRole("searchbox").fill("portal");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=portal/);
    await page.getByLabel("Technology").selectOption({ label: "React Native" });
    await expect(page).toHaveURL(/tech=/);
    await expect(page.getByTestId("request-row").filter({ visible: true }).first()).toContainText(
      "Patient portal MVP",
    );

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/q=portal/);

    await page.goto("/?q=no-such-project-anywhere");
    await expect(page.getByText("No requests match these filters.")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page.getByTestId("request-row").filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe("as a Tech Lead viewing someone else's request", () => {
  test.use({ storageState: authFile("techlead") });

  test("can view but not edit or delete", async ({ page }) => {
    await page.goto("/?q=Patient+portal+MVP");
    await page.getByRole("link", { name: "Open Patient portal MVP" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Patient portal MVP" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete draft" })).toHaveCount(0);

    await page.goto(`${page.url()}/edit?step=1`);
    await expect(page).toHaveURL(/notice=view-only/);
    await expect(
      page.getByRole("status").filter({ hasText: "Only the owner or an Admin" }),
    ).toBeVisible();
  });
});

test.describe("as an Admin", () => {
  test.use({ storageState: authFile("admin") });

  test("edits and deletes another person's draft", async ({ browser, page }) => {
    const name = unique("Admin edits");
    const owner = await (
      await browser.newContext({ storageState: authFile("techlead") })
    ).newPage();
    await startRequest(owner, name);
    const url = owner.url().replace(/\/edit\?step=2$/, "");

    await page.goto(url);
    await expect(page.getByText("Owner: Dev Tech Lead")).toBeVisible();
    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Project name").fill(`${name} (checked)`);
    await page.getByRole("button", { name: "Save & exit" }).click();
    await expect(page).toHaveURL("/");
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: `${name} (checked)` })).toBeVisible();
    await expect(page.getByText("Owner: Dev Tech Lead")).toBeVisible();

    await page.getByRole("button", { name: "Delete draft" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page).toHaveURL("/");
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("adds and retires a technology, and the wizard follows", async ({ page }) => {
    const tech = unique("Svelte");
    await page.goto("/settings/tech-stack");
    await page.getByLabel("Name", { exact: true }).fill(tech);
    await page
      .getByRole("group", { name: "Parts for the new technology" })
      .getByLabel("Web/Frontend")
      .check();
    await page.getByRole("button", { name: "Add technology" }).click();
    await expect(page.getByRole("status")).toHaveText(`${tech} added.`);

    await startRequest(page, unique("Catalog check"));
    const editUrl = page.url();
    await part(page, "WEB_FRONTEND").getByLabel("Web/Frontend").check();
    await expect(part(page, "WEB_FRONTEND").getByLabel(tech)).toBeVisible();

    await page.goto("/settings/tech-stack");
    await page.getByRole("button", { name: `Retire ${tech}` }).click();
    await expect(page.getByRole("status")).toHaveText(`${tech} retired.`);

    await page.goto(editUrl);
    await part(page, "WEB_FRONTEND").getByLabel("Web/Frontend").check();
    await expect(part(page, "WEB_FRONTEND").getByLabel("React")).toBeVisible();
    await expect(part(page, "WEB_FRONTEND").getByLabel(tech)).toHaveCount(0);
  });

  test("Home, the wizard and a request page fit a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/?q=Patient+portal+MVP");
    const open = page.getByRole("link", { name: "Open Patient portal MVP" }).first();
    const requestUrl = await open.getAttribute("href");
    for (const path of ["/", "/estimates/new", requestUrl!, "/settings/tech-stack"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

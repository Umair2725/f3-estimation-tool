import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/estimate-hours, specs/excel-export, specs/estimate-defaults. Serial: the defaults test
// changes what new requests start from, and the totals test relies on QA 25% / PM 30%.
test.describe.configure({ mode: "serial" });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;

/** Creates a request with Backend (Node.js) and one feature on it; returns its page URL. */
async function backendRequest(page: Page, name: string) {
  await page.goto("/estimates/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Client", { exact: true }).fill("Northwind Clinics");
  await page.getByRole("button", { name: "Next: Platforms & stack" }).click();
  await expect(page).toHaveURL(/edit\?step=2$/);
  const backend = page.getByTestId("part-BACKEND").filter({ visible: true });
  await backend.getByLabel("Backend").check();
  await backend.getByLabel("Node.js").check();
  await page.getByRole("button", { name: "Next: Environment & compliance" }).click();
  await page.getByLabel("Staging").check();
  await page.getByRole("button", { name: "Next: Requirements" }).click();
  await page.getByRole("button", { name: "Add a feature" }).click();
  await page.getByLabel("Feature name").fill("Appointment booking");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+$/);
  return page.url();
}

test.describe("estimate hours and export", () => {
  test.use({ storageState: authFile("estimator") });

  test("enter hours, see the spec totals, save, export and see the total on Home", async ({
    page,
    browser,
  }) => {
    const name = unique("Hours demo");
    const requestUrl = await backendRequest(page, name);
    await page.getByRole("link", { name: "Estimate hours" }).click();
    await expect(page).toHaveURL(/\/estimate$/);

    const task = page.getByRole("region", { name: "Task Appointment booking" });
    await task.getByRole("button", { name: "Add sub task" }).click();
    await task.getByLabel("Sub task title in Appointment booking").fill("Booking API");
    await task.getByLabel("Min hours for Booking API").fill("100");
    await task.getByLabel("Max hours for Booking API").fill("140");
    await page.getByLabel("Deployment Min hours for Backend (Node.js)").fill("16");
    await page.getByLabel("Deployment Max hours for Backend (Node.js)").fill("24");

    await expect(page.getByTestId("grand-total")).toHaveText("195.3–275.9");
    await expect(page.getByTestId("cost")).toHaveText("$5,859–$8,277");
    await expect(page.getByTestId("checklist")).toContainText("Confirm the hourly rate");
    await expect(page.getByRole("button", { name: "Export (internal)" })).toBeDisabled();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
    await page.reload();
    await expect(page.getByLabel("Min hours for Booking API")).toHaveValue("100");

    // Download and parse the export.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export (internal)" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^${name} – Estimate \\(internal\\) – \\d{4}-\\d{2}-\\d{2}\\.xlsx$`),
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Backend (Node.js)"]);
    const total = wb.getWorksheet("Summary")!.getCell("C15").value as ExcelJS.CellFormulaValue;
    expect(total.formula).toBe("SUM(C11:C13)");
    expect(total.result).toBeCloseTo(195.3, 9);

    await page.goto(requestUrl);
    await expect(page.getByText("Last exported by Dev Estimator")).toBeVisible();
    await expect(page.getByTestId("request-total")).toHaveText("195–276");
    await page.goto(`/?q=${encodeURIComponent(name)}`);
    await expect(page.getByTestId("request-hours").filter({ visible: true }).first()).toHaveText(
      "195–276",
    );

    // A Tech Lead sees the same hours but can't change them.
    const lead = await (await browser.newContext({ storageState: authFile("techlead") })).newPage();
    await lead.goto(`${requestUrl}/estimate`);
    await expect(lead.getByLabel("Min hours for Booking API")).toBeDisabled();
    await expect(lead.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(lead.getByTestId("grand-total")).toHaveText("195.3–275.9");
  });
});

test.describe("estimate defaults", () => {
  test.use({ storageState: authFile("admin") });

  test("an Admin's new QA default applies to new requests", async ({ page }) => {
    await page.goto("/settings/estimate-defaults");
    await page.getByLabel("QA (%)").fill("20");
    await page.getByRole("button", { name: "Save defaults" }).click();
    await expect(page.getByRole("status")).toContainText("Defaults saved");
    try {
      await backendRequest(page, unique("Defaults check"));
      await page.getByRole("link", { name: "Estimate hours" }).click();
      await expect(page.getByLabel("QA percentage")).toHaveValue("20");
    } finally {
      await page.goto("/settings/estimate-defaults");
      await page.getByLabel("QA (%)").fill("25");
      await page.getByRole("button", { name: "Save defaults" }).click();
      await expect(page.getByRole("status")).toContainText("Defaults saved");
    }
  });

  test("the default minutes per round starts at 6 and must be 1 to 480", async ({ page }) => {
    // Only an invalid value is tried: a saved change would affect the AI guess spec running alongside.
    await page.goto("/settings/estimate-defaults");
    const minutes = page.getByLabel("Default minutes per round");
    await expect(minutes).toHaveValue("6");
    // The field itself refuses 600 (min 1, max 480), so nothing is sent; the server's own check
    // is covered by the integration tests.
    await minutes.fill("600");
    await page.getByRole("button", { name: "Save defaults" }).click();
    expect(await minutes.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
    await page.reload();
    await expect(page.getByLabel("Default minutes per round")).toHaveValue("6");
  });
});

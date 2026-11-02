import ExcelJS from "exceljs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/project-outcome and specs/actual-hours. Serial: one request goes through every step.
test.describe.configure({ mode: "serial" });

const name = `Actuals demo ${Date.now().toString(36)}`;
let requestUrl = "";

async function as(browser: Browser, role: "estimator" | "techlead" | "admin"): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(role) })).newPage();
}

test("the owner estimates a request and marks it won", async ({ browser }) => {
  const page = await as(browser, "estimator");
  await page.goto("/estimates/new");
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Client", { exact: true }).fill("Northwind Clinics");
  await page.getByRole("button", { name: "Next: Platforms & stack" }).click();
  await expect(page).toHaveURL(/edit\?step=2$/);
  const backend = page.getByTestId("part-BACKEND").filter({ visible: true });
  await backend.getByLabel("Backend").check();
  await backend.getByLabel("Node.js").check();
  await page.getByRole("button", { name: "Next: Environment & compliance" }).click();
  await page.getByRole("button", { name: "Next: Requirements" }).click();
  await page.getByRole("button", { name: "Add a feature" }).click();
  await page.getByLabel("Feature name").fill("Booking");
  await page.getByRole("group", { name: "Parts for Booking" }).getByLabel("Backend").check();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+$/);
  requestUrl = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "Estimate hours" }).click();
  const task = page.getByRole("region", { name: "Task Booking" });
  for (const [title, min, max] of [
    ["Booking API", "40", "56"],
    ["User login", "8", "12"],
  ]) {
    await task.getByRole("button", { name: "Add sub task" }).click();
    await task.getByLabel("Sub task title in Booking").last().fill(title);
    await task.getByLabel(`Min hours for ${title}`).fill(min);
    await task.getByLabel(`Max hours for ${title}`).fill(max);
  }
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");

  await page.goto(requestUrl);
  await page.getByRole("button", { name: "Mark as won" }).click();
  await expect(page.getByTestId("outcome")).toHaveText("In delivery");
  await page.goto(`/?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("row-outcome").filter({ visible: true }).first()).toHaveText(
    "In delivery",
  );
});

test("an Estimator can view but not record actual hours", async ({ browser }) => {
  const page = await as(browser, "estimator");
  await page.goto(`${requestUrl}/actuals`);
  await expect(page.getByText("You can view these hours")).toBeVisible();
  await expect(page.getByLabel("Actual hours for Booking API")).toBeDisabled();
});

test("a Tech Lead enters actual hours and sees the report", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto(`${requestUrl}/actuals`);
  await page.getByLabel("Actual hours for Booking API").fill("38");
  // AI-era project: who did the work (specs/actual-hours "Team level feeds benchmarks").
  await page.getByLabel("Team level").selectOption("EXPERIENCED");
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as version 1" })).toBeVisible();
  const report = page.getByTestId("accuracy-report");
  await expect(report).toContainText("-5%");
  await expect(report).toContainText("In progress");

  await page.goto(`/?q=${encodeURIComponent(name)}`);
  await expect(page.getByTestId("request-hours").filter({ visible: true }).first()).toContainText(
    "actual 38",
  );
});

test("a Tech Lead uploads the edited export, confirms a renamed row and saves version 2", async ({
  browser,
}) => {
  // Export, edit, upload and parse: slow under a busy parallel run.
  test.slow();
  // Export as the owner and edit it like a PM would.
  const owner = await as(browser, "estimator");
  await owner.goto(`${requestUrl}/estimate`);
  const downloadPromise = owner.waitForEvent("download");
  await owner.getByRole("link", { name: "Export (internal)" }).click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await (await downloadPromise).path());
  wb.getWorksheet("Backend (Node.js)")!.eachRow((row) => {
    if (row.getCell(3).value === "User login") {
      row.getCell(3).value = "User Login + OTP";
      row.getCell(4).value = 9;
      row.getCell(5).value = 9;
    }
    if (row.getCell(3).value === "Booking API") {
      row.getCell(4).value = 41;
      row.getCell(5).value = 41;
    }
  });
  const edited = Buffer.from(await wb.xlsx.writeBuffer());

  const page = await as(browser, "techlead");
  await page.goto(`${requestUrl}/actuals`);
  await page.getByLabel("Actuals file", { exact: true }).setInputFiles({
    name: "Actuals.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: edited,
  });
  await page.getByRole("button", { name: "Upload and preview" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/actuals\/review\//);
  await expect(page.getByTestId("match-counts")).toContainText("1 to confirm");
  await expect(page.getByRole("button", { name: "Save as a new version" })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm match for User login" }).click();
  await expect(page.getByRole("button", { name: "Save as a new version" })).toBeDisabled();
  await page.getByLabel("Team level").selectOption("JUNIOR");
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(page).toHaveURL(new RegExp(`${requestUrl}/actuals$`));
  await expect(page.getByTestId("versions")).toContainText("Version 2");
  await expect(page.getByTestId("versions")).toContainText("Actuals.xlsx");
  await expect(
    page.getByLabel("Actual hours for Booking API").filter({ visible: true }),
  ).toHaveValue("41");
});

test("a wrong file type is refused with a message", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto(`${requestUrl}/actuals`);
  await page
    .getByLabel("Actuals file", { exact: true })
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await page.getByRole("button", { name: "Upload and preview" }).filter({ visible: true }).click();
  await expect(page.getByRole("alert").and(page.locator("p"))).toHaveText(
    "Upload the estimate as an .xlsx file",
  );
});

test("Delivered locks actual hours for a Tech Lead; an Admin can reopen", async ({ browser }) => {
  const owner = await as(browser, "estimator");
  await owner.goto(requestUrl);
  await owner.getByRole("button", { name: "Mark as delivered" }).click();
  await expect(owner.getByTestId("outcome")).toHaveText("Delivered");

  const lead = await as(browser, "techlead");
  await lead.goto(`${requestUrl}/actuals`);
  await expect(lead.getByText("Delivered: actual hours are final.")).toBeVisible();
  await expect(lead.getByLabel("Actual hours for Booking API")).toBeDisabled();
  await expect(lead.getByTestId("accuracy-report")).toContainText("Final");

  const admin = await as(browser, "admin");
  await admin.goto(requestUrl);
  await admin.getByRole("button", { name: "Reopen (back to in delivery)" }).click();
  await expect(admin.getByTestId("outcome")).toHaveText("In delivery");
});

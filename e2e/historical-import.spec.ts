import ExcelJS from "exceljs";
import JSZip from "jszip";
import { expect, test } from "@playwright/test";
import { authFile } from "./helpers";

// specs/historical-import. Synthetic past estimates only: real files are never committed.

const run = Date.now().toString(36);

async function estimate(project: string, extraSheet?: string) {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Summary");
  s.getCell("B1").value = "Folio3 Project Estimation Template v 0.5";
  s.getCell("B2").value = project;
  s.getCell("B5").value = "Client Name";
  s.getCell("C5").value = `Northwind ${run}`;
  for (const name of ["BackEnd", ...(extraSheet ? [extraSheet] : [])]) {
    const ws = wb.addWorksheet(name);
    ["S.No", "Task", "Minimum", "Maximum", "Comments"].forEach(
      (h, i) => (ws.getCell(8, i + 2).value = h),
    );
    ws.getCell("B9").value = 1;
    ws.getCell("C9").value = "Authentication";
    [
      ["User login", 8, 12],
      ["Sample row", 1, 1],
    ].forEach(([title, min, max], i) => {
      ws.getCell(10 + i, 3).value = title;
      ws.getCell(10 + i, 4).value = min;
      ws.getCell(10 + i, 5).value = max;
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.describe("as an Estimator", () => {
  test.use({ storageState: authFile("estimator") });
  test("there is no import entry", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }).getByText("Import past projects"),
    ).toHaveCount(0);
  });
});

test.describe("as an Admin", () => {
  test.use({ storageState: authFile("admin") });

  test("uploads a zip, corrects a project, approves it and sees it as a historical project", async ({
    page,
  }) => {
    const project = `Portal ${run}`;
    const zip = new JSZip();
    zip.file("Portal/estimate.xlsx", await estimate(project, "MVP"));
    zip.file("Fleet/fleet.xlsx", await estimate(`Fleet ${run}`));
    const bytes = await zip.generateAsync({ type: "nodebuffer" });

    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Import past projects" })
      .click();
    await expect(page).toHaveURL("/settings/import");
    await page
      .getByLabel("Zip file")
      .setInputFiles({ name: `past-${run}.zip`, mimeType: "application/zip", buffer: bytes });
    await page.getByRole("button", { name: "Upload zip" }).click();
    await expect(page).toHaveURL(/\/settings\/import\/[^/]+$/);
    await expect(page.getByTestId("batch-summary")).toHaveText(
      "0 imported · 2 waiting · 0 skipped · 0 rejected · 0 failed",
    );

    const portalRow = page.locator('[data-testid="import-row"][data-folder="Portal"]');
    await expect(portalRow).toContainText("1 sheet(s) need a part");
    await portalRow.getByRole("link", { name: "Check" }).click();

    await page.getByLabel("Part for sheet MVP").selectOption("WEB_FRONTEND");
    await page.getByLabel("Include Sample row").first().uncheck();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Changes saved." })).toBeVisible();
    await page.getByRole("button", { name: "Approve and import" }).click();
    await expect(page.getByText("This project was imported")).toBeVisible();

    await page.getByRole("link", { name: "Open the historical project" }).click();
    await expect(page.getByRole("heading", { level: 1, name: project })).toBeVisible();
    await expect(page.getByTestId("imported-label")).toHaveText("Imported");
    await expect(page.getByTestId("imported-files")).toContainText("estimate.xlsx");

    await page.getByRole("link", { name: "View hours" }).click();
    await expect(page.getByTestId("subtask-source").filter({ visible: true }).first()).toHaveText(
      "BackEnd, row 10",
    );
    await expect(
      page.getByLabel("Sub task title in Authentication").filter({ visible: true }).first(),
    ).toBeDisabled();

    await page.goto(`/?q=${encodeURIComponent(project)}`);
    await expect(page.getByTestId("row-imported").filter({ visible: true }).first()).toHaveText(
      "Imported",
    );
  });
});

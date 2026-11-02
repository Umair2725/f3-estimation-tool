import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/feature-benchmarks with stub embeddings. Serial: one benchmark goes from creation to a
// suggestion and a proposal. Requests are created as the Admin so the Estimator's drafts (checked
// by other specs in parallel) are left alone.
test.describe.configure({ mode: "serial" });

const letters = () =>
  Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );
// Random words, so no other benchmark or past Task matches it.
const feature = `${letters()} ${letters()}`;
let benchmarkUrl = "";

async function as(browser: Browser, role: "admin" | "techlead" | "architect"): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(role) })).newPage();
}

test("an Admin imports the seed list after a preview", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/");
  // The sidebar links to the library; open it directly (the list is long under a busy run).
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Feature hours" }),
  ).toHaveAttribute("href", "/benchmarks");
  await page.goto("/benchmarks");
  await expect(page.getByRole("heading", { level: 1, name: "Feature hours" })).toBeVisible();
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page).toHaveURL("/benchmarks/import", { timeout: 15_000 });
  await page.getByLabel("Seed CSV or survey workbook").setInputFiles("data/feature-benchmarks.csv");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByTestId("import-counts")).toContainText("0 with problems");
  await page.getByRole("button", { name: "Apply import" }).click();
  // 166 rows in one transaction can take a few seconds under a busy test run.
  await expect(page.getByRole("status").filter({ hasText: "Imported 166 rows." })).toBeVisible({
    timeout: 30_000,
  });
});

test("a Tech Lead adds a benchmark and confirms it", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto("/benchmarks/new");
  await page.getByLabel("Feature").fill(feature);
  await page.getByLabel("Part").selectOption("BACKEND");
  await page.getByLabel("Typical stack").fill("Node.js");
  await page.getByLabel("AI hours, experienced developer (Min)").fill("3");
  await page.getByLabel("AI hours, junior developer (Max)").fill("5");
  await page.getByRole("button", { name: "Add benchmark" }).click();
  // The new benchmark's page, not /benchmarks/new itself.
  await expect(page).toHaveURL(/\/benchmarks\/(?!new$)[^/]+$/);
  benchmarkUrl = new URL(page.url()).pathname;
  await expect(page.getByTestId("benchmark-hours")).toHaveText("3–5 h");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByTestId("benchmark-state")).toContainText("Confirmed by Dev Tech Lead");
});

test("a request Task gets the confirmed benchmark first and keeps the link", async ({
  browser,
}) => {
  const page = await as(browser, "admin");
  await page.goto("/estimates/new");
  await page.getByLabel("Project name").fill(`Benchmarks demo ${Date.now().toString(36)}`);
  await page.getByLabel("Client", { exact: true }).fill("Northwind Clinics");
  await page.getByRole("button", { name: "Next: Platforms & stack" }).click();
  await expect(page).toHaveURL(/edit\?step=2$/);
  const backend = page.getByTestId("part-BACKEND").filter({ visible: true });
  await backend.getByLabel("Backend").check();
  await backend.getByLabel("Node.js").check();
  await page.getByRole("button", { name: "Next: Environment & compliance" }).click();
  await page.getByRole("button", { name: "Next: Requirements" }).click();
  await page.getByRole("button", { name: "Add a feature" }).click();
  await page.getByLabel("Feature name").fill(feature);
  await page
    .getByRole("group", { name: `Parts for ${feature}` })
    .getByLabel("Backend")
    .check();
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+$/);

  await page.getByRole("link", { name: "Estimate hours" }).click();
  await page.getByRole("button", { name: "Find matches for all Tasks" }).click();
  const task = page.getByRole("region", { name: `Task ${feature}` });
  const line = task.getByTestId("suggestion-line");
  await expect(line).toContainText("Confirmed benchmark");
  await expect(line).toContainText("3–5 h");
  await expect(line).toContainText(/Benchmark FB-\d+, confirmed by Dev Tech Lead/);
  await task.getByRole("button", { name: "Accept" }).click();
  await expect(task.getByLabel(`Comment for ${feature}`)).toHaveValue(/^From benchmark FB-\d+$/);
});

test("a large change is proposed and an Architect accepts it", async ({ browser }) => {
  const lead = await as(browser, "techlead");
  await lead.goto(benchmarkUrl);
  await lead.getByLabel("Hours spent").fill("1");
  await lead.getByRole("button", { name: "Add observation" }).click();
  await expect(lead.getByText("proposed to an Architect")).toBeVisible();
  await expect(lead.getByTestId("benchmark-hours")).toHaveText("3–5 h");

  const architect = await as(browser, "architect");
  await architect.goto("/reviews");
  await architect
    .getByTestId("benchmark-proposals")
    .filter({ visible: true })
    .locator("li")
    .filter({ hasText: feature })
    .getByRole("link", { name: "Review change" })
    .click();
  await expect(architect.getByTestId("proposal")).toContainText("Proposed: 1–5 h");
  await architect.getByRole("button", { name: "Accept proposal" }).click();
  await expect(architect.getByTestId("benchmark-hours")).toHaveText("1–5 h");
  await expect(architect.getByTestId("change-log")).toContainText("Proposal accepted");
});

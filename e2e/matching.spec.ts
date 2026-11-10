import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/feature-matching, with stub embeddings and no AI key (see playwright.config.ts).
// Serial: one request goes from matches to an Architect reference (stored as a Draft benchmark). Run as the Admin, so the
// Estimator's drafts (checked by other specs in parallel) are left alone.
test.describe.configure({ mode: "serial" });

const letters = () =>
  Array.from({ length: 7 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join(
    "",
  );
const name = `Matching demo ${Date.now().toString(36)}`;
// Random words, so no earlier run's reference can match it.
const unknown = `${letters()} ${letters()}`;
let requestUrl = "";

async function as(browser: Browser, role: "admin" | "architect"): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(role) })).newPage();
}

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

test("the Admin finds matches and accepts one from Field service app", async ({ browser }) => {
  const page = await as(browser, "admin");
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
  for (const feature of ["Work orders", unknown]) {
    await page.getByRole("button", { name: "Add a feature" }).click();
    await page.getByLabel("Feature name").last().fill(feature);
    await page
      .getByRole("group", { name: `Parts for ${feature}` })
      .getByLabel("Backend")
      .check();
  }
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/estimates\/[^/]+$/);
  requestUrl = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "Estimate hours" }).click();
  await page.getByRole("button", { name: "Find matches for all Tasks" }).click();
  const work = page.getByRole("region", { name: "Task Work orders" });
  await expect(work.getByTestId("suggestion-line")).toContainText("Based on actual hours (AI era)");
  await expect(work.getByTestId("suggestion-line")).toContainText("Field service app v1");
  await work.getByText(/^Similar past work/).click();
  await expect(work.getByTestId("matches-table")).toContainText("Field service app");

  await work.getByRole("button", { name: "Accept" }).click();
  await expect(work.getByTestId("suggestion-line")).toContainText("Accepted by Dev Admin");
  await expect(work.getByLabel("Sub task title in Work orders").first()).toHaveValue(
    "Work order API and sync",
  );
  await expect(work.getByLabel("Comment for Work order API and sync")).toHaveValue(
    "From Field service app v1, Backend (Python) (actual hours)",
  );
});

test("a Task with no match gets an AI estimate sized in rounds", async ({ browser }) => {
  // The stub guess (AI_GUESS=stub): Core logic 4 rounds at High risk, Screens 2 rounds at Low.
  const page = await as(browser, "admin");
  await page.goto(`${requestUrl}/estimate`);
  const task = page.getByRole("region", { name: `Task ${unknown}` });
  await expect(task.getByTestId("suggestion-line")).toContainText("No reliable match");
  const minutes = task.getByLabel("Minutes per round");
  await expect(minutes).toHaveValue("6");

  await minutes.fill("0");
  await task.getByRole("button", { name: "AI estimate" }).click();
  await expect(task.getByText("Enter whole minutes from 1 to 480")).toBeVisible();
  await expect(task.getByTestId("suggestion-line")).toContainText("No reliable match");

  await minutes.fill("60");
  // Slow the server action down so the progress shows while the estimate runs.
  await page.route(`**${requestUrl}/estimate`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await task.getByRole("button", { name: "AI estimate" }).click();
  await expect(task.getByTestId("ai-estimating")).toHaveText("Claude is estimating this Task…");
  await expect(task.getByRole("button", { name: "Estimating…" })).toBeDisabled();
  await expect(task.getByRole("button", { name: "Find again" })).toBeDisabled();
  const guess = task.getByTestId("ai-guess");
  await expect(guess).toBeVisible();
  await expect(task.getByTestId("ai-estimating")).toHaveCount(0);
  await page.unrouteAll();
  await expect(guess).toContainText(
    "4–6 rounds × 60 min, High risk: Third-party API is undocumented",
  );
  await expect(guess).toContainText("2 rounds × 60 min, Low risk");
  await expect(guess).toContainText("Integration, 15% of rounds");
  await expect(task.getByTestId("guess-risks")).toContainText(
    "The client's rules for this feature are not written down yet",
  );
  // 4–6 h + 2–2 h + integration 0.9–1.2 h.
  await expect(task.getByTestId("suggestion-line")).toContainText("6.9–9.2 h");

  // Estimate again at 30 minutes per round halves the hours.
  await task.getByLabel("Minutes per round").fill("30");
  await task.getByRole("button", { name: "Estimate again" }).click();
  await expect(task.getByTestId("ai-guess")).toContainText("4–6 rounds × 30 min");
  await expect(task.getByTestId("suggestion-line")).toContainText("3.5–4.6 h");
});

test("a Task with a reliable match can get an AI estimate too", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto(`${requestUrl}/estimate`);
  const work = page.getByRole("region", { name: "Task Work orders" });
  await expect(work.getByRole("button", { name: "Ask an Architect" })).toHaveCount(0);
  await work.getByRole("button", { name: "AI estimate" }).click();
  await expect(work.getByTestId("suggestion-line")).toContainText(
    "AI-generated, no historical reference",
  );
  await expect(work.getByTestId("ai-guess")).toContainText("4–6 rounds × 6 min");
  // The match stays listed, the accepted Sub tasks stay, and no Architect is offered.
  await work.getByText(/^Similar past work/).click();
  await expect(work.getByTestId("matches-table")).toContainText("Field service app");
  await expect(work.getByLabel("Sub task title in Work orders").first()).toHaveValue(
    "Work order API and sync",
  );
  await expect(work.getByRole("button", { name: "Ask an Architect" })).toHaveCount(0);

  await work.getByRole("button", { name: "Find again" }).click();
  await expect(work.getByTestId("suggestion-line")).toContainText("Based on actual hours (AI era)");
});

test("a Task with no match goes to an Architect", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto(`${requestUrl}/estimate`);
  const task = page.getByRole("region", { name: `Task ${unknown}` });
  await task.getByRole("button", { name: "Ask an Architect" }).click();
  await task.getByLabel("Architect").selectOption({ label: "Dev Architect" });
  await task.getByLabel("Note (optional)").fill("New for us");
  await task.getByRole("button", { name: "Send request" }).click();
  await expect(task.getByTestId("waiting-reference")).toHaveText(
    "Waiting for Dev Architect's reference",
  );
});

test("the Architect adds reference hours", async ({ browser }) => {
  const page = await as(browser, "architect");
  await page.goto("/reviews");
  await visible(page, "reference-requests")
    .locator("li")
    .filter({ hasText: unknown })
    .getByRole("link", { name: "Add reference hours" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(unknown);
  await page.getByLabel("Reference Sub task 1 title").fill("Core service");
  await page.getByLabel("Min hours for Core service").fill("16");
  await page.getByLabel("Max hours for Core service").fill("24");
  await page.getByRole("button", { name: "Save reference hours" }).click();
  await expect(page.getByText("now a Draft benchmark used for matching").first()).toBeVisible();
});

test("the Admin sees the update and the reference as the suggestion", async ({ browser }) => {
  const page = await as(browser, "admin");
  await page.goto("/");
  await visible(page, "updates")
    .getByRole("link", { name: `Dev Architect added reference hours for ${name}` })
    .click();
  const task = page.getByRole("region", { name: `Task ${unknown}` });
  // Reference hours are stored as a Draft benchmark (specs/feature-matching).
  await expect(task.getByTestId("suggestion-line")).toContainText(
    "Draft benchmark, not confirmed yet",
  );
  await expect(task.getByTestId("suggestion-line")).toContainText("16–24 h");
  await task.getByRole("button", { name: "Accept" }).click();
  await expect(task.getByLabel(`Comment for Core service`)).toHaveValue(
    /^From benchmark FB-9\d{3}$/,
  );
});

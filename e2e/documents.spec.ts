import { expect, test, type Browser, type Page } from "@playwright/test";
import { buildDocx } from "../test/fixtures/documents";
import { authFile } from "./helpers";

// specs/requirement-documents and specs/client-questions, with DOCUMENT_READER=stub (see
// playwright.config.ts): each DOCX section becomes a feature, "Questions" and "Assumptions"
// sections give those items, and "AWS" or "HIPAA" give details. Run as the Admin, so the
// Estimator's drafts (checked by other specs in parallel) are left alone.
test.describe.configure({ mode: "serial" });

const name = `Clinic portal ${Date.now().toString(36)}`;
let requestUrl = "";

async function as(browser: Browser, role: "admin" | "techlead"): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(role) })).newPage();
}

test("upload an RFP, review the proposals and add them to the request", async ({ browser }) => {
  test.slow();
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
  await page.getByLabel("Azure").check();
  await page.getByRole("button", { name: "Next: Requirements" }).click();
  await page.getByRole("button", { name: "Add a feature" }).click();
  await page.getByLabel("Feature name").last().fill("Visit reminders");
  await page
    .getByRole("group", { name: "Parts for Visit reminders" })
    .getByLabel("Backend")
    .check();
  await expect(page).toHaveURL(/\/estimates\/[^/]+\/edit\?step=4$/);
  requestUrl = new URL(page.url()).pathname.replace(/\/edit$/, "");
  await page.getByRole("button", { name: "Save & exit" }).click();
  await expect(page).toHaveURL("/");

  // Upload on the Requirements step.
  await page.goto(`${requestUrl}/edit?step=4`);
  const panel = page.getByTestId("documents-panel");
  const docx = await buildDocx([
    { heading: "Book appointment", paragraphs: ["Patients book appointments online."] },
    { heading: "Reschedule appointment", paragraphs: ["Patients move a booked visit."] },
    { heading: "Visit reminders", paragraphs: ["Patients get SMS reminders."] },
    { heading: "Platform", paragraphs: ["The portal is hosted on AWS and must meet HIPAA."] },
    { heading: "Questions", paragraphs: ["Which records system must the portal use?"] },
    { heading: "Assumptions", paragraphs: ["The clinic provides test patient data."] },
  ]);
  await panel.getByLabel("File").setInputFiles({
    name: "Clinic RFP.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(docx),
  });
  await panel.getByLabel("This is").selectOption("CLIENT_REQUIREMENTS");
  await panel.getByRole("button", { name: "Upload" }).click();
  await expect(panel.getByRole("status")).toContainText("Clinic RFP.docx uploaded");
  const row = panel.getByTestId("document-row").filter({ hasText: "Clinic RFP.docx" });
  await expect(row).toContainText("Client requirements · 6 sections");
  await expect(row.getByTestId("document-status")).toContainText("Ready to review", {
    timeout: 20_000,
  });
  await row.getByRole("link", { name: "Review" }).click();

  // Review: the existing feature is flagged and unticked; Azure stays unless chosen.
  const editor = page.getByTestId("review-editor");
  const feature = (n: string) =>
    editor
      .getByTestId("proposed-feature")
      .filter({ has: page.getByLabel("Feature name").and(page.locator(`[value="${n}"]`)) });
  await expect(feature("Visit reminders")).toContainText("Already in the request");
  await expect(feature("Visit reminders").getByLabel("Add Visit reminders")).not.toBeChecked();
  await expect(editor.getByTestId("cite").first()).toContainText("Quote checked");
  await expect(editor.getByLabel("Add Hosting")).not.toBeChecked();
  await expect(editor.getByLabel("Add Compliance")).toBeChecked();

  await feature("Platform").getByRole("button", { name: "Delete Platform" }).click();
  await editor.getByLabel("Merge the ticked features into").fill("Appointment booking");
  await editor.getByRole("button", { name: /^Merge 2 ticked/ }).click();
  const merged = feature("Appointment booking");
  await expect(merged.getByTestId("cite")).toHaveCount(2);

  await editor.getByRole("button", { name: /^Add to request/ }).click();
  await expect(editor.getByRole("status")).toHaveText(
    "Added 1 feature, 1 detail, 1 assumption, 0 risks, 1 question to the request.",
  );
  // Reloaded from the server: the merged items show as added.
  await expect(feature("Book appointment")).toContainText("Added");
  await expect(feature("Reschedule appointment")).toContainText("Added");

  // The request shows the feature, the question and HIPAA; the new Task has a suggestion.
  await page.goto(requestUrl);
  await expect(page.getByTestId("client-questions")).toContainText(
    "Which records system must the portal use?",
  );
  await expect(page.getByTestId("client-questions")).toContainText("Clinic RFP.docx");
  await expect(page.getByRole("region", { name: "Requirements" })).toContainText(
    "Appointment booking",
  );
  await page.getByRole("link", { name: "Estimate hours" }).click();
  const task = page.getByRole("region", { name: "Task Appointment booking" }).first();
  await expect(task.getByTestId("suggestion-line")).toBeVisible();
});

test("a Tech Lead can download the document but not upload", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto(requestUrl);
  const panel = page.getByTestId("documents-panel");
  await expect(panel.getByRole("link", { name: "Download" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Upload" })).toHaveCount(0);
  await expect(
    page.getByTestId("client-questions").getByRole("button", { name: "Add question" }),
  ).toHaveCount(0);

  // The proposals are read-only for them, and the pages fit a phone.
  await panel.getByRole("link", { name: "View proposals" }).click();
  await expect(page.getByRole("button", { name: /^Add to request/ })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of [new URL(page.url()).pathname, requestUrl]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

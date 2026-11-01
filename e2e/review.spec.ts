import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers";

// specs/estimate-review. Serial: one request goes through a full review round.
test.describe.configure({ mode: "serial" });

const name = `Review demo ${Date.now().toString(36)}`;
let requestUrl = "";

async function as(browser: Browser, role: "estimator" | "techlead"): Promise<Page> {
  return (await browser.newContext({ storageState: authFile(role) })).newPage();
}

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

test("the owner estimates a request and submits it to a Tech Lead", async ({ browser }) => {
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
  await expect(visible(page, "review-status")).toHaveText("Draft · v1");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByLabel("Approver").selectOption({ label: "Dev Tech Lead (Tech Lead)" });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(visible(page, "review-status")).toHaveText(
    "Waiting for review by Dev Tech Lead · v1",
  );

  // Locked while in review.
  await page.getByRole("link", { name: "View hours" }).click();
  await expect(page.getByText("These hours are locked")).toBeVisible();
  await expect(page.getByLabel("Min hours for User login")).toBeDisabled();
});

test("the Tech Lead comments on a Sub task and requests changes", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByTestId("nav-count"),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /^Reviews/ })
    .click();
  await expect(page).toHaveURL("/reviews");
  await visible(page, "waiting-reviews")
    .locator("li")
    .filter({ hasText: name })
    .getByRole("link", { name: "Review" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Review: ${name}`);
  await expect(visible(page, "review-total")).not.toHaveText("–");

  await page.getByRole("button", { name: "Comment on User login" }).click();
  await page.getByLabel("Comment on User login").fill("Seems high for a login screen");
  await page.getByRole("button", { name: "Post comment" }).first().click();
  await expect(
    visible(page, "comment-thread").filter({ hasText: "Seems high for a login screen" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByRole("button", { name: "Send back for changes" }).click();
  await expect(page.getByRole("alert").and(page.locator("p"))).toHaveText(
    "Add a comment saying what to change",
  );
  await page.getByLabel("What should change? (required)").fill("Please lower the login estimate");
  await page.getByRole("button", { name: "Send back for changes" }).click();
  // The decision buttons go away once decided; the page shows the new status.
  await expect(page.getByText(/Changes requested by Dev Tech Lead · v1/)).toBeVisible();
});

test("the owner sees the update, edits and resubmits", async ({ browser }) => {
  const page = await as(browser, "estimator");
  await page.goto("/");
  const update = visible(page, "updates").getByRole("link", {
    name: `Changes requested on ${name} by Dev Tech Lead`,
  });
  await update.click();
  await expect(visible(page, "review-status")).toHaveText(
    "Changes requested by Dev Tech Lead · v1",
  );

  await page.getByRole("link", { name: "Estimate hours" }).click();
  await expect(
    visible(page, "comment-thread").filter({ hasText: "Seems high for a login screen" }),
  ).toBeVisible();
  await page.getByLabel("Min hours for User login").fill("6");
  await page.getByLabel("Max hours for User login").fill("9");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("save-state")).toHaveText("All changes saved");
  // The comment stays on its Sub task after the edit.
  await page.reload();
  await expect(
    visible(page, "comment-thread").filter({ hasText: "Seems high for a login screen" }),
  ).toBeVisible();

  await page.goto(requestUrl);
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByLabel("Approver")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(visible(page, "review-status")).toHaveText(
    "Waiting for review by Dev Tech Lead · v1",
  );
});

test("the Tech Lead approves", async ({ browser }) => {
  const page = await as(browser, "techlead");
  await page.goto(`${requestUrl}/review`);
  await page.getByRole("button", { name: "Approve estimate" }).click();
  await expect(page.getByText(/Approved by Dev Tech Lead · v1/)).toBeVisible();

  await page.goto(requestUrl);
  await expect(visible(page, "review-status")).toHaveText("Approved by Dev Tech Lead · v1");
  await page.getByText(/^History \(4\)$/).click();
  const history = visible(page, "review-history");
  await expect(history.getByRole("listitem")).toHaveCount(4);
  await expect(history).toContainText("Please lower the login estimate");
});

test("the owner edits the approved estimate as version 2", async ({ browser }) => {
  const page = await as(browser, "estimator");
  await page.goto(requestUrl);
  await page.getByRole("button", { name: "Edit as new version" }).click();
  await page.getByRole("button", { name: "Start new version" }).click();
  await expect(visible(page, "review-status")).toHaveText(
    /^Draft · v2 · v1 approved by Dev Tech Lead on \d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.getByRole("link", { name: "Estimate hours" })).toBeVisible();
});

test("an Estimator has no Reviews page", async ({ browser }) => {
  const page = await as(browser, "estimator");
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByText(/^Reviews/),
  ).toHaveCount(0);
  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "You don't have access to this page" }),
  ).toBeVisible();
});

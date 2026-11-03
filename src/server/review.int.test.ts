import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import { parseEstimateFile } from "./estimate-parser/core";
import { getEstimate, saveEstimate, type EstimateView } from "./estimates";
import { createRequest, saveStep } from "./estimation-requests";
import { exportInternal } from "./export/export";
import { DRAFT_WATERMARK } from "./export/workbook";
import {
  addComment,
  approve,
  CHANGES_COMMENT_REQUIRED,
  CHOOSE_APPROVER,
  getReview,
  getReviewPanel,
  knowledgeBaseSources,
  listReviews,
  markRequestRead,
  reopen,
  requestChanges,
  reviewCount,
  submitForReview,
  unreadNotifications,
  withdraw,
} from "./review";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(
  role: Role | null = "ESTIMATOR",
  status: "ACTIVE" | "DEACTIVATED" = "ACTIVE",
) {
  const user = await createUser({ role, status });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

function inputFrom(view: EstimateView) {
  return {
    tasks: view.parts.flatMap((p) =>
      p.tasks.map((t) => ({ taskId: t.taskId, subTasks: t.subTasks })),
    ),
    parts: view.parts.map(({ part, deploymentMin, deploymentMax, assumptions, risks }) => ({
      part,
      deploymentMin,
      deploymentMax,
      assumptions,
      risks,
    })),
    ...view.overheads,
  };
}

/** A complete request: one Backend feature with two Sub tasks (or the given ones). */
async function completeRequest(
  owner: CurrentUser,
  subTasks = [
    { title: "User login", min: 8, max: 12, comment: "" },
    { title: "Password reset", min: 4, max: 6, comment: "" },
  ],
) {
  const { id } = await createRequest(owner, {
    projectName: `Review ${tag}`,
    clientName: `Northwind ${tag}`,
    projectDate: "2026-11-01",
  });
  await saveStep(owner, id, 2, {
    applicationTypes: ["Web"],
    operatingSystems: [],
    browsers: ["Chrome"],
    parts: [{ part: "BACKEND", technologyIds: [tech["Node.js"]] }],
  });
  await saveStep(owner, id, 3, { hosting: ["AWS"], environments: ["Production"], compliance: [] });
  await saveStep(owner, id, 4, {
    loadedIds: [],
    features: [{ name: "Sign in", description: "", parts: ["BACKEND"] }],
  });
  const view = await getEstimate(owner, id);
  view.parts[0].tasks[0].subTasks = subTasks;
  view.overheads.rateConfirmed = true;
  await saveEstimate(owner, id, inputFrom(view));
  return id;
}

async function editFirstSubTask(actor: CurrentUser, id: string, min: number, max: number) {
  const view = await getEstimate(actor, id);
  view.parts[0].tasks[0].subTasks[0] = { ...view.parts[0].tasks[0].subTasks[0], min, max };
  return saveEstimate(actor, id, inputFrom(view));
}

describe("review and approval (specs/estimate-review)", () => {
  it("runs a full round: submit, request changes, resubmit, approve, reopen as v2", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await completeRequest(owner);

    // Submit: the Approver list excludes the owner and only has Tech Leads and Architects.
    const panel = await getReviewPanel(owner, id);
    expect(panel.can.submit).toBe(true);
    expect(panel.approverChoices.map((c) => c.id)).toContain(lead.id);
    expect(await submitForReview(owner, id, { reviewerId: lead.id })).toEqual({
      reviewerName: lead.name,
    });
    expect(await reviewCount(lead)).toBe(1);
    expect((await unreadNotifications(lead)).map((n) => [n.kind, n.requestId])).toEqual([
      ["SUBMITTED", id],
    ]);

    // Locked while in review, for the owner and for an Admin.
    const admin = await person("ADMIN");
    await expect(editFirstSubTask(owner, id, 9, 12)).rejects.toThrow(
      "This request can no longer be edited",
    );
    await expect(editFirstSubTask(admin, id, 9, 12)).rejects.toMatchObject({ status: 403 });

    // A comment on a Sub task, then request changes (comment required).
    const review = await getReview(lead, id);
    expect(review.panel.can).toMatchObject({ approve: true, requestChanges: true, comment: true });
    const login = review.estimate.parts[0].tasks[0].subTasks[0];
    await addComment(lead, id, { body: "Seems high for a login screen", subTaskId: login.id });
    await expect(requestChanges(lead, id, { comment: "  " })).rejects.toThrow(
      CHANGES_COMMENT_REQUIRED,
    );
    await requestChanges(lead, id, { comment: "Please lower the login estimate" });
    expect((await unreadNotifications(owner))[0]).toMatchObject({
      kind: "CHANGES_REQUESTED",
      actorName: lead.name,
    });
    await markRequestRead(owner, id);
    expect(await unreadNotifications(owner)).toEqual([]);

    // The owner edits and resubmits; the same Approver is still assigned.
    await editFirstSubTask(owner, id, 6, 9);
    expect((await getReviewPanel(owner, id)).reviewer?.id).toBe(lead.id);
    await submitForReview(owner, id, { reviewerId: lead.id });
    await approve(lead, id);

    const approved = await getReviewPanel(owner, id);
    expect(approved).toMatchObject({
      status: "APPROVED",
      version: 1,
      latestApproval: { version: 1, approvedByName: lead.name },
    });
    expect(approved.history.map((h) => [h.fromStatus, h.toStatus, h.comment])).toEqual([
      ["IN_REVIEW", "APPROVED", null],
      ["CHANGES_REQUESTED", "IN_REVIEW", null],
      ["IN_REVIEW", "CHANGES_REQUESTED", "Please lower the login estimate"],
      ["DRAFT", "IN_REVIEW", null],
    ]);
    const comments = (await getReview(owner, id)).comments;
    expect(comments.map((c) => [c.body, c.subTaskId, c.targetTitle])).toEqual([
      ["Seems high for a login screen", login.id, "User login"],
      ["Please lower the login estimate", null, null],
    ]);
    expect((await listReviews(lead)).recent.map((r) => [r.id, r.outcome])).toEqual([
      [id, "APPROVED"],
    ]);

    // The approved snapshot has the totals the review page showed; it is the source.
    const sources = (await knowledgeBaseSources(owner)).filter((s) => s.requestId === id);
    expect(sources).toHaveLength(1);
    expect(sources[0].snapshot.totals).toEqual((await getReview(owner, id)).totals);
    expect(sources[0].snapshot.parts[0].tasks[0].subTasks[0]).toMatchObject({
      title: "User login",
      minTenths: 60,
      maxTenths: 90,
    });

    // Edit as new version: Draft v2, editable; the source stays v1.
    expect(await reopen(owner, id)).toEqual({ version: 2 });
    await editFirstSubTask(owner, id, 20, 30);
    const after = (await knowledgeBaseSources(owner)).filter((s) => s.requestId === id);
    expect(
      after.map((s) => [s.version, s.snapshot.parts[0].tasks[0].subTasks[0].minTenths]),
    ).toEqual([[1, 60]]);
    expect(await getReviewPanel(owner, id)).toMatchObject({ status: "DRAFT", version: 2 });
  });

  it("emails each review update to the right person (specs/email-notifications)", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await completeRequest(owner);
    const emails = () =>
      getDb().emailMessage.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" } });

    await submitForReview(owner, id, { reviewerId: lead.id });
    await requestChanges(lead, id, { comment: "Split the sync Task" });
    const [submitted, changes] = await emails();
    expect(submitted).toMatchObject({ kind: "SUBMITTED", to: lead.email, userId: lead.id });
    expect(submitted.text).toContain(`/estimates/${id}/review`);
    // Not set up in tests, so the Email page can still show what would have gone out.
    expect(submitted.status).toBe("NOT_SENT");
    expect(changes).toMatchObject({ kind: "CHANGES_REQUESTED", to: owner.email });
    expect(changes.text).toContain("Comment: Split the sync Task");

    // A deactivated owner gets the in-app update but no email.
    await submitForReview(owner, id, { reviewerId: lead.id });
    await getDb().user.update({ where: { id: owner.id }, data: { status: "DEACTIVATED" } });
    await approve(lead, id);
    expect((await emails()).map((e) => [e.kind, e.to])).toEqual([
      ["SUBMITTED", lead.email],
      ["CHANGES_REQUESTED", owner.email],
      ["SUBMITTED", lead.email],
    ]);
  });

  it("refuses ineligible Approvers, incomplete requests and Min greater than Max", async () => {
    const owner = await person("TECH_LEAD");
    const estimator = await person("ESTIMATOR");
    const gone = await person("ARCHITECT", "DEACTIVATED");
    const id = await completeRequest(owner);

    expect((await getReviewPanel(owner, id)).approverChoices.map((c) => c.id)).not.toContain(
      owner.id,
    );
    await expect(submitForReview(owner, id, { reviewerId: owner.id })).rejects.toThrow(
      "You can't review your own request",
    );
    await expect(submitForReview(owner, id, { reviewerId: estimator.id })).rejects.toThrow(
      CHOOSE_APPROVER,
    );
    await expect(submitForReview(owner, id, { reviewerId: gone.id })).rejects.toThrow(
      CHOOSE_APPROVER,
    );

    const architect = await person("ARCHITECT");
    const bad = await completeRequest(owner, [
      { title: "Upside down", min: 10, max: 6, comment: "" },
    ]);
    await expect(submitForReview(owner, bad, { reviewerId: architect.id })).rejects.toThrow(
      "Fix the hours before submitting: 1 Sub task has Min greater than Max",
    );

    const { id: bare } = await createRequest(owner, {
      projectName: `Bare ${tag}`,
      clientName: "",
      projectDate: "2026-11-01",
    });
    await expect(submitForReview(owner, bare, { reviewerId: architect.id })).rejects.toThrow(
      /^Finish the request before submitting: /,
    );
    expect(await getReviewPanel(owner, bare)).toMatchObject({ status: "DRAFT" });
  });

  it("lets only one of approve and withdraw win, and moves a review by withdrawing", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const architect = await person("ARCHITECT");
    const id = await completeRequest(owner);
    await submitForReview(owner, id, { reviewerId: lead.id });

    const results = await Promise.allSettled([approve(lead, id), withdraw(owner, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ status: 409 });

    const status = (await getReviewPanel(owner, id)).status;
    if (status === "DRAFT") {
      // Withdrawn: resubmit to someone else; the first Approver can no longer act.
      await submitForReview(owner, id, { reviewerId: architect.id });
      await expect(approve(lead, id)).rejects.toMatchObject({ status: 403 });
      await approve(architect, id);
    }
    expect((await getReviewPanel(owner, id)).status).toBe("APPROVED");
    await expect(approve(lead, id)).rejects.toMatchObject({
      status: 409,
      message: "This request is no longer in review",
    });
  });

  it("limits comments and the Reviews page to the right people", async () => {
    const owner = await person();
    const other = await person();
    const lead = await person("TECH_LEAD");
    const id = await completeRequest(owner);

    await expect(addComment(owner, id, { body: "Too early" })).rejects.toMatchObject({
      status: 403,
    });
    await submitForReview(owner, id, { reviewerId: lead.id });
    await expect(addComment(other, id, { body: "Drive-by" })).rejects.toMatchObject({
      status: 403,
    });
    const view = await getEstimate(owner, id);
    await addComment(owner, id, { body: "Login uses SSO", taskId: view.parts[0].tasks[0].taskId });
    expect((await getReview(other, id)).comments.map((c) => c.targetTitle)).toEqual(["Sign in"]);
    expect((await getReview(other, id)).panel.can.approve).toBe(false);

    await expect(listReviews(other)).rejects.toMatchObject({ status: 403 });
    expect((await listReviews(lead)).waiting.map((w) => [w.id, w.ownerName])).toEqual([
      [id, owner.name],
    ]);
    expect(await reviewCount(other)).toBe(0);
  });

  it("never lists drafts as knowledge-base sources", async () => {
    const owner = await person();
    const id = await completeRequest(owner);
    expect((await knowledgeBaseSources(owner)).some((s) => s.requestId === id)).toBe(false);
  });

  it("watermarks the export unless the estimate is approved", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await completeRequest(owner);

    const summary = async () => {
      const { buffer } = await exportInternal(owner, id);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.getWorksheet("Summary")!;
      const parsed = await parseEstimateFile(buffer, "x.xlsx");
      if (!parsed.ok) throw new Error(parsed.error);
      return { b4: ws.getCell("B4").value, header: ws.headerFooter?.oddHeader ?? "", parsed };
    };
    const draft = await summary();
    expect(draft.b4).toBe(DRAFT_WATERMARK);
    expect(draft.header).toContain(DRAFT_WATERMARK);

    await submitForReview(owner, id, { reviewerId: lead.id });
    await approve(lead, id);
    const final = await summary();
    expect(final.b4).toBeNull();
    expect(final.header).not.toContain("DRAFT");
    // The watermark changes nothing the parser reads.
    expect(JSON.stringify(final.parsed.sheets)).toBe(JSON.stringify(draft.parsed.sheets));
    expect(final.parsed.summary.projectName).toBe(draft.parsed.summary.projectName);
    expect(final.parsed.warnings).toEqual(draft.parsed.warnings);
  });
});

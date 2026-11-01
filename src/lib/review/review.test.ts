import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "@/lib/estimation/checklist";
import { computeTotals } from "@/lib/estimation/totals";
import { ROLES, type Role } from "@/server/auth/permissions";
import { attentionGroups, minOverMaxMessage } from "./attention";
import { buildSnapshot, readSnapshot } from "./snapshot";
import {
  canAct,
  canComment,
  IMPORTED_LOCKED,
  isEligibleReviewer,
  NOT_IN_REVIEW,
  OWN_APPROVAL,
  TRANSITIONS,
  type ReviewAction,
  type ReviewSubject,
} from "./transitions";

const owner = { id: "owner", role: "ESTIMATOR" as Role };
const lead = { id: "lead", role: "TECH_LEAD" as Role };
const request = (over: Partial<ReviewSubject> = {}): ReviewSubject => ({
  ownerId: "owner",
  status: "DRAFT",
  reviewerId: null,
  origin: "NEW",
  ...over,
});

describe("canAct (specs/estimate-review)", () => {
  const statuses = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "EXPORTED"] as const;

  it("allows each action only from its statuses", () => {
    for (const [action, rule] of Object.entries(TRANSITIONS) as [
      ReviewAction,
      (typeof TRANSITIONS)[ReviewAction],
    ][]) {
      const approver = action === "approve" || action === "request-changes";
      for (const status of statuses) {
        const result = canAct(
          action,
          approver ? lead : owner,
          request({ status, reviewerId: "lead" }),
        );
        expect(result.ok, `${action} from ${status}`).toBe(rule.from.includes(status));
        if (!result.ok) expect(result.status).toBe(409);
      }
    }
  });

  it("gives approve and request changes only to Tech Leads and Architects", () => {
    for (const role of ROLES) {
      const result = canAct(
        "approve",
        { id: "x", role },
        request({ status: "IN_REVIEW", reviewerId: "x" }),
      );
      expect(result.ok, role).toBe(role === "TECH_LEAD" || role === "ARCHITECT");
    }
    expect(canAct("approve", { id: "x", role: null }, request({ status: "IN_REVIEW" }))).toEqual({
      ok: false,
      status: 403,
      message: "Only a Tech Lead or Architect can review estimates",
    });
  });

  it("refuses the owner and anyone not assigned", () => {
    const own = request({ ownerId: "lead", status: "IN_REVIEW", reviewerId: "lead" });
    expect(canAct("approve", lead, own)).toMatchObject({ status: 403, message: OWN_APPROVAL });
    expect(canAct("request-changes", lead, own)).toMatchObject({ status: 403 });
    const other = request({ status: "IN_REVIEW", reviewerId: "someone-else" });
    expect(canAct("approve", lead, other)).toMatchObject({ status: 403 });
  });

  it("reports a withdrawn request as no longer in review, before the assignment", () => {
    expect(canAct("approve", lead, request({ status: "DRAFT", reviewerId: null }))).toEqual({
      ok: false,
      status: 409,
      message: NOT_IN_REVIEW,
    });
  });

  it("gives submit, withdraw and reopen to the owner or an Admin, never on imports", () => {
    const other = { id: "other", role: "ESTIMATOR" as Role };
    const admin = { id: "admin", role: "ADMIN" as Role };
    expect(canAct("submit", owner, request()).ok).toBe(true);
    expect(canAct("submit", admin, request()).ok).toBe(true);
    expect(canAct("submit", other, request())).toMatchObject({ status: 403 });
    expect(canAct("reopen", admin, request({ status: "APPROVED", origin: "IMPORTED" }))).toEqual({
      ok: false,
      status: 403,
      message: IMPORTED_LOCKED,
    });
  });
});

describe("reviewer eligibility and comments", () => {
  it("accepts only active Tech Leads and Architects who don't own the request", () => {
    const person = (role: Role | null, status: "ACTIVE" | "DEACTIVATED" = "ACTIVE", id = "p") => ({
      id,
      role,
      status,
    });
    expect(isEligibleReviewer(person("TECH_LEAD"), "owner")).toBe(true);
    expect(isEligibleReviewer(person("ARCHITECT"), "owner")).toBe(true);
    expect(isEligibleReviewer(person("ESTIMATOR"), "owner")).toBe(false);
    expect(isEligibleReviewer(person("ADMIN"), "owner")).toBe(false);
    expect(isEligibleReviewer(person(null), "owner")).toBe(false);
    expect(isEligibleReviewer(person("TECH_LEAD", "DEACTIVATED"), "owner")).toBe(false);
    expect(isEligibleReviewer(person("TECH_LEAD", "ACTIVE", "owner"), "owner")).toBe(false);
  });

  it("lets the reviewer, owner and Admins comment while in review or changes requested", () => {
    const inReview = request({ status: "IN_REVIEW", reviewerId: "lead" });
    expect(canComment(lead, inReview)).toBe(true);
    expect(canComment(owner, inReview)).toBe(true);
    expect(canComment({ id: "a", role: "ADMIN" }, inReview)).toBe(true);
    expect(canComment({ id: "e", role: "ESTIMATOR" }, inReview)).toBe(false);
    expect(canComment({ id: "t", role: "TECH_LEAD" }, inReview)).toBe(false);
    expect(canComment(owner, request({ status: "APPROVED" }))).toBe(false);
    expect(canComment(owner, request({ status: "DRAFT" }))).toBe(false);
  });
});

describe("attention items", () => {
  const item = (code: ChecklistItem["code"], message: string = code): ChecklistItem => ({
    code,
    message,
  });

  it("groups checklist warnings with counts, in a fixed order, without Min > Max", () => {
    const groups = attentionGroups([
      item("rate-unconfirmed", "Confirm the hourly rate"),
      item("zero-hours"),
      item("min-over-max"),
      item("zero-hours"),
      item("task-without-subtasks"),
    ]);
    expect(groups.map((g) => [g.code, g.summary, g.items.length])).toEqual([
      ["zero-hours", "2 Sub tasks have no hours", 2],
      ["task-without-subtasks", "1 Task has no Sub tasks", 1],
      ["rate-unconfirmed", "Confirm the hourly rate", 1],
    ]);
    expect(attentionGroups([item("zero-hours")])[0].summary).toBe("1 Sub task has no hours");
  });

  it("names Min > Max for the submit refusal", () => {
    expect(minOverMaxMessage([item("min-over-max")])).toBe(
      "Fix the hours before submitting: 1 Sub task has Min greater than Max",
    );
    expect(minOverMaxMessage([item("zero-hours")])).toBeNull();
  });
});

describe("approved snapshot", () => {
  const source = {
    projectName: "Portal",
    clientName: "Northwind",
    overheads: {
      qaEnabled: true,
      qaPercent: 25,
      pmEnabled: false,
      pmPercent: 30,
      bugFixPercent: 10,
      hourlyRate: 30,
    },
    parts: [
      {
        part: "BACKEND" as const,
        label: "Backend (Node.js)",
        deploymentMin: 4,
        deploymentMax: 6,
        tasks: [
          {
            featureName: "Login",
            subTasks: [{ title: "User login", min: 8.5, max: 12, comment: "" }],
          },
        ],
      },
    ],
  };

  it("stores tenths and the same totals as computeTotals", () => {
    const snap = buildSnapshot(2, source);
    expect(snap).toMatchObject({ snapshotVersion: 1, version: 2, projectName: "Portal" });
    expect(snap.parts[0].tasks[0]).toEqual({
      title: "Login",
      subTasks: [{ title: "User login", minTenths: 85, maxTenths: 120, comment: "" }],
    });
    expect(snap.totals).toEqual(
      computeTotals({
        parts: [
          {
            part: "BACKEND",
            tasks: [{ subTasks: [{ minTenths: 85, maxTenths: 120 }] }],
            deploymentMinTenths: 40,
            deploymentMaxTenths: 60,
          },
        ],
        qa: { enabled: true, percent: 25 },
        pm: { enabled: false, percent: 30 },
        bugFixPercent: 10,
        rate: 30,
      }),
    );
    expect(readSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(() => readSnapshot({ snapshotVersion: 9 })).toThrow("Unknown approved snapshot format");
  });
});

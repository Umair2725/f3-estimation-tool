import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { getEstimate, saveEstimate, type EstimateView } from "../estimates";
import { createRequest, saveStep } from "../estimation-requests";
import { approve, getReview, reopen, submitForReview } from "../review";
import { confirmBenchmark, createBenchmark, retireBenchmark } from "../benchmarks/benchmarks";
import { setGuessClientForTests } from "./ai-guess";
import { stubEmbedder } from "./embedder";
import { indexRequest } from "./knowledge";
import {
  ADJUST_REASON_REQUIRED,
  answerReference,
  askArchitect,
  CHOOSE_ARCHITECT,
  decideSuggestion,
  declineReference,
  fillHours,
  findMatches,
  getMatching,
  listReferenceRequests,
  requestAiGuess,
} from "./matching";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterEach(async () => {
  setGuessClientForTests(undefined);
  // One test changes the default minutes per round; put the starting value back.
  await getDb().estimateDefaults.update({
    where: { id: "default" },
    data: { minutesPerRound: 60 },
  });
});
afterAll(async () => {
  const db = getDb();
  await db.featureBenchmark.deleteMany({ where: { createdById: { in: users } } });
  await db.estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await db.client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role = "ESTIMATOR") {
  const user = await createUser({ role });
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

/** A Backend (Node.js) request with one feature per name, each with the given Sub tasks. */
async function request(
  owner: CurrentUser,
  features: { name: string; subTasks?: { title: string; min: number; max: number }[] }[],
) {
  const { id } = await createRequest(owner, {
    projectName: `Matching ${tag} ${randomUUID().slice(0, 4)}`,
    clientName: `Contoso ${tag}`,
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
    features: features.map((f) => ({ name: f.name, description: "", parts: ["BACKEND"] })),
  });
  const view = await getEstimate(owner, id);
  for (const task of view.parts[0].tasks) {
    const subs = features.find((f) => f.name === task.featureName)?.subTasks ?? [];
    task.subTasks = subs.map((s) => ({ ...s, comment: "" }));
  }
  view.overheads.rateConfirmed = true;
  await saveEstimate(owner, id, inputFrom(view));
  return id;
}

async function approved(owner: CurrentUser, lead: CurrentUser, id: string) {
  await submitForReview(owner, id, { reviewerId: lead.id });
  await approve(lead, id);
}

const taskOf = async (actor: CurrentUser, id: string, name: string) =>
  (await getEstimate(actor, id)).parts[0].tasks.find((t) => t.featureName === name)!;

const word = (w: string) => `${w}${tag.replace(/\d/g, "")}`;

describe("knowledge index (specs/feature-matching)", () => {
  it("indexes the latest approved version only, and replaces it on re-approval", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await request(owner, [
      { name: `${word("Quasar")} ledger`, subTasks: [{ title: "Ledger API", min: 8, max: 12 }] },
      { name: `${word("Nimbus")} export`, subTasks: [{ title: "CSV export", min: 2, max: 4 }] },
    ]);
    const db = getDb();
    const entries = () =>
      db.knowledgeItem.findMany({
        where: { requestId: id, model: "stub" },
        select: { version: true, minTenths: true, kind: true },
        orderBy: { minTenths: "asc" },
      });
    expect(await entries()).toEqual([]);
    await approved(owner, lead, id);
    expect(await entries()).toEqual([
      { version: 1, minTenths: 20, kind: "APPROVED_AI_ERA" },
      { version: 1, minTenths: 80, kind: "APPROVED_AI_ERA" },
    ]);

    await reopen(owner, id);
    const view = await getEstimate(owner, id);
    view.parts[0].tasks[0].subTasks[0].min = 1;
    await saveEstimate(owner, id, inputFrom(view));
    expect((await entries()).map((e) => e.version)).toEqual([1, 1]);
    await approved(owner, lead, id);
    expect((await entries()).map((e) => e.version)).toEqual([2, 2]);
  });
});

describe("find matches and decide", () => {
  it("suggests from an approved estimate, then accepts, adjusts and rejects", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    // Three words, so the random tag can't pull the stub similarity under the threshold (with
    // two, about 1 run in 70 did: the source's Sub task titles add words the query lacks).
    const name = `${word("Orbit")} customer invoicing`;
    const source = await request(owner, [
      {
        name,
        subTasks: [
          { title: "Invoice API", min: 10, max: 14 },
          { title: "PDF invoices", min: 4, max: 6 },
        ],
      },
    ]);
    await approved(owner, lead, source);

    const target = await request(owner, [{ name }, { name: `${word("Zephyr")} telemetry` }]);
    await findMatches(owner, target);
    const task = await taskOf(owner, target, name);
    const other = await taskOf(owner, target, `${word("Zephyr")} telemetry`);
    const view = await getMatching(owner, target);
    const suggestion = view.byTask[task.taskId].suggestion!;
    expect(suggestion.method).toBe("AI_ERA_ESTIMATE");
    expect(suggestion.matches[0]).toMatchObject({ requestId: source, version: 1 });
    expect([suggestion.minTenths, suggestion.maxTenths]).toEqual([140, 200]);
    expect(view.byTask[other.taskId].suggestion!.method).toBe("NO_MATCH");

    await expect(
      decideSuggestion(owner, target, task.taskId, { decision: "ADJUSTED" }),
    ).rejects.toThrow(ADJUST_REASON_REQUIRED);
    await decideSuggestion(owner, target, task.taskId, {
      decision: "ADJUSTED",
      reason: "Client wants SSO too",
    });
    const after = await taskOf(owner, target, name);
    const sourceName = (
      await getDb().estimationRequest.findUniqueOrThrow({ where: { id: source } })
    ).projectName;
    expect(after.subTasks.map((s) => [s.title, s.min, s.max, s.comment])).toEqual([
      ["Invoice API", 10, 14, `From ${sourceName} v1, Backend (Node.js)`],
      ["PDF invoices", 4, 6, `From ${sourceName} v1, Backend (Node.js)`],
    ]);
    const decided = (await getMatching(owner, target)).byTask[task.taskId].suggestion!;
    expect(decided).toMatchObject({
      decision: "ADJUSTED",
      reason: "Client wants SSO too",
      decidedByName: owner.name,
    });

    // Reject leaves the Sub tasks alone.
    await findMatches(owner, target, task.taskId);
    await decideSuggestion(owner, target, task.taskId, { decision: "REJECTED" });
    expect((await taskOf(owner, target, name)).subTasks).toHaveLength(2);

    // Nothing to accept on a no-match Task; and the own request is never a match.
    await expect(
      decideSuggestion(owner, target, other.taskId, { decision: "ACCEPTED" }),
    ).rejects.toThrow("There are no suggested hours to accept for this Task");
    await reopen(owner, source).catch(() => undefined);
    await findMatches(owner, source);
    const own = (await getMatching(owner, source)).byTask[
      (await taskOf(owner, source, name)).taskId
    ];
    expect(own.suggestion!.matches.some((m) => m.requestId === source)).toBe(false);

    // Locked while in review.
    await submitForReview(owner, target, { reviewerId: lead.id });
    await expect(
      decideSuggestion(owner, target, task.taskId, { decision: "ACCEPTED" }),
    ).rejects.toThrow("This request can no longer be edited");
    await expect(findMatches(owner, target)).rejects.toMatchObject({ status: 403 });
  });

  it("prefers AI-era actual hours over the estimate, and pre-AI comes last", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const name = `${word("Kestrel")} routing`;
    const preAi = await request(owner, [
      { name, subTasks: [{ title: "Route API", min: 30, max: 40 }] },
    ]);
    await getDb().estimationRequest.update({ where: { id: preAi }, data: { baseline: "PRE_AI" } });
    await approved(owner, lead, preAi);

    const target = await request(owner, [{ name }]);
    await findMatches(owner, target);
    const task = await taskOf(owner, target, name);
    expect((await getMatching(owner, target)).byTask[task.taskId].suggestion).toMatchObject({
      method: "PRE_AI_MATCH",
      minTenths: 300,
    });

    const delivered = await request(owner, [
      { name, subTasks: [{ title: "Route API", min: 20, max: 28 }] },
    ]);
    await approved(owner, lead, delivered);
    const sub = (await taskOf(owner, delivered, name)).subTasks[0];
    const db = getDb();
    await db.actualsVersion.create({
      data: {
        requestId: delivered,
        number: 1,
        source: "MANUAL",
        createdById: lead.id,
        rows: {
          create: [
            {
              subTaskId: sub.id,
              partLabel: "Backend (Node.js)",
              taskTitle: name,
              title: "Route API",
              estMinTenths: 200,
              estMaxTenths: 280,
              actualTenths: 180,
              status: "MATCHED",
              flags: [],
              position: 0,
            },
          ],
        },
      },
    });
    await indexRequest(db, stubEmbedder, delivered);
    await findMatches(owner, target);
    expect((await getMatching(owner, target)).byTask[task.taskId].suggestion).toMatchObject({
      method: "AI_ERA_ACTUALS",
      minTenths: 180,
      maxTenths: 180,
    });
  });
});

describe("benchmarks in matching (specs/feature-matching)", () => {
  it("offers a Confirmed benchmark first, matches Any parts, never Design, and drops retired ones", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const architect = await person("ARCHITECT");
    const name = `${word("Glacier")} onboarding`;
    // A pre-AI source above the threshold too: the benchmark must still come first.
    const preAi = await request(owner, [
      { name, subTasks: [{ title: "Old way", min: 30, max: 40 }] },
    ]);
    await getDb().estimationRequest.update({ where: { id: preAi }, data: { baseline: "PRE_AI" } });
    await approved(owner, lead, preAi);
    const b = await createBenchmark(lead, {
      feature: name,
      part: "BACKEND",
      stack: "Node.js",
      experienced: 3,
      junior: 5,
    });
    await confirmBenchmark(lead, b.id);

    const target = await request(owner, [{ name }]);
    await findMatches(owner, target);
    const task = await taskOf(owner, target, name);
    const s1 = (await getMatching(owner, target)).byTask[task.taskId].suggestion!;
    expect(s1).toMatchObject({ method: "BENCHMARK_CONFIRMED", minTenths: 30, maxTenths: 50 });
    expect(s1.matches.find((m) => m.benchmark?.id === b.id)?.benchmark).toMatchObject({
      code: b.code,
      status: "CONFIRMED",
      confirmedByName: lead.name,
    });
    await decideSuggestion(owner, target, task.taskId, { decision: "ACCEPTED" });
    const subs = await getDb().subTask.findMany({ where: { taskId: task.taskId } });
    expect(subs.map((x) => [x.title, x.benchmarkId, x.comment])).toEqual([
      [name, b.id, `From benchmark ${b.code}`],
    ]);

    // Retired: gone from matching; the pre-AI source is next.
    await retireBenchmark(architect, b.id);
    await findMatches(owner, target, task.taskId);
    expect((await getMatching(owner, target)).byTask[task.taskId].suggestion!.method).toBe(
      "PRE_AI_MATCH",
    );

    // Any part matches a Mobile-free Backend Task; Design never matches.
    const anyName = `${word("Harbor")} audit trail`;
    const any = await createBenchmark(lead, { feature: anyName, part: "ANY", experienced: 2 });
    const design = await createBenchmark(lead, {
      feature: `${word("Meadow")} style guide`,
      part: "DESIGN",
      experienced: 2,
    });
    const other = await request(owner, [
      { name: anyName },
      { name: `${word("Meadow")} style guide` },
    ]);
    await findMatches(owner, other);
    const view = await getMatching(owner, other);
    const anyTask = await taskOf(owner, other, anyName);
    expect(view.byTask[anyTask.taskId].suggestion).toMatchObject({ method: "BENCHMARK_DRAFT" });
    expect(
      Object.values(view.byTask).some((t) =>
        t.suggestion?.matches.some((m) => m.benchmark?.id === design.id),
      ),
    ).toBe(false);
    void any;
  });
});

describe("Architect references", () => {
  it("asks an Architect, who adds reference hours used now and by later requests", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const architect = await person("ARCHITECT");
    const otherArchitect = await person("ARCHITECT");
    const name = `${word("Vortex")} reconciliation`;
    const id = await request(owner, [{ name }]);
    await findMatches(owner, id);
    const task = await taskOf(owner, id, name);
    expect((await getMatching(owner, id)).byTask[task.taskId].suggestion!.method).toBe("NO_MATCH");

    await expect(askArchitect(owner, id, task.taskId, { architectId: lead.id })).rejects.toThrow(
      CHOOSE_ARCHITECT,
    );
    await askArchitect(owner, id, task.taskId, { architectId: architect.id, note: "Bank feeds" });
    await expect(
      askArchitect(owner, id, task.taskId, { architectId: architect.id }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getMatching(owner, id)).byTask[task.taskId].ask).toMatchObject({
      status: "OPEN",
      architectName: architect.name,
    });

    const { open } = await listReferenceRequests(architect);
    const ask = open.find((r) => r.requestId === id)!;
    expect(ask).toMatchObject({
      featureName: name,
      partLabel: "Backend (Node.js)",
      note: "Bank feeds",
      canAnswer: true,
    });
    expect(
      (await getDb().notification.findMany({ where: { userId: architect.id } })).map((n) => n.kind),
    ).toEqual(["REFERENCE_REQUESTED"]);

    const input = {
      title: name,
      subTasks: [
        { title: "Bank feed import", min: 8, max: 12 },
        { title: "Matching rules", min: 8, max: 12 },
      ],
    };
    await expect(answerReference(otherArchitect, ask.id, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(answerReference(lead, ask.id, input)).rejects.toMatchObject({ status: 403 });
    await answerReference(architect, ask.id, input);

    // Stored as a Draft benchmark with the Sub tasks as its breakdown.
    const answered = await getDb().referenceRequest.findUniqueOrThrow({
      where: { id: ask.id },
      include: { benchmark: true },
    });
    expect(answered.benchmark).toMatchObject({
      status: "DRAFT",
      feature: name,
      part: "BACKEND",
      stack: "Node.js",
      experiencedTenths: 160,
      juniorTenths: 240,
    });
    expect(Number(answered.benchmark!.code.slice(3))).toBeGreaterThanOrEqual(9001);

    const now = (await getMatching(owner, id)).byTask[task.taskId];
    expect(now.ask!.status).toBe("ANSWERED");
    expect(now.suggestion).toMatchObject({
      method: "BENCHMARK_DRAFT",
      minTenths: 160,
      maxTenths: 240,
    });
    expect(now.suggestion!.suggested![0]).toMatchObject({
      title: "Bank feed import",
      comment: `From benchmark ${answered.benchmark!.code}`,
      benchmarkId: answered.benchmarkId,
    });
    // Accepting keeps the link, so actual hours can flow back.
    await decideSuggestion(owner, id, task.taskId, { decision: "ACCEPTED" });
    const linked = await getDb().subTask.findMany({ where: { taskId: task.taskId } });
    expect(linked.map((l) => l.benchmarkId)).toEqual([answered.benchmarkId, answered.benchmarkId]);
    expect(
      (await getDb().notification.findMany({ where: { userId: owner.id } })).map((n) => n.kind),
    ).toContain("REFERENCE_ADDED");
    // No order in the query, so compare sorted (the rows can come back either way).
    expect(
      (await getDb().emailMessage.findMany({ where: { requestId: id } }))
        .map((e) => [e.kind, e.to])
        .sort(),
    ).toEqual([
      ["REFERENCE_ADDED", owner.email],
      ["REFERENCE_REQUESTED", architect.email],
    ]);

    // A later request with a similar feature gets it as a match.
    const later = await request(owner, [{ name }]);
    await findMatches(owner, later);
    const laterTask = await taskOf(owner, later, name);
    expect((await getMatching(owner, later)).byTask[laterTask.taskId].suggestion!.method).toBe(
      "BENCHMARK_DRAFT",
    );
    await expect(answerReference(architect, ask.id, input)).rejects.toMatchObject({ status: 409 });
    void lead;
  });

  it("lets the Architect decline with a reason", async () => {
    const owner = await person();
    const architect = await person("ARCHITECT");
    const name = `${word("Pylon")} scheduling`;
    const id = await request(owner, [{ name }]);
    await findMatches(owner, id);
    const task = await taskOf(owner, id, name);
    const { id: askId } = await askArchitect(owner, id, task.taskId, { architectId: architect.id });
    await expect(declineReference(architect, askId, { reason: " " })).rejects.toThrow(
      "Say why you're declining",
    );
    await declineReference(architect, askId, { reason: "Too vague" });
    expect((await getMatching(owner, id)).byTask[task.taskId].ask).toMatchObject({
      status: "DECLINED",
      declineReason: "Too vague",
    });
    // Asking again is allowed after a decline.
    await askArchitect(owner, id, task.taskId, { architectId: architect.id });

    // Each update is also emailed (specs/email-notifications).
    const emails = await getDb().emailMessage.findMany({
      where: { requestId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(emails.map((e) => [e.kind, e.to])).toEqual([
      ["REFERENCE_REQUESTED", architect.email],
      ["REFERENCE_DECLINED", owner.email],
      ["REFERENCE_REQUESTED", architect.email],
    ]);
    expect(emails[1].text).toContain("Reason: Too vague");
    expect(emails[1].text).toContain(`/estimates/${id}/estimate`);
  });
});

describe("AI guess", () => {
  it("is refused without a key, and stored as a labelled guess with one", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const name = `${word("Lumen")} forecasting`;
    const id = await request(owner, [{ name }]);
    await findMatches(owner, id);
    const task = await taskOf(owner, id, name);

    setGuessClientForTests(null);
    expect((await getMatching(owner, id)).aiGuesses).toBe(false);
    await expect(requestAiGuess(owner, id, task.taskId, 60)).rejects.toThrow(
      "AI guesses aren't set up",
    );

    const seen: unknown[] = [];
    setGuessClientForTests(async (input) => {
      seen.push(input);
      return {
        subTasks: [
          {
            title: "Forecast model",
            kind: "MODERATE",
            baseRounds: 4,
            risk: "HIGH",
            riskReason: "SDK docs are sparse",
          },
        ],
        biggestRisks: ["Client's data history may be incomplete"],
      };
    });

    // A bad minutes per round is refused before the AI is called, and changes nothing.
    for (const minutes of [0, 30.5, 481, "60"]) {
      await expect(requestAiGuess(owner, id, task.taskId, minutes)).rejects.toMatchObject({
        status: 400,
        message: "Enter whole minutes from 1 to 480",
      });
    }
    expect(seen).toEqual([]);
    expect((await getMatching(owner, id)).byTask[task.taskId].suggestion!.method).toBe("NO_MATCH");

    await requestAiGuess(owner, id, task.taskId, 60);
    expect(seen).toEqual([
      {
        applicationTypes: ["Web"],
        partLabel: "Backend (Node.js)",
        featureName: name,
        featureDescription: "",
        compliance: [],
      },
    ]);
    const view = await getMatching(owner, id);
    expect(view.defaultMinutesPerRound).toBe(60);
    const guessed = view.byTask[task.taskId].suggestion!;
    expect(guessed).toMatchObject({
      method: "AI_GUESS",
      minTenths: 40,
      maxTenths: 60,
      minutesPerRound: 60,
      risks: ["Client's data history may be incomplete"],
    });
    expect(guessed.suggested![0]).toMatchObject({
      comment:
        "AI-generated, no historical reference · 4–6 rounds × 60 min, High risk: SDK docs are sparse",
      kind: "MODERATE",
      baseRounds: 4,
      risk: "HIGH",
    });

    // Guess again at 90 minutes replaces the hours, the minutes and the risks.
    setGuessClientForTests(async () => ({
      subTasks: [{ title: "Forecast model", kind: "MODERATE", baseRounds: 4, risk: "LOW" }],
      biggestRisks: [],
    }));
    await requestAiGuess(owner, id, task.taskId, 90);
    expect((await getMatching(owner, id)).byTask[task.taskId].suggestion).toMatchObject({
      minTenths: 60,
      maxTenths: 60,
      minutesPerRound: 90,
      risks: [],
    });

    await decideSuggestion(owner, id, task.taskId, { decision: "ACCEPTED" });
    await submitForReview(owner, id, { reviewerId: lead.id });
    const attention = (await getReview(lead, id)).attention;
    expect(attention.find((g) => g.code === "ai-guess")).toMatchObject({
      summary: "1 Task uses an AI guess",
      items: [{ taskId: task.taskId }],
    });
  });
});

describe("hours filled in at once (specs/requirement-documents)", () => {
  it("uses a reliable match's hours, else an AI guess, recorded as accepted", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const matched = `${word("Orchid")} invoicing`;
    const source = await request(owner, [
      { name: matched, subTasks: [{ title: "Invoice API", min: 6, max: 9 }] },
    ]);
    await approved(owner, lead, source);

    const unmatched = `${word("Zephyr")} telemetry`;
    const failing = `${word("Basalt")} payroll`;
    const kept = `${word("Cobalt")} audit`;
    const id = await request(owner, [
      { name: matched },
      { name: unmatched },
      { name: failing },
      { name: kept, subTasks: [{ title: "Typed by hand", min: 1, max: 2 }] },
    ]);
    setGuessClientForTests(async (input) => {
      if (input.featureName === failing) throw new Error("model unavailable");
      return {
        subTasks: [{ title: "Telemetry pipeline", kind: "MODERATE", baseRounds: 4, risk: "LOW" }],
        biggestRisks: [],
      };
    });
    // Guesses made while filling hours use the Admin default minutes per round.
    await getDb().estimateDefaults.update({
      where: { id: "default" },
      data: { minutesPerRound: 45 },
    });
    await findMatches(owner, id);
    const tasks = (await getEstimate(owner, id)).parts[0].tasks;
    const filled = await fillHours(
      owner.id,
      id,
      tasks.map((t) => t.taskId),
    );
    expect(filled).toEqual({ matched: 1, guessed: 1, empty: 1 });

    const view = await getEstimate(owner, id);
    const matching = await getMatching(owner, id);
    const task = (name: string) => view.parts[0].tasks.find((t) => t.featureName === name)!;
    const suggestion = (name: string) => matching.byTask[task(name).taskId].suggestion!;

    expect(task(matched).subTasks).toMatchObject([
      { title: "Invoice API", min: 6, max: 9, comment: expect.stringContaining("From ") },
    ]);
    expect(suggestion(matched)).toMatchObject({ decision: "ACCEPTED", decidedByName: owner.name });

    // 4 rounds × 45 minutes = 3 h.
    expect(task(unmatched).subTasks).toMatchObject([
      { title: "Telemetry pipeline", min: 3, max: 3 },
    ]);
    expect(task(unmatched).subTasks[0].comment).toBe(
      "AI-generated, no historical reference · 4 rounds × 45 min, Low risk",
    );
    expect(suggestion(unmatched)).toMatchObject({
      method: "AI_GUESS",
      decision: "ACCEPTED",
      minutesPerRound: 45,
    });

    // A failed guess leaves the Task as "No reliable match" without hours.
    expect(task(failing).subTasks).toEqual([]);
    expect(suggestion(failing)).toMatchObject({ method: "NO_MATCH", decision: "PENDING" });

    // Hours already there are never replaced.
    expect(task(kept).subTasks).toMatchObject([{ title: "Typed by hand", min: 1, max: 2 }]);
    expect(suggestion(kept).decision).toBe("PENDING");

    // The estimator can still reject a filled-in suggestion.
    await decideSuggestion(owner, id, task(unmatched).taskId, { decision: "REJECTED" });
    expect((await getMatching(owner, id)).byTask[task(unmatched).taskId].suggestion).toMatchObject({
      decision: "REJECTED",
    });
  });

  it("leaves Tasks without a match empty when AI guesses aren't set up", async () => {
    const owner = await person();
    const name = `${word("Quartz")} kiosk`;
    const id = await request(owner, [{ name }]);
    setGuessClientForTests(null);
    await findMatches(owner, id);
    const [task] = (await getEstimate(owner, id)).parts[0].tasks;
    expect(await fillHours(owner.id, id, [task.taskId])).toEqual({
      matched: 0,
      guessed: 0,
      empty: 1,
    });
    expect((await getEstimate(owner, id)).parts[0].tasks[0].subTasks).toEqual([]);
  });
});

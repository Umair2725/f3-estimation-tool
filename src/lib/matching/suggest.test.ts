import { describe, expect, it } from "vitest";
import {
  chooseSuggestion,
  entryText,
  METHOD_LABELS,
  queryText,
  sourceName,
  type Match,
} from "./suggest";

const match = (over: Partial<Match> = {}): Match => ({
  id: "m",
  kind: "APPROVED_PRE_AI",
  similarity: 0.9,
  requestId: "r1",
  version: 1,
  projectName: "Patient portal MVP",
  clientName: "Northwind Clinics",
  authorName: null,
  benchmark: null,
  partLabel: "Backend (Node.js)",
  title: "Login",
  subTasks: [
    { title: "Login API", minTenths: 80, maxTenths: 120, actualTenths: 100 },
    { title: "Password reset", minTenths: 40, maxTenths: 60, actualTenths: null },
  ],
  minTenths: 120,
  maxTenths: 180,
  actualTenths: null,
  sourceDate: "2026-10-01",
  ...over,
});

describe("texts (specs/feature-matching)", () => {
  it("builds the indexed and query texts", () => {
    expect(
      entryText({
        partLabel: "Backend (Node.js)",
        title: "Login",
        description: " Email sign-in ",
        subTaskTitles: ["A", "B", "C", "D", "E", "F", "G"],
      }),
    ).toBe("Backend (Node.js): Login. Email sign-in. Sub tasks: A; B; C; D; E; F.");
    expect(queryText({ partLabel: "Mobile (Flutter)", featureName: "Offline sync" })).toBe(
      "Mobile (Flutter): Offline sync.",
    );
  });
});

describe("chooseSuggestion order", () => {
  const T = 0.77;

  const bench = (status: "CONFIRMED" | "DRAFT", id: string, similarity: number) =>
    match({
      id,
      kind: status === "CONFIRMED" ? "BENCHMARK_CONFIRMED" : "BENCHMARK_DRAFT",
      similarity,
      requestId: null,
      version: null,
      projectName: null,
      benchmark: {
        id: `b-${id}`,
        code: `FB-${id}`,
        status,
        confirmedByName: status === "CONFIRMED" ? "Dev Architect" : null,
        projectsCount: 2,
        updatedAt: "2026-10-01",
      },
    });

  it("prefers benchmarks (Confirmed, then Draft), then actuals, an AI-era estimate, then pre-AI", () => {
    const pre = match({ id: "pre", similarity: 0.95 });
    const estimate = match({ id: "est", kind: "APPROVED_AI_ERA", similarity: 0.9 });
    const actuals = match({
      id: "act",
      kind: "APPROVED_AI_ERA",
      similarity: 0.85,
      actualTenths: 100,
    });
    const draft = bench("DRAFT", "draft", 0.95);
    const confirmed = bench("CONFIRMED", "conf", 0.8);
    expect(chooseSuggestion([pre, draft, estimate, actuals, confirmed], T).source?.id).toBe("conf");
    expect(chooseSuggestion([pre, draft, estimate, actuals], T).source?.id).toBe("draft");
    expect(chooseSuggestion([pre, estimate, actuals], T).method).toBe("AI_ERA_ACTUALS");
    expect(chooseSuggestion([pre, estimate], T).method).toBe("AI_ERA_ESTIMATE");
    expect(chooseSuggestion([pre], T).method).toBe("PRE_AI_MATCH");
  });

  it("ignores matches below the threshold, including at the edge", () => {
    expect(chooseSuggestion([match({ similarity: 0.769 })], T)).toEqual({
      method: "NO_MATCH",
      source: null,
      subTasks: null,
      minTenths: null,
      maxTenths: null,
    });
    expect(chooseSuggestion([match({ similarity: 0.77 })], T).method).toBe("PRE_AI_MATCH");
    expect(chooseSuggestion([bench("CONFIRMED", "low", 0.5), match()], T).method).toBe(
      "PRE_AI_MATCH",
    );
  });

  it("copies Sub tasks with a source comment, and uses actual hours for AI-era actuals", () => {
    const pre = chooseSuggestion([match()], T);
    expect(pre.subTasks).toEqual([
      {
        title: "Login API",
        minTenths: 80,
        maxTenths: 120,
        comment: "From Patient portal MVP v1, Backend (Node.js)",
      },
      {
        title: "Password reset",
        minTenths: 40,
        maxTenths: 60,
        comment: "From Patient portal MVP v1, Backend (Node.js)",
      },
    ]);
    expect([pre.minTenths, pre.maxTenths]).toEqual([120, 180]);

    const act = chooseSuggestion([match({ kind: "APPROVED_AI_ERA", actualTenths: 100 })], T);
    expect(act.subTasks?.map((s) => [s.minTenths, s.maxTenths, s.comment])).toEqual([
      [100, 100, "From Patient portal MVP v1, Backend (Node.js) (actual hours)"],
      [40, 60, "From Patient portal MVP v1, Backend (Node.js) (actual hours)"],
    ]);
  });

  it("links benchmark Sub tasks to their benchmark", () => {
    const b = chooseSuggestion([bench("CONFIRMED", "012", 0.9)], T);
    expect(b.method).toBe("BENCHMARK_CONFIRMED");
    expect(b.subTasks?.[0]).toMatchObject({
      comment: "From benchmark FB-012",
      benchmarkId: "b-012",
    });
    expect(chooseSuggestion([match()], T).subTasks?.[0].benchmarkId).toBeUndefined();
  });

  it("names sources and labels every method", () => {
    expect(sourceName(bench("DRAFT", "9001", 0.9))).toBe("benchmark FB-9001");
    expect(METHOD_LABELS.PRE_AI_MATCH).toBe("Pre-AI hours: the AI reduction isn't applied yet");
    expect(METHOD_LABELS.AI_GUESS).toBe("AI-generated, no historical reference");
  });
});

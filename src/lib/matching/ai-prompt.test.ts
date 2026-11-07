import { describe, expect, it } from "vitest";
import { matchingGroups } from "@/lib/review/attention";
import { GUESS_SYSTEM, GuessSchema, guessPrompt, guessToSubTasks } from "./ai-prompt";

describe("AI guess prompt (specs/feature-matching privacy)", () => {
  it("holds only this request's feature, part, stack and context", () => {
    const prompt = guessPrompt({
      applicationTypes: ["Web", "Mobile"],
      partLabel: "Mobile (Flutter)",
      featureName: "Offline sync",
      featureDescription: " Work orders offline ",
      compliance: ["HIPAA"],
    });
    expect(prompt).toBe(
      [
        "Part and stack: Mobile (Flutter)",
        "Feature: Offline sync",
        "Description: Work orders offline",
        "Application: Web, Mobile",
        "Compliance: HIPAA",
      ].join("\n"),
    );
    // The input type has no client, project or other request fields to leak.
    expect(prompt).not.toMatch(/client|project/i);
  });

  it("tells the model to estimate in rounds, not hours", () => {
    expect(GUESS_SYSTEM).toMatch(/rounds, never in hours/);
    expect(GUESS_SYSTEM).toMatch(/Never raise the risk just to be safe/);
  });
});

const NOTE = "AI-generated, no historical reference";
const sub = (over: Record<string, unknown> = {}) => ({
  title: "Sync",
  kind: "MODERATE",
  baseRounds: 4,
  risk: "LOW",
  ...over,
});
const parse = (subTasks: unknown[], biggestRisks: string[] = []) =>
  GuessSchema.parse({ subTasks, biggestRisks });

describe("AI guess answers (specs/feature-matching)", () => {
  it("refuses an empty guess, a risk above Low without a reason, and rounds outside 1 to 15", () => {
    const ok = (subTasks: unknown[]) =>
      GuessSchema.safeParse({ subTasks, biggestRisks: [] }).success;
    expect(ok([])).toBe(false);
    expect(ok([sub({ risk: "HIGH" })])).toBe(false);
    expect(ok([sub({ risk: "HIGH", riskReason: "  " })])).toBe(false);
    expect(ok([sub({ baseRounds: 16 })])).toBe(false);
    expect(ok([sub({ baseRounds: 0 })])).toBe(false);
    expect(ok([sub({ baseRounds: 2.5 })])).toBe(false);
    expect(ok([sub({ risk: "HIGH", riskReason: "SDK docs are sparse" })])).toBe(true);
  });
});

describe("sizing a guess in rounds (specs/feature-matching)", () => {
  it("turns 4 base rounds at High risk and 60 minutes into 4–6 h", () => {
    const guess = parse([sub({ risk: "HIGH", riskReason: " SDK docs are sparse " })]);
    expect(guessToSubTasks(guess, 60, NOTE).subTasks).toEqual([
      {
        title: "Sync",
        minTenths: 40,
        maxTenths: 60,
        comment: `${NOTE} · 4–6 rounds × 60 min, High risk: SDK docs are sparse`,
        kind: "MODERATE",
        baseRounds: 4,
        risk: "HIGH",
        riskReason: "SDK docs are sparse",
      },
    ]);
  });

  it("needs no reason for Low risk: 2 rounds at 30 minutes is 1–1 h", () => {
    const [only] = guessToSubTasks(
      parse([sub({ baseRounds: 2, kind: "BOILERPLATE" })]),
      30,
      NOTE,
    ).subTasks;
    expect(only).toMatchObject({
      minTenths: 10,
      maxTenths: 10,
      comment: `${NOTE} · 2 rounds × 30 min, Low risk`,
    });
    expect(only).not.toHaveProperty("riskReason");
  });

  it("keeps fractional effective rounds exact: 3 rounds at Medium risk is 3–3.9 h", () => {
    const [only] = guessToSubTasks(
      parse([sub({ baseRounds: 3, risk: "MEDIUM", riskReason: "New API" })]),
      60,
      NOTE,
    ).subTasks;
    expect(only).toMatchObject({ minTenths: 30, maxTenths: 39 });
    expect(only.comment).toContain("3–3.9 rounds × 60 min, Medium risk: New API");
  });

  it("adds integration at 15% of the base and effective totals", () => {
    // 6 base rounds Low (6 effective) + 4 base rounds Very high (8 effective) = 10 and 14.
    const guess = parse(
      [
        sub({ title: "Screens", baseRounds: 6 }),
        sub({ title: "Sync", risk: "VERY_HIGH", riskReason: "Conflict rules unknown" }),
      ],
      [" Client's offline conflict rules are unknown "],
    );
    const { subTasks, risks } = guessToSubTasks(guess, 60, NOTE);
    expect(subTasks.map((s) => [s.title, s.minTenths, s.maxTenths])).toEqual([
      ["Screens", 60, 60],
      ["Sync", 40, 80],
      ["Integration and wiring", 15, 21],
    ]);
    expect(subTasks[2].comment).toBe(`${NOTE} · Integration, 15% of rounds`);
    expect(risks).toEqual(["Client's offline conflict rules are unknown"]);
  });

  it("adds no integration Sub task to a single Sub task, and scales with the minutes", () => {
    const guess = parse([sub()]);
    expect(guessToSubTasks(guess, 60, NOTE).subTasks).toHaveLength(1);
    expect(guessToSubTasks(guess, 30, NOTE).subTasks[0]).toMatchObject({
      minTenths: 20,
      maxTenths: 20,
    });
  });
});

describe("review attention for matching", () => {
  it("lists AI guesses, no-match Tasks and Tasks waiting for a reference", () => {
    const groups = matchingGroups({
      aiGuess: [{ taskId: "t1", name: "Sync" }],
      noMatch: [
        { taskId: "t2", name: "Maps" },
        { taskId: "t3", name: "Chat" },
      ],
      waitingReference: [],
    });
    expect(groups.map((g) => [g.code, g.summary, g.items.map((i) => i.taskId)])).toEqual([
      ["ai-guess", "1 Task uses an AI guess", ["t1"]],
      ["no-match", "2 Tasks have no reliable match and no hours", ["t2", "t3"]],
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { matchingGroups } from "@/lib/review/attention";
import { GuessSchema, guessPrompt, guessToSubTasks } from "./ai-prompt";

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

  it("validates answers and turns hours into tenths, never Min above Max", () => {
    expect(GuessSchema.safeParse({ subTasks: [] }).success).toBe(false);
    const guess = GuessSchema.parse({
      subTasks: [{ title: " Sync ", minHours: 12.5, maxHours: 8 }],
    });
    expect(guessToSubTasks(guess, "AI-generated, no historical reference")).toEqual([
      {
        title: "Sync",
        minTenths: 80,
        maxTenths: 125,
        comment: "AI-generated, no historical reference",
      },
    ]);
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

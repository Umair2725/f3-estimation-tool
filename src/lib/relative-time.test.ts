import { describe, expect, it } from "vitest";
import { lastActiveLabel, savedAgoLabel } from "./relative-time";

const now = new Date("2026-10-30T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;

describe("lastActiveLabel", () => {
  it.each([
    [null, "Never"],
    [ago(5 * MIN), "Now"],
    [ago(20 * MIN), "20 min ago"],
    [ago(3 * 60 * MIN), "3 h ago"],
    [ago(30 * 60 * MIN), "Yesterday"],
    [ago(5 * 24 * 60 * MIN), "5 days ago"],
    [new Date("2026-01-02T00:00:00Z"), "2026-01-02"],
  ])("%s → %s", (at, label) => {
    expect(lastActiveLabel(at, now)).toBe(label);
  });
});

describe("savedAgoLabel", () => {
  it.each([
    [ago(20_000), "just now"],
    [ago(MIN), "1 minute ago"],
    [ago(12 * MIN), "12 minutes ago"],
    [ago(60 * MIN), "1 hour ago"],
    [ago(26 * 60 * MIN), "2026-10-29"],
  ])("%s → %s", (at, label) => {
    expect(savedAgoLabel(at, now)).toBe(label);
  });
});

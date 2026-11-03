import { describe, expect, it } from "vitest";
import { addedMessage, estimateHrefAfterAdding, readAddedCounts } from "./added-notice";

const counts = {
  features: 15,
  details: 7,
  assumptions: 1,
  risks: 0,
  questions: 2,
  hours: { matched: 9, guessed: 5, empty: 1 },
};

describe("added notice", () => {
  it("words the counts and where the hours came from", () => {
    expect(addedMessage(counts)).toBe(
      "Added 15 features, 7 details, 1 assumption, 0 risks, 2 questions to the request. " +
        "Hours: 9 Tasks from past estimates, 5 Tasks from an AI guess (check them), " +
        "1 Task still without hours.",
    );
  });

  it("leaves out the hours when no features were added", () => {
    const none = { ...counts, features: 0, hours: { matched: 0, guessed: 0, empty: 0 } };
    expect(addedMessage(none)).toBe(
      "Added 0 features, 7 details, 1 assumption, 0 risks, 2 questions to the request.",
    );
  });

  it("round-trips the counts through the Estimate tab's address", () => {
    const href = estimateHrefAfterAdding("r1", counts);
    expect(href).toBe("/estimates/r1/estimate?notice=document-added&added=15.7.1.0.2.9.5.1");
    const params = new URL(href, "http://x").searchParams;
    expect(readAddedCounts(params.get("notice"), params.get("added"))).toEqual(counts);
  });

  it("ignores anything malformed", () => {
    expect(readAddedCounts("document-added", "1.2.3.4.5")).toBeNull();
    expect(readAddedCounts("document-added", "a.b.c.d.e.f.g.h")).toBeNull();
    expect(readAddedCounts("other", "1.2.3.4.5.6.7.8")).toBeNull();
    expect(readAddedCounts("document-added", undefined)).toBeNull();
  });
});

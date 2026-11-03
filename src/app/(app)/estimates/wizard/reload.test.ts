import { describe, expect, it } from "vitest";
import { isNewer, reloadState, withSavedIds } from "./reload";
import type { FeatureState, WizardState } from "./types";

const feature = (key: string, name = key): FeatureState => ({
  key,
  name,
  description: "",
  parts: ["BACKEND"],
});

function state(features: FeatureState[], projectName = "Portal", other = ""): WizardState {
  return {
    1: { projectName, clientName: "", projectManager: "Sara", projectDate: "2026-11-03" },
    2: { applicationTypes: [], operatingSystems: [], browsers: [], parts: [] },
    3: { hosting: [], environments: [], appStores: [], compliance: [], nfr: {}, other },
    4: { features },
  };
}

describe("isNewer", () => {
  it("compares ISO versions", () => {
    expect(isNewer("2026-11-03T13:40:00.000Z", "2026-11-03T13:39:00.000Z")).toBe(true);
    expect(isNewer("2026-11-03T13:39:00.000Z", "2026-11-03T13:39:00.000Z")).toBe(false);
    expect(isNewer("2026-11-03T13:38:00.000Z", "2026-11-03T13:39:00.000Z")).toBe(false);
    expect(isNewer(null, "2026-11-03T13:39:00.000Z")).toBe(false);
  });
});

describe("reloadState", () => {
  const saved = state([feature("f1", "Web app")]);
  const fresh = state(
    [feature("f1", "Web app"), feature("d1", "Booking"), feature("d2", "Reports")],
    "Portal (from document)",
  );

  it("takes everything from the server when nothing is unsaved", () => {
    expect(reloadState(saved, saved, fresh, 4)).toEqual(fresh);
  });

  it("keeps unsaved features and adds the ones added elsewhere", () => {
    const typed = state([feature("f1", "Web app"), feature("new-1", "Search")]);
    const next = reloadState(typed, saved, fresh, 4);
    expect(next[4].features.map((f) => f.name)).toEqual([
      "Web app",
      "Search",
      "Booking",
      "Reports",
    ]);
    expect(next[1].projectName).toBe("Portal (from document)");
  });

  it("doesn't bring back a feature removed in the form", () => {
    const removed = state([]);
    const next = reloadState(removed, saved, fresh, 4);
    expect(next[4].features.map((f) => f.key)).toEqual(["d1", "d2"]);
  });

  it("keeps unsaved values on another current step and reloads the rest", () => {
    const typed = state([feature("f1", "Web app")], "Portal", "Typed note");
    const next = reloadState(typed, saved, fresh, 3);
    expect(next[3].other).toBe("Typed note");
    expect(next[4]).toEqual(fresh[4]);
    expect(next[1]).toEqual(fresh[1]);
  });
});

describe("withSavedIds", () => {
  it("replaces the form's keys with the saved ids", () => {
    const s = state([feature("f1"), feature("new-1", "Search")]);
    expect(withSavedIds(s, ["f1", "f9"])[4].features.map((f) => f.key)).toEqual(["f1", "f9"]);
  });

  it("leaves the state alone without ids", () => {
    const s = state([feature("f1")]);
    expect(withSavedIds(s, undefined)).toBe(s);
  });
});

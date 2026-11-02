import { describe, expect, it } from "vitest";
import { updateLink, updateText } from "./texts";

const n = { projectName: "Field service app", actorName: "Dev Tech Lead", requestId: "r1" };

describe("updateText and updateLink", () => {
  it.each([
    [
      "SUBMITTED",
      "Dev Tech Lead submitted Field service app for your review",
      "/estimates/r1/review",
    ],
    [
      "CHANGES_REQUESTED",
      "Changes requested on Field service app by Dev Tech Lead",
      "/estimates/r1",
    ],
    ["APPROVED", "Field service app approved by Dev Tech Lead", "/estimates/r1"],
    [
      "REFERENCE_REQUESTED",
      "Dev Tech Lead asked you for reference hours on Field service app",
      "/reviews",
    ],
    [
      "REFERENCE_ADDED",
      "Dev Tech Lead added reference hours for Field service app",
      "/estimates/r1/estimate",
    ],
    [
      "REFERENCE_DECLINED",
      "Dev Tech Lead declined a request for reference hours on Field service app",
      "/estimates/r1/estimate",
    ],
  ])("%s", (kind, text, link) => {
    expect(updateText({ ...n, kind })).toBe(text);
    expect(updateLink({ ...n, kind })).toBe(link);
  });
});

import { describe, expect, it } from "vitest";
import { normalizeTitle, PROPOSE_AT, similarity } from "./similarity";

describe("similarity", () => {
  it("is 1 for names equal after normalizing", () => {
    expect(similarity("User Login", " user   login ")).toBe(1);
    expect(similarity("Sign up & sign in", "sign up and sign in")).toBe(1);
  });

  it("proposes the brief's renamed example", () => {
    expect(similarity("User login", "User Login + OTP")).toBeGreaterThanOrEqual(PROPOSE_AT);
    expect(similarity("Booking API", "Booking APIs")).toBeGreaterThanOrEqual(PROPOSE_AT);
  });

  it("doesn't propose unrelated names", () => {
    expect(similarity("Booking API", "Lab results")).toBeLessThan(PROPOSE_AT);
    expect(similarity("Image uploader", "Data migration")).toBeLessThan(PROPOSE_AT);
    expect(similarity("", "Anything")).toBe(0);
  });

  it("normalizes punctuation and spacing", () => {
    expect(normalizeTitle("  Sign-up / Sign-in (Web) ")).toBe("sign up sign in web");
  });
});

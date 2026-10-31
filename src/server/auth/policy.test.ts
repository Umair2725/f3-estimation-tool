import { describe, expect, it } from "vitest";
import { decideRole, isAllowedIdentity, isFolio3Email, safeNextPath } from "./policy";

describe("isAllowedIdentity", () => {
  it("accepts a verified @folio3.com account", () => {
    expect(isAllowedIdentity({ email: "sara.a@folio3.com", emailVerified: true })).toBe(true);
    expect(isAllowedIdentity({ email: "Sara.A@Folio3.com", emailVerified: true })).toBe(true);
  });

  it("refuses other domains, look-alikes and unverified emails", () => {
    for (const email of [
      "someone@gmail.com",
      "x@folio3.com.evil.io",
      "x@notfolio3.com",
      "x@sub.folio3.com",
      "folio3.com",
    ]) {
      expect(isAllowedIdentity({ email, emailVerified: true })).toBe(false);
    }
    expect(isAllowedIdentity({ email: "sara.a@folio3.com", emailVerified: false })).toBe(false);
    expect(isAllowedIdentity({ email: "sara.a@folio3.com", emailVerified: null })).toBe(false);
    expect(isAllowedIdentity({ email: null, emailVerified: true })).toBe(false);
  });

  it("isFolio3Email trims and ignores case", () => {
    expect(isFolio3Email("  KhanUmair@FOLIO3.com ")).toBe(true);
  });
});

describe("decideRole", () => {
  const admins = ["khanumair@folio3.com"];

  it("makes ADMIN_EMAILS people Admin, ignoring case and spaces", () => {
    expect(
      decideRole({
        email: " KhanUmair@Folio3.com",
        currentRole: null,
        adminEmails: [" KHANUMAIR@folio3.com "],
        invitationRole: null,
      }),
    ).toEqual({ role: "ADMIN", consumeInvitation: false });
  });

  it("uses and consumes an invitation", () => {
    expect(
      decideRole({
        email: "sara.a@folio3.com",
        currentRole: null,
        adminEmails: admins,
        invitationRole: "TECH_LEAD",
      }),
    ).toEqual({ role: "TECH_LEAD", consumeInvitation: true });
  });

  it("prefers ADMIN_EMAILS over an invitation, and clears the invitation", () => {
    expect(
      decideRole({
        email: "khanumair@folio3.com",
        currentRole: null,
        adminEmails: admins,
        invitationRole: "ESTIMATOR",
      }),
    ).toEqual({ role: "ADMIN", consumeInvitation: true });
  });

  it("leaves people without an invitation waiting for a role", () => {
    expect(
      decideRole({
        email: "new.person@folio3.com",
        currentRole: null,
        adminEmails: admins,
        invitationRole: null,
      }),
    ).toEqual({ role: null, consumeInvitation: false });
  });

  it("never changes an existing role (removing someone from ADMIN_EMAILS doesn't demote them)", () => {
    expect(
      decideRole({
        email: "khanumair@folio3.com",
        currentRole: "ADMIN",
        adminEmails: [],
        invitationRole: null,
      }),
    ).toEqual({ role: "ADMIN", consumeInvitation: false });
    expect(
      decideRole({
        email: "sara.a@folio3.com",
        currentRole: "ESTIMATOR",
        adminEmails: ["sara.a@folio3.com"],
        invitationRole: "ARCHITECT",
      }),
    ).toEqual({ role: "ESTIMATOR", consumeInvitation: false });
  });
});

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/settings/people")).toBe("/settings/people");
    expect(safeNextPath("/estimates?status=draft#top")).toBe("/estimates?status=draft#top");
    // Percent-encoded text stays encoded, so it can't inject headers.
    expect(safeNextPath("/%0d%0aSet-Cookie:x")).toBe("/%0d%0aSet-Cookie:x");
  });

  it("falls back to / for anything that could leave the site", () => {
    for (const next of [
      null,
      undefined,
      "",
      "settings",
      "//evil.com",
      "///evil.com",
      "https://evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\u0000x",
      "/\r\nSet-Cookie:x",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(next as string)).toBe("/");
    }
  });
});

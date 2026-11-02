import { describe, expect, it } from "vitest";
import { absoluteLink, renderEmail, type EmailContent } from "./templates";

const base = "http://localhost:3000/";
const update = { actorName: "Dev Estimator", projectName: "Field service app", requestId: "r1" };

describe("renderEmail", () => {
  it("names who acted and links to the review page on submit", () => {
    const email = renderEmail({ kind: "SUBMITTED", ...update }, base);
    expect(email.subject).toBe("Dev Estimator submitted Field service app for your review");
    expect(email.text).toContain("http://localhost:3000/estimates/r1/review");
    expect(email.html).toContain('href="http://localhost:3000/estimates/r1/review"');
  });

  it("quotes the changes comment", () => {
    const email = renderEmail(
      {
        kind: "CHANGES_REQUESTED",
        ...update,
        actorName: "Dev Tech Lead",
        detail: "Split the sync Task",
      },
      base,
    );
    expect(email.subject).toBe("Changes requested on Field service app by Dev Tech Lead");
    expect(email.text).toContain("Comment: Split the sync Task");
    expect(email.text).toContain("http://localhost:3000/estimates/r1\n");
  });

  it("gives the decline reason and links to the Estimate tab", () => {
    const email = renderEmail(
      { kind: "REFERENCE_DECLINED", ...update, detail: "Too vague, needs the client's sync rules" },
      base,
    );
    expect(email.text).toContain("Reason: Too vague, needs the client's sync rules");
    expect(email.text).toContain("/estimates/r1/estimate");
    expect(email.html).toContain("Too vague, needs the client&#39;s sync rules");
  });

  it("covers approved and the other reference updates", () => {
    expect(renderEmail({ kind: "APPROVED", ...update }, base).subject).toBe(
      "Field service app approved by Dev Estimator",
    );
    expect(renderEmail({ kind: "REFERENCE_REQUESTED", ...update }, base).text).toContain(
      "http://localhost:3000/reviews",
    );
    expect(renderEmail({ kind: "REFERENCE_ADDED", ...update }, base).subject).toBe(
      "Dev Estimator added reference hours for Field service app",
    );
  });

  it("invites with a plain sign-in link and no token", () => {
    const email = renderEmail(
      { kind: "INVITATION", inviterName: "Dev Admin", roleLabel: "Tech Lead" },
      base,
    );
    expect(email.subject).toBe("Dev Admin invited you to the F3 Estimation Tool as Tech Lead");
    expect(email.text).toContain("Sign in with Google: http://localhost:3000/sign-in\n");
    expect(email.html).toContain('href="http://localhost:3000/sign-in"');
  });

  it("tells a person they now have access", () => {
    const email = renderEmail({ kind: "ACCESS_GRANTED", roleLabel: "Estimator" }, base);
    expect(email.subject).toBe("You now have access to the F3 Estimation Tool as Estimator");
  });

  it("escapes everything that goes into the HTML", () => {
    const email = renderEmail(
      { kind: "APPROVED", ...update, projectName: '<script>alert("x")</script>' },
      base,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("takes no hours, rates or totals", () => {
    const inputs: EmailContent[] = [
      { kind: "APPROVED", ...update },
      { kind: "INVITATION", inviterName: "A", roleLabel: "Estimator" },
    ];
    for (const input of inputs) {
      expect(Object.keys(input).some((k) => /hour|rate|total/i.test(k))).toBe(false);
    }
  });
});

describe("absoluteLink", () => {
  it("joins with exactly one slash", () => {
    expect(absoluteLink("https://estimates.folio3.com", "/reviews")).toBe(
      "https://estimates.folio3.com/reviews",
    );
    expect(absoluteLink("https://estimates.folio3.com//", "reviews")).toBe(
      "https://estimates.folio3.com/reviews",
    );
  });
});

import { describe, expect, it } from "vitest";
import { docxSections } from "./docx-sections";

describe("docxSections", () => {
  it("splits at headings, with text before the first heading as Start", () => {
    expect(
      docxSections(
        "<p>Intro</p><h1>Booking</h1><p>Patients book visits.</p><h2>Billing</h2><p>Pay</p>",
      ),
    ).toEqual([
      { heading: "Start", text: "Intro" },
      { heading: "Booking", text: "Patients book visits." },
      { heading: "Billing", text: "Pay" },
    ]);
  });

  it("keeps a heading with text under it that names another feature", () => {
    // The sample SOW: "Sign up" is Heading 1, "Forgot password" a plain paragraph.
    expect(docxSections("<h1>Sign up</h1><p>Forgot password</p>")).toEqual([
      { heading: "Sign up", text: "Forgot password" },
    ]);
  });

  it("keeps headings that have no text under them", () => {
    expect(docxSections("<h1>Sign up</h1><h1>Forgot password</h1>")).toEqual([
      { heading: "Sign up", text: "" },
      { heading: "Forgot password", text: "" },
    ]);
    expect(docxSections("<h1>Sign up</h1><p>Email and password</p><h2>Reports</h2>")).toEqual([
      { heading: "Sign up", text: "Email and password" },
      { heading: "Reports", text: "" },
    ]);
  });

  it("gives one empty Start section for an empty document", () => {
    expect(docxSections("")).toEqual([{ heading: "Start", text: "" }]);
    expect(docxSections("<p>Only text</p>")).toEqual([{ heading: "Start", text: "Only text" }]);
  });
});

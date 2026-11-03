import { describe, expect, it } from "vitest";
import { isScannedPage, normalize, quoteFound, type TextLayer } from "./quotes";

const pdf: TextLayer = {
  kind: "pdf",
  pages: [
    "Northwind Clinics — Request for Proposal",
    "",
    "Patients book appointments on-\nline and receive “smart” reminders.",
    "The portal must be hosted on AWS and meet HIPAA.",
  ],
};

const docx: TextLayer = {
  kind: "docx",
  sections: [
    { heading: "Scope", text: "Machine inputs, general inputs and capex inputs." },
    { heading: "Reports", text: "Monthly, quarterly and annual reports." },
  ],
};

describe("normalize", () => {
  it("unifies quotes, dashes, hyphenation and spaces", () => {
    expect(normalize("On-\nline “smart”  reminders – today")).toBe(
      'online "smart" reminders - today',
    );
  });
});

describe("quoteFound", () => {
  it("finds a quote across curly quotes and line-end hyphenation", () => {
    expect(
      quoteFound(pdf, {
        page: 3,
        section: null,
        quote: 'Patients book appointments online and receive "smart" reminders',
      }),
    ).toBe(true);
  });

  it("accepts a quote one page off, but not two", () => {
    expect(quoteFound(pdf, { page: 3, section: null, quote: "hosted on AWS" })).toBe(true);
    expect(quoteFound(pdf, { page: 1, section: null, quote: "hosted on AWS" })).toBe(false);
  });

  it("ignores missing punctuation", () => {
    expect(quoteFound(pdf, { page: 4, section: null, quote: "hosted on AWS and meet HIPAA" })).toBe(
      true,
    );
    expect(quoteFound(pdf, { page: 4, section: null, quote: "The portal must, be hosted" })).toBe(
      true,
    );
  });

  it("returns false for a quote that isn't there or a scanned page", () => {
    expect(quoteFound(pdf, { page: 4, section: null, quote: "runs on Azure" })).toBe(false);
    expect(quoteFound(pdf, { page: 2, section: null, quote: "anything" })).toBe(false);
  });

  it("checks a DOCX section first, then the whole document", () => {
    expect(quoteFound(docx, { page: null, section: "Scope", quote: "capex inputs" })).toBe(true);
    expect(quoteFound(docx, { page: null, section: "Scope", quote: "annual reports" })).toBe(true);
    expect(quoteFound(docx, { page: null, section: "Scope", quote: "weekly reports" })).toBe(false);
  });
});

describe("isScannedPage", () => {
  it("treats a page with almost no text as scanned", () => {
    expect(isScannedPage(pdf, 2)).toBe(true);
    expect(isScannedPage(pdf, 3)).toBe(false);
    expect(isScannedPage(docx, null)).toBe(false);
  });
});

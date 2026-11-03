import { describe, expect, it } from "vitest";
import { proposalCounts, ReadingSchema, toProposal, type Reading } from "./proposal";

const cite = (page: number, quote: string) => ({ page, section: null, quote });

export const sampleReading: Reading = {
  features: [
    {
      name: "Appointment booking",
      description: "Patients book, move and cancel visits",
      parts: ["WEB_FRONTEND", "BACKEND"],
      needsConfirmation: false,
      cite: cite(4, "Patients book appointments online"),
    },
  ],
  details: {
    projectName: null,
    client: {
      value: "Northwind Clinics",
      needsConfirmation: false,
      cite: cite(1, "Northwind Clinics"),
    },
    applicationTypes: {
      values: ["Web", "Mobile"],
      needsConfirmation: false,
      cite: cite(2, "a web portal and an iOS app"),
    },
    operatingSystems: null,
    browsers: null,
    hosting: { values: ["AWS"], needsConfirmation: false, cite: cite(9, "hosted on AWS") },
    environments: null,
    appStores: null,
    compliance: { values: ["HIPAA"], needsConfirmation: false, cite: cite(9, "HIPAA") },
    parts: [
      {
        part: "BACKEND",
        technologies: ["Node.js"],
        note: null,
        needsConfirmation: true,
        cite: cite(9, "Node.js"),
      },
    ],
    nfr: [],
  },
  assumptions: [],
  risks: [
    {
      part: "BACKEND",
      text: "Records system not named",
      needsConfirmation: true,
      cite: cite(7, "the clinic's records system"),
    },
  ],
  questions: [
    {
      text: "Which records system must the portal integrate with?",
      needsConfirmation: false,
      cite: cite(7, "the clinic's records system"),
    },
  ],
};

describe("ReadingSchema", () => {
  it("accepts a valid reading", () => {
    expect(ReadingSchema.parse(sampleReading)).toEqual(sampleReading);
  });

  it("rejects unknown detail values and over-long quotes", () => {
    const badHosting = structuredClone(sampleReading);
    (badHosting.details.hosting as { values: string[] }).values = ["Heroku"];
    expect(ReadingSchema.safeParse(badHosting).success).toBe(false);
    const longQuote = structuredClone(sampleReading);
    longQuote.features[0].cite.quote = "x".repeat(201);
    expect(ReadingSchema.safeParse(longQuote).success).toBe(false);
  });

  it("rejects a feature without parts", () => {
    const noParts = structuredClone(sampleReading);
    noParts.features[0].parts = [];
    expect(ReadingSchema.safeParse(noParts).success).toBe(false);
  });
});

describe("toProposal", () => {
  it("gives every item an id, trims quotes and records the quote check", () => {
    const p = toProposal(sampleReading, (c) => c.page !== 7, "r1");
    expect(p.features[0]).toMatchObject({ id: "r1:feature:0", cite: { checked: true } });
    expect(p.details.client?.id).toBe("r1:client:0");
    expect(p.questions[0].cite.checked).toBe(false);
    expect(proposalCounts(p)).toEqual({
      features: 1,
      details: 5,
      assumptions: 0,
      risks: 1,
      questions: 1,
    });
  });
});

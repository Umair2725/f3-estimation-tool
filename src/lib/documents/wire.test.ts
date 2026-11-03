import { describe, expect, it } from "vitest";
import { fromWire, WireSchema, type Wire } from "./wire";

const pdf = (page: number, quote: string, needsConfirmation = false) => ({
  page,
  section: "",
  quote,
  needsConfirmation,
});
const docx = (section: string, quote: string) => ({
  page: 0,
  section,
  quote,
  needsConfirmation: false,
});

const wire: Wire = {
  features: [
    {
      name: "  Appointment   booking ",
      description: "Patients book online",
      parts: ["WEB_FRONTEND", "BACKEND", "BACKEND"],
      cite: pdf(3, "Patients book appointments online"),
    },
    { name: "No quote", description: "", parts: ["BACKEND"], cite: pdf(3, " ") },
    { name: "No part", description: "", parts: [], cite: pdf(3, "x") },
  ],
  details: [
    { field: "client", values: ["Northwind Clinics"], cite: pdf(1, "Northwind Clinics") },
    { field: "hosting", values: ["aws", "Heroku"], cite: pdf(10, "hosted on AWS") },
    { field: "hosting", values: ["Azure"], cite: pdf(10, "or Azure") },
    { field: "compliance", values: ["hipaa", "soc2"], cite: pdf(10, "HIPAA", true) },
    { field: "browsers", values: ["Opera"], cite: pdf(6, "Opera") },
  ],
  parts: [
    { part: "BACKEND", technologies: ["Node.js", "Node.js"], note: "", cite: pdf(10, "Node") },
  ],
  nfr: [{ area: "performance", note: "500 concurrent patients", cite: pdf(11, "500") }],
  notes: [
    {
      kind: "assumption",
      part: "BACKEND",
      text: "Test data provided",
      cite: docx("Scope", "test"),
    },
    { kind: "risk", part: "BACKEND", text: "Records system unnamed", cite: pdf(7, "records") },
  ],
  questions: [{ text: "Which records system?", cite: pdf(7, "records system") }],
};

describe("fromWire", () => {
  const reading = fromWire(WireSchema.parse(wire));

  it("cleans features and drops ones with no quote, name or part", () => {
    expect(reading.features).toEqual([
      {
        name: "Appointment booking",
        description: "Patients book online",
        parts: ["WEB_FRONTEND", "BACKEND"],
        needsConfirmation: false,
        cite: { page: 3, section: null, quote: "Patients book appointments online" },
      },
    ]);
  });

  it("maps detail values to allowed ones, drops unknown values, and keeps the first entry", () => {
    expect(reading.details.client?.value).toBe("Northwind Clinics");
    expect(reading.details.hosting?.values).toEqual(["AWS"]);
    expect(reading.details.compliance).toMatchObject({
      values: ["HIPAA", "SOC 2"],
      needsConfirmation: true,
    });
    // Only unknown values: no detail at all.
    expect(reading.details.browsers).toBeNull();
    expect(reading.details.parts[0]).toMatchObject({ technologies: ["Node.js"], note: null });
    expect(reading.details.nfr[0]).toMatchObject({ area: "performance" });
  });

  it("splits notes into assumptions and risks, and turns page 0 into a Word section", () => {
    expect(reading.assumptions[0]).toMatchObject({
      text: "Test data provided",
      cite: { page: null, section: "Scope" },
    });
    expect(reading.risks.map((r) => r.text)).toEqual(["Records system unnamed"]);
    expect(reading.questions).toHaveLength(1);
  });

  it("shortens over-long quotes instead of failing", () => {
    const long = structuredClone(wire);
    long.questions[0].cite.quote = "q".repeat(500);
    expect(fromWire(long).questions[0].cite.quote).toHaveLength(200);
  });
});

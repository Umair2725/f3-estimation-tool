import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Reading } from "@/lib/documents/proposal";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import {
  addClientQuestion,
  editClientQuestion,
  listClientQuestions,
  QUESTION_REQUIRED,
  removeClientQuestion,
} from "@/server/client-questions";
import { getDb } from "@/server/db";
import { createRequest, deleteRequest, saveStep } from "@/server/estimation-requests";
import { exportInternal } from "@/server/export/export";
import {
  buildDocx,
  buildNonDocxZip,
  buildPdf,
  sampleRfpSections,
} from "../../../test/fixtures/documents";
import { createUser, deleteUsers } from "../../../test/factories";
import { applyDocument, getDocumentReview } from "./apply";
import {
  getDocumentFile,
  listDocuments,
  removeDocument,
  TOO_LARGE,
  uploadDocument,
  WRONG_TYPE,
} from "./files";
import { readDocumentSoftly, setDocumentReaderForTests, startReading } from "./read";

// specs/requirement-documents and specs/client-questions, with a fake reader (no Claude calls).

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterEach(() => setDocumentReaderForTests(undefined));
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

async function draft(owner: CurrentUser) {
  const { id } = await createRequest(owner, {
    projectName: `Docs ${tag}`,
    clientName: `Contoso ${tag}`,
    projectDate: "2026-11-02",
  });
  await saveStep(owner, id, 2, {
    applicationTypes: ["Web"],
    operatingSystems: [],
    browsers: [],
    parts: [{ part: "WEB_FRONTEND", technologyIds: [tech["React"]] }],
  });
  await saveStep(owner, id, 3, { hosting: ["Azure"], environments: [], compliance: [] });
  await saveStep(owner, id, 4, {
    features: [{ name: "User login", description: "", parts: ["WEB_FRONTEND"] }],
  });
  return id;
}

const cite = (page: number | null, section: string | null, quote: string) => ({
  page,
  section,
  quote,
});

/** What the fake reader returns for the sample DOCX. */
function fakeReading(): Reading {
  const s = (section: string, quote: string) => cite(null, section, quote);
  return {
    features: [
      {
        name: "Appointment booking",
        description: "Online booking",
        parts: ["WEB_FRONTEND", "BACKEND"],
        needsConfirmation: false,
        cite: s("Appointment booking", "Patients book appointments online."),
      },
      {
        name: "Visit reminders",
        description: "SMS a day before",
        parts: ["BACKEND"],
        needsConfirmation: true,
        cite: s("Visit reminders", "SMS reminders a day before"),
      },
      {
        name: "user login",
        description: "",
        parts: ["WEB_FRONTEND"],
        needsConfirmation: false,
        cite: s("Appointment booking", "not in the document"),
      },
    ],
    details: {
      projectName: null,
      client: null,
      applicationTypes: null,
      operatingSystems: { values: ["iOS"], needsConfirmation: false, cite: s("Hosting", "AWS") },
      browsers: null,
      hosting: { values: ["AWS"], needsConfirmation: false, cite: s("Hosting", "hosted on AWS") },
      environments: null,
      appStores: null,
      compliance: { values: ["HIPAA"], needsConfirmation: false, cite: s("Hosting", "HIPAA") },
      parts: [
        {
          part: "BACKEND",
          technologies: ["Node.js", "Elixir"],
          note: null,
          needsConfirmation: false,
          cite: s("Hosting", "portal"),
        },
      ],
      nfr: [
        {
          area: "security",
          note: "Pen test",
          needsConfirmation: false,
          cite: s("Hosting", "HIPAA"),
        },
      ],
    },
    assumptions: [
      {
        part: "BACKEND",
        text: "The clinic provides test patient data.",
        needsConfirmation: false,
        cite: s("Assumptions", "The clinic provides test patient data."),
      },
    ],
    risks: [],
    questions: [
      {
        text: "Which records system must the portal integrate with?",
        needsConfirmation: false,
        cite: s("Questions", "Which records system"),
      },
    ],
  };
}

async function readyDocument(owner: CurrentUser, id: string) {
  setDocumentReaderForTests(async () => ({ reading: fakeReading(), model: "fake" }));
  const docx = await buildDocx(sampleRfpSections());
  const doc = await uploadDocument(owner, id, {
    fileName: "Clinic RFP.docx",
    kind: "CLIENT_REQUIREMENTS",
    bytes: docx,
  });
  await readDocumentSoftly(doc.id);
  return doc.id;
}

describe("upload (specs/requirement-documents)", () => {
  it("stores a PDF with its pages and a DOCX with its sections", async () => {
    const owner = await person();
    const id = await draft(owner);
    setDocumentReaderForTests(null);
    const pdf = buildPdf(["Clinic RFP", "", "Hosted on AWS"]);
    await uploadDocument(owner, id, {
      fileName: "Clinic RFP.pdf",
      kind: "CLIENT_REQUIREMENTS",
      bytes: pdf,
    });
    await uploadDocument(owner, id, {
      fileName: "Clinic RFP.pdf",
      kind: "FOLIO3_SOW",
      bytes: await buildDocx(sampleRfpSections()),
    });
    const docs = await listDocuments(owner, id);
    expect(
      docs.map((d) => [d.fileName, d.format, d.pageCount, d.status, d.uploadedByName]),
    ).toEqual([
      ["Clinic RFP.pdf", "PDF", 3, "NOT_SET_UP", owner.name],
      ["Clinic RFP.pdf", "DOCX", 5, "NOT_SET_UP", owner.name],
    ]);
  });

  it("refuses other types and files over 25 MB, storing nothing", async () => {
    const owner = await person();
    const id = await draft(owner);
    const upload = (bytes: Uint8Array, fileName = "x.pdf") =>
      uploadDocument(owner, id, { fileName, kind: "CLIENT_REQUIREMENTS", bytes });
    await expect(upload(await buildNonDocxZip(), "notes.xlsx")).rejects.toThrow(WRONG_TYPE);
    await expect(upload(new TextEncoder().encode("just text"), "renamed.pdf")).rejects.toThrow(
      WRONG_TYPE,
    );
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-"));
    await expect(upload(big, "scan.pdf")).rejects.toThrow(TOO_LARGE);
    expect(await listDocuments(owner, id)).toEqual([]);
  });

  it("lets a view-only person download but not upload or remove", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await draft(owner);
    const docId = await readyDocument(owner, id);
    expect((await getDocumentFile(lead, docId)).fileName).toBe("Clinic RFP.docx");
    await expect(
      uploadDocument(lead, id, {
        fileName: "a.pdf",
        kind: "CLIENT_REQUIREMENTS",
        bytes: buildPdf(["x"]),
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(removeDocument(lead, docId)).rejects.toMatchObject({ status: 403 });
    await removeDocument(owner, docId);
    expect(await listDocuments(owner, id)).toEqual([]);
  });

  it("deletes documents and questions with their request", async () => {
    const owner = await person();
    const id = await draft(owner);
    await readyDocument(owner, id);
    await addClientQuestion(owner, id, "Is SSO required?");
    await deleteRequest(owner, id);
    expect(await getDb().requestDocument.count({ where: { requestId: id } })).toBe(0);
    expect(await getDb().clientQuestion.count({ where: { requestId: id } })).toBe(0);
  });
});

describe("reading", () => {
  it("is ready to review with counts, checking quotes against the document", async () => {
    const owner = await person();
    const id = await draft(owner);
    await readyDocument(owner, id);
    const [doc] = await listDocuments(owner, id);
    expect(doc).toMatchObject({
      status: "READY",
      counts: { features: 3, details: 5, assumptions: 1, risks: 0, questions: 1 },
    });
    const { review } = await getDocumentReview(owner, id, doc.id);
    const checked = Object.fromEntries(review!.features.map((f) => [f.name, f.cites[0].checked]));
    expect(checked).toEqual({
      "Appointment booking": true,
      "Visit reminders": true,
      "user login": false,
    });
  });

  it("fails with a reason, then reads again", async () => {
    const owner = await person();
    const id = await draft(owner);
    setDocumentReaderForTests(async () => {
      throw new Error("Claude returned no usable answer");
    });
    const doc = await uploadDocument(owner, id, {
      fileName: "rfp.pdf",
      kind: "CLIENT_REQUIREMENTS",
      bytes: buildPdf(["Booking"]),
    });
    expect(doc.status).toBe("READING");
    await readDocumentSoftly(doc.id);
    expect((await listDocuments(owner, id))[0]).toMatchObject({
      status: "FAILED",
      error: "Claude returned no usable answer",
    });
    setDocumentReaderForTests(async () => ({ reading: fakeReading(), model: "fake" }));
    await startReading(owner, doc.id);
    expect((await listDocuments(owner, id))[0].status).toBe("READING");
    await readDocumentSoftly(doc.id);
    expect((await listDocuments(owner, id))[0].status).toBe("READY");
  });

  it("shows a read stuck for over 10 minutes as failed", async () => {
    const owner = await person();
    const id = await draft(owner);
    setDocumentReaderForTests(async () => ({ reading: fakeReading(), model: "fake" }));
    const doc = await uploadDocument(owner, id, {
      fileName: "rfp.pdf",
      kind: "CLIENT_REQUIREMENTS",
      bytes: buildPdf(["Booking"]),
    });
    await getDb().requestDocument.update({
      where: { id: doc.id },
      data: { readStartedAt: new Date(Date.now() - 11 * 60_000) },
    });
    expect((await listDocuments(owner, id))[0]).toMatchObject({
      status: "FAILED",
      error: "Reading took too long. Read it again.",
    });
  });
});

describe("add to request", () => {
  async function selectionFor(owner: CurrentUser, id: string, docId: string) {
    const { review } = await getDocumentReview(owner, id, docId);
    const r = review!;
    const features = r.features.filter((f) => f.selected);
    const lists = Object.fromEntries(
      r.lists.filter((l) => l.selected).map((l) => [l.field, l.values]),
    );
    return {
      review: r,
      selection: {
        itemIds: [
          ...features.flatMap((f) => f.itemIds),
          ...r.lists.filter((l) => l.selected).map((l) => l.id),
          ...r.parts.map((p) => p.id),
          ...r.assumptions.map((a) => a.id),
          ...r.questions.map((q) => q.id),
        ],
        features: features.map((f) => ({
          name: f.name,
          description: f.description,
          parts: f.parts,
        })),
        lists,
        parts: r.parts.map((p) => ({
          part: p.part,
          technologyIds: p.technologies.map((t) => t.id),
          note: p.note,
        })),
        nfr: r.nfr.map((n) => ({ area: n.area, note: n.note })),
        assumptions: r.assumptions.map((a) => ({ part: a.part, text: a.text })),
        questions: r.questions.map((q) => ({
          text: q.text,
          source: { page: q.cite.page, section: q.cite.section, quote: q.cite.quote },
        })),
      },
    };
  }

  it("adds the ticked items, keeps filled-in values unless chosen, and matches the new Tasks", async () => {
    const owner = await person();
    const id = await draft(owner);
    const docId = await readyDocument(owner, id);
    const { review, selection } = await selectionFor(owner, id, docId);
    // The duplicate "user login" and Azure → AWS hosting start unticked.
    expect(review.features.find((f) => f.name === "user login")?.selected).toBe(false);
    expect(review.lists.find((l) => l.field === "hosting")?.selected).toBe(false);

    expect(await applyDocument(owner, id, docId, selection)).toMatchObject({
      features: 2,
      assumptions: 1,
      questions: 1,
    });
    const db = getDb();
    const request = await db.estimationRequest.findUniqueOrThrow({
      where: { id },
      include: {
        features: { orderBy: { position: "asc" } },
        parts: { include: { technologies: true } },
      },
    });
    expect(request.features.map((f) => f.name)).toEqual([
      "User login",
      "Appointment booking",
      "Visit reminders",
    ]);
    expect(request.operatingSystems).toEqual(["iOS"]);
    const considerations = request.considerations as {
      hosting: string[];
      compliance: string[];
      other: string;
      nfr: { security?: { enabled: boolean; note: string } };
    };
    expect(considerations.hosting).toEqual(["Azure"]);
    expect(considerations.compliance).toEqual(["HIPAA"]);
    expect(considerations.nfr.security).toEqual({ enabled: true, note: "Pen test" });
    expect(considerations.other).toContain(
      "Backend: Document asks for Elixir (not in the catalog)",
    );
    const backend = request.parts.find((p) => p.part === "BACKEND")!;
    expect(backend.technologies.map((t) => t.technologyId)).toEqual([tech["Node.js"]]);
    expect(backend.assumptions).toEqual(["The clinic provides test patient data."]);

    const { questions } = await listClientQuestions(owner, id);
    expect(questions).toEqual([
      {
        id: expect.any(String),
        text: "Which records system must the portal integrate with?",
        source: expect.objectContaining({ fileName: "Clinic RFP.docx", section: "Questions" }),
      },
    ]);

    // Tasks for the new features exist and were matched.
    const tasks = await db.estimateTask.findMany({
      where: {
        feature: { requestId: id, name: { in: ["Appointment booking", "Visit reminders"] } },
      },
      include: { suggestion: true },
    });
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.suggestion)).toBe(true);

    // Reviewing again shows them as added and unticked.
    const again = (await getDocumentReview(owner, id, docId)).review!;
    expect(again.features.find((f) => f.name === "Appointment booking")).toMatchObject({
      added: true,
      selected: false,
    });
    expect((await listDocuments(owner, id))[0].addedByName).toBe(owner.name);
  });

  it("refuses while the request is in review and changes nothing", async () => {
    const owner = await person();
    const id = await draft(owner);
    const docId = await readyDocument(owner, id);
    const { selection } = await selectionFor(owner, id, docId);
    await getDb().estimationRequest.update({ where: { id }, data: { status: "IN_REVIEW" } });
    await expect(applyDocument(owner, id, docId, selection)).rejects.toThrow(
      "This request can no longer be edited",
    );
    expect(await getDb().feature.count({ where: { requestId: id } })).toBe(1);
  });

  it("refuses an invalid selection", async () => {
    const owner = await person();
    const id = await draft(owner);
    const docId = await readyDocument(owner, id);
    await expect(
      applyDocument(owner, id, docId, {
        itemIds: [],
        features: [{ name: "X", description: "", parts: [] }],
      }),
    ).rejects.toThrow("Choose at least one part");
  });
});

describe("client questions (specs/client-questions)", () => {
  it("lets editors add, edit and remove; others only see them", async () => {
    const owner = await person();
    const lead = await person("TECH_LEAD");
    const id = await draft(owner);
    await expect(addClientQuestion(owner, id, " ")).rejects.toThrow(QUESTION_REQUIRED);
    const { id: qid } = await addClientQuestion(owner, id, "Is single sign-on required?");
    await editClientQuestion(owner, qid, "Is SSO with Google required?");
    expect(await listClientQuestions(lead, id)).toEqual({
      canEdit: false,
      questions: [{ id: qid, text: "Is SSO with Google required?", source: null }],
    });
    await expect(addClientQuestion(lead, id, "x")).rejects.toMatchObject({ status: 403 });
    await expect(removeClientQuestion(lead, qid)).rejects.toMatchObject({ status: 403 });
    await removeClientQuestion(owner, qid);
    expect((await listClientQuestions(owner, id)).questions).toEqual([]);
  });

  it("keeps questions out of the export", async () => {
    const owner = await person();
    const id = await draft(owner);
    await addClientQuestion(owner, id, "Which records system?");
    const { buffer } = await exportInternal(owner, id);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).not.toContain("Questions");
  });
});

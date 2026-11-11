import "server-only";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentKind } from "@/generated/prisma/client";
import { docxSections } from "@/lib/documents/docx-sections";
import { proposalCounts, type Proposal } from "@/lib/documents/proposal";
import type { TextLayer } from "@/lib/documents/quotes";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { loadForEdit } from "@/server/estimation-requests";
import { assertAccess, ServiceError } from "@/server/service-error";
import { documentReaderAvailable, STUCK_AFTER_MS } from "./read";

// Requirement documents on a request (specs/requirement-documents "Upload requirement
// documents", "Documents stay private to the tool"). Files are checked by content, stored on the
// request and deleted with it.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const WRONG_TYPE = "Upload a PDF or Word (.docx) file";
export const TOO_LARGE = "Files can be up to 25 MB";
export const KINDS: DocumentKind[] = ["CLIENT_REQUIREMENTS", "FOLIO3_SOW"];

type Parsed = { format: "PDF" | "DOCX"; pageCount: number; textLayer: TextLayer };

async function parseFile(bytes: Uint8Array): Promise<Parsed> {
  const head = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (head === "%PDF-") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      return { format: "PDF", pageCount: totalPages, textLayer: { kind: "pdf", pages: text } };
    } catch {
      throw new ServiceError(
        "This PDF can't be opened. Check that it isn't damaged or locked.",
        400,
      );
    }
  }
  if (head.startsWith("PK")) {
    const zip = await JSZip.loadAsync(bytes).catch(() => null);
    if (zip?.file("word/document.xml")) {
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
      const sections = docxSections(value);
      return {
        format: "DOCX",
        pageCount: sections.length,
        textLayer: { kind: "docx", sections },
      };
    }
  }
  throw new ServiceError(WRONG_TYPE, 400);
}

async function loadViewable(actor: CurrentUser | null, requestId: string) {
  assertAccess(actor);
  const request = await getDb().estimationRequest.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!request) throw new ServiceError("Request not found", 404);
}

/** Stores a document after checking its content; reading starts separately (./read.ts). */
export async function uploadDocument(
  actor: CurrentUser | null,
  requestId: string,
  input: { fileName: string; kind: unknown; bytes: Uint8Array },
) {
  assertAccess(actor, "estimate.edit");
  await getDb().$transaction((tx) => loadForEdit(tx, actor, requestId));
  if (!KINDS.includes(input.kind as DocumentKind)) {
    throw new ServiceError("Say whether this is the client's requirements or a Folio3 SOW", 400);
  }
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) throw new ServiceError(TOO_LARGE, 400);
  if (input.bytes.byteLength === 0) throw new ServiceError(WRONG_TYPE, 400);
  const parsed = await parseFile(input.bytes);
  const fileName = input.fileName.trim().slice(0, 200) || `document.${parsed.format.toLowerCase()}`;
  return getDb().requestDocument.create({
    data: {
      requestId,
      fileName,
      kind: input.kind as DocumentKind,
      format: parsed.format,
      bytes: Buffer.from(input.bytes),
      sizeBytes: input.bytes.byteLength,
      fingerprint: createHash("sha256").update(input.bytes).digest("hex"),
      pageCount: parsed.pageCount,
      textLayer: parsed.textLayer,
      status: documentReaderAvailable() ? "READING" : "NOT_SET_UP",
      readStartedAt: documentReaderAvailable() ? new Date() : null,
      uploadedById: actor.id,
    },
    select: { id: true, status: true },
  });
}

export type DocumentRow = {
  id: string;
  fileName: string;
  kind: DocumentKind;
  format: "PDF" | "DOCX";
  pageCount: number;
  sizeBytes: number;
  status: "READING" | "READY" | "FAILED" | "NOT_SET_UP";
  error: string | null;
  uploadedByName: string;
  createdAt: Date;
  addedAt: Date | null;
  addedByName: string | null;
  counts: ReturnType<typeof proposalCounts> | null;
};

/** A read that started over 10 minutes ago and never finished counts as failed. */
function effectiveStatus(d: { status: DocumentRow["status"]; readStartedAt: Date | null }) {
  const stuck =
    d.status === "READING" &&
    (!d.readStartedAt || Date.now() - d.readStartedAt.getTime() > STUCK_AFTER_MS);
  return stuck
    ? { status: "FAILED" as const, error: "Reading took too long. Read it again." }
    : null;
}

export async function listDocuments(
  actor: CurrentUser | null,
  requestId: string,
): Promise<DocumentRow[]> {
  await loadViewable(actor, requestId);
  const db = getDb();
  const docs = await db.requestDocument.findMany({
    where: { requestId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fileName: true,
      kind: true,
      format: true,
      pageCount: true,
      sizeBytes: true,
      status: true,
      error: true,
      readStartedAt: true,
      uploadedById: true,
      createdAt: true,
      addedAt: true,
      addedById: true,
      proposal: true,
    },
  });
  const ids = [...new Set(docs.flatMap((d) => [d.uploadedById, d.addedById ?? ""]))];
  const people = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";
  return docs.map((d) => {
    const stuck = effectiveStatus(d);
    return {
      id: d.id,
      fileName: d.fileName,
      kind: d.kind,
      format: d.format,
      pageCount: d.pageCount,
      sizeBytes: d.sizeBytes,
      status: stuck?.status ?? d.status,
      error: stuck?.error ?? d.error,
      uploadedByName: name(d.uploadedById),
      createdAt: d.createdAt,
      addedAt: d.addedAt,
      addedByName: d.addedById ? name(d.addedById) : null,
      counts: d.status === "READY" && d.proposal ? proposalCounts(d.proposal as Proposal) : null,
    };
  });
}

/** The file itself, for anyone who can view the request. */
export async function getDocumentFile(actor: CurrentUser | null, documentId: string) {
  assertAccess(actor);
  const doc = await getDb().requestDocument.findUnique({
    where: { id: documentId },
    select: { fileName: true, format: true, bytes: true },
  });
  if (!doc) throw new ServiceError("Document not found", 404);
  return {
    fileName: doc.fileName,
    contentType:
      doc.format === "PDF"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: new Uint8Array(doc.bytes),
  };
}

/** Removes the file and its proposal; items already added stay in the request. */
export async function removeDocument(actor: CurrentUser | null, documentId: string) {
  assertAccess(actor, "estimate.edit");
  const db = getDb();
  const doc = await db.requestDocument.findUnique({
    where: { id: documentId },
    select: { requestId: true },
  });
  if (!doc) throw new ServiceError("Document not found", 404);
  await db.$transaction(async (tx) => {
    await loadForEdit(tx, actor, doc.requestId);
    await tx.requestDocument.delete({ where: { id: documentId } });
  });
}

export { effectiveStatus };

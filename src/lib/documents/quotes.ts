// Checks a proposed quote against the document's own text (specs/requirement-documents
// "Proposals cite their source"). Pure. Claude's page and quote are only trusted once found here.

/** A PDF's text per page (empty for scanned pages), or a DOCX's sections. */
export type TextLayer =
  | { kind: "pdf"; pages: string[] }
  | { kind: "docx"; sections: { heading: string; text: string }[] };

/** Below this many characters a PDF page is treated as scanned (no usable text layer). */
export const SCANNED_PAGE_CHARS = 20;

/** Lowercase, straight quotes, plain dashes, no line-end hyphenation, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same text without punctuation, so a quote that drops a comma still matches. */
function loose(text: string): string {
  return normalize(text)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(haystack: string, quote: string): boolean {
  if (!quote) return false;
  return normalize(haystack).includes(normalize(quote)) || loose(haystack).includes(loose(quote));
}

/**
 * True when the quote is on the cited page or a neighbouring one (PDF), or in the cited section
 * or anywhere in the document (DOCX). A scanned page can't be checked, so it returns false.
 */
export function quoteFound(
  layer: TextLayer,
  cite: { page: number | null; section: string | null; quote: string },
): boolean {
  if (layer.kind === "pdf") {
    if (cite.page === null) return layer.pages.some((p) => contains(p, cite.quote));
    const index = cite.page - 1;
    return [index, index - 1, index + 1].some(
      (i) => i >= 0 && i < layer.pages.length && contains(layer.pages[i], cite.quote),
    );
  }
  const section = layer.sections.find(
    (s) => cite.section !== null && normalize(s.heading) === normalize(cite.section),
  );
  if (section && contains(section.text, cite.quote)) return true;
  return layer.sections.some((s) => contains(`${s.heading}\n${s.text}`, cite.quote));
}

/** True when the cited PDF page has no usable text (a scan). */
export function isScannedPage(layer: TextLayer, page: number | null): boolean {
  if (layer.kind !== "pdf" || page === null) return false;
  const text = layer.pages[page - 1] ?? "";
  return text.replace(/\s+/g, "").length < SCANNED_PAGE_CHARS;
}

// Splits a Word document's HTML (from mammoth) into sections at its headings (specs/requirement-
// documents "Claude reads each document"). Pure.

function stripTags(html: string): string {
  return html
    .replace(/<\/(p|li|tr|h[1-6])>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * One section per heading, in order; text before the first heading is "Start". A heading with no
 * text under it is kept with empty text, since a heading on its own can name a feature.
 */
export function docxSections(html: string): { heading: string; text: string }[] {
  const sections: { heading: string; text: string }[] = [];
  const parts = html.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/);
  let heading: string | null = null;
  let body = "";
  const close = () => {
    const text = stripTags(body);
    if (heading !== null) sections.push({ heading, text });
    else if (text) sections.push({ heading: "Start", text });
  };
  for (const part of parts) {
    if (/^<h[1-6]/.test(part)) {
      close();
      heading = stripTags(part) || "Untitled section";
      body = "";
    } else body += part;
  }
  close();
  if (sections.length === 0) sections.push({ heading: "Start", text: "" });
  return sections;
}

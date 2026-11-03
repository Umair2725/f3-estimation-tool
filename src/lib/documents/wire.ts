// What Claude returns when reading a requirement document, kept deliberately flat (specs/
// requirement-documents). The API compiles the output schema into a grammar with a size limit:
// every optional object and length limit grows it, and the full `ReadingSchema` was rejected as
// "too large". So this schema has no nullable objects and no length limits, and `fromWire`
// turns it into a `Reading`, dropping values the tool doesn't allow instead of failing. Pure.
import { z } from "zod";
import {
  APP_STORES,
  APPLICATION_TYPES,
  BROWSERS,
  COMPLIANCE,
  ENVIRONMENTS,
  HOSTING,
  NFR_AREAS,
  OPERATING_SYSTEMS,
  PART_VALUES,
  type NfrKey,
  type Part,
} from "@/lib/estimation/options";
import { MAX_QUOTE, ReadingSchema, type ListDetailKey, type Reading } from "./proposal";

const DETAIL_FIELDS = [
  "projectName",
  "client",
  "applicationTypes",
  "operatingSystems",
  "browsers",
  "hosting",
  "environments",
  "appStores",
  "compliance",
] as const;
const NFR_KEYS = NFR_AREAS.map((a) => a.key) as [NfrKey, ...NfrKey[]];

const wireCite = z.object({
  /** 1-based PDF page, or 0 for a Word document. */
  page: z.number().int(),
  /** Word section heading, or "" for a PDF. */
  section: z.string(),
  quote: z.string(),
  needsConfirmation: z.boolean(),
});

export const WireSchema = z.object({
  features: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parts: z.array(z.enum(PART_VALUES)),
      cite: wireCite,
    }),
  ),
  details: z.array(
    z.object({
      field: z.enum(DETAIL_FIELDS),
      /** One value for projectName and client; the allowed values for the other fields. */
      values: z.array(z.string()),
      cite: wireCite,
    }),
  ),
  parts: z.array(
    z.object({
      part: z.enum(PART_VALUES),
      technologies: z.array(z.string()),
      note: z.string(),
      cite: wireCite,
    }),
  ),
  nfr: z.array(z.object({ area: z.enum(NFR_KEYS), note: z.string(), cite: wireCite })),
  notes: z.array(
    z.object({
      kind: z.enum(["assumption", "risk"]),
      part: z.enum(PART_VALUES),
      text: z.string(),
      cite: wireCite,
    }),
  ),
  questions: z.array(z.object({ text: z.string(), cite: wireCite })),
});
export type Wire = z.infer<typeof WireSchema>;

const ALLOWED: Record<ListDetailKey, readonly string[]> = {
  applicationTypes: APPLICATION_TYPES,
  operatingSystems: OPERATING_SYSTEMS,
  browsers: BROWSERS,
  hosting: HOSTING,
  environments: ENVIRONMENTS,
  appStores: APP_STORES,
  compliance: COMPLIANCE,
};

const clip = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);

function toCite(c: Wire["features"][number]["cite"]) {
  return {
    needsConfirmation: c.needsConfirmation,
    cite: {
      page: c.page >= 1 ? c.page : null,
      section: c.page >= 1 ? null : clip(c.section, 200) || null,
      quote: clip(c.quote, MAX_QUOTE),
    },
  };
}

/** Matches a value to an allowed one, ignoring letter case and spaces ("soc2" → "SOC 2"). */
function allowedValue(field: ListDetailKey, value: string): string | null {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ALLOWED[field].find((a) => key(a) === key(value)) ?? null;
}

/**
 * Turns Claude's flat answer into a `Reading`. Items with no quote, features with no name or no
 * part, and values the tool doesn't allow are dropped; the first entry wins for each detail.
 */
export function fromWire(wire: Wire): Reading {
  const hasQuote = (c: { quote: string }) => c.quote.trim().length > 0;
  const details: Reading["details"] = {
    projectName: null,
    client: null,
    applicationTypes: null,
    operatingSystems: null,
    browsers: null,
    hosting: null,
    environments: null,
    appStores: null,
    compliance: null,
    parts: [],
    nfr: [],
  };
  for (const d of wire.details) {
    if (!hasQuote(d.cite) || details[d.field]) continue;
    if (d.field === "projectName" || d.field === "client") {
      const value = clip(d.values[0] ?? "", 200);
      if (value) details[d.field] = { value, ...toCite(d.cite) };
      continue;
    }
    const field = d.field;
    const values = [
      ...new Set(d.values.map((v) => allowedValue(field, v)).filter((v): v is string => !!v)),
    ];
    if (values.length) {
      (details as Record<ListDetailKey, unknown>)[field] = { values, ...toCite(d.cite) };
    }
  }
  const seenParts = new Set<Part>();
  for (const p of wire.parts) {
    if (!hasQuote(p.cite) || seenParts.has(p.part)) continue;
    seenParts.add(p.part);
    details.parts.push({
      part: p.part,
      technologies: [...new Set(p.technologies.map((t) => clip(t, 100)).filter(Boolean))],
      note: clip(p.note, 500) || null,
      ...toCite(p.cite),
    });
  }
  const seenNfr = new Set<NfrKey>();
  for (const n of wire.nfr) {
    if (!hasQuote(n.cite) || seenNfr.has(n.area)) continue;
    seenNfr.add(n.area);
    details.nfr.push({ area: n.area, note: clip(n.note, 500), ...toCite(n.cite) });
  }

  const reading: Reading = {
    features: wire.features
      .filter((f) => hasQuote(f.cite) && f.name.trim() && f.parts.length)
      .map((f) => ({
        name: clip(f.name, 200),
        description: clip(f.description, 1000),
        parts: [...new Set(f.parts)],
        ...toCite(f.cite),
      })),
    details,
    assumptions: wire.notes
      .filter((n) => n.kind === "assumption" && hasQuote(n.cite) && n.text.trim())
      .map((n) => ({ part: n.part, text: clip(n.text, 1000), ...toCite(n.cite) })),
    risks: wire.notes
      .filter((n) => n.kind === "risk" && hasQuote(n.cite) && n.text.trim())
      .map((n) => ({ part: n.part, text: clip(n.text, 1000), ...toCite(n.cite) })),
    questions: wire.questions
      .filter((q) => hasQuote(q.cite) && q.text.trim())
      .map((q) => ({ text: clip(q.text, 1000), ...toCite(q.cite) })),
  };
  // The stored shape's own checks still apply, so a bad conversion fails loudly in tests.
  return ReadingSchema.parse(reading);
}

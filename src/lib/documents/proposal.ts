// What reading a requirement document proposes (specs/requirement-documents "Proposals cite their
// source", "Proposed features and request details", "Proposed assumptions, risks and questions").
// Pure. `ReadingSchema` is what Claude returns; `Proposal` is what is stored, with item ids and
// quote checks.
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
} from "@/lib/estimation/options";

export const MAX_QUOTE = 200;

const NFR_KEYS = NFR_AREAS.map((a) => a.key) as [NfrKey, ...NfrKey[]];
const part = z.enum(PART_VALUES);

const cite = z.object({
  /** 1-based PDF page; null for a DOCX. */
  page: z.number().int().min(1).nullable(),
  /** DOCX section heading; null for a PDF. */
  section: z.string().max(200).nullable(),
  quote: z.string().min(1).max(MAX_QUOTE),
});

const flagged = { needsConfirmation: z.boolean(), cite };

const listDetail = <T extends readonly [string, ...string[]]>(values: T) =>
  z.object({ values: z.array(z.enum(values)).min(1), ...flagged }).nullable();

const textDetail = z.object({ value: z.string().min(1).max(200), ...flagged }).nullable();

export const ReadingSchema = z.object({
  features: z.array(
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000),
      parts: z.array(part).min(1),
      ...flagged,
    }),
  ),
  details: z.object({
    projectName: textDetail,
    client: textDetail,
    applicationTypes: listDetail(APPLICATION_TYPES),
    operatingSystems: listDetail(OPERATING_SYSTEMS),
    browsers: listDetail(BROWSERS),
    hosting: listDetail(HOSTING),
    environments: listDetail(ENVIRONMENTS),
    appStores: listDetail(APP_STORES),
    compliance: listDetail(COMPLIANCE),
    parts: z.array(
      z.object({
        part,
        /** Catalog names as the document gives them; resolved against the catalog on review. */
        technologies: z.array(z.string().min(1).max(100)),
        note: z.string().max(500).nullable(),
        ...flagged,
      }),
    ),
    nfr: z.array(z.object({ area: z.enum(NFR_KEYS), note: z.string().max(500), ...flagged })),
  }),
  assumptions: z.array(z.object({ part, text: z.string().min(1).max(1000), ...flagged })),
  risks: z.array(z.object({ part, text: z.string().min(1).max(1000), ...flagged })),
  questions: z.array(z.object({ text: z.string().min(1).max(1000), ...flagged })),
});
export type Reading = z.infer<typeof ReadingSchema>;

export type Cite = z.infer<typeof cite> & {
  /** True when the quote was found in the document's own text. */
  checked: boolean;
};

type WithId<T> = Omit<T, "cite"> & { id: string; cite: Cite };

export type ListDetailKey =
  | "applicationTypes"
  | "operatingSystems"
  | "browsers"
  | "hosting"
  | "environments"
  | "appStores"
  | "compliance";
export const LIST_DETAIL_KEYS: ListDetailKey[] = [
  "applicationTypes",
  "operatingSystems",
  "browsers",
  "hosting",
  "environments",
  "appStores",
  "compliance",
];

type Details = Reading["details"];
export type Proposal = {
  features: WithId<Reading["features"][number]>[];
  details: {
    projectName: WithId<NonNullable<Details["projectName"]>> | null;
    client: WithId<NonNullable<Details["client"]>> | null;
  } & { [K in ListDetailKey]: WithId<NonNullable<Details[K]>> | null } & {
    parts: WithId<Details["parts"][number]>[];
    nfr: WithId<Details["nfr"][number]>[];
  };
  assumptions: WithId<Reading["assumptions"][number]>[];
  risks: WithId<Reading["risks"][number]>[];
  questions: WithId<Reading["questions"][number]>[];
};

/**
 * Gives every item a stable id (prefix + index, so a re-read gets fresh ids per document read) and
 * runs `check` on each quote.
 */
export function toProposal(
  reading: Reading,
  check: (c: z.infer<typeof cite>) => boolean,
  readId: string,
): Proposal {
  const tag = <T extends { cite: z.infer<typeof cite> }>(kind: string, item: T, i: number) => ({
    ...item,
    id: `${readId}:${kind}:${i}`,
    cite: { ...item.cite, quote: item.cite.quote.trim(), checked: check(item.cite) },
  });
  const one = <T extends { cite: z.infer<typeof cite> }>(kind: string, item: T | null) =>
    item ? tag(kind, item, 0) : null;
  const d = reading.details;
  return {
    features: reading.features.map((f, i) => tag("feature", f, i)),
    details: {
      projectName: one("projectName", d.projectName),
      client: one("client", d.client),
      applicationTypes: one("applicationTypes", d.applicationTypes),
      operatingSystems: one("operatingSystems", d.operatingSystems),
      browsers: one("browsers", d.browsers),
      hosting: one("hosting", d.hosting),
      environments: one("environments", d.environments),
      appStores: one("appStores", d.appStores),
      compliance: one("compliance", d.compliance),
      parts: d.parts.map((p, i) => tag("part", p, i)),
      nfr: d.nfr.map((n, i) => tag("nfr", n, i)),
    },
    assumptions: reading.assumptions.map((a, i) => tag("assumption", a, i)),
    risks: reading.risks.map((r, i) => tag("risk", r, i)),
    questions: reading.questions.map((q, i) => tag("question", q, i)),
  };
}

/** The counts shown when a document is ready to review. */
export function proposalCounts(p: Proposal) {
  const d = p.details;
  const details =
    [d.projectName, d.client, ...LIST_DETAIL_KEYS.map((k) => d[k])].filter(Boolean).length +
    d.parts.length +
    d.nfr.length;
  return {
    features: p.features.length,
    details,
    assumptions: p.assumptions.length,
    risks: p.risks.length,
    questions: p.questions.length,
  };
}

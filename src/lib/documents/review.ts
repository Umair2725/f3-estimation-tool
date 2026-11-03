// Builds the review of a document's proposal against the request as it is now (specs/
// requirement-documents "Review before adding", "Duplicates and filled-in values"), and the
// selection a person sends back with "Add to request". Pure.
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
  PART_LABELS,
  PART_VALUES,
  type NfrKey,
  type Part,
} from "@/lib/estimation/options";
import {
  LIST_DETAIL_KEYS,
  MAX_QUOTE,
  type Cite,
  type ListDetailKey,
  type Proposal,
} from "./proposal";

export const LIST_DETAIL_LABELS: Record<ListDetailKey, string> = {
  applicationTypes: "Application types",
  operatingSystems: "Operating systems",
  browsers: "Browsers",
  hosting: "Hosting",
  environments: "Environments",
  appStores: "App stores",
  compliance: "Compliance",
};

/** The request as the review needs it. */
export type RequestSnapshot = {
  projectName: string;
  clientName: string | null;
  lists: Record<ListDetailKey, string[]>;
  nfr: Partial<Record<NfrKey, { enabled: boolean; note: string }>>;
  parts: { part: Part; technologyIds: string[] }[];
  featureNames: string[];
  featureIds: string[];
};

export type CatalogEntry = { id: string; name: string; parts: Part[] };

export type ReviewFeature = {
  id: string;
  /** Proposal item ids this feature came from (more than one after a merge). */
  itemIds: string[];
  name: string;
  description: string;
  parts: Part[];
  cites: Cite[];
  needsConfirmation: boolean;
  duplicate: boolean;
  added: boolean;
  /** Added earlier but no longer in the request: offered again, unticked. */
  removed: boolean;
  selected: boolean;
};

type Row = {
  id: string;
  cite: Cite;
  needsConfirmation: boolean;
  added: boolean;
  selected: boolean;
};

export type Review = {
  features: ReviewFeature[];
  text: (Row & {
    field: "projectName" | "client";
    label: string;
    current: string | null;
    value: string;
  })[];
  lists: (Row & { field: ListDetailKey; label: string; current: string[]; values: string[] })[];
  parts: (Row & {
    part: Part;
    label: string;
    currentTechnologies: string[];
    technologies: { id: string; name: string }[];
    note: string | null;
  })[];
  nfr: (Row & { area: NfrKey; label: string; current: string | null; note: string })[];
  assumptions: (Row & { part: Part; text: string })[];
  risks: (Row & { part: Part; text: string })[];
  questions: (Row & { text: string })[];
};

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** "Document asks for Elixir (not in the catalog)" for each technology the catalog lacks. */
export function unknownTechnologyNote(names: string[]): string | null {
  if (names.length === 0) return null;
  return `Document asks for ${names.join(", ")} (not in the catalog)`;
}

export function buildReview(
  proposal: Proposal,
  request: RequestSnapshot,
  catalog: CatalogEntry[],
  addedItemIds: string[],
  /** Proposal item id -> the feature it was added as; older additions have none. */
  addedFeatures: Record<string, string> = {},
): Review {
  const added = new Set(addedItemIds);
  const existing = new Set(request.featureNames.map(normalizeName));
  const featureIds = new Set(request.featureIds);
  // Still in the request: its feature exists (merged or renamed ones too); without a record of
  // the feature, a feature with its name.
  const stillThere = (item: { id: string; name: string }) =>
    addedFeatures[item.id] !== undefined
      ? featureIds.has(addedFeatures[item.id])
      : existing.has(normalizeName(item.name));
  const row = (item: { id: string; cite: Cite; needsConfirmation: boolean }, filled: boolean) => ({
    id: item.id,
    cite: item.cite,
    needsConfirmation: item.needsConfirmation,
    added: added.has(item.id),
    selected: !added.has(item.id) && !filled,
  });

  // "Added" only while the request still has the feature; otherwise it can be added again.
  const features: ReviewFeature[] = proposal.features.map((f) => {
    const duplicate = existing.has(normalizeName(f.name));
    const wasAdded = added.has(f.id);
    const removed = wasAdded && !stillThere(f);
    return {
      id: f.id,
      itemIds: [f.id],
      name: f.name,
      description: f.description,
      parts: f.parts,
      cites: [f.cite],
      needsConfirmation: f.needsConfirmation,
      duplicate,
      added: wasAdded && !removed,
      removed,
      selected: !wasAdded && !duplicate,
    };
  });

  const d = proposal.details;
  const text: Review["text"] = [];
  for (const [field, label, current] of [
    ["projectName", "Project name", request.projectName.trim() || null],
    ["client", "Client", request.clientName?.trim() || null],
  ] as const) {
    const item = d[field];
    if (!item) continue;
    const same = current !== null && normalizeName(current) === normalizeName(item.value);
    if (same) continue;
    text.push({ ...row(item, current !== null), field, label, current, value: item.value });
  }

  const lists: Review["lists"] = [];
  for (const field of LIST_DETAIL_KEYS) {
    const item = d[field];
    if (!item) continue;
    const current = request.lists[field];
    if (item.values.every((v) => current.includes(v))) continue;
    lists.push({
      ...row(item, current.length > 0),
      field,
      label: LIST_DETAIL_LABELS[field],
      current,
      values: item.values,
    });
  }

  const parts: Review["parts"] = d.parts.map((p) => {
    const current = request.parts.find((rp) => rp.part === p.part);
    const offered = catalog.filter((c) => c.parts.includes(p.part));
    const known: { id: string; name: string }[] = [];
    const unknown: string[] = [];
    for (const name of p.technologies) {
      const match = offered.find((c) => normalizeName(c.name) === normalizeName(name));
      if (match) {
        if (!known.some((k) => k.id === match.id)) known.push({ id: match.id, name: match.name });
      } else unknown.push(name);
    }
    const notes = [p.note?.trim(), unknownTechnologyNote(unknown)].filter(Boolean);
    const currentNames = (current?.technologyIds ?? []).map(
      (id) => catalog.find((c) => c.id === id)?.name ?? id,
    );
    return {
      ...row(p, (current?.technologyIds.length ?? 0) > 0),
      part: p.part,
      label: PART_LABELS[p.part],
      currentTechnologies: currentNames,
      technologies: known,
      note: notes.length ? notes.join(". ") : null,
    };
  });

  const nfr: Review["nfr"] = d.nfr.map((n) => {
    const current = request.nfr[n.area];
    const filled = !!current?.enabled;
    return {
      ...row(n, filled),
      area: n.area,
      label: NFR_AREAS.find((a) => a.key === n.area)?.label ?? n.area,
      current: filled ? current!.note || "Yes" : null,
      note: n.note,
    };
  });

  return {
    features,
    text,
    lists,
    parts,
    nfr,
    assumptions: proposal.assumptions.map((a) => ({
      ...row(a, false),
      part: a.part,
      text: a.text,
    })),
    risks: proposal.risks.map((r) => ({ ...row(r, false), part: r.part, text: r.text })),
    questions: proposal.questions.map((q) => ({ ...row(q, false), text: q.text })),
  };
}

/** Joins features into one, keeping every source; parts are the union. */
export function mergeFeatures(features: ReviewFeature[], name: string): ReviewFeature {
  const [first] = features;
  const parts = PART_VALUES.filter((p) => features.some((f) => f.parts.includes(p)));
  return {
    ...first,
    id: features.map((f) => f.id).join("+"),
    itemIds: features.flatMap((f) => f.itemIds),
    name: name.trim() || first.name,
    description: features
      .map((f) => f.description.trim())
      .filter(Boolean)
      .join("; ")
      .slice(0, 1000),
    parts,
    cites: features.flatMap((f) => f.cites),
    needsConfirmation: features.some((f) => f.needsConfirmation),
    duplicate: false,
    added: false,
    removed: false,
    selected: true,
  };
}

/** Splits a feature into two that keep the same source; the second is named for editing. */
export function splitFeature(feature: ReviewFeature): [ReviewFeature, ReviewFeature] {
  return [
    { ...feature, id: `${feature.id}/a`, selected: true },
    { ...feature, id: `${feature.id}/b`, name: `${feature.name} (2)`, selected: true },
  ];
}

// ---------- what "Add to request" sends ----------

const part = z.enum(PART_VALUES);
const source = z.object({
  page: z.number().int().min(1).nullable(),
  section: z.string().max(200).nullable(),
  quote: z.string().max(MAX_QUOTE),
});
const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values)).optional();

export const SelectionSchema = z.object({
  /** Proposal item ids being added, recorded so a later review shows them as added. */
  itemIds: z.array(z.string().max(200)).max(2000),
  features: z
    .array(
      z.object({
        /** The proposal items this feature came from (several after a merge). */
        itemIds: z.array(z.string().max(200)).max(500).default([]),
        name: z.string().trim().min(1, "Give every feature a name").max(200),
        description: z.string().trim().max(1000),
        parts: z.array(part).min(1, "Choose at least one part"),
      }),
    )
    .max(500),
  projectName: z.string().trim().min(1).max(200).optional(),
  client: z.string().trim().min(1).max(200).optional(),
  lists: z
    .object({
      applicationTypes: enumList(APPLICATION_TYPES),
      operatingSystems: enumList(OPERATING_SYSTEMS),
      browsers: enumList(BROWSERS),
      hosting: enumList(HOSTING),
      environments: enumList(ENVIRONMENTS),
      appStores: enumList(APP_STORES),
      compliance: enumList(COMPLIANCE),
    })
    .default({}),
  parts: z
    .array(
      z.object({
        part,
        technologyIds: z.array(z.string().max(100)).max(50),
        note: z.string().trim().max(500).nullable(),
      }),
    )
    .max(5)
    .default([]),
  nfr: z
    .array(
      z.object({
        area: z.enum(NFR_AREAS.map((a) => a.key) as [NfrKey, ...NfrKey[]]),
        note: z.string().trim().max(500),
      }),
    )
    .default([]),
  assumptions: z.array(z.object({ part, text: z.string().trim().min(1).max(1000) })).default([]),
  risks: z.array(z.object({ part, text: z.string().trim().min(1).max(1000) })).default([]),
  questions: z
    .array(z.object({ text: z.string().trim().min(1).max(1000), source: source.nullable() }))
    .default([]),
});
export type Selection = z.input<typeof SelectionSchema>;

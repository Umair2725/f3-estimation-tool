import { describe, expect, it } from "vitest";
import { toProposal, type Reading } from "./proposal";
import {
  buildReview,
  mergeFeatures,
  SelectionSchema,
  splitFeature,
  type RequestSnapshot,
} from "./review";

const cite = (page: number, quote: string) => ({ page, section: null, quote });
const feature = (name: string, page: number, parts: Reading["features"][number]["parts"]) => ({
  name,
  description: `${name} description`,
  parts,
  needsConfirmation: false,
  cite: cite(page, name),
});

const reading: Reading = {
  features: [
    feature("Book appointment", 3, ["WEB_FRONTEND"]),
    feature("Reschedule appointment", 3, ["BACKEND"]),
    feature("user login", 2, ["BACKEND"]),
    feature("Admin reports and exports", 6, ["ADMIN_PANEL"]),
  ],
  details: {
    projectName: { value: "Patient portal", needsConfirmation: false, cite: cite(1, "Patient") },
    client: { value: "northwind clinics", needsConfirmation: false, cite: cite(1, "Northwind") },
    applicationTypes: { values: ["Web"], needsConfirmation: false, cite: cite(2, "web") },
    operatingSystems: { values: ["iOS"], needsConfirmation: false, cite: cite(2, "iOS") },
    browsers: null,
    hosting: { values: ["AWS"], needsConfirmation: false, cite: cite(9, "AWS") },
    environments: null,
    appStores: null,
    compliance: { values: ["HIPAA"], needsConfirmation: true, cite: cite(9, "HIPAA") },
    parts: [
      {
        part: "BACKEND",
        technologies: ["node.js", "Elixir"],
        note: null,
        needsConfirmation: false,
        cite: cite(9, "Node.js and Elixir"),
      },
    ],
    nfr: [{ area: "security", note: "Pen test", needsConfirmation: false, cite: cite(9, "pen") }],
  },
  assumptions: [
    { part: "BACKEND", text: "Client hosts", needsConfirmation: false, cite: cite(9, "x") },
  ],
  risks: [],
  questions: [{ text: "Which EHR?", needsConfirmation: false, cite: cite(7, "records") }],
};

const request: RequestSnapshot = {
  projectName: "Patient portal MVP",
  clientName: "Northwind Clinics",
  lists: {
    applicationTypes: ["Web"],
    operatingSystems: [],
    browsers: [],
    hosting: ["Azure"],
    environments: [],
    appStores: [],
    compliance: [],
  },
  nfr: {},
  parts: [{ part: "WEB_FRONTEND", technologyIds: ["t-react"] }],
  featureNames: ["User login"],
  featureIds: ["f-login"],
};

const catalog = [
  { id: "t-react", name: "React", parts: ["WEB_FRONTEND" as const] },
  { id: "t-node", name: "Node.js", parts: ["BACKEND" as const] },
];

const proposal = toProposal(reading, () => true, "r1");

describe("buildReview", () => {
  const review = buildReview(proposal, request, catalog, []);

  it("flags a feature already in the request and unticks it", () => {
    const login = review.features.find((f) => f.name === "user login")!;
    expect(login).toMatchObject({ duplicate: true, selected: false });
    expect(review.features.filter((f) => f.selected)).toHaveLength(3);
  });

  it("keeps a filled-in value by default and shows both", () => {
    const hosting = review.lists.find((l) => l.field === "hosting")!;
    expect(hosting).toMatchObject({ current: ["Azure"], values: ["AWS"], selected: false });
    const project = review.text.find((t) => t.field === "projectName")!;
    expect(project).toMatchObject({ current: "Patient portal MVP", selected: false });
  });

  it("ticks empty fields and drops proposals the request already has", () => {
    expect(review.lists.find((l) => l.field === "operatingSystems")?.selected).toBe(true);
    expect(review.lists.find((l) => l.field === "applicationTypes")).toBeUndefined();
    // Same client, different letter case: nothing to review.
    expect(review.text.find((t) => t.field === "client")).toBeUndefined();
    expect(review.lists.find((l) => l.field === "compliance")).toMatchObject({
      needsConfirmation: true,
      selected: true,
    });
  });

  it("resolves catalog technologies and notes the ones the catalog lacks", () => {
    expect(review.parts[0]).toMatchObject({
      part: "BACKEND",
      technologies: [{ id: "t-node", name: "Node.js" }],
      note: "Document asks for Elixir (not in the catalog)",
      selected: true,
    });
  });

  it("shows items added earlier as added and unticked", () => {
    // "Book appointment" was added and is still in the request (any letter case and spacing).
    const withAdded = {
      ...request,
      featureNames: [...request.featureNames, " book  Appointment "],
    };
    const again = buildReview(proposal, withAdded, catalog, [
      proposal.features[0].id,
      proposal.questions[0].id,
    ]);
    expect(again.features[0]).toMatchObject({ added: true, removed: false, selected: false });
    expect(again.questions[0]).toMatchObject({ added: true, selected: false });
  });

  it("offers a feature again when it was added but is no longer in the request", () => {
    const again = buildReview(proposal, request, catalog, [proposal.features[0].id]);
    expect(again.features[0]).toMatchObject({
      name: "Book appointment",
      added: false,
      removed: true,
      duplicate: false,
      selected: false,
    });
    // Features never added are unaffected.
    expect(again.features[1]).toMatchObject({ added: false, removed: false, selected: true });
  });

  it("follows the feature an item was added as, through merges and renames", () => {
    const ids = [proposal.features[0].id, proposal.features[1].id];
    const merged = { ...request, featureNames: ["Appointments"], featureIds: ["f-merged"] };
    const map = { [ids[0]]: "f-merged", [ids[1]]: "f-merged" };
    const again = buildReview(proposal, merged, catalog, ids, map);
    expect(again.features[0]).toMatchObject({ added: true, removed: false });
    expect(again.features[1]).toMatchObject({ added: true, removed: false });

    // The merged feature is removed from the request: both items are offered again.
    const gone = buildReview(proposal, { ...merged, featureIds: [] }, catalog, ids, map);
    expect(gone.features[0]).toMatchObject({ added: false, removed: true, selected: false });
    expect(gone.features[1]).toMatchObject({ added: false, removed: true, selected: false });
  });

  it("keeps a duplicate that was never added from this document flagged, not removed", () => {
    const login = review.features.find((f) => f.name === "user login")!;
    expect(login).toMatchObject({ duplicate: true, added: false, removed: false });
  });
});

describe("merge and split", () => {
  const review = buildReview(proposal, request, catalog, []);

  it("merges features keeping every source and the union of parts", () => {
    const merged = mergeFeatures(review.features.slice(0, 2), "Appointment booking");
    expect(merged).toMatchObject({
      name: "Appointment booking",
      parts: ["BACKEND", "WEB_FRONTEND"],
      selected: true,
    });
    expect(merged.cites.map((c) => c.quote)).toEqual([
      "Book appointment",
      "Reschedule appointment",
    ]);
    expect(merged.itemIds).toEqual([proposal.features[0].id, proposal.features[1].id]);
  });

  it("splits a feature into two with the same source", () => {
    const [a, b] = splitFeature(review.features[3]);
    expect([a.name, b.name]).toEqual([
      "Admin reports and exports",
      "Admin reports and exports (2)",
    ]);
    expect(a.cites).toEqual(b.cites);
    expect(a.id).not.toBe(b.id);
  });
});

describe("SelectionSchema", () => {
  it("requires a name and a part on every feature", () => {
    const result = SelectionSchema.safeParse({
      itemIds: [],
      features: [{ name: " ", description: "", parts: [] }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      "Give every feature a name",
      "Choose at least one part",
    ]);
  });
});

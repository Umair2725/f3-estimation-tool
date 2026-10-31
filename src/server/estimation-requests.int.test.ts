import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { parseFilters } from "@/lib/estimation/filters";
import { createUser, deleteUsers } from "../../test/factories";
import {
  createRequest,
  deleteRequest,
  EDIT_REFUSED,
  getRequest,
  listRequests,
  myDrafts,
  saveStep,
} from "./estimation-requests";

const users: string[] = [];
const techIds: string[] = [];
const tag = randomUUID().slice(0, 8); // keeps this run's clients and projects apart

afterAll(async () => {
  const db = getDb();
  await db.estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await db.client.deleteMany({ where: { name: { contains: tag } } });
  await db.technology.deleteMany({ where: { id: { in: techIds } } });
  await deleteUsers(users);
});

async function person(role: Role | null = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

let tech: Record<string, string>;
beforeAll(async () => {
  const all = await getDb().technology.findMany();
  tech = Object.fromEntries(all.map((t) => [t.name, t.id]));
});

const today = "2026-10-31";
const step1 = (projectName: string, clientName = "") => ({
  projectName,
  clientName,
  projectDate: today,
});
const step2 = (parts: { part: string; technologyIds: string[] }[]) => ({
  applicationTypes: ["Web"],
  operatingSystems: [],
  browsers: ["Chrome"],
  parts,
});

describe("creating and saving steps (specs/estimation-requests)", () => {
  it("creates a Draft owned by the creator with defaults", async () => {
    const sara = await person();
    const { id } = await createRequest(sara, step1(`Portal ${tag}`));
    const request = await getRequest(sara, id);
    expect(request).toMatchObject({
      status: "DRAFT",
      owner: { id: sara.id },
      projectManager: sara.name,
      projectDate: today,
      lastStep: 1,
      canEdit: true,
      canDelete: true,
    });
  });

  it("requires a project name", async () => {
    await expect(createRequest(await person(), step1("  "))).rejects.toMatchObject({
      status: 400,
      message: "Enter a project name",
    });
  });

  it("reuses a client regardless of case and spacing", async () => {
    const sara = await person();
    const a = await createRequest(sara, step1(`A ${tag}`, `Northwind Clinics ${tag}`));
    const b = await createRequest(
      sara,
      step1(`B ${tag}`, `  northwind   clinics ${tag} `.toUpperCase()),
    );
    const [ra, rb] = await Promise.all([getRequest(sara, a.id), getRequest(sara, b.id)]);
    expect(rb.clientName).toBe(ra.clientName);
    expect(await getDb().client.count({ where: { name: { contains: tag } } })).toBe(1);
  });

  it("saves every step and records the last step", async () => {
    const sara = await person();
    const { id } = await createRequest(sara, step1(`Steps ${tag}`, `Client ${tag}`));
    await saveStep(
      sara,
      id,
      2,
      step2([
        { part: "BACKEND", technologyIds: [tech["Node.js"]] },
        { part: "MOBILE", technologyIds: [tech["React Native"]] },
      ]),
    );
    await saveStep(sara, id, 3, {
      compliance: ["HIPAA"],
      nfr: { security: { enabled: true, note: "Pen test before launch" } },
    });
    await saveStep(sara, id, 4, {
      features: [
        {
          name: "Appointment booking",
          description: "Doctor availability, reminders",
          parts: ["BACKEND"],
        },
        { name: "Lab results", parts: ["MOBILE", "BACKEND"] },
      ],
    });
    const request = await getRequest(sara, id);
    expect(request.lastStep).toBe(4);
    expect(request.parts).toEqual([
      { part: "BACKEND", technologies: [{ id: tech["Node.js"], name: "Node.js", retired: false }] },
      {
        part: "MOBILE",
        technologies: [{ id: tech["React Native"], name: "React Native", retired: false }],
      },
    ]);
    expect(request.considerations.compliance).toEqual(["HIPAA"]);
    expect(request.considerations.nfr.security).toEqual({
      enabled: true,
      note: "Pen test before launch",
    });
    expect(request.features.map((f) => f.name)).toEqual(["Appointment booking", "Lab results"]);
    expect(request.missing).toEqual([]);

    await saveStep(sara, id, 3, { compliance: [] });
    expect((await getRequest(sara, id)).lastStep).toBe(3);
  });

  it("removes a dropped part from features", async () => {
    const sara = await person();
    const { id } = await createRequest(sara, step1(`Drop ${tag}`));
    await saveStep(
      sara,
      id,
      2,
      step2([
        { part: "BACKEND", technologyIds: [tech["Node.js"]] },
        { part: "MOBILE", technologyIds: [tech["Flutter"]] },
      ]),
    );
    await saveStep(sara, id, 4, {
      features: [{ name: "Photo capture", parts: ["MOBILE", "BACKEND"] }],
    });
    await saveStep(sara, id, 2, step2([{ part: "BACKEND", technologyIds: [tech["Node.js"]] }]));
    const request = await getRequest(sara, id);
    expect(request.parts.map((p) => p.part)).toEqual(["BACKEND"]);
    expect(request.features[0].parts).toEqual(["BACKEND"]);
  });

  it("refuses technologies of another part, and features using parts not on the request", async () => {
    const sara = await person();
    const { id } = await createRequest(sara, step1(`Wrong ${tag}`));
    await expect(
      saveStep(sara, id, 2, step2([{ part: "MOBILE", technologyIds: [tech["Node.js"]] }])),
    ).rejects.toThrow("Node.js isn't available for Mobile");
    await expect(
      saveStep(sara, id, 4, { features: [{ name: "X", parts: ["MOBILE"] }] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(saveStep(sara, id, 4, { features: [{ name: "X", parts: [] }] })).rejects.toThrow(
      "Choose at least one part",
    );
  });

  it("keeps a retired technology already on the request but refuses it for new selections", async () => {
    const sara = await person();
    const old = await getDb().technology.create({
      data: { name: `AngularJS ${tag}`, nameKey: `angularjs ${tag}`, parts: ["WEB_FRONTEND"] },
    });
    techIds.push(old.id);
    const { id } = await createRequest(sara, step1(`Retired ${tag}`));
    await saveStep(sara, id, 2, step2([{ part: "WEB_FRONTEND", technologyIds: [old.id] }]));
    await getDb().technology.update({ where: { id: old.id }, data: { retiredAt: new Date() } });

    await saveStep(sara, id, 2, step2([{ part: "WEB_FRONTEND", technologyIds: [old.id] }]));
    expect((await getRequest(sara, id)).parts[0].technologies[0]).toMatchObject({ retired: true });

    const other = await createRequest(sara, step1(`Retired 2 ${tag}`));
    await expect(
      saveStep(sara, other.id, 2, step2([{ part: "WEB_FRONTEND", technologyIds: [old.id] }])),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("who may view and change a request (specs/estimation-requests)", () => {
  it("lets others view but only the owner or an Admin edit", async () => {
    const owner = await person();
    const other = await person();
    const lead = await person("TECH_LEAD");
    const admin = await person("ADMIN");
    const { id } = await createRequest(owner, step1(`Rules ${tag}`));

    for (const viewer of [other, lead]) {
      const seen = await getRequest(viewer, id);
      expect(seen).toMatchObject({ canEdit: false, canDelete: false });
      await expect(saveStep(viewer, id, 1, step1("Hijack"))).rejects.toMatchObject({
        status: 403,
        message: EDIT_REFUSED,
      });
    }
    expect((await getRequest(owner, id)).projectName).toBe(`Rules ${tag}`);

    await saveStep(admin, id, 1, step1(`Rules by admin ${tag}`));
    const after = await getRequest(owner, id);
    expect(after.projectName).toBe(`Rules by admin ${tag}`);
    expect(after.owner.id).toBe(owner.id);
  });

  it("refuses edits once the request is no longer a draft", async () => {
    const owner = await person();
    const { id } = await createRequest(owner, step1(`Locked ${tag}`));
    await getDb().estimationRequest.update({ where: { id }, data: { status: "APPROVED" } });
    await expect(saveStep(owner, id, 1, step1("Changed"))).rejects.toMatchObject({ status: 403 });
    await expect(deleteRequest(owner, id)).rejects.toMatchObject({ status: 403 });
  });

  it("deletes a draft for its owner, keeping the client", async () => {
    const owner = await person();
    const other = await person();
    const { id } = await createRequest(owner, step1(`Delete ${tag}`, `Keep client ${tag}`));
    await expect(deleteRequest(other, id)).rejects.toMatchObject({ status: 403 });
    await deleteRequest(owner, id);
    await expect(getRequest(owner, id)).rejects.toMatchObject({ status: 404 });
    expect(await getDb().client.count({ where: { name: `Keep client ${tag}` } })).toBe(1);
  });

  it("refuses everything to people without a role", async () => {
    const owner = await person();
    const nobody = await person(null);
    const { id } = await createRequest(owner, step1(`Nobody ${tag}`));
    await expect(getRequest(nobody, id)).rejects.toMatchObject({ status: 403 });
    await expect(createRequest(nobody, step1("X"))).rejects.toMatchObject({ status: 403 });
    await expect(listRequests(nobody, parseFilters({}))).rejects.toMatchObject({ status: 403 });
    await expect(getRequest(null, id)).rejects.toMatchObject({ status: 401 });
  });
});

describe("home list (specs/home-screen)", () => {
  it("filters by mine, status, owner, client, technology and search, newest first", async () => {
    const t = `${tag}-${randomUUID().slice(0, 6)}`;
    const sara = await person();
    const bilal = await person();
    const a = await createRequest(sara, step1(`Patient portal ${t}`, `Northwind ${t}`));
    const b = await createRequest(bilal, step1(`Fleet dashboard ${t}`, `Contoso ${t}`));
    await saveStep(
      bilal,
      b.id,
      2,
      step2([{ part: "MOBILE", technologyIds: [tech["React Native"]] }]),
    );
    const c = await createRequest(sara, step1(`Course market ${t}`, `Portal Learning ${t}`));
    await getDb().estimationRequest.update({ where: { id: c.id }, data: { status: "APPROVED" } });

    const ids = async (params: Record<string, string>, viewer = sara) =>
      (await listRequests(viewer, parseFilters({ q: t, ...params }))).rows.map((r) => r.id);

    expect(await ids({})).toEqual([c.id, b.id, a.id]);
    expect(await ids({ view: "mine" })).toEqual([c.id, a.id]);
    expect(await ids({ view: "approved" })).toEqual([c.id]);
    expect(await ids({ status: "DRAFT" })).toEqual([b.id, a.id]);
    expect(await ids({ owner: bilal.id })).toEqual([b.id]);
    expect(await ids({ tech: tech["React Native"] })).toEqual([b.id]);
    expect(await ids({ q: `portal ${t}`.toUpperCase() })).toEqual([a.id]);
    expect(await ids({ q: `PORTAL` })).toContain(c.id); // matches the client name
    const client = await getDb().client.findFirstOrThrow({ where: { name: `Contoso ${t}` } });
    expect(await ids({ client: client.id })).toEqual([b.id]);

    const row = (await listRequests(sara, parseFilters({ q: `Fleet dashboard ${t}` }))).rows[0];
    expect(row).toMatchObject({ clientName: `Contoso ${t}`, status: "DRAFT", parts: ["MOBILE"] });
  });

  it("pages 25 rows at a time", async () => {
    const owner = await person();
    for (let i = 0; i < 27; i++) await createRequest(owner, step1(`Paging ${tag} ${i}`));
    const page1 = await listRequests(owner, parseFilters({ owner: owner.id }));
    const page2 = await listRequests(owner, parseFilters({ owner: owner.id, page: "2" }));
    expect(page1).toMatchObject({ total: 27, pageCount: 2 });
    expect(page1.rows).toHaveLength(25);
    expect(page2.rows).toHaveLength(2);
  });

  it("counts my drafts and finds the latest at its last step", async () => {
    const sara = await person();
    expect(await myDrafts(sara)).toEqual({ count: 0, latest: null });
    await createRequest(sara, step1(`Older ${tag}`));
    const { id } = await createRequest(sara, step1(`Newer ${tag}`));
    await saveStep(sara, id, 2, step2([]));
    await saveStep(sara, id, 3, {});
    const drafts = await myDrafts(sara);
    expect(drafts.count).toBe(2);
    expect(drafts.latest).toMatchObject({ id, projectName: `Newer ${tag}`, lastStep: 3 });
  });
});

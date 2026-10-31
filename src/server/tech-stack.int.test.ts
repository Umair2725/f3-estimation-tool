import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../test/factories";
import {
  addTechnology,
  listTechnologies,
  restoreTechnology,
  retireTechnology,
  updateTechnology,
} from "./tech-stack";

const users: string[] = [];
const techs: string[] = [];
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().technology.deleteMany({ where: { id: { in: techs } } });
  await deleteUsers(users);
});

async function actor(role: "ADMIN" | "ESTIMATOR" | null) {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}
const uniqueName = (base: string) => `${base} ${randomUUID().slice(0, 6)}`;

describe("tech stack catalog (specs/tech-stack-catalog)", () => {
  it("starts with the brief's technologies", async () => {
    const list = await listTechnologies(await actor("ESTIMATOR"));
    const byName = Object.fromEntries(list.map((t) => [t.name, t.parts]));
    expect(byName["React Native"]).toEqual(["MOBILE"]);
    expect(byName["Node.js"]).toEqual(["BACKEND"]);
    for (const name of [
      "React",
      "Next.js",
      ".NET",
      "Python",
      "Flutter",
      "Swift",
      "Kotlin",
      "AWS",
    ]) {
      expect(byName[name], name).toBeDefined();
    }
  });

  it("lets an Admin add, rename, retire and restore", async () => {
    const admin = await actor("ADMIN");
    const name = uniqueName("Svelte");
    const tech = await addTechnology(admin, { name, parts: ["WEB_FRONTEND"] });
    techs.push(tech.id);
    expect((await listTechnologies(admin)).map((t) => t.name)).toContain(name);

    await updateTechnology(admin, tech.id, {
      name: `${name} Kit`,
      parts: ["WEB_FRONTEND", "ADMIN_PANEL"],
    });
    await retireTechnology(admin, tech.id);
    expect((await listTechnologies(admin)).map((t) => t.id)).not.toContain(tech.id);
    const all = await listTechnologies(admin, { includeRetired: true });
    expect(all.find((t) => t.id === tech.id)).toMatchObject({
      name: `${name} Kit`,
      parts: ["WEB_FRONTEND", "ADMIN_PANEL"],
      retired: true,
    });

    await restoreTechnology(admin, tech.id);
    expect((await listTechnologies(admin)).map((t) => t.id)).toContain(tech.id);
  });

  it("refuses duplicate names regardless of case", async () => {
    const admin = await actor("ADMIN");
    await expect(
      addTechnology(admin, { name: "  react ", parts: ["WEB_FRONTEND"] }),
    ).rejects.toMatchObject({
      status: 409,
      message: "React is already in the catalog",
    });
  });

  it("requires a name and a part", async () => {
    const admin = await actor("ADMIN");
    await expect(addTechnology(admin, { name: "", parts: [] })).rejects.toMatchObject({
      status: 400,
    });
    await expect(addTechnology(admin, { name: uniqueName("X"), parts: [] })).rejects.toThrow(
      "Choose at least one part",
    );
  });

  it("is managed by Admins only; people without a role can't read it", async () => {
    const estimator = await actor("ESTIMATOR");
    await expect(
      addTechnology(estimator, { name: uniqueName("Y"), parts: ["BACKEND"] }),
    ).rejects.toMatchObject({
      status: 403,
    });
    const anyTech = (await listTechnologies(estimator))[0];
    await expect(retireTechnology(estimator, anyTech.id)).rejects.toMatchObject({ status: 403 });
    await expect(listTechnologies(await actor(null))).rejects.toMatchObject({ status: 403 });
  });

  it("can't delete a technology a request uses", async () => {
    const admin = await actor("ADMIN");
    const tech = await addTechnology(admin, { name: uniqueName("Used"), parts: ["BACKEND"] });
    techs.push(tech.id);
    await getDb().estimationRequest.create({
      data: {
        projectName: "Catalog test",
        projectManager: "X",
        projectDate: new Date(),
        ownerId: admin.id,
        parts: { create: { part: "BACKEND", technologies: { create: { technologyId: tech.id } } } },
      },
    });
    await expect(getDb().technology.delete({ where: { id: tech.id } })).rejects.toThrow();
    await getDb().estimationRequest.deleteMany({ where: { projectName: "Catalog test" } });
  });
});

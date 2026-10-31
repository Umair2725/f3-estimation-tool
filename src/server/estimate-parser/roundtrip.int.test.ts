import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { getEstimate, saveEstimate } from "../estimates";
import { createRequest, saveStep } from "../estimation-requests";
import { exportInternal } from "../export/export";
import { parseEstimateFile } from "./core";

// specs/estimate-file-parsing "Round trip of the tool's own export".

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

describe("export → parse round trip", () => {
  it("reads back exactly what was exported, with no warnings", async () => {
    const user = await createUser({ role: "ESTIMATOR" });
    users.push(user.id);
    const owner = toCurrentUser(user) as CurrentUser;
    const tech = Object.fromEntries(
      (await getDb().technology.findMany()).map((t) => [t.name, t.id]),
    );

    const { id } = await createRequest(owner, {
      projectName: `Round trip ${tag}`,
      clientName: `Northwind ${tag}`,
      projectDate: "2026-10-31",
    });
    await saveStep(owner, id, 2, {
      applicationTypes: ["Web", "Mobile"],
      operatingSystems: ["iOS"],
      browsers: ["Chrome"],
      parts: [
        { part: "BACKEND", technologyIds: [tech["Node.js"]] },
        { part: "MOBILE", technologyIds: [tech["React Native"]] },
      ],
    });
    await saveStep(owner, id, 3, { environments: ["Staging", "Production"] });
    await saveStep(owner, id, 4, {
      features: [
        {
          name: "Appointment booking",
          description: "Doctor availability",
          parts: ["BACKEND", "MOBILE"],
        },
        { name: "Lab results", parts: ["BACKEND"] },
      ],
    });
    const view = await getEstimate(owner, id);
    const [backend, mobile] = view.parts;
    backend.tasks[0].subTasks = [
      { title: "Booking API", min: 12, max: 16, comment: "REST" },
      { title: "Reminder emails", min: 6.5, max: 8, comment: "" },
    ];
    backend.tasks[1].subTasks = [{ title: "Results API", min: 8, max: 12, comment: "" }];
    mobile.tasks[0].subTasks = [
      { title: "Booking screens", min: 14, max: 20, comment: "Calendar view" },
    ];
    backend.deploymentMin = 16;
    backend.deploymentMax = 24;
    backend.assumptions = ["Lab results come from the client's API"];
    mobile.risks = ["App store review delays"];
    await saveEstimate(owner, id, {
      tasks: view.parts.flatMap((p) =>
        p.tasks.map((t) => ({ taskId: t.taskId, subTasks: t.subTasks })),
      ),
      parts: view.parts.map(({ part, deploymentMin, deploymentMax, assumptions, risks }) => ({
        part,
        deploymentMin,
        deploymentMax,
        assumptions,
        risks,
      })),
      ...view.overheads,
    });

    const { buffer, fileName } = await exportInternal(owner, id);
    const parsed = await parseEstimateFile(buffer, fileName);
    if (!parsed.ok) throw new Error(parsed.error);

    expect(parsed.warnings).toEqual([]);
    expect(parsed.templateVersion).toBe("0.5");
    expect(parsed.summary).toMatchObject({
      projectName: `Round trip ${tag}`,
      clientName: `Northwind ${tag}`,
      projectManager: user.name,
      date: { iso: "2026-10-31" },
      qaPercent: 25,
      pmPercent: 30,
    });

    const dev = parsed.sheets.filter((s) => s.kind === "BACKEND" || s.kind === "MOBILE");
    expect(dev.map((s) => [s.name, s.kind, s.stack, s.status])).toEqual([
      ["Backend (Node.js)", "BACKEND", "Node.js", "ok"],
      ["Mobile (React Native)", "MOBILE", "React Native", "ok"],
    ]);
    const simplify = (s: (typeof dev)[number]) =>
      s.tasks.map((t) => ({
        title: t.title,
        comment: t.comment,
        subTasks: t.subTasks.map(({ title, min, max, comment }) => ({ title, min, max, comment })),
      }));
    expect(simplify(dev[0])).toEqual([
      {
        title: "Appointment booking",
        comment: "Doctor availability",
        subTasks: [
          { title: "Booking API", min: 12, max: 16, comment: "REST" },
          { title: "Reminder emails", min: 6.5, max: 8, comment: "" },
        ],
      },
      {
        title: "Lab results",
        comment: "",
        subTasks: [{ title: "Results API", min: 8, max: 12, comment: "" }],
      },
    ]);
    expect(simplify(dev[1])).toEqual([
      {
        title: "Appointment booking",
        comment: "Doctor availability",
        subTasks: [{ title: "Booking screens", min: 14, max: 20, comment: "Calendar view" }],
      },
    ]);
    expect(dev[0]).toMatchObject({
      bugFixPercent: 10,
      development: { min: 26.5, max: 36 },
      activities: [{ title: "Deployment", min: 16, max: 24, comment: "Staging, Production" }],
      assumptions: ["Lab results come from the client's API"],
      risks: [],
      estimator: user.name,
    });
    expect(dev[1]).toMatchObject({
      bugFixPercent: 10,
      risks: ["App store review delays"],
      assumptions: [],
    });
  });
});

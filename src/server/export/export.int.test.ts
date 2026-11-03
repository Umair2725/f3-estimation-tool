import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toCurrentUser, type CurrentUser } from "@/server/auth/access";
import type { Role } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { createUser, deleteUsers } from "../../../test/factories";
import { getEstimate, saveEstimate, type EstimateView } from "../estimates";
import { createRequest, getRequest, saveStep } from "../estimation-requests";
import { exportInternal } from "./export";
import { sheetNames, TEMPLATE_PATH } from "./workbook";

const users: string[] = [];
const tag = randomUUID().slice(0, 8);
let tech: Record<string, string>;

beforeAll(async () => {
  tech = Object.fromEntries((await getDb().technology.findMany()).map((t) => [t.name, t.id]));
});
afterAll(async () => {
  await getDb().estimationRequest.deleteMany({ where: { ownerId: { in: users } } });
  await getDb().client.deleteMany({ where: { name: { contains: tag } } });
  await deleteUsers(users);
});

async function person(role: Role | null = "ESTIMATOR") {
  const user = await createUser({ role });
  users.push(user.id);
  return toCurrentUser(user) as CurrentUser;
}

function inputFrom(view: EstimateView) {
  return {
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
  };
}

/** The spec example: Backend 100–140 h of Sub tasks, Deployment 16–24, QA 25%, PM 30%, $30. */
async function specRequest(owner: CurrentUser, subTaskCount = 2) {
  const { id } = await createRequest(owner, {
    projectName: `Patient portal ${tag}`,
    clientName: `Northwind ${tag}`,
    projectDate: "2026-10-31",
  });
  await saveStep(owner, id, 2, {
    applicationTypes: ["Web", "Mobile"],
    operatingSystems: ["iOS", "Android"],
    browsers: ["Chrome"],
    parts: [
      { part: "BACKEND", technologyIds: [tech["Node.js"]] },
      { part: "MOBILE", technologyIds: [tech["Flutter"]] },
    ],
  });
  await saveStep(owner, id, 3, {
    hosting: ["AWS"],
    environments: ["Staging", "Production"],
    compliance: ["HIPAA"],
    nfr: { security: { enabled: true, note: "Pen test before launch" } },
  });
  await saveStep(owner, id, 4, {
    loadedIds: [],
    features: [
      {
        name: "Appointment booking",
        description: "Doctor availability",
        parts: ["BACKEND", "MOBILE"],
      },
    ],
  });
  const view = await getEstimate(owner, id);
  // Split 100–140 h into one-decimal pieces; the first takes the remainder.
  const split = (totalTenths: number, i: number) => {
    const each = Math.floor(totalTenths / subTaskCount);
    return (i === 0 ? totalTenths - each * (subTaskCount - 1) : each) / 10;
  };
  view.parts[0].tasks[0].subTasks = Array.from({ length: subTaskCount }, (_, i) => ({
    title: `Backend piece ${i + 1}`,
    min: split(1000, i),
    max: split(1400, i),
    comment: i === 0 ? "First" : "",
  }));
  view.parts[0].deploymentMin = 16;
  view.parts[0].deploymentMax = 24;
  view.parts[0].assumptions = ["Client provides SMS gateway"];
  view.parts[1].risks = ["App store review delays"];
  await saveEstimate(owner, id, inputFrom(view));
  return id;
}

async function read(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

function formula(cell: ExcelJS.Cell) {
  const v = cell.value as ExcelJS.CellFormulaValue;
  return { formula: v?.formula, result: v?.result as number };
}

describe("internal Excel export (specs/excel-export)", () => {
  it("has the Summary and one development sheet per part, named by part and stack", async () => {
    const owner = await person();
    const id = await specRequest(owner);
    const { buffer, fileName } = await exportInternal(owner, id, new Date("2026-10-31T10:00:00Z"));
    expect(fileName).toBe(`Patient portal ${tag} – Estimate (internal) – 2026-10-31.xlsx`);
    const wb = await read(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Backend (Node.js)",
      "Mobile (Flutter)",
    ]);
  });

  it("writes the Summary with linked rows, QA and PM, Total, price block and special considerations", async () => {
    const owner = await person();
    const id = await specRequest(owner);
    const wb = await read((await exportInternal(owner, id)).buffer);
    const s = wb.getWorksheet("Summary")!;
    expect(s.getCell("B2").value).toBe(`Patient portal ${tag}`);
    expect(s.getCell("C5").value).toBe(`Northwind ${tag}`);

    expect(s.getCell("B11").value).toBe("Backend (Node.js)");
    expect(formula(s.getCell("C11"))).toEqual({ formula: "'Backend (Node.js)'!D6", result: 126 });
    expect(formula(s.getCell("D11")).formula).toBe("'Backend (Node.js)'!E6");
    expect(s.getCell("B12").value).toBe("Mobile (Flutter)");
    expect(s.getCell("B13").value).toBe("QA Estimates");
    expect(formula(s.getCell("C13"))).toEqual({ formula: "SUM(C11:C12)*25%", result: 31.5 });
    expect(s.getCell("B14").value).toBe("PM Estimates");
    expect(formula(s.getCell("D14")).formula).toBe("SUM(D11:D12)*30%");

    const total = formula(s.getCell("C16"));
    expect(s.getCell("B16").value).toBe("Total Estimates");
    expect(total.formula).toBe("SUM(C11:C14)");
    expect(total.result).toBeCloseTo(195.3, 9);
    expect(formula(s.getCell("D16")).result).toBeCloseTo(275.9, 9);

    expect(s.getCell("B18").value).toBe("Hourly rate (USD)");
    expect(s.getCell("C18").value).toBe(30);
    expect(formula(s.getCell("C19")).formula).toBe("C16*C18");
    expect(formula(s.getCell("C19")).result).toBeCloseTo(5859, 9);
    expect(formula(s.getCell("C20")).formula).toBe("D16*C18");
    expect(formula(s.getCell("C20")).result).toBeCloseTo(8277, 9);

    // Resources and Weeks stay empty.
    for (let r = 9; r <= 24; r++) {
      for (const col of ["G", "H", "I"])
        expect(s.getCell(`${col}${r}`).value, `${col}${r}`).toBeNull();
    }

    expect(s.getCell("C27").value).toBe("Web, Mobile");
    expect(s.getCell("C28").value).toBe("Multiple");
    expect(s.getCell("E28").value).toBe("iOS, Android");
    expect(s.getCell("C29").value).toBe("Single");
    expect(s.getCell("C30").value).toBe("AWS");
    expect(s.getCell("E30").value).toBe("Staging, Production");
    expect(s.getCell("C31").value).toBe("No");
    expect(s.getCell("C32").value).toBe("Yes");
    expect(s.getCell("E32").value).toBe("Pen test before launch");
    expect(s.getCell("E34").value).toBe("Compliance: HIPAA");
  });

  it("leaves out QA or PM when turned off", async () => {
    const owner = await person();
    const id = await specRequest(owner);
    const view = await getEstimate(owner, id);
    await saveEstimate(owner, id, { ...inputFrom(view), pmEnabled: false });
    const s = (await read((await exportInternal(owner, id)).buffer)).getWorksheet("Summary")!;
    expect(s.getCell("B13").value).toBe("QA Estimates");
    expect(s.getCell("B15").value).toBe("Total Estimates");
    expect(formula(s.getCell("C15")).result).toBeCloseTo(157.5, 9);
  });

  it("writes Tasks, Sub tasks and every total as formulas on the development sheet", async () => {
    const owner = await person();
    const id = await specRequest(owner, 9); // more Sub tasks than the template block has rows
    const wb = await read((await exportInternal(owner, id)).buffer);
    const d = wb.getWorksheet("Backend (Node.js)")!;
    const template = new ExcelJS.Workbook();
    await template.xlsx.readFile(TEMPLATE_PATH);
    const proto = template.getWorksheet("Dev Mobile Estimates")!;

    expect(d.getCell("B2").value).toBe(`Development Estimates for Patient portal ${tag}`);
    expect(d.getCell("C8").value).toBe("Task");
    expect(d.getCell("C8").fill).toEqual(proto.getCell("C8").fill); // header style kept
    expect(d.getCell("C9").value).toBe("Appointment booking");
    expect(formula(d.getCell("D9"))).toEqual({ formula: "SUM(D10:D18)", result: 100 });
    expect(formula(d.getCell("E9")).formula).toBe("SUM(E10:E18)");
    expect(d.getCell("C18").value).toBe("Backend piece 9");

    // Development total, Bug fixing, Deployment, post-development and Grand Total.
    const devRow = 20;
    expect(d.getCell(`C${devRow}`).value).toBe("Development Total Efforts (in hours)");
    expect(formula(d.getCell(`D${devRow}`))).toEqual({ formula: "SUM(D9)", result: 100 });
    expect(d.getCell(`C${devRow}`).fill).toEqual(proto.getCell("C31").fill);
    expect(formula(d.getCell(`D${devRow + 4}`))).toEqual({ formula: `D${devRow}*10%`, result: 10 });
    expect(d.getCell(`C${devRow + 5}`).value).toBe("Deployment");
    expect(d.getCell(`D${devRow + 5}`).value).toBe(16);
    expect(d.getCell(`F${devRow + 5}`).value).toBe("Staging, Production");
    expect(formula(d.getCell(`D${devRow + 6}`)).formula).toBe(`D${devRow + 4}+D${devRow + 5}`);
    expect(formula(d.getCell("D6"))).toEqual({ formula: `D${devRow}+D${devRow + 6}`, result: 126 });
    expect(formula(d.getCell("E6")).result).toBeCloseTo(178, 9);

    let assumptions = false;
    let notes = false;
    d.eachRow((row) => {
      if (row.getCell(3).value === "Client provides SMS gateway") assumptions = true;
      if (row.getCell(3).value === "Notes") notes = true;
    });
    expect(assumptions).toBe(true);
    expect(notes).toBe(true);
  });

  it("ships nothing from the template's samples and no broken references", async () => {
    const owner = await person();
    const id = await specRequest(owner);
    const wb = await read((await exportInternal(owner, id)).buffer);
    expect(wb.getWorksheet("Questions")).toBeUndefined();
    const names = new Set(wb.worksheets.map((w) => w.name));
    wb.worksheets.forEach((ws) =>
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          const v = cell.value;
          if (typeof v === "string") {
            expect(v).not.toMatch(/^<.*>$|^(Sub task|Task) -\s?\d|PickupMonitor|\[Project Name\]/);
          }
          if (v && typeof v === "object" && "formula" in v) {
            for (const m of String(v.formula).matchAll(/'((?:[^']|'')+)'!/g))
              expect(names.has(m[1])).toBe(true);
          }
        }),
      ),
    );
  });

  it("records the export and leaves the status alone; refuses people without a role", async () => {
    const owner = await person();
    const id = await specRequest(owner);
    await exportInternal(await person("TECH_LEAD"), id);
    const request = await getRequest(owner, id);
    expect(request.status).toBe("DRAFT");
    expect(request.lastExport?.userName).toBe("Integration Test");
    expect(await getDb().exportRecord.count({ where: { requestId: id, kind: "INTERNAL" } })).toBe(
      1,
    );
    await expect(exportInternal(await person(null), id)).rejects.toMatchObject({ status: 403 });
    await expect(exportInternal(null, id)).rejects.toMatchObject({ status: 401 });
  });

  it("exports 300 Sub tasks in under 5 seconds", async () => {
    const owner = await person();
    const id = await specRequest(owner, 200);
    const view = await getEstimate(owner, id);
    view.parts[1].tasks[0].subTasks = Array.from({ length: 100 }, (_, i) => ({
      title: `M${i}`,
      min: 1,
      max: 2,
      comment: "",
    }));
    await saveEstimate(owner, id, inputFrom(view));
    const started = performance.now();
    const { buffer } = await exportInternal(owner, id);
    expect(performance.now() - started).toBeLessThan(5000);
    expect((await read(buffer)).worksheets).toHaveLength(3);
  }, 30_000);
});

describe("sheetNames", () => {
  it("removes forbidden characters, limits to 31 characters and keeps names unique", () => {
    expect(
      sheetNames([
        "Backend (Node.js)",
        "Web/Frontend (React, Next.js, Angular, Vue)",
        "Admin Panel [beta]: v2?",
        "Backend (Node.js)",
      ]),
    ).toEqual([
      "Backend (Node.js)",
      "Web Frontend (React, Next.js,…",
      "Admin Panel beta v2",
      "Backend (Node.js) 2",
    ]);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { benchmarkSource, changeLine } from "./labels";
import {
  decide,
  projectsCount,
  recalculated,
  weightedHours,
  type ObservationInput,
} from "./recalc";
import { BENCHMARK_PART_LABELS, parseCsv, readCsv, readRows } from "./rows";

const HEADER =
  "feature_id,module,feature,part,typical_stack,what_is_included,pre_ai_min_hours,pre_ai_max_hours,pre_ai_source,ai_hours_experienced,ai_hours_junior,ai_tools_used,projects_count,filled_by,confirmed_by,confirmed_on,notes";

describe("benchmark rows (specs/feature-benchmarks import)", () => {
  it("parses quoted commas, doubled quotes and line breaks", () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,,\n')).toEqual([
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["x", "y", "", ""],
    ]);
  });

  it("reads the seed CSV: 166 rows, no problems, no AI hours", () => {
    const { rows, problems } = readCsv(readFileSync("data/feature-benchmarks.csv", "utf8"));
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(166);
    expect(rows[0]).toMatchObject({
      code: "FB-001",
      part: "WEB_FRONTEND",
      stack: "React",
      included: "Repo scaffolding, folder structure, naming conventions, lint/format",
      preAiMinTenths: 20,
      preAiMaxTenths: 80,
      experiencedTenths: null,
    });
    expect(rows.some((r) => r.experiencedTenths !== null)).toBe(false);
  });

  it("maps every part name, case-insensitively", () => {
    const lines = Object.values(BENCHMARK_PART_LABELS).map(
      (label, i) => `FB-${100 + i},M,Feature ${i},${label.toUpperCase()},Any,,,,,,,,,,,,`,
    );
    const { rows, problems } = readCsv([HEADER, ...lines].join("\n"));
    expect(problems).toEqual([]);
    expect(rows.map((r) => r.part)).toEqual([
      "WEB_FRONTEND",
      "BACKEND",
      "ADMIN_PANEL",
      "MOBILE",
      "CLOUD_INFRA",
      "DESIGN",
      "ANY",
    ]);
  });

  it("reports bad rows by number and keeps the good ones", () => {
    const { rows, problems } = readCsv(
      [
        HEADER,
        "FB-001,M,Sign up,Web/Frontend,React,,10,12,,4,6,Claude Code,2,Sara,Ahmed,2026-09-01,",
        "FB-002,M,Login,Frontendz,React,,,,,,,,,,,,",
        "FB-003,M,Reset,Backend,Any,,8,4,,,,,,,,,",
        "FB-004,M,Upload,Backend,Any,,,,,lots,,,,,,,",
        "FB-005,M,Search,Backend,Any,,,,,6,4,,,,,,",
        "FB-001,M,Again,Backend,Any,,,,,,,,,,,,",
      ].join("\n"),
    );
    expect(
      rows.map((r) => [r.code, r.experiencedTenths, r.juniorTenths, r.confirmedBy, r.date]),
    ).toEqual([["FB-001", 40, 60, "Ahmed", "2026-09-01"]]);
    expect(problems.map((p) => p.message)).toEqual([
      "Row 3: unknown part Frontendz",
      "Row 4: Pre-AI Min is more than Max",
      "Row 5: AI hours (experienced) isn't a number of hours: lots",
      "Row 6: experienced hours are more than junior hours",
      "Row 7: FB-001 appears twice",
    ]);
  });

  it("reads survey rows by their display headers", () => {
    const header = [
      null,
      "ID",
      "Module",
      "Feature",
      "Part",
      "Typical stack",
      "What is included (one instance)",
      "Pre-AI Min (h)",
      "Pre-AI Max (h)",
      "Pre-AI source",
      "AI hours - experienced dev",
      "AI hours - junior dev",
      "AI tools used",
      "Based on # projects",
      "Filled by (Tech Lead)",
      "Confirmed by (Architect)",
      "Date (YYYY-MM-DD)",
      "Notes",
    ];
    const { rows } = readRows(header, [
      [
        null,
        "FB-012",
        "Users",
        "Sign up",
        "Web/Frontend",
        "React",
        "",
        10,
        12,
        "",
        4,
        6,
        "Cursor",
        3,
        "Sara",
        "Ahmed",
        new Date("2026-09-15"),
        "",
      ],
    ]);
    expect(rows[0]).toMatchObject({
      code: "FB-012",
      experiencedTenths: 40,
      juniorTenths: 60,
      projectsCount: 3,
      date: "2026-09-15",
    });
  });
});

const obs = (
  level: ObservationInput["level"],
  hours: number,
  daysAgo: number,
  requestId: string | null = null,
): ObservationInput => ({
  id: `${level}${hours}${daysAgo}`,
  level,
  hoursTenths: hours * 10,
  observedOn: new Date(Date.UTC(2026, 10, 1) - daysAgo * 86_400_000),
  requestId,
});
const now = new Date(Date.UTC(2026, 10, 1));

describe("recalculation (specs/feature-benchmarks)", () => {
  it("weighs the last 6 months double and rounds to 0.5 h (spec example: 4.5 h)", () => {
    expect(
      weightedHours([obs("EXPERIENCED", 6, 730), obs("EXPERIENCED", 4, 30)], "EXPERIENCED", now),
    ).toBe(45);
    expect(weightedHours([obs("MIXED", 3, 1)], "EXPERIENCED", now)).toBeNull();
  });

  it("keeps a level without observations and ignores mixed ones", () => {
    expect(
      recalculated(
        { experienced: 40, junior: 60 },
        [obs("EXPERIENCED", 3, 1), obs("MIXED", 1, 1)],
        now,
      ),
    ).toEqual({
      experienced: 30,
      junior: 60,
    });
  });

  it("proposes Confirmed changes over 15%, applies the rest, and always applies to a Draft", () => {
    expect(
      decide({ experienced: 40, junior: 60 }, { experienced: 30, junior: 60 }, "CONFIRMED"),
    ).toBe("propose");
    expect(
      decide({ experienced: 40, junior: 60 }, { experienced: 35, junior: 60 }, "CONFIRMED"),
    ).toBe("apply");
    expect(decide({ experienced: 40, junior: 60 }, { experienced: 10, junior: 60 }, "DRAFT")).toBe(
      "apply",
    );
    expect(
      decide({ experienced: 40, junior: 60 }, { experienced: 40, junior: 60 }, "CONFIRMED"),
    ).toBe("none");
    expect(
      decide({ experienced: null, junior: null }, { experienced: 40, junior: null }, "CONFIRMED"),
    ).toBe("propose");
  });

  it("counts distinct projects, plus one per observation without a project", () => {
    expect(
      projectsCount([
        obs("EXPERIENCED", 4, 1, "a"),
        obs("JUNIOR", 6, 1, "a"),
        obs("EXPERIENCED", 5, 1),
        obs("MIXED", 5, 1, "b"),
      ]),
    ).toBe(2);
  });
});

describe("labels", () => {
  it("cites a Confirmed benchmark and marks a Draft", () => {
    const b = {
      code: "FB-012",
      confirmedByName: "Ahmed",
      projectsCount: 4,
      updatedAt: "2026-09-14T10:00:00Z",
    };
    expect(benchmarkSource({ ...b, status: "CONFIRMED" })).toBe(
      "Benchmark FB-012, confirmed by Ahmed, based on 4 projects, updated 2026-09",
    );
    expect(benchmarkSource({ ...b, status: "DRAFT" })).toBe(
      "Draft benchmark FB-012, not confirmed yet",
    );
  });

  it("describes changes for the log", () => {
    expect(
      changeLine({
        kind: "RECALCULATED",
        fromExperienced: 40,
        toExperienced: 35,
        fromJunior: 60,
        toJunior: 60,
        observationCount: 3,
      }),
    ).toBe("Recalculated 4–6 h → 3.5–6 h from 3 observations");
  });
});

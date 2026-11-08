// Fictional demo data for the sign-in page's product tour (no real client names).

export type TourRow =
  | {
      name: string;
      src: "past";
      sim: number;
      min: number;
      max: number;
      ref: string;
      actual: number;
    }
  | { name: string; src: "bench"; min: number; max: number; ref: string }
  | { name: string; src: "ai" };

export type TourTab = "backend" | "mobile" | "web";

export const TABS: { id: TourTab; label: string }[] = [
  { id: "backend", label: "Backend (Node.js)" },
  { id: "mobile", label: "Mobile (Flutter)" },
  { id: "web", label: "Web (React)" },
];

/** The AI row sits at this index on every tab. */
export const AI_ROW = 2;

export const ROWS: Record<TourTab, TourRow[]> = {
  backend: [
    {
      name: "Appointment booking",
      src: "past",
      sim: 91,
      min: 32,
      max: 40,
      ref: "Clinic booking app (2025)",
      actual: 37,
    },
    {
      name: "Insurance verification",
      src: "bench",
      min: 18,
      max: 24,
      ref: "Third-party API integration",
    },
    { name: "Work orders", src: "ai" },
    {
      name: "Push notifications",
      src: "past",
      sim: 84,
      min: 10,
      max: 14,
      ref: "Field service app (2024)",
      actual: 12,
    },
  ],
  mobile: [
    {
      name: "Onboarding & sign-in",
      src: "past",
      sim: 88,
      min: 20,
      max: 26,
      ref: "Contoso Logistics driver app",
      actual: 23,
    },
    { name: "Offline sync", src: "bench", min: 30, max: 42, ref: "Offline-first sync" },
    { name: "Work orders", src: "ai" },
    {
      name: "Camera & uploads",
      src: "past",
      sim: 79,
      min: 8,
      max: 12,
      ref: "Field service app (2024)",
      actual: 11,
    },
  ],
  web: [
    { name: "Admin dashboard", src: "bench", min: 24, max: 32, ref: "Dashboard with charts" },
    {
      name: "Role management",
      src: "past",
      sim: 93,
      min: 12,
      max: 16,
      ref: "Clinic booking app (2025)",
      actual: 14,
    },
    { name: "Work orders", src: "ai" },
    {
      name: "Reports export",
      src: "past",
      sim: 81,
      min: 10,
      max: 14,
      ref: "Fabrikam HR portal",
      actual: 13,
    },
  ],
};

/** The AI estimate's Sub tasks: [title, base rounds, risk factor]. */
export const AI_SUBTASKS: [string, number, number][] = [
  ["Core logic · Moderate, High risk", 8, 1.5],
  ["Screens · Boilerplate", 3, 1.0],
];

export type Range = [number, number];

/** Min = base rounds, Max = effective rounds, plus 15% integration (agent-estimation). */
export function aiRounds(): { total: Range; integration: Range } {
  let min = 0;
  let max = 0;
  for (const [, base, factor] of AI_SUBTASKS) {
    min += base;
    max += Math.round(base * factor);
  }
  const integration: Range = [Math.round(min * 0.15), Math.round(max * 0.15)];
  return { total: [min + integration[0], max + integration[1]], integration };
}

export function rowHours(row: TourRow, minutesPerRound: number): Range {
  if (row.src !== "ai") return [row.min, row.max];
  const { total } = aiRounds();
  return [
    Math.round((total[0] * minutesPerRound) / 60),
    Math.round((total[1] * minutesPerRound) / 60),
  ];
}

/** Development, overheads (bugs 10% + QA 25% + PM 30%) and the total for one tab. */
export function tabTotals(tab: TourTab, minutesPerRound: number) {
  const dev = ROWS[tab].reduce<Range>(
    (sum, row) => {
      const [lo, hi] = rowHours(row, minutesPerRound);
      return [sum[0] + lo, sum[1] + hi];
    },
    [0, 0],
  );
  const overheads: Range = [Math.round(dev[0] * 0.65), Math.round(dev[1] * 0.65)];
  const total: Range = [dev[0] + overheads[0], dev[1] + overheads[1]];
  return { dev, overheads, total };
}

export const range = ([lo, hi]: Range) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

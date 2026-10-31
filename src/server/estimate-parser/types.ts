// Parsed estimate files (specs/estimate-file-parsing). Every item keeps where it came from.

export type SheetKind =
  | "BACKEND"
  | "WEB_FRONTEND"
  | "ADMIN_PANEL"
  | "MOBILE"
  | "CLOUD_INFRA"
  | "QA"
  | "GD"
  | "PM"
  | "QUESTIONS"
  | "SUMMARY"
  | "UNKNOWN";

export const PART_KINDS: SheetKind[] = [
  "BACKEND",
  "WEB_FRONTEND",
  "ADMIN_PANEL",
  "MOBILE",
  "CLOUD_INFRA",
];

export type MinMax = { min: number; max: number };

export type ParseWarning = { sheet?: string; row?: number; cell?: string; message: string };

export type ParsedSubTask = {
  title: string;
  min: number;
  max: number;
  comment: string;
  row: number;
};

export type ParsedTask = {
  title: string;
  row: number;
  research: boolean;
  comment: string;
  subTasks: ParsedSubTask[];
  min: number;
  max: number;
};

export type ParsedActivity = {
  title: string;
  min: number;
  max: number;
  comment: string;
  row: number;
};

export type ParsedSheet = {
  name: string;
  kind: SheetKind;
  /** "ok" with data; "no-data" skeleton or untouched template; "no-table" header not found; "skipped" not a development sheet. */
  status: "ok" | "no-data" | "no-table" | "skipped";
  title?: string;
  stack?: string;
  estimator?: string;
  reviewer?: string;
  date?: { raw: string; iso?: string };
  tasks: ParsedTask[];
  activities: ParsedActivity[];
  environments: string[];
  bugFixPercent: number | null;
  /** Recalculated from Sub tasks (research Tasks excluded). */
  development: MinMax;
  /** What the file itself shows, when readable. */
  fileDevelopment?: MinMax;
  assumptions: string[];
  risks: string[];
};

export type ParsedSummary = {
  projectName: string | null;
  clientName: string | null;
  projectManager: string | null;
  date: { raw: string; iso?: string } | null;
  qaPercent: number | null;
  pmPercent: number | null;
  considerations: { label: string; action: string; comments: string }[];
};

export type ParsedEstimate =
  | { ok: false; error: string; fingerprint: string; fileName: string }
  | {
      ok: true;
      fingerprint: string;
      fileName: string;
      templateVersion: string | null;
      summary: ParsedSummary;
      sheets: ParsedSheet[];
      warnings: ParseWarning[];
    };

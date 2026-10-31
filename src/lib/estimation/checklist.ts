// Pre-export checklist (specs/excel-export "Pre-export checklist"). Warnings only: they never
// block the internal export. Pure, so the review workflow (F-10) can reuse it.
import { PART_LABELS, type Part } from "./options";

export type ChecklistInput = {
  parts: {
    part: Part;
    assumptions: string[];
    risks: string[];
    tasks: {
      taskId: string;
      featureName: string;
      subTasks: { title: string; min: number; max: number; comment: string }[];
    }[];
  }[];
  features: { name: string; description?: string }[];
  otherConsiderations: string;
  overheads: { hourlyRate: number; rateConfirmed: boolean };
  approvedRates: number[];
  /** Names of every other client in the tool (not this request's client). */
  otherClients: string[];
};

export type ChecklistCode =
  | "min-over-max"
  | "zero-hours"
  | "task-without-subtasks"
  | "feature-without-hours"
  | "rate-unconfirmed"
  | "rate-not-approved"
  | "other-client-named";

export type ChecklistItem = {
  code: ChecklistCode;
  message: string;
  /** Where to fix it: a part tab and optionally a Task on it. */
  part?: Part;
  taskId?: string;
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match; names under 4 characters are ignored to avoid noise. */
export function mentionsName(text: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(trimmed)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function buildChecklist(input: ChecklistInput): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const hoursByFeature = new Map<string, number>();

  for (const part of input.parts) {
    const where = PART_LABELS[part.part];
    for (const task of part.tasks) {
      const taskHours = task.subTasks.reduce((sum, s) => sum + s.min + s.max, 0);
      hoursByFeature.set(task.featureName, (hoursByFeature.get(task.featureName) ?? 0) + taskHours);
      if (task.subTasks.length === 0) {
        items.push({
          code: "task-without-subtasks",
          message: `${where} → "${task.featureName}" has no Sub tasks`,
          part: part.part,
          taskId: task.taskId,
        });
      }
      for (const sub of task.subTasks) {
        const label = `${where} → "${task.featureName}" → "${sub.title}"`;
        if (sub.min > sub.max) {
          items.push({
            code: "min-over-max",
            message: `Min is more than Max: ${label}`,
            part: part.part,
            taskId: task.taskId,
          });
        }
        if (sub.min === 0 && sub.max === 0) {
          items.push({
            code: "zero-hours",
            message: `No hours: ${label}`,
            part: part.part,
            taskId: task.taskId,
          });
        }
      }
    }
  }

  for (const feature of input.features) {
    if ((hoursByFeature.get(feature.name) ?? 0) === 0) {
      items.push({
        code: "feature-without-hours",
        message: `"${feature.name}" has no hours on any part`,
      });
    }
  }

  if (!input.approvedRates.includes(input.overheads.hourlyRate)) {
    items.push({ code: "rate-not-approved", message: "The rate is no longer an approved rate" });
  }
  if (!input.overheads.rateConfirmed) {
    items.push({ code: "rate-unconfirmed", message: "Confirm the hourly rate" });
  }

  const texts = [
    input.otherConsiderations,
    ...input.features.flatMap((f) => [f.name, f.description ?? ""]),
    ...input.parts.flatMap((p) => [
      ...p.assumptions,
      ...p.risks,
      ...p.tasks.flatMap((t) => t.subTasks.flatMap((s) => [s.title, s.comment])),
    ]),
  ].join("\n");
  for (const name of input.otherClients) {
    if (mentionsName(texts, name)) {
      items.push({
        code: "other-client-named",
        message: `The request names another client: ${name}`,
      });
    }
  }
  return items;
}

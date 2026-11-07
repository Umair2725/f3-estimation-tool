// Items needing the Approver's attention (specs/estimate-review "Items needing attention"), built
// from the pre-export checklist. Min > Max never appears: it blocks submitting.
import type { ChecklistCode, ChecklistItem } from "@/lib/estimation/checklist";

/** Matching adds its own codes (specs/feature-matching "Review attention for suggestions"). */
export type AttentionCode = ChecklistCode | "ai-guess" | "no-match" | "waiting-reference";

export type AttentionItem = { code: AttentionCode; message: string; taskId?: string };

export type AttentionGroup = {
  code: AttentionCode;
  summary: string; // "1 Sub task has no hours"
  items: AttentionItem[];
};

const ORDER: ChecklistCode[] = [
  "zero-hours",
  "task-without-subtasks",
  "feature-without-hours",
  "rate-unconfirmed",
  "rate-not-approved",
  "other-client-named",
];

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summary(code: ChecklistCode, items: ChecklistItem[]): string {
  const n = items.length;
  switch (code) {
    case "zero-hours":
      return `${count(n, "Sub task has", "Sub tasks have")} no hours`;
    case "task-without-subtasks":
      return `${count(n, "Task has", "Tasks have")} no Sub tasks`;
    case "feature-without-hours":
      return `${count(n, "feature has", "features have")} no hours`;
    case "other-client-named":
      return n === 1 ? items[0].message : `The request names ${n} other clients`;
    default:
      return items[0].message;
  }
}

export function attentionGroups(checklist: ChecklistItem[]): AttentionGroup[] {
  return ORDER.flatMap((code) => {
    const items = checklist.filter((i) => i.code === code);
    return items.length ? [{ code, summary: summary(code, items), items }] : [];
  });
}

type TaskRef = { taskId: string; name: string };

/** AI guesses in use, Tasks with no reliable match and no hours, and Tasks waiting for a reference. */
export function matchingGroups(input: {
  aiGuess: TaskRef[];
  noMatch: TaskRef[];
  waitingReference: TaskRef[];
}): AttentionGroup[] {
  const group = (
    code: AttentionCode,
    tasks: TaskRef[],
    summary: (n: number) => string,
    message: (name: string) => string,
  ): AttentionGroup[] =>
    tasks.length
      ? [
          {
            code,
            summary: summary(tasks.length),
            items: tasks.map((t) => ({ code, message: message(t.name), taskId: t.taskId })),
          },
        ]
      : [];
  return [
    ...group(
      "ai-guess",
      input.aiGuess,
      (n) => `${count(n, "Task uses", "Tasks use")} an AI estimate`,
      (name) => `"${name}": AI-generated, no historical reference`,
    ),
    ...group(
      "no-match",
      input.noMatch,
      (n) => `${count(n, "Task has", "Tasks have")} no reliable match and no hours`,
      (name) => `"${name}": no reliable match`,
    ),
    ...group(
      "waiting-reference",
      input.waitingReference,
      (n) => `${count(n, "Task is", "Tasks are")} waiting for an Architect's reference`,
      (name) => `"${name}": waiting for an Architect's reference`,
    ),
  ];
}

/** Submitting is refused while any Sub task has Min greater than Max. */
export function minOverMaxMessage(checklist: ChecklistItem[]): string | null {
  const n = checklist.filter((i) => i.code === "min-over-max").length;
  return n
    ? `Fix the hours before submitting: ${count(n, "Sub task has", "Sub tasks have")} Min greater than Max`
    : null;
}

// Items needing the Approver's attention (specs/estimate-review "Items needing attention"), built
// from the pre-export checklist. Min > Max never appears: it blocks submitting.
import type { ChecklistCode, ChecklistItem } from "@/lib/estimation/checklist";

export type AttentionGroup = {
  code: ChecklistCode;
  summary: string; // "1 Sub task has no hours"
  items: ChecklistItem[];
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

/** Submitting is refused while any Sub task has Min greater than Max. */
export function minOverMaxMessage(checklist: ChecklistItem[]): string | null {
  const n = checklist.filter((i) => i.code === "min-over-max").length;
  return n
    ? `Fix the hours before submitting: ${count(n, "Sub task has", "Sub tasks have")} Min greater than Max`
    : null;
}

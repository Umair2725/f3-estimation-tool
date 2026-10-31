// What a request still needs before Finish (specs/estimation-requests: "Finish checks
// completeness"). Pure, so the export and review workflow can reuse it.
import { PART_LABELS, type Part, type Step } from "./options";

export type CompletenessInput = {
  clientName: string | null;
  parts: { part: Part; technologyCount: number }[];
  features: { name: string; parts: Part[] }[];
};

export type MissingItem = { step: Step; message: string };

export function checkCompleteness(request: CompletenessInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!request.clientName?.trim()) missing.push({ step: 1, message: "Choose the client" });
  if (request.parts.length === 0) {
    missing.push({ step: 2, message: "Choose at least one part" });
  }
  for (const part of request.parts) {
    if (part.technologyCount === 0) {
      missing.push({ step: 2, message: `Choose a technology for ${PART_LABELS[part.part]}` });
    }
  }
  if (request.features.length === 0) {
    missing.push({ step: 4, message: "Add at least one feature" });
  }
  for (const feature of request.features) {
    if (feature.parts.length === 0) {
      missing.push({ step: 4, message: `Choose a part for "${feature.name}"` });
    }
  }
  return missing;
}

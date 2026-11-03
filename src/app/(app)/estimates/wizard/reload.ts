import type { Step } from "@/lib/estimation/options";
import type { WizardState } from "./types";

// Picking up changes made elsewhere (specs/estimation-requests "Wizard keeps changes made
// elsewhere"). Pure, so the rules are unit tested.

/** Whether the request's version from the server is newer than the one the wizard knows. */
export function isNewer(version: string | null, known: string | null): boolean {
  return !!version && (!known || version > known);
}

/**
 * The wizard's state after the request changed elsewhere: every step comes from `fresh`, and
 * so does the saved baseline. Unsaved values on the current step are kept; on step 4 the
 * features added elsewhere since the form loaded are appended to them, so nothing is lost.
 */
export function reloadState(
  current: WizardState,
  saved: WizardState,
  fresh: WizardState,
  step: Step,
): WizardState {
  const dirty = JSON.stringify(current[step]) !== JSON.stringify(saved[step]);
  if (!dirty) return fresh;
  if (step !== 4) return { ...fresh, [step]: current[step] };
  const known = new Set([...saved[4].features, ...current[4].features].map((f) => f.key));
  const addedElsewhere = fresh[4].features.filter((f) => !known.has(f.key));
  return { ...fresh, 4: { features: [...current[4].features, ...addedElsewhere] } };
}

/** Swaps the form's keys for the saved feature ids after a step 4 save (same order). */
export function withSavedIds(state: WizardState, featureIds: string[] | undefined): WizardState {
  if (!featureIds || featureIds.length !== state[4].features.length) return state;
  return {
    ...state,
    4: { features: state[4].features.map((f, i) => ({ ...f, key: featureIds[i] })) },
  };
}

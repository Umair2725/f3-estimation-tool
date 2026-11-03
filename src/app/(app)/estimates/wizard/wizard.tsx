"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import type { MissingItem } from "@/lib/estimation/completeness";
import { STEPS, type Step } from "@/lib/estimation/options";
import { savedAgoLabel } from "@/lib/relative-time";
import { createRequestAction, saveStepAction, type SaveResult } from "../actions";
import { isNewer, reloadState, withSavedIds } from "./reload";
import { Step1, Step2, Step3, Step4 } from "./steps";
import { RequestSummary } from "./summary";
import type { Errors, WizardProps, WizardState } from "./types";

// The four-step wizard (specs/estimation-requests, approved design screen 3). Every move
// (Next, Back, stepper, Save & exit, Finish) saves the current step first; a failed save keeps
// the person on the step with the errors shown.
//
// Next.js keeps this page mounted (hidden) while the person is elsewhere, so the wizard can hold
// an old copy of the request. When the page brings a newer version (changed elsewhere, such as
// items added from a document) the wizard reloads, keeping unsaved values on the current step.

type Destination = { kind: "step"; step: Step } | { kind: "exit" } | { kind: "finish" };

export function Wizard(props: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(props.initialStep);
  const [furthest, setFurthest] = useState<Step>(
    Math.max(props.lastStep, props.initialStep) as Step,
  );
  const [state, setState] = useState<WizardState>(props.initial);
  const [saved, setSaved] = useState<WizardState>(props.initial);
  const [savedAt, setSavedAt] = useState<string | null>(props.savedAt);
  const [knownVersion, setKnownVersion] = useState<string | null>(props.version);
  const [reloaded, setReloaded] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => new Date());
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Adjusting state while rendering (React's pattern for "props changed"), so the stale copy
  // is never shown.
  if (isNewer(props.version, knownVersion)) {
    setKnownVersion(props.version);
    setState(reloadState(state, saved, props.initial, step));
    setSaved(props.initial);
    setSavedAt(props.version);
    setReloaded(true);
  }

  const dirty = JSON.stringify(state[step]) !== JSON.stringify(saved[step]);

  // Keep "Draft saved · 2 minutes ago" current.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Warn before leaving the page with unsaved changes on this step.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<S extends Step>(s: S, value: WizardState[S]) {
    setState((prev) => ({ ...prev, [s]: value }));
  }

  async function save(): Promise<SaveResult> {
    // Step 4 also sends the features it loaded: only those can be removed by this save.
    const payload =
      step === 4
        ? { features: state[4].features, loadedIds: saved[4].features.map((f) => f.key) }
        : state[step];
    if (!props.id) return createRequestAction(payload);
    return saveStepAction(props.id, step, payload);
  }

  function go(destination: Destination) {
    startTransition(async () => {
      setMessage(null);
      setReloaded(false);
      const result = await save();
      if (!result.ok) {
        setErrors(result.fields);
        setMessage(result.message);
        return;
      }
      setErrors({});
      // New features get their saved ids, so the next save updates them instead of adding them.
      const done = step === 4 ? withSavedIds(state, result.featureIds) : state;
      if (done !== state) setState(done);
      setSaved((prev) => ({ ...prev, [step]: done[step] }));
      setSavedAt(result.savedAt);
      setKnownVersion(result.savedAt);
      setNow(new Date());

      if (destination.kind === "exit") {
        router.push("/");
        return;
      }
      if (destination.kind === "finish") {
        setMissing(result.missing);
        if (result.missing.length === 0) router.push(`/estimates/${result.id}`);
        return;
      }
      if (!props.id) {
        // The request exists now: continue on its edit page.
        router.replace(`/estimates/${result.id}/edit?step=${destination.step}`);
        return;
      }
      setMissing([]);
      setStep(destination.step);
      setFurthest((f) => Math.max(f, destination.step) as Step);
      router.replace(`/estimates/${props.id}/edit?step=${destination.step}`, { scroll: false });
      requestAnimationFrame(() => headingRef.current?.focus());
    });
  }

  const current = STEPS[step - 1];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {props.id ? state[1].projectName || "Estimation request" : "New estimation request"}
          </h1>
          <p className="mt-1.5 text-foreground-2">
            Four short steps. Everything is saved as a draft as you go, so you can leave and come
            back.
          </p>
        </div>

        <Stepper
          current={step}
          furthest={furthest}
          disabled={pending || !props.id}
          onPick={(s) => go({ kind: "step", step: s })}
        />

        <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
          {reloaded && (
            <p role="status" className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
              Updated with changes made elsewhere.
            </p>
          )}
          {message && (
            <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
              {message}
            </p>
          )}
          {missing.length > 0 && (
            <div role="alert" className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
              <p className="font-semibold">Before you finish:</p>
              <ul className="mt-1 list-disc pl-5">
                {missing.map((item) => (
                  <li key={`${item.step}-${item.message}`}>
                    {item.message}{" "}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => go({ kind: "step", step: item.step })}
                    >
                      Go to {STEPS[item.step - 1].label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section aria-labelledby="step-title" className={`${ui.card} flex flex-col gap-5 p-5`}>
            <h2
              id="step-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-bold outline-none"
            >
              Step {step} of 4: {current.label}
            </h2>
            {step === 1 && (
              <Step1
                value={state[1]}
                onChange={(v) => update(1, v)}
                errors={errors}
                clientNames={props.clientNames}
              />
            )}
            {step === 2 && (
              <Step2
                value={state[2]}
                onChange={(v) => update(2, v)}
                errors={errors}
                technologies={props.technologies}
                savedParts={saved[2].parts.map((p) => p.part)}
                features={state[4].features}
              />
            )}
            {step === 3 && (
              <Step3 value={state[3]} onChange={(v) => update(3, v)} errors={errors} />
            )}
            {step === 4 && (
              <Step4
                value={state[4]}
                onChange={(v) => update(4, v)}
                errors={errors}
                parts={saved[2].parts.map((p) => p.part)}
                documentsPanel={props.documentsPanel}
              />
            )}
          </section>
          <RequestSummary state={state} technologies={props.technologies} />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 md:-mx-7 md:px-7">
        <span className="text-sm text-muted" role="status" data-testid="saved-status">
          {savedAt ? `Draft saved · ${savedAgoLabel(new Date(savedAt), now)}` : "Not saved yet"}
          {dirty && savedAt ? " · unsaved changes" : ""}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={ui.ghostButton}
            disabled={pending}
            onClick={() => go({ kind: "exit" })}
          >
            Save &amp; exit
          </button>
          {step > 1 && (
            <button
              type="button"
              className={ui.secondaryButton}
              disabled={pending}
              onClick={() => go({ kind: "step", step: (step - 1) as Step })}
            >
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              className={ui.primaryButton}
              disabled={pending}
              onClick={() => go({ kind: "step", step: (step + 1) as Step })}
            >
              Next: {STEPS[step as 1 | 2 | 3].label}
            </button>
          ) : (
            <button
              type="button"
              className={ui.primaryButton}
              disabled={pending}
              onClick={() => go({ kind: "finish" })}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper(props: {
  current: Step;
  furthest: Step;
  disabled: boolean;
  onPick: (step: Step) => void;
}) {
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap gap-x-2 gap-y-2 text-sm">
        {STEPS.map(({ step, label }) => {
          const isCurrent = step === props.current;
          const reachable = step <= props.furthest && !isCurrent;
          const badge = (
            <span
              className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                isCurrent
                  ? "bg-brand-strong text-white"
                  : step < props.current || step <= props.furthest
                    ? "bg-ok-bg text-ok"
                    : "bg-surface-2 text-muted"
              }`}
              aria-hidden="true"
            >
              {step}
            </span>
          );
          return (
            <li key={step} className="flex items-center gap-2">
              {reachable ? (
                <button
                  type="button"
                  disabled={props.disabled}
                  onClick={() => props.onPick(step)}
                  className="inline-flex items-center gap-2 rounded-full py-1 pr-2 font-semibold text-foreground-2 hover:text-foreground disabled:opacity-60"
                >
                  {badge}
                  {label}
                </button>
              ) : (
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={`inline-flex items-center gap-2 py-1 pr-2 ${isCurrent ? "font-bold" : "text-muted"}`}
                >
                  {badge}
                  {label}
                </span>
              )}
              {step < 4 && <span aria-hidden="true" className="h-px w-4 bg-border-strong" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

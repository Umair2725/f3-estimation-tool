"use client";

import { useId } from "react";
import { ui } from "@/components/ui";
import {
  APP_STORES,
  APPLICATION_TYPES,
  BROWSERS,
  COMPLIANCE,
  ENVIRONMENTS,
  HOSTING,
  NFR_AREAS,
  OPERATING_SYSTEMS,
  PART_LABELS,
  PARTS,
  type Part,
} from "@/lib/estimation/options";
import type {
  Errors,
  FeatureState,
  Step1State,
  Step2State,
  Step3State,
  Step4State,
  TechnologyOption,
} from "./types";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className={ui.fieldError}>
      {message}
    </span>
  );
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item);
}

function CheckGroup(props: {
  legend: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{props.legend}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {props.options.map((option) => (
          <label key={option} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.value.includes(option)}
              onChange={(e) => props.onChange(toggle(props.value, option, e.target.checked))}
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Step 1: Project ----------

/** A labelled input with its hint and error outside the label, linked by aria-describedby. */
function Field(props: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (a11y: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => React.ReactNode;
}) {
  const id = useId();
  const described = [props.hint && `${id}-hint`, props.error && `${id}-error`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`flex flex-col gap-1 ${props.className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-semibold">
        {props.label}
      </label>
      {props.children({
        id,
        "aria-describedby": described || undefined,
        "aria-invalid": !!props.error,
      })}
      {props.hint && (
        <span id={`${id}-hint`} className="text-xs text-muted">
          {props.hint}
        </span>
      )}
      <FieldError id={`${id}-error`} message={props.error} />
    </div>
  );
}

export function Step1(props: {
  value: Step1State;
  onChange: (value: Step1State) => void;
  errors: Errors;
  clientNames: string[];
}) {
  const listId = useId();
  const { value, onChange, errors } = props;
  const set = (patch: Partial<Step1State>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Project name" error={errors.projectName} className="sm:col-span-2">
        {(a11y) => (
          <input
            {...a11y}
            className={ui.input}
            value={value.projectName}
            maxLength={200}
            required
            onChange={(e) => set({ projectName: e.target.value })}
          />
        )}
      </Field>
      <Field
        label="Client"
        hint="Pick a client already in the tool, or type a new one."
        className="sm:col-span-2"
      >
        {(a11y) => (
          <input
            {...a11y}
            className={ui.input}
            value={value.clientName}
            maxLength={200}
            list={listId}
            autoComplete="off"
            onChange={(e) => set({ clientName: e.target.value })}
          />
        )}
      </Field>
      <datalist id={listId}>
        {props.clientNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Field label="Project manager">
        {(a11y) => (
          <input
            {...a11y}
            className={ui.input}
            value={value.projectManager}
            maxLength={120}
            onChange={(e) => set({ projectManager: e.target.value })}
          />
        )}
      </Field>
      <Field label="Date" error={errors.projectDate}>
        {(a11y) => (
          <input
            {...a11y}
            type="date"
            className={ui.input}
            value={value.projectDate}
            required
            onChange={(e) => set({ projectDate: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

// ---------- Step 2: Platforms & stack ----------

export function Step2(props: {
  value: Step2State;
  onChange: (value: Step2State) => void;
  errors: Errors;
  technologies: TechnologyOption[];
  savedParts: Part[];
  features: FeatureState[];
}) {
  const { value, onChange } = props;
  const set = (patch: Partial<Step2State>) => onChange({ ...value, ...patch });
  const chosen = (part: Part) => value.parts.find((p) => p.part === part);

  function setPart(part: Part, on: boolean) {
    set({
      parts: on
        ? [...value.parts, { part, technologyIds: [] }]
        : value.parts.filter((p) => p.part !== part),
    });
  }

  function setTech(part: Part, techId: string, on: boolean) {
    set({
      parts: value.parts.map((p) =>
        p.part === part ? { ...p, technologyIds: toggle(p.technologyIds, techId, on) } : p,
      ),
    });
  }

  // Parts that were saved, are now unticked, and that features still use (spec: warn first).
  const removed = props.savedParts.filter((part) => !chosen(part));
  const affected = removed
    .map((part) => ({
      part,
      features: props.features
        .filter((f) => f.parts.includes(part))
        .map((f) => f.name || "Untitled"),
    }))
    .filter((r) => r.features.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <CheckGroup
        legend="Application types"
        options={APPLICATION_TYPES}
        value={value.applicationTypes}
        onChange={(applicationTypes) => set({ applicationTypes })}
      />
      <CheckGroup
        legend="Operating systems"
        options={OPERATING_SYSTEMS}
        value={value.operatingSystems}
        onChange={(operatingSystems) => set({ operatingSystems })}
      />
      <CheckGroup
        legend="Browsers"
        options={BROWSERS}
        value={value.browsers}
        onChange={(browsers) => set({ browsers })}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Parts and tech stack</legend>
        <p className="text-sm text-muted">
          Each part becomes one development sheet in the Excel estimate.
        </p>
        {PARTS.map(({ value: part, label }) => {
          const selection = chosen(part);
          const options = props.technologies.filter(
            (t) =>
              (t.parts.includes(part) && !t.retired) || selection?.technologyIds.includes(t.id),
          );
          return (
            <div
              key={part}
              className="rounded-lg border border-border p-3"
              data-testid={`part-${part}`}
            >
              <label className="inline-flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={!!selection}
                  onChange={(e) => setPart(part, e.target.checked)}
                />
                {label}
              </label>
              {selection && (
                <fieldset className="mt-2 flex flex-wrap gap-x-5 gap-y-2 pl-6">
                  <legend className="sr-only">Technologies for {label}</legend>
                  {options.map((tech) => (
                    <label key={tech.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selection.technologyIds.includes(tech.id)}
                        onChange={(e) => setTech(part, tech.id, e.target.checked)}
                      />
                      {tech.name}
                      {tech.retired && <span className="text-muted">(retired)</span>}
                    </label>
                  ))}
                  {options.length === 0 && (
                    <span className="text-sm text-muted">
                      No technologies in the catalog for this part yet. Ask an Admin to add one.
                    </span>
                  )}
                </fieldset>
              )}
            </div>
          );
        })}
      </fieldset>

      {affected.length > 0 && (
        <div role="alert" className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
          {affected.map((r) => (
            <p key={r.part}>
              Removing <strong>{PART_LABELS[r.part]}</strong> also removes it from:{" "}
              {r.features.join(", ")}.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Step 3: Environment & compliance ----------

export function Step3(props: {
  value: Step3State;
  onChange: (value: Step3State) => void;
  errors: Errors;
}) {
  const { value, onChange } = props;
  const set = (patch: Partial<Step3State>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-6">
      <CheckGroup
        legend="Hosting"
        options={HOSTING}
        value={value.hosting}
        onChange={(hosting) => set({ hosting })}
      />
      <CheckGroup
        legend="Environments"
        options={ENVIRONMENTS}
        value={value.environments}
        onChange={(environments) => set({ environments })}
      />
      <CheckGroup
        legend="App store publishing"
        options={APP_STORES}
        value={value.appStores}
        onChange={(appStores) => set({ appStores })}
      />
      <CheckGroup
        legend="Compliance"
        options={COMPLIANCE}
        value={value.compliance}
        onChange={(compliance) => set({ compliance })}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Non-functional requirements</legend>
        {NFR_AREAS.map(({ key, label }) => {
          const area = value.nfr[key] ?? { enabled: false, note: "" };
          const setArea = (patch: Partial<typeof area>) =>
            set({ nfr: { ...value.nfr, [key]: { ...area, ...patch } } });
          return (
            <div key={key} className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={area.enabled}
                  onChange={(e) => setArea({ enabled: e.target.checked })}
                />
                {label}
              </label>
              {area.enabled && (
                <label className="flex flex-col gap-1 pl-6 text-sm">
                  <span className="sr-only">Note for {label}</span>
                  <input
                    className={ui.input}
                    placeholder="Optional note, for example the target or standard"
                    maxLength={500}
                    value={area.note}
                    onChange={(e) => setArea({ note: e.target.value })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </fieldset>
      <label className={ui.label}>
        Other considerations
        <textarea
          className={`${ui.input} min-h-24 py-2`}
          maxLength={2000}
          value={value.other}
          onChange={(e) => set({ other: e.target.value })}
        />
      </label>
    </div>
  );
}

// ---------- Step 4: Requirements ----------

let nextKey = 0;
export const newFeatureKey = () => `new-${Date.now()}-${nextKey++}`;

export function Step4(props: {
  value: Step4State;
  onChange: (value: Step4State) => void;
  errors: Errors;
  parts: Part[];
}) {
  const { features } = props.value;
  const setFeatures = (next: FeatureState[]) => props.onChange({ features: next });
  const setFeature = (index: number, patch: Partial<FeatureState>) =>
    setFeatures(features.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  function move(index: number, by: -1 | 1) {
    const next = [...features];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setFeatures(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        aria-disabled="true"
        className="rounded-xl border-2 border-dashed border-border-strong px-4 py-5 text-center"
      >
        <p className="font-semibold">Upload the client&apos;s requirements</p>
        <p className="mt-1 text-sm text-muted">
          Document upload (PDF or DOCX) is coming soon. For now, add the features by hand.
        </p>
      </div>

      {props.parts.length === 0 && (
        <p className="rounded-lg bg-warn-bg px-3.5 py-3 text-sm text-warn">
          Choose the project&apos;s parts in step 2 first; each feature belongs to one or more
          parts.
        </p>
      )}

      <ol className="flex flex-col gap-4" aria-label="Features">
        {features.map((feature, index) => {
          const label = feature.name || `Feature ${index + 1}`;
          const err = (field: string) => props.errors[`features.${index}.${field}`];
          return (
            <li
              key={feature.key}
              className="rounded-lg border border-border p-4"
              data-testid="feature-row"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Feature name" error={err("name")}>
                  {(a11y) => (
                    <input
                      {...a11y}
                      className={ui.input}
                      value={feature.name}
                      maxLength={200}
                      onChange={(e) => setFeature(index, { name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Short description">
                  {(a11y) => (
                    <input
                      {...a11y}
                      className={ui.input}
                      value={feature.description}
                      maxLength={1000}
                      onChange={(e) => setFeature(index, { description: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <fieldset className="mt-3">
                <legend className="text-sm font-semibold">Parts for {label}</legend>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                  {props.parts.map((part) => (
                    <label key={part} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={feature.parts.includes(part)}
                        onChange={(e) =>
                          setFeature(index, {
                            parts: toggle(feature.parts, part, e.target.checked),
                          })
                        }
                      />
                      {PART_LABELS[part]}
                    </label>
                  ))}
                </div>
                {err("parts") && <span className={ui.fieldError}>{err("parts")}</span>}
              </fieldset>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ui.smallButton}
                  disabled={index === 0}
                  aria-label={`Move ${label} up`}
                  onClick={() => move(index, -1)}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className={ui.smallButton}
                  disabled={index === features.length - 1}
                  aria-label={`Move ${label} down`}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className={ui.smallButton}
                  aria-label={`Remove ${label}`}
                  onClick={() => setFeatures(features.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <button
          type="button"
          className={ui.secondaryButton}
          onClick={() =>
            setFeatures([
              ...features,
              {
                key: newFeatureKey(),
                name: "",
                description: "",
                parts: props.parts.length === 1 ? [...props.parts] : [],
              },
            ])
          }
        >
          Add a feature
        </button>
      </div>
    </div>
  );
}

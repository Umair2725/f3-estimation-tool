"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import {
  addObservation,
  confirmBenchmark,
  createBenchmark,
  decideProposal,
  retireBenchmark,
  updateBenchmark,
} from "@/server/benchmarks/benchmarks";
import { applyImport, previewImport, type ImportPreview } from "@/server/benchmarks/import";
import { ServiceError } from "@/server/service-error";

// Server actions for the benchmark library (specs/feature-benchmarks). The service re-checks.
export type ActionResult = { ok: boolean; message?: string };

async function run(work: () => Promise<unknown>, done: string): Promise<ActionResult> {
  try {
    await work();
    refresh();
    return { ok: true, message: done };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export type BenchmarkFields = {
  feature: string;
  module: string;
  part: string;
  stack: string;
  included: string;
  experienced: string;
  junior: string;
  aiTools: string;
  notes: string;
};

export async function createBenchmarkAction(input: BenchmarkFields): Promise<ActionResult> {
  let id: string | null = null;
  const result = await run(async () => {
    id = (await createBenchmark(await getCurrentUser(), input)).id;
  }, "Benchmark added.");
  if (result.ok && id) redirect(`/benchmarks/${id}`);
  return result;
}

export async function updateBenchmarkAction(id: string, input: BenchmarkFields) {
  return run(async () => updateBenchmark(await getCurrentUser(), id, input), "Saved.");
}

export async function confirmBenchmarkAction(id: string) {
  return run(async () => confirmBenchmark(await getCurrentUser(), id), "Confirmed.");
}

export async function retireBenchmarkAction(id: string) {
  return run(async () => retireBenchmark(await getCurrentUser(), id), "Retired.");
}

export async function addObservationAction(
  id: string,
  input: { hours: string; level: string; observedOn: string; aiTools: string; note: string },
): Promise<ActionResult> {
  try {
    const { result } = await addObservation(await getCurrentUser(), id, input);
    refresh();
    const message = {
      apply: "Observation added. The hours were recalculated.",
      propose: "Observation added. The change is over 15%, so it was proposed to an Architect.",
      none: "Observation added. The hours didn't change.",
    }[result];
    return { ok: true, message };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function decideProposalAction(id: string, accept: boolean) {
  return run(
    async () => decideProposal(await getCurrentUser(), id, accept),
    accept ? "Proposal accepted." : "Proposal rejected.",
  );
}

async function fileFrom(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ServiceError("Choose the .csv seed file or the .xlsx survey", 400);
  }
  return { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function previewImportAction(
  form: FormData,
): Promise<{ ok: true; preview: ImportPreview } | { ok: false; message: string }> {
  try {
    return { ok: true, preview: await previewImport(await getCurrentUser(), await fileFrom(form)) };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function applyImportAction(form: FormData): Promise<ActionResult> {
  try {
    const { applied, skipped } = await applyImport(await getCurrentUser(), await fileFrom(form));
    refresh();
    return {
      ok: true,
      message: `Imported ${applied} ${applied === 1 ? "row" : "rows"}${skipped ? `, skipped ${skipped} with problems` : ""}.`,
    };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

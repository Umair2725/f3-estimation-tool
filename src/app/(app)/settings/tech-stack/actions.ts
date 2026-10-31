"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { ServiceError } from "@/server/service-error";
import {
  addTechnology,
  restoreTechnology,
  retireTechnology,
  updateTechnology,
  type TechnologyInput,
} from "@/server/tech-stack";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function run(change: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await change();
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function addTechnologyAction(input: TechnologyInput) {
  return run(async () => addTechnology(await getCurrentUser(), input));
}

export async function updateTechnologyAction(id: string, input: TechnologyInput) {
  return run(async () => updateTechnology(await getCurrentUser(), id, input));
}

export async function retireTechnologyAction(id: string) {
  return run(async () => retireTechnology(await getCurrentUser(), id));
}

export async function restoreTechnologyAction(id: string) {
  return run(async () => restoreTechnology(await getCurrentUser(), id));
}

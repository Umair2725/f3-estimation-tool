"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { updateDefaults, type DefaultsInput } from "@/server/estimate-defaults";
import { ServiceError } from "@/server/service-error";

export type DefaultsResult =
  { ok: true } | { ok: false; message: string; fields: Record<string, string> };

export async function updateDefaultsAction(input: DefaultsInput): Promise<DefaultsResult> {
  try {
    await updateDefaults(await getCurrentUser(), input);
    refresh();
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError)
      return { ok: false, message: err.message, fields: err.fields ?? {} };
    throw err;
  }
}

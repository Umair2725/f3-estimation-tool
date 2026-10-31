import "server-only";
import { z } from "zod";
import type { CurrentUser } from "@/server/auth/access";
import { getDb } from "@/server/db";
import { nameKey, PART_VALUES, type Part } from "@/lib/estimation/options";
import { fieldErrors } from "@/lib/estimation/schemas";
import { assertAccess, ServiceError } from "./service-error";

// The Admin-managed technology catalog (specs/tech-stack-catalog). Anyone with a role can read
// it (the wizard offers it); only `settings.manage` can change it. Entries are retired, never
// deleted, so requests that used them keep them.

export type TechnologyRow = { id: string; name: string; parts: Part[]; retired: boolean };

const technologyInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(60, "Use at most 60 characters"),
  parts: z
    .array(z.enum(PART_VALUES))
    .transform((p) => [...new Set(p)])
    .refine((p) => p.length > 0, "Choose at least one part"),
});
export type TechnologyInput = z.input<typeof technologyInput>;

function parseInput(input: unknown) {
  const parsed = technologyInput.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    throw new ServiceError(Object.values(fields)[0] ?? "Check the form", 400, fields);
  }
  return parsed.data;
}

async function assertNameFree(name: string, exceptId?: string) {
  const existing = await getDb().technology.findUnique({ where: { nameKey: nameKey(name) } });
  if (existing && existing.id !== exceptId) {
    throw new ServiceError(`${existing.name} is already in the catalog`, 409);
  }
}

export async function listTechnologies(
  actor: CurrentUser | null,
  options: { includeRetired?: boolean } = {},
): Promise<TechnologyRow[]> {
  assertAccess(actor);
  const rows = await getDb().technology.findMany({
    where: options.includeRetired ? {} : { retiredAt: null },
    orderBy: { name: "asc" },
  });
  return rows.map((t) => ({ id: t.id, name: t.name, parts: t.parts, retired: !!t.retiredAt }));
}

export async function addTechnology(actor: CurrentUser | null, input: unknown) {
  assertAccess(actor, "settings.manage");
  const { name, parts } = parseInput(input);
  await assertNameFree(name);
  return getDb().technology.create({ data: { name, nameKey: nameKey(name), parts } });
}

export async function updateTechnology(actor: CurrentUser | null, id: string, input: unknown) {
  assertAccess(actor, "settings.manage");
  const { name, parts } = parseInput(input);
  await findOrThrow(id);
  await assertNameFree(name, id);
  return getDb().technology.update({
    where: { id },
    data: { name, nameKey: nameKey(name), parts },
  });
}

export async function retireTechnology(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "settings.manage");
  await findOrThrow(id);
  return getDb().technology.update({ where: { id }, data: { retiredAt: new Date() } });
}

export async function restoreTechnology(actor: CurrentUser | null, id: string) {
  assertAccess(actor, "settings.manage");
  await findOrThrow(id);
  return getDb().technology.update({ where: { id }, data: { retiredAt: null } });
}

async function findOrThrow(id: string) {
  const found = await getDb().technology.findUnique({ where: { id } });
  if (!found) throw new ServiceError("Technology not found", 404);
  return found;
}

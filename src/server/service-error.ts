import { checkAccess, type CurrentUser } from "@/server/auth/access";
import type { Permission } from "@/server/auth/permissions";

/** A refusal or validation failure with the HTTP status an API route should answer with. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Throws a ServiceError (401/403) unless the actor has a role and, if given, the permission. */
export function assertAccess(
  actor: CurrentUser | null,
  permission?: Permission,
): asserts actor is CurrentUser {
  const access = checkAccess(actor, permission);
  if (!access.ok) throw new ServiceError(access.message, access.status);
}

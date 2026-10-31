import { PeopleError } from "@/server/people";

/** JSON error for the people API; unexpected errors are rethrown to the error handler. */
export function peopleErrorResponse(err: unknown): Response {
  if (!(err instanceof PeopleError)) throw err;
  return Response.json(
    { error: err.status === 401 ? "unauthorized" : "refused", message: err.message },
    { status: err.status, headers: { "Cache-Control": "no-store" } },
  );
}

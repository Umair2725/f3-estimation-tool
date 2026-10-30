import { expect, test } from "@playwright/test";

// specs/system-health - needs a running database with the migrations applied.

test("GET /api/health returns 200 with app and database status", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ status: "ok", database: { status: "ok" } });
  expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  expect(new Date(body.time).toISOString()).toBe(body.time);
});

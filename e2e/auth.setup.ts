import { expect, request, test as setup } from "@playwright/test";
import { apiSignIn, authFile, BASE_URL, seed, USERS, type TestRole } from "./helpers";

// Signs in once per role and saves the session for the specs (task 7.1).
setup("seed dev users and sign in as each role", async () => {
  seed();
  for (const role of Object.keys(USERS) as TestRole[]) {
    const context = await request.newContext({ baseURL: BASE_URL });
    const response = await apiSignIn(context, USERS[role]);
    expect(response.status(), `sign-in as ${role}`).toBe(200);
    await context.storageState({ path: authFile(role) });
    await context.dispose();
  }
});

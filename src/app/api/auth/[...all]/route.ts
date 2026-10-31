import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

// Better Auth's endpoints: Google callback, sign-out, session, and dev sign-in when enabled.
export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));

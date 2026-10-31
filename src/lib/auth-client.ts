"use client";
import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client (same origin, so no baseURL needed).
export const authClient = createAuthClient();

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const DEV_USERS = [
  { email: "dev.admin@folio3.com", label: "Admin" },
  { email: "dev.architect@folio3.com", label: "Architect" },
  { email: "dev.techlead@folio3.com", label: "Tech Lead" },
  { email: "dev.estimator@folio3.com", label: "Estimator" },
  { email: "dev.newcomer@folio3.com", label: "No role yet" },
];

export function SignInPanel(props: {
  next: string;
  error: string | null;
  googleEnabled: boolean;
  devLogin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState(props.error);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(DEV_USERS[0].email);
  const [password, setPassword] = useState("");

  async function google() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: props.next,
      errorCallbackURL: "/sign-in",
    });
    if (err) {
      setError(err.message ?? "Sign-in didn't work. Please try again.");
      setBusy(false);
    }
  }

  async function devSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(devSignInError(err));
      setBusy(false);
      return;
    }
    router.replace(props.next);
    router.refresh();
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sign in to F3 Estimation Tool</h1>
        <p className="mt-1.5 text-muted">Use your Folio3 Google account. No new password needed.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-err-bg px-3.5 py-3 text-sm text-err">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={google}
        disabled={busy || !props.googleEnabled}
        className="flex min-h-12 items-center justify-center gap-3 rounded-full border border-border-strong bg-surface px-5 font-semibold hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      {!props.googleEnabled && (
        <p className="text-sm text-muted">
          Google sign-in isn&apos;t configured on this server yet (see README).
        </p>
      )}

      <p className="rounded-lg bg-info-bg px-3.5 py-3 text-sm text-info">
        Only <strong>@folio3.com</strong> accounts can sign in. An Admin assigns your role after
        your first sign-in.
      </p>

      {props.devLogin && (
        <form
          onSubmit={devSignIn}
          className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-4"
          aria-labelledby="dev-signin-title"
        >
          <h2 id="dev-signin-title" className="text-sm font-bold">
            Development sign-in
          </h2>
          <p className="text-xs text-muted">
            Local development and tests only. Never available in production.
          </p>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Test user
            <select
              className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 font-normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            >
              {DEV_USERS.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.label} ({u.email})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              className="min-h-10 rounded-lg border border-border-strong bg-surface px-3 font-normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-10 rounded-full bg-brand-strong px-5 font-semibold text-white disabled:opacity-60"
          >
            Sign in as test user
          </button>
        </form>
      )}
    </div>
  );
}

/** Plain-language message for a failed development sign-in, based on the server's error code. */
function devSignInError(err: { status?: number; code?: string; message?: string }): string {
  const code = (err.code ?? "").toUpperCase();
  if (code === "DEACTIVATED") return "Your access has been turned off. Contact an Admin.";
  if (code === "INVALID_ORIGIN") {
    return "This address doesn't match the server's AUTH_URL setting. Open the app at its configured address.";
  }
  if (err.status === 401) return "Email or password is wrong.";
  return "Sign-in didn't work. Please try again.";
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

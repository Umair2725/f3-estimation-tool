"use client"; // Error boundaries must be Client Components

// Shown when a page fails to render. Never shows error details to the user; server errors
// are logged by src/instrumentation.ts (onRequestError).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted">
        An unexpected error occurred. Please try again. If it keeps happening, contact the tool
        owner.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-md bg-accent px-4 py-2 font-medium text-white"
      >
        Try again
      </button>
    </section>
  );
}

export default function HomePage() {
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">F3 Estimation Tool</h1>
      <p className="mt-3 text-lg text-muted">
        Estimate new projects faster by reusing Folio3&apos;s past estimates and the hours our teams
        really spend building features with AI.
      </p>
      <div
        role="status"
        className="mt-8 rounded-lg border border-border bg-notice-bg px-4 py-3 text-notice-fg"
      >
        Estimation features are coming soon. This is an early version of the tool.
      </div>
    </section>
  );
}

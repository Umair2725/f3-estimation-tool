// Shared Tailwind class names for the approved design's controls (docs/design/README.md).
export const ui = {
  primaryButton:
    "inline-flex min-h-10 items-center justify-center rounded-full bg-brand-strong px-5 font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
  secondaryButton:
    "inline-flex min-h-10 items-center justify-center rounded-full border border-border-strong bg-surface px-5 font-semibold hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60",
  ghostButton:
    "inline-flex min-h-10 items-center justify-center rounded-full px-4 font-semibold text-foreground-2 hover:bg-surface-2 disabled:opacity-60",
  smallButton:
    "inline-flex min-h-8 items-center justify-center rounded-full border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60",
  input:
    "min-h-10 w-full rounded-lg border border-border-strong bg-surface px-3 font-normal disabled:opacity-60",
  label: "flex flex-col gap-1 text-sm font-semibold",
  card: "min-w-0 rounded-xl border border-border bg-surface",
  cardHead: "flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4",
  fieldError: "text-sm font-normal text-err",
};

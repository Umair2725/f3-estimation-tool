// Fixed choices for estimation requests (specs/estimation-requests). They map to rows of the
// Excel template, so they change only with code. The tech stack catalog is the only
// Admin-managed list (specs/tech-stack-catalog). Safe to import from client components.

export const PARTS = [
  { value: "BACKEND", label: "Backend" },
  { value: "WEB_FRONTEND", label: "Web/Frontend" },
  { value: "ADMIN_PANEL", label: "Admin Panel" },
  { value: "MOBILE", label: "Mobile" },
  { value: "CLOUD_INFRA", label: "Cloud/Infrastructure" },
] as const;
export type Part = (typeof PARTS)[number]["value"];
export const PART_VALUES = PARTS.map((p) => p.value) as [Part, ...Part[]];
export const PART_LABELS = Object.fromEntries(PARTS.map((p) => [p.value, p.label])) as Record<
  Part,
  string
>;

export const APPLICATION_TYPES = ["Web", "Mobile", "Desktop"] as const;
export const OPERATING_SYSTEMS = ["iOS", "Android", "Windows", "macOS", "Linux"] as const;
export const BROWSERS = ["Chrome", "Safari", "Firefox", "Edge"] as const;

export const HOSTING = ["AWS", "Azure", "Google Cloud", "On-premises", "Client-managed"] as const;
export const ENVIRONMENTS = ["Staging", "Production"] as const;
export const APP_STORES = ["Apple App Store", "Google Play"] as const;
export const COMPLIANCE = ["HIPAA", "GDPR", "SOC 2", "PCI-DSS"] as const;

export const NFR_AREAS = [
  { key: "accessibility", label: "Accessibility" },
  { key: "performance", label: "Performance and load" },
  { key: "security", label: "Security" },
  { key: "documentation", label: "Documentation" },
] as const;
export type NfrKey = (typeof NFR_AREAS)[number]["key"];

export const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "CHANGES_REQUESTED", label: "Changes requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "EXPORTED", label: "Exported" },
] as const;
export type RequestStatus = (typeof STATUSES)[number]["value"];
export const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.value, s.label])) as Record<
  RequestStatus,
  string
>;

export const STEPS = [
  { step: 1, label: "Project" },
  { step: 2, label: "Platforms & stack" },
  { step: 3, label: "Environment & compliance" },
  { step: 4, label: "Requirements" },
] as const;
export type Step = (typeof STEPS)[number]["step"];

/** Key used to match client and technology names regardless of case and spacing. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

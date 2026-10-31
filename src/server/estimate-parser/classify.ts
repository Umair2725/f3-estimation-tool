// Sheet kinds from sheet names (specs/estimate-file-parsing "Classify sheets by name").
// Ordered rules: the first match wins, so combined names resolve predictably
// ("GD Estimates (Web)" is GD, "Admin Panel (React)" is Admin, "React Native" is Mobile).
import type { SheetKind } from "./types";

const RULES: [SheetKind, RegExp][] = [
  ["SUMMARY", /\bsummary\b/],
  ["QUESTIONS", /\bquestions?\b/],
  ["QA", /\bqa\b|\bquality assurance\b|\btesting\b/],
  ["PM", /\bpm\b|\bproject management\b/],
  ["GD", /\bgd\b|\bgraphic|\bdesign\b/],
  ["ADMIN_PANEL", /\badmin\b/],
  ["MOBILE", /\bmobile|\bapp\b|\bmobileapp\b|\bflutter\b|\breact native\b|\bios\b|\bandroid\b/],
  ["CLOUD_INFRA", /\bcloud\b|\binfra|\bdevops\b/],
  ["BACKEND", /\bbackend\b|\bback end\b|\bserver\b|\bnode\b|\bapi\b/],
  ["WEB_FRONTEND", /\bweb\b|\breact\b|\bui\b|\bfrontend\b|\bfront end\b/],
];

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function classifySheet(name: string): SheetKind {
  // Split joined words like "BackEnd" / "MobileApp" before lowercasing.
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  const normalized = normalizeName(spaced);
  const joined = normalized.replace(/\s+/g, "");
  for (const [kind, pattern] of RULES) {
    if (pattern.test(normalized)) return kind;
  }
  // Joined forms such as "backend" written as "BackEnd" are handled above; also try the
  // name without spaces for "mobileapp" or "frontend".
  if (/mobileapp|reactnative/.test(joined)) return "MOBILE";
  if (/backend/.test(joined)) return "BACKEND";
  if (/frontend/.test(joined)) return "WEB_FRONTEND";
  return "UNKNOWN";
}

// Export file names (specs/excel-export "Internal export from the template").

/** "Patient portal MVP – Estimate (internal) – 2026-10-31.xlsx", without characters files can't have. */
export function exportFileName(projectName: string, isoDate: string): string {
  const safe = projectName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${safe || "Estimate"} – Estimate (internal) – ${isoDate}.xlsx`;
}

/** Content-Disposition with an ASCII fallback and the full UTF-8 name (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

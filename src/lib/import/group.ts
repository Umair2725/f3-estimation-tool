// Groups the files of an import zip into projects (specs/historical-import "Grouping files in a
// zip"). Pure: works on paths only, so it's unit-tested without real zips.

export type ZipEntry = { path: string; size: number };

export type ProjectFiles = {
  folder: string;
  estimatePath: string | null;
  actualsPath: string | null;
  failure: string | null;
};

export const ACTUALS_NAME = /[-_ ]actuals\.xlsx$/i;
export const MAX_XLSX_BYTES = 10 * 1024 * 1024;

const baseName = (path: string) => path.split("/").at(-1) ?? path;

export function groupZipEntries(entries: ZipEntry[]): {
  projects: ProjectFiles[];
  notes: string[];
} {
  const notes: string[] = [];
  const folders = new Map<string, string[]>();

  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = path.split("/").filter(Boolean);
    const name = parts.at(-1) ?? "";
    // System and lock files are ignored silently.
    if (!name || parts.includes("__MACOSX") || name.startsWith(".") || name.startsWith("~$"))
      continue;
    if (!/\.xlsx$/i.test(name)) {
      notes.push(`Ignored "${path}": only .xlsx files are imported`);
      continue;
    }
    if (parts.length > 2) {
      notes.push(`Ignored "${path}": put each project's files directly in its own folder`);
      continue;
    }
    if (entry.size > MAX_XLSX_BYTES) {
      notes.push(`Ignored "${path}": larger than 10 MB`);
      continue;
    }
    // Root files are each their own project, named after the file.
    const folder = parts.length === 1 ? name.replace(/\.xlsx$/i, "") : parts[0];
    const key = parts.length === 1 ? `\u0000${folder}` : folder;
    folders.set(key, [...(folders.get(key) ?? []), path]);
  }

  const projects = [...folders.entries()]
    .sort(([a], [b]) => a.replace(/\u0000/, "").localeCompare(b.replace(/\u0000/, "")))
    .map(([key, paths]): ProjectFiles => {
      const folder = key.replace(/^\u0000/, "");
      const actuals = paths.filter((p) => ACTUALS_NAME.test(baseName(p)));
      const estimates = paths.filter((p) => !ACTUALS_NAME.test(baseName(p)));
      let failure: string | null = null;
      if (estimates.length > 1) failure = "This folder has more than one estimate file";
      else if (actuals.length > 1) failure = "This folder has more than one actuals file";
      else if (estimates.length === 0) failure = "This folder has no estimate file";
      return {
        folder,
        estimatePath: estimates.length === 1 ? estimates[0] : null,
        actualsPath: actuals.length === 1 ? actuals[0] : null,
        failure,
      };
    });
  return { projects, notes };
}

# Design

## Context

- **Template:** Folio3's template v0.5 is documented in `openspec/changes/add-lean-excel-export/design.md`.
- **Sample findings:** brief section 15 lists how real past estimates differ from the template:
  - renamed sheets; the header row at row 7, 8 or 10
  - missing `SUM` formulas, and formulas with no saved results
  - skeleton sheets, Min > Max, duplicate S.No
  - notes in column A, and dates in many formats
- **Library:** `exceljs` 4.4.0 is already a dependency (it powers the export). It reads values, formulas and saved formula results (`cell.value.result`).
- **No samples in this environment:** the samples aren't on this machine and must never be committed. Tests therefore build synthetic workbooks that reproduce each finding. An optional test reads any files a developer places in the git-ignored `samples/` folder.

## Goals / Non-Goals

**Goals:**
- One pure-ish function, `parseEstimateFile(buffer, fileName)`, that never throws for bad data and returns structured data plus warnings, with sources (sheet, row) on every item.
- Robust to everything listed in brief section 15.
- A perfect round trip with our own export.

**Non-Goals:**
- Storing anything, a preview UI, or matching actuals.
- Interpreting free-form tables. They are only flagged.
- Detecting the stack from Assumptions text or the SOW. That's F-08's preview.

## Decisions

### 1. Module layout (`src/server/estimate-parser/`)

| File | Responsibility |
|---|---|
| `types.ts` | `ParsedEstimate`, `ParsedSheet`, `ParsedTask`, `ParsedSubTask`, `ParseWarning`, `SheetKind` |
| `classify.ts` | `classifySheet(name)`, the keyword rules with precedence; pure and unit-tested |
| `cells.ts` | Cell helpers: `text(cell)` (rich text and hyperlinks flattened), `hours(cell)` (number, saved formula result, or numeric text; reports formulas without results), `percentFromFormula(formula)` (`*0.25`, `*25%`, `*25/100`) |
| `sheet.ts` | Development sheet reading: header detection, Task / Sub task state machine, sections, header details |
| `summary.ts` | Summary reading by labels |
| `index.ts` | `parseEstimateFile`: load the workbook (errors become a result, not a throw), fingerprint, classify, read each sheet, collect warnings |

`server-only` is imported in `index.ts` only, so the pure helpers can be unit-tested directly.

### 2. Classification precedence
- Exact kinds first: `summary`, `question`, then `qa` (whole word, or "QA Estimates"), `pm` (whole word), and `gd` (whole word, or "graphic"/"design").
- Then parts: `admin` before `web`, because "Admin Panel (React)" is the Admin Panel. `mobile` keywords before `web` keywords, because "React Native" contains "react". Then `cloud`, `backend` and `web`.
- Matching is on lowercased names with punctuation turned into spaces. Keyword sets are taken from the brief.
- **Why fixed precedence:** names combine words ("GD Estimates (Web)", "Dev Admin Estimates"). An ordered list is predictable and testable. The user confirms the kind in F-08's preview anyway.

### 3. Development sheet state machine
- **Header:** the first row (within rows 1–30) that has cells reading "S.No"/"S. No"/"Sr" and "Task", "Min…" and "Max…" (case-insensitive, trimmed). Its column indexes give `sno`, `task`, `min`, `max` and `comments`.
- **Then rows to the end of the sheet**, in these states: `tasks` → `other` → `research` → `assumptions` → `risks` → `notes`. Sections are switched by labels in the task column:
  - "Development Total" records the file's dev total and stays in `tasks`
  - "Other Development Activities" moves to `other`
  - "Post Development … Total" records it
  - "Research Task" moves to `research`
  - "Assumptions" moves to `assumptions`, "Risks" to `risks`, and "Notes" to `notes`, where everything is skipped
  - "Grand Total" above the header is read as the file's grand total
- **In `tasks`:**
  - a numeric S.No (or text like "1.") with Task text starts a Task
  - Task text with no S.No and with hours (or a comment) is a Sub task of the current Task
  - a Sub task before any Task goes under a synthetic Task named after the sheet, with a warning
  - placeholders are skipped: the regexes `/^(sub\s*)?task\s*-\s*\d+$/i` and `/^<.*>$/`, and rows with no text
  - S.No with no text and no hours counts as a skeleton row
- **In `other`:**
  - "Bug Fixing" gives a percentage, from the formula (`percentFromFormula`) or from Min ÷ development Min
  - every other row with hours (Deployment, Builds, Code review…) becomes an activity row `{ title, min, max, comment, row }`
  - "Staging"/"Production"/"App Store" lines with no hours are kept as the Deployment's environments
- **In `research`:** non-placeholder rows with text and hours become Tasks with `research: true`.
- **In `assumptions` and `risks`:** non-placeholder text in the task column, or in the merged C:F cell, becomes list items. The template's sample assumption sentence ("<List down …>") is a placeholder.
- **Outside the table:** non-empty text in columns before `sno` (for example column A) becomes a warning "note outside the table" with the text.
- **Header details:** in rows above the header, the first long text cell is the title. A cell matching `/by\s*:?\s*(.+?)(?:\/|$)/i` and `/reviewed\s*by\s*:?\s*(.+)/i` gives the estimator and reviewer. A date is a Date value, or text matched by a few patterns ("5th May 2025", "dd/mm/yyyy", "yyyy-mm-dd"); the raw text is always kept. The stack is the last bracketed text of the title, or else of the sheet name.
- **Skeleton:** a development sheet with no Tasks, no activity hours, and either numbered rows or only placeholders gets `status: "no-data"` and a warning.

### 4. Hours and comparisons
- Hours are numbers, rounded to 0.1 for stability. Negative or non-numeric values give a warning, and 0 is used.
- **Recalculated:** Task totals and the development total are sums of Sub task hours. Research Tasks are kept separate.
- **File totals** are read from the Task rows and the development total row: a value, or a formula's saved result. A formula with no saved result is "unknown" and isn't compared, but it gets one warning per sheet ("formulas have no saved results; totals were recalculated").
- Differences over 0.05 h become warnings: "Dev Backend Estimates: the file's development total is 26–34 h, but its Sub tasks add up to 166–254 h".

### 5. Summary by label
- **Project details:**
  - **Project name:** the cell right of a "Project Name"/"Project" label if present; otherwise the non-placeholder text in B2 (the template's title row).
  - **Client, PM, date:** the first non-empty cell to the right of the "Client Name", "Project Manager" and "Date" labels.
- **Template version:** `/template\s*v\s*([\d.]+)/i` in the first rows. Anything other than 0.5 gives a warning.
- **QA and PM rows:** rows whose label contains "QA" or "PM". The percentage comes from the formula (`percentFromFormula`), or else from the row's Min ÷ the sum of the development rows' Min (rows whose formula refers to a development sheet, or labelled "Development"). It's rounded to a whole percent.
- **Special Considerations:** rows after the "Special Considerations" label, each as `{ label, action, comments }`, with placeholders removed.
- **Free-form tables:** any other block of 3 or more consecutive rows with a text label and a number, outside the known rows (summary rows, price rows such as "Hourly rate" and "Cost", and special considerations), gives a "free-form table" warning with the row range.

### 6. Result shape (abridged)
```ts
type ParsedEstimate =
  | { ok: false; error: string; fingerprint: string }
  | {
      ok: true;
      fingerprint: string; fileName: string; templateVersion: string | null;
      summary: { projectName; clientName; projectManager; date: { raw; iso? }; qaPercent; pmPercent;
                 considerations: { label; action; comments }[] };
      sheets: ParsedSheet[];   // every sheet, with kind and status ("ok" | "no-data" | "skipped" | "no-table")
      warnings: { sheet?; row?; cell?; message }[];
    };
type ParsedSheet = { name; kind; status; title?; stack?; estimator?; reviewer?; date?;
  tasks: { title; row; research: boolean; subTasks: { title; min; max; comment; row }[]; min; max }[];
  activities: { title; min; max; comment; row }[]; environments: string[];
  bugFixPercent: number | null; development: { min; max }; fileDevelopment?: { min; max };
  assumptions: string[]; risks: string[] };
```

### 7. CLI
- `scripts/parse-estimate.ts`, run with `tsx`.
- It imports the parser through a path that avoids `server-only` (the library's pure core is in `core.ts`; `index.ts` re-exports it with the `server-only` marker).
- It prints a readable summary and the warnings, and `--json` prints the full result.
- It never writes files.

### 8. Tests
- **Unit:** `classifySheet` for every brief example; the placeholder regexes; `percentFromFormula`; the date patterns; the "By / Reviewed by" extraction.
- **Synthetic workbooks**, generated in the test with ExcelJS, one finding each:
  - renamed sheets and the header on row 10, with columns shifted
  - Task rows without `SUM` (26–34 vs 166–254)
  - formulas without saved results
  - a skeleton sheet; the unfilled template itself (from `docs/templates`)
  - Min > Max on Deployment; duplicate S.No; a note in column A
  - Research Tasks; Assumptions and Risks
  - QA/PM as formulas and as values; template v0.4
  - a free-form Summary table; a non-workbook file
- **Round trip (integration):** export a request with the export service, parse the file, and assert that it equals the estimate with zero warnings.
- **Local samples:** `samples/*.xlsx`, if present, must parse without throwing. The test reports counts and skips when there are none. It never runs in CI, because the folder is git-ignored and empty there.

## Risks / Trade-offs

- [Real files have layouts the synthetic tests don't cover] → Warnings instead of failures. Placing samples A and B in `samples/` and running `npm run parse-estimate` gives quick feedback. The F-08 preview lets people fix what the parser can't.
- [Keyword classification mislabels sheets, such as "App Store Assets" becoming Mobile] → Every classification is confirmed in F-08's preview. Here we only need sensible defaults.
- [ExcelJS reads shared formulas without results as a `sharedFormula` with no result] → `hours()` treats a missing result as unknown and warns. It never guesses.

## Migration Plan

- None: a new library and script, with no database or runtime changes.

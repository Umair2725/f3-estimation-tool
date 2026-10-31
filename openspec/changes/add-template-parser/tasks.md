# Tasks

## 1. Building blocks

- [x] 1.1 Add `src/server/estimate-parser/types.ts` and `classify.ts` (`classifySheet` with the brief's keywords and the precedence from design Decision 2); verify unit tests for every sheet name in brief section 15 ("Dev Backend Estimates", "BackEnd", "Server", "Web", "React Web", "UI Estimates", "MobileApp", "Flutter (mobile app)", "Admin Panel", "Cloud Infra", "GD Estimates (Web)", "MVP", "QA Estimates", "PM Estimates", "Questions", "Summary")
- [x] 1.2 Add `cells.ts` (`text`, `hours` with saved formula results, `percentFromFormula`, the placeholder test, date parsing, "By / Reviewed by" and stack extraction); verify unit tests for each, including rich text, `*0.25`, `*25%`, "5th May 2025", "08/05/2025", and "(React Native)"

## 2. Reading sheets

- [x] 2.1 Implement the development sheet reader (header detection in rows 1–30, column mapping, the Task / Sub task state machine, sections, bug fixing %, activities and environments, Research Tasks, Assumptions, Risks, Notes skipped, header details, skeleton detection, notes outside the table, duplicate S.No, Min > Max, recalculated vs file totals); verify tests on synthetic sheets for each finding listed in design Decision 8
- [x] 2.2 Implement the Summary reader (project details by label, template version, QA/PM percentages from formulas or values, special considerations without placeholders, free-form table warning); verify tests, including QA `C11*0.3` → 30, values-based percentages, v0.4 → warning, and a free-form block → warning
- [x] 2.3 Implement `parseEstimateFile(buffer, fileName)` (load errors become "This file isn't a readable Excel workbook", SHA-256 fingerprint, every sheet with kind and status, warnings collected with sheet, row and cell); verify tests: a non-workbook file, the same bytes under two names give the same fingerprint, and the unfilled template gives no Tasks with every development sheet "no-data"

## 3. Round trip and local check

- [x] 3.1 Integration test: export a request (two parts, Research-free, with Assumptions, Risks, Deployment, QA and PM on) with the export service, parse the file, and assert that parts, Tasks, Sub tasks, hours, comments, bug-fixing %, Deployment, Assumptions, Risks and QA/PM % equal the estimate, with no warnings
- [x] 3.2 Add `scripts/parse-estimate.ts` and `npm run parse-estimate` (readable summary, `--json`, exit 0 on parse errors with the message printed, exit 2 on a missing file); verify by running it on an exported file and on the unfilled template
- [x] 3.3 Add the optional local-samples test (`samples/*.xlsx` parse without throwing; skipped when there are none) and a README section on checking real files locally; verify it is skipped in CI and that `samples/` stays git-ignored

## 4. CI

- [ ] 4.1 Verify CI is green on the pull request

## Workflow follow-up

- Run `npm run parse-estimate` on samples A and B locally (product owner), and record any layout the parser misreads as new test cases.
- Next change from the brief: `add-actual-hours-upload` (F-12), which reuses this parser.

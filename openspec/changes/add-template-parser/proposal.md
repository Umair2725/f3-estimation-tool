# Proposal

## Why

Three upcoming features need to read Folio3 estimate files:
- the historical import (F-08), which loads past estimates into the knowledge base
- the actuals upload (F-12), which reads the same template filled with real hours
- tests of our own export (F-07)

The four sample estimates showed that past files don't follow the template's fixed rows or sheet names (brief section 15):
- sheets are renamed
- header rows move
- many totals are missing or wrong
- skeleton sheets and placeholders are left behind

One shared, well-tested reader is the foundation for those features (brief section 12, step 5).

## What Changes

- **A parser library** (server-only, no UI) that turns an `.xlsx` estimate into structured data plus warnings, **reading by labels and patterns, never by fixed cell positions**:
  - **Sheets** classified by name keywords into the five parts, plus QA, GD, PM, Questions, Summary, or **Unknown**.
  - **Tables** found by their header row (S.No / Task / Minimum / Maximum / Comments) wherever it is. Columns are found from that header.
  - **Rows:**
    - a row with a number in S.No and text in Task is a **Task**
    - the rows below it with text and hours are its **Sub tasks**
    - each keeps its **source sheet and row**
  - **Sections** by label: development total, other development activities (bug fixing as a **percentage**, deployment and builds as rows), Research Tasks, Assumptions & Constraints, Risks. The Notes block is skipped.
  - **Header details:** the title (with the stack in brackets, for example "(Node)"), the date as written, and "By" / "Reviewed by".
  - **Summary:**
    - project name, client, project manager and date, found by label
    - the Special Considerations rows
    - QA and PM as percentages of development, read from formulas or computed from the values
    - the template version
  - **Hours are recalculated from the Sub tasks.** The file's own totals are only compared, and a difference becomes a warning showing both numbers.
  - **Skipped:**
    - template placeholders ("Task -1", "Sub task -2", "<Research Task …>", "<List down …>")
    - placeholder rows with no hours
    - the template's sample Questions and Assumptions
  - **Skeleton sheets** (numbered rows with no Task text or hours) are reported as "no data", not silently dropped.
  - **Warnings:**
    - Min > Max
    - duplicate S.No
    - notes typed outside the table
    - a sheet whose kind is unknown
    - a different template version
    - free-form tables on the Summary
    - formulas without saved results
  - **An unreadable file** returns a clear error, never a crash.
  - Each result carries a **content fingerprint** (SHA-256), so later imports can detect duplicates without trusting file names.
- **A local command** `npm run parse-estimate -- <file.xlsx>` prints the parsed result and its warnings, so people can check real files without uploading them anywhere.
- **Tests:**
  - synthetic workbooks that reproduce each finding from the samples
  - a round trip of the tool's own export
  - an optional run over real files placed in the git-ignored `samples/` folder, skipped when it is empty

**Out of scope:**
- uploading files, the import preview and storage (F-08)
- matching actuals to estimates (F-12)
- reading SOW or requirements documents (F-09)
- free-form tables beyond detecting and flagging them

## Capabilities

### New Capabilities
- `estimate-file-parsing`: how an estimate `.xlsx` in Folio3's template (or one of its variations) is read into Tasks, Sub tasks, hours, sections, Summary details and warnings, and what is skipped.

### Modified Capabilities
- None.

## Impact

- **Code:**
  - `src/server/estimate-parser/` (classification, table reading, Summary reading, fingerprint)
  - a CLI script under `scripts/`
- **Dependencies:** none new. It uses `exceljs`, added for the export.
- **Data:** no database changes.
- **Privacy:** real client files are never committed. The optional sample test reads only the local, git-ignored `samples/` folder.

# F3 Estimation Tool: UX design

| | |
|---|---|
| **Status** | Draft v0.1, for product owner review |
| **Date** | 2026-10-30 |
| **Prototype** | [prototype/index.html](prototype/index.html): open it in any browser. It starts at sign-in; click "Continue with Google". |
| **Based on** | [docs/product-brief.md](../product-brief.md) (v0.7), Nielsen's [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [Laws of UX](https://lawsofux.com) |

The prototype is a single self-contained HTML file with **fictional demo data** (Northwind Clinics, Contoso Logistics and so on; no real client names). Buttons are clickable: decisions show a confirmation with **Undo**, totals update live, and the "source" badges open an evidence panel. It isn't production code. The real screens are built as OpenSpec changes, using these designs as the reference.

---

## 1. Brand (taken from folio3.com on 2026-10-30)

| Token | Value | Use |
|---|---|---|
| Brand red | `#F32735` | Logo, small accents, selected navigation item tint |
| Brand red (accessible) | `#D91E2B` | **Primary buttons and links.** The site's `#F32735` with white text is about **4.1:1** contrast, below the WCAG AA 4.5:1 minimum for normal text. `#D91E2B` gives about 5:1 and looks the same at a glance. |
| Brand yellow | `#FFCB11` | Highlights, avatar, quote markers, secondary call-to-action. Always with dark text, never as text on white. |
| Ink | `#171819` | Text, the dark sign-in panel |
| Surface / background | `#FFFFFF` / `#F5F5F5` / `#FAFAFA` | Cards / sections / page |
| Muted text | `#6B6C70` | Secondary text (darker than the site's `#747474`, for contrast on grey) |
| Lines | `#E2E2E4`, `#D4D4D4` | Borders, dividers |
| Font | **Plus Jakarta Sans** (Google Fonts), 400–700 | Same as folio3.com |
| Shape | Pill buttons (`999px`), 14 px card radius | Matches the site's rounded pill buttons |

**Status colours** (green = done or approved, blue = in review, amber = needs attention, red = errors) and an **AI purple** (`#6D28D9`) for "AI guess" items have their own tokens, so they never clash with the brand red. **Dark mode** has its own token set; it follows the system setting and can be switched in the sidebar.

**Logo:** the prototype *links* to the official logo PNG on Folio3's CDN, and falls back to a text wordmark if it doesn't load. It isn't downloaded into the repository (see Open questions).

## 2. Screen map

| # | Screen | Who | Brief features |
|---|---|---|---|
| 1 | **Sign in**: Google, `@folio3.com` only | Everyone | F-01 |
| 2 | **Home**: drafts, reviews waiting, "continue where you left off", all requests with status filters | Everyone | F-02 |
| 3 | **New estimation request**: 4-step wizard (Project → Platforms & stack → Environment & compliance → Requirements); PDF/DOCX upload with extracted features, each quoted with its page number | Estimator | F-03, F-09 |
| 4 | **Estimate workspace**: features by part (tabs), a source badge on every number, Accept / Adjust / Remove, Team experience switch, live totals (development + 10% bugs + QA 25% + PM 30%, rate, cost), pre-submit checklist | Estimator | F-04, F-05, F-07, F-24 |
| 4a | **"Why this number?" panel**: benchmark details, similar past projects with similarity %, AI reduction shown step by step, editable hours for AI guesses | Estimator, Approver | F-04, F-05, F-24 |
| 5 | **Review**: flagged items first (AI guesses, large overrides), comments, Approve / Request changes | Tech Lead, Architect | F-10 |
| 6 | **Export**: Client / Internal, optional sections, ready-to-export checklist, download | Estimator | F-07 |
| 7 | **Import past projects**: batch upload, per-file status, warnings (for example totals that don't match), duplicates, approve | Admin | F-08 |
| 8 | **Actual hours**: matched / unplanned / dropped, inline edit, variance, mark delivered | Tech Lead, Architect | F-12 |
| 9 | **Feature hours**: the benchmark library, pre-AI vs with-AI hours, trend sparkline, confirmation status, proposed changes | Architect | F-24, F-15 |
| 10 | **Settings**: QA / PM / bug-fixing %, approved rates, people and roles | Admin | F-01, F-07 |
| 11 | **Page not found** | Everyone | app-shell spec |

Navigation is a fixed **left sidebar**, grouped into Work (Home, Estimates, Reviews), Knowledge base, and Admin. **"New estimation"** is always the top action. A breadcrumb is shown on every screen.

## 3. Nielsen's 10 usability heuristics: where each is applied

| # | Heuristic | How the design applies it |
|---|---|---|
| 1 | **Visibility of system status** | "Draft saved · 2 minutes ago" in the wizard footer. A progress stepper. "18 of 24 features reviewed" with a progress bar. Totals update instantly as you accept, remove or change team experience. Status badges (Draft, In review, Changes requested, Approved, Exported) everywhere. A confirmation message after every action. |
| 2 | **Match between system and the real world** | Uses Folio3's own words and structure: Tasks / Sub tasks, Min–Max hours, parts named like the Excel sheets ("Backend (Node.js)"), QA %, PM %, hourly rate, SOW, RFP. The export fills the same Excel template the team already uses. |
| 3 | **User control and freedom** | Every Accept / Remove has **Undo** and a "Change" / "Restore" button. "Save & exit" on every wizard step. "Back" in the wizard. Esc closes panels. Imports are a preview first: nothing is saved until you approve. |
| 4 | **Consistency and standards** | One button system (red primary, white secondary, ghost tertiary). The same source badge colours everywhere (green Benchmark, blue Past project, dashed purple AI guess). Standard patterns: left navigation, breadcrumb, tables, stepper, drawer. |
| 5 | **Error prevention** | Pre-submit and pre-export **checklists** (unreviewed items, AI guesses, default rate, Min > Max, copied text). Only Approved estimates can be exported for clients. Approve is only available to Tech Leads and Architects. Duplicate-upload detection. Request changes requires a comment. |
| 6 | **Recognition rather than recall** | A source legend above the table. The request summary stays visible next to the wizard. Pre-AI hours shown struck through next to the suggestion. A feature library to pick from instead of typing. Quotes from the RFP next to each extracted feature. |
| 7 | **Flexibility and efficiency of use** | "Accept all confident (21)" for experts. Keyboard: `/` focuses search, Esc closes panels. Team experience switches the whole estimate in one click. Benchmarks are reused automatically. |
| 8 | **Aesthetic and minimalist design** | Calm neutral surfaces with brand red only for primary actions and the current location. Detail lives in the evidence panel, not in the table. Optional export sections are off by default (lean export). |
| 9 | **Help users recognize, diagnose, and recover from errors** | Plain-language errors with a fix: "Totals don't match: the sheet says 26–34 h, its sub tasks add up to 166–254 h; the tool will use the sub-task total." "Unfilled template · no tasks found" with Skip. "No reliable match… please check it or ask a Tech Lead." |
| 10 | **Help and documentation** | A help icon in the top bar ("how estimates are calculated"). `?` tooltips on non-obvious settings (Team experience). Every screen starts with a one-line description of what it's for. The evidence panel explains the calculation order. |

## 4. Laws of UX applied

| Law | Where |
|---|---|
| **Jakob's Law** (users expect your product to work like others they know) | Familiar SaaS layout: left sidebar, breadcrumb, tables, stepper, "Continue with Google". |
| **Hick's Law** (more choices take longer) | The wizard splits input into 4 small steps. Each row offers 3 actions at most. Exports offer two choices (Client / Internal). |
| **Fitts's Law** (big, close targets are faster) | Primary actions are large pills (48 px) placed where the eye ends: the bottom-right of the wizard, and under the totals. Buttons are at least 32–40 px high; row actions sit in the row. |
| **Miller's Law** (chunking) | Features grouped by module (User Management, Appointments, Compliance) and by part (tabs). Numbers grouped in the totals card. |
| **Tesler's Law** (complexity has to live somewhere) | The system carries it: document extraction, matching, AI reduction, percentages and formulas are automatic; the user decides. |
| **Doherty Threshold** (respond within 400 ms) | Totals and badges update instantly on the client. Long jobs (document reading, matching) show progress messages. |
| **Goal-Gradient Effect** (motivation rises near the goal) | Stepper with completed steps ticked. "18 of 24 reviewed" progress bar. |
| **Zeigarnik Effect** (unfinished tasks are remembered) | A "Continue where you left off" card on Home; drafts counted on Home. |
| **Von Restorff Effect** (the odd one out is remembered) | AI guesses use a different (dashed, purple) badge plus "check this one". Overrides are flagged in amber in Review. |
| **Law of Common Region / Proximity** | Cards group related content (totals, checklist, comments). Labels sit right next to their fields. |
| **Serial Position Effect** | Most-used items first and last in navigation (New estimation at the top, the user and settings at the bottom). |
| **Peak-End Rule** | The flow ends on a clear success: "Ready to export", all ticks green, then download. |
| **Aesthetic-Usability Effect** | A consistent, polished Folio3-branded look builds trust in the numbers. |
| **Postel's Law** (be liberal in what you accept) | Accepts PDF and DOCX, single files or a zip, same-name files from different people; tolerant of messy past sheets, with warnings rather than failures. |

## 5. Accessibility

- Contrast: brand-red buttons use `#D91E2B` (white text about 5:1). Muted text is darkened to `#6B6C70`. Yellow never carries text on white.
- Visible focus ring (blue, 3 px) on every interactive element. Skip-friendly heading focus on screen change.
- Status is never shown by colour alone: badges always include text ("Accepted", "AI guess", "Needs confirmation").
- Proper semantics: `nav`, breadcrumb with `aria-current`, `role="tab"`, `aria-pressed` toggles, a labelled dialog for the evidence panel, `role="status"` for messages.
- Works from **375 px** phone width to desktop with no page-level horizontal scroll (checked on all 11 screens); wide tables scroll inside their card.
- Light and dark mode; reduced-motion respected.

## 6. Decisions made while the product owner was away (2026-10-30)

These were taken as recommended defaults; change any of them.

1. **Format:** a clickable HTML prototype in the repository, instead of a Figma file, so it can be reviewed in any browser and kept next to the specs.
2. **Accessible red** `#D91E2B` for buttons, with the original `#F32735` kept for the logo and accents (see section 1).
3. **Logo linked, not copied** into the repository.
4. **Left sidebar navigation** rather than top tabs: there are 7+ sections, and it leaves room for growth.
5. **Evidence in a side panel** ("Why this number?"), so the estimate table stays readable.
6. **Fictional demo data only.**
7. Delivered on its own branch with a pull request, **not merged**, so the designs can be reviewed first.

## 7. Open questions for the product owner

1. **Logo file:** may we download the official logo (and favicon) into the repository, or should we ask Folio3 marketing for the official SVG and brand guidelines?
2. **Logo dot blue:** the exact blue of the logo's middle dot isn't in the website's CSS. The prototype uses `#2F6FED` for the sign-in illustration. Is there an official value?
3. **Sign-in illustration:** keep the abstract brand-dot artwork, or use a photo, as folio3.com does?
4. **Screens to prioritise** for the first build after sign-in: the recommendation is Home → Wizard (without upload) → Estimate workspace → Export, which matches the OpenSpec order in the brief.

# Feature benchmarks (seed data)

These files seed the **FeatureBenchmark** table (feature F-24 in [docs/product-brief.md](../docs/product-brief.md)). They list **166 features** Folio3 builds again and again, so the tool can suggest the hours the team **really spends with AI**.

| File | For | Use |
|---|---|---|
| `feature-hours-survey.xlsx` | **Tech Leads and Architects** | Fill in the real hours spent with AI. It has an Instructions sheet, yellow input columns and input checks. |
| `feature-benchmarks.csv` | **The tool** (database seed) | Same rows and columns in CSV. The tool imports either file. |

## How to fill in the survey

1. Open `feature-hours-survey.xlsx` and read the **Instructions** sheet.
2. On the **Features** sheet, fill in only the **yellow** columns, for features your team has built with AI:
   - **AI hours – experienced dev**: real hours an experienced developer spends with AI on one instance of the feature, as described in "What is included". The tool uses this as **Minimum**.
   - **AI hours – junior dev**: real hours a junior developer spends on the same scope. The tool uses this as **Maximum**.
   - **AI tools used**, **Based on # projects**, **Filled by (Tech Lead)**, **Confirmed by (Architect)**, **Date**, **Notes**.
3. Leave a row empty if there's no AI-era data for it. The tool then falls back to past estimates with the AI reduction (F-05).
4. Add missing features at the bottom with the next `FB-` number.
5. Don't put client names in the file.

## Columns

| Column (CSV name) | Meaning |
|---|---|
| `feature_id` | Stable ID (`FB-001`…) |
| `module` | Group, e.g. User Management, Payments, AI Features |
| `feature` | Feature name as it should appear in estimates |
| `part` | Web/Frontend, Backend, Mobile, Admin Panel, Cloud/Infrastructure, Design, Any |
| `typical_stack` | Stack the numbers apply to, or `Any` |
| `what_is_included` | Scope of one instance. Keeps numbers comparable |
| `pre_ai_min_hours`, `pre_ai_max_hours`, `pre_ai_source` | From past (pre-AI) sample estimates. These are **estimates, not actual hours**; blank where no past estimate was found |
| `ai_hours_experienced` | **To fill in:** real hours with AI, experienced developer (→ Min) |
| `ai_hours_junior` | **To fill in:** real hours with AI, junior developer (→ Max) |
| `ai_tools_used`, `projects_count` | **To fill in** |
| `filled_by`, `confirmed_by`, `confirmed_on` | **To fill in:** Tech Lead who entered the row, Architect who confirmed it, date |
| `notes` | Anything else |

Bug fixing (10%), QA (25%) and PM (30%) are **not** part of these hours. The tool adds them as percentages.

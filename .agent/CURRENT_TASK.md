# Task: Per-nutrient P/K Increment 5b — known P or K in CSV, Evidence Report and prompt

Task ID: per-nutrient-p-k-increment-5b-known-p-or-k-in-csv-evidence-report-and-prompt-20261002
Starting HEAD: 552e709f6c0da9f0f4eaaf2f19d77a448c7d1b4b
Verify command: `npm run typecheck && npm run build`

## Objective

Implement the second part of Increment 5 of `docs/farm-return-next/campaign-c/PER_NUTRIENT_PK_DESIGN.md`
(§4 row 5, "5b"): carry the per-nutrient P/K display (done on the Nutrients cards in 5a, commit
`f616ae3`) into the CSV field report, the Evidence Report, and — only if needed — the fertiliser
prompt, so a field with a known P (or K) index and the other missing reports the known nutrient
instead of withholding both. Reporting/content only; no engine change.

## Scope

1. CSV field report (`src/lib/reports.ts`): the P and K requirement columns read
   `requirementByNutrient`, and the P and K organic-offset columns read
   `organicApplication.availableNutrientByNutrient` (rounded as the existing columns are), each
   per nutrient. An unknown arm keeps the existing marker (`INSUFFICIENT_EVIDENCE`, or
   `NOT_APPLICABLE` for tillage) — never 0. N columns, the products column (D1 option a: still
   withheld while either index is missing) and NAP columns are unchanged.
2. Evidence Report (`src/orchestration/scientific-evidence-report/` and
   `src/app/(app)/evidence-report/[jobSessionId]/EvidenceReportPageClient.tsx`): for a mixed field,
   show the "Nutrient requirement" section with per-nutrient Gross / Organic offset / Net rows from
   `requirementByNutrient`, `availableNutrientByNutrient` and `netRequirementByNutrient`, "—" for
   the unknown nutrient, plus the 5a D3 line (e.g. "K requirement isn't shown because this field's
   soil K Index is missing. Add a soil test to complete the plan."). Fully indexed and no-index
   fields render exactly as today. Before changing the report, check
   `docs/farm-return-next/DOMAIN_CONTRACTS.md` for the report's frozen status and integrity rules
   (hash/fingerprint, versioning); only an additive change is allowed.
3. Fertiliser prompt (`src/orchestration/prompt/fertiliser-recommendation.ts`): verify that a mixed
   field's prompt text names only the missing index and does not claim both are missing. Change it
   only if it is inaccurate; otherwise record "no change needed" with the reason.
4. Reuse the 5a presentation helper (`src/lib/nutrient-card-presentation.ts`) for wording where it
   fits; no calculation in components. Update the design's §6 Status ("Increment 5b done") and
   IMPLEMENTATION_LOG minimally.

## Out of scope

- Any domain/engine change, `requirementProvisional`, purchasing (D1), statutory/NAP/buffer (D2,
  CC-B5), the requirement card's mobile header-badge overflow (separate follow-up), decisions D4,
  migrations, harness, push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository (this session cannot delete
  files). If a quick check script cannot be run, rely on repository tests.

## Acceptance criteria

- Mixed fields (P-only, K-only): CSV P/K requirement and offset columns show the known nutrient's
  values and the marker for the unknown one; the Evidence Report shows per-nutrient rows with "—"
  and the D3 line; no unknown is exported or shown as 0.
- Fully indexed and no-index fields: CSV rows and Evidence Report identical to today.
- Prompt verified (changed only if inaccurate).

## Required tests

- `src/lib/reports.test.ts` cases for P-only, K-only, both, neither, tillage, driven by real
  `calculateNutrientPlan` output; Evidence Report orchestration/page tests for the same states;
  prompt tests for mixed fields if changed. Existing report, evidence-report and prompt tests pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if the Evidence Report change is not additive under its contract or
would alter its integrity/fingerprint for fully indexed fields, if a domain/engine change is
needed, or if a fully indexed or no-index field's output would change.

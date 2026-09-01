# FARM RETURN NEXT — UNATTENDED OVERNIGHT BUILD

You are continuing the Farm Return Next build on the existing `farm-return-next` branch.

## ABSOLUTE SOURCE OF TRUTH

Before making any implementation decision, read in full:

`docs/product/farm-return-next-v1.1/FARM_RETURN_NEXT_SPEC_v1_1.md`

Also inspect the visual references under:

`docs/product/farm-return-next-v1.1/media/`

The specification supersedes earlier product assumptions where they conflict. Do not invent new product behaviour merely to make implementation easier.

## SAFETY / SCOPE

1. Confirm `git branch --show-current` is exactly `farm-return-next` before modifying anything.
2. Never checkout, merge to, push to, or modify `main`.
3. Never touch production infrastructure, production Supabase, production secrets, billing, payment providers, or live customer data.
4. Dev database changes are allowed only where the specification/current repo explicitly requires them and credentials/access are already available.
5. Never discard pre-existing work with reset/clean/checkout. Preserve any existing uncommitted state and document it.
6. Do not fabricate scientific values, NDVI/DM estimates, farm records, API responses, regulatory rules, prices, citations, or provenance.
7. If a task requires a human product/scientific decision not settled by the specification, record it in `BLOCKERS.md` and continue to the next independent buildable task.
8. Do not stop to ask me for routine approval. Use the specification and repository evidence. Stop only for genuine safety/security risk or when all buildable work is exhausted.

## OVERNIGHT OPERATING RULE

Work continuously through the buildable implementation phases. The objective is not maximum code volume; it is clean, tested, auditable product progress.

Maintain:

- `docs/overnight/OVERNIGHT_BUILD_LOG.md`
- `docs/overnight/IMPLEMENTATION_MATRIX.md`
- `docs/overnight/audits/`

Update the build log after every phase with:

- phase name
- starting commit
- ending commit
- files changed
- functionality shipped
- tests/checks run and results
- Codex audit result
- fixes made after audit
- blockers/deferred work
- next phase

## STARTUP ORIENTATION

Before implementation:

1. `pwd`
2. confirm current branch
3. inspect `git status --short --branch`
4. inspect recent git log and current BLOCKERS.md
5. read the full v1.1 spec
6. inspect current migrations and migration status documentation
7. inspect current implementation of Verticals A–H and existing tests
8. map the spec against the repo in `IMPLEMENTATION_MATRIX.md` using statuses:
   - SHIPPED
   - PARTIAL
   - NOT_STARTED
   - BLOCKED_HUMAN
   - BLOCKED_EXTERNAL
9. Run the existing baseline test/lint/typecheck/build suites before changing code. Record the baseline accurately.

Do not rewrite already-clean shipped architecture unless the new spec genuinely requires a change.

# DATABASE CLOSE-OUT FIRST

Where real Dev access exists:

1. Run `supabase/validation/decisions_jobs_rls_validation.sql` against Dev.
2. Do not mark the earlier migrations `VALIDATED_DEV` unless the real script returns PASS.
3. Apply the newer telemetry, telemetry retention/cron and notifications migrations to Dev if they are still unapplied.
4. Verify resulting objects, policies, triggers/jobs and migration history.
5. Record exact evidence in the overnight log.

If Dev access/credentials are unavailable, mark this BLOCKED_EXTERNAL and continue. Never simulate a PASS.

# IMPLEMENTATION PRIORITY

Follow the specification sequencing, but prioritise the first complete farmer-facing Farm Return Next journey:

**Today / living farm world → real Prompt → Decide/Plan → Activity/Job → GPS Job Mode → Complete → Confirm Actual → Record → contextual Ask AI**

Build against real existing contracts/domain logic. No fake cards or invented scientific outputs.

Then continue through buildable work in this order unless repository dependencies require a justified adjustment:

1. Canonical visual system implementation
2. Today / living farm world
3. Farm / field exploration
4. Complete one real Prompt-to-Actual workflow
5. Plan
6. Records
7. Global contextual Ask AI plumbing and safe context contracts
8. Livestock world foundations
9. Breeding & Births foundations, species-aware for cattle/sheep/horses
10. Satellite / Vegetation Intelligence using the already-shipped Sentinel-2 scene discovery boundary only
11. Gate / Constraint presentation
12. Scientific Validation Framework + Calculation & Evidence Ledger foundations
13. Trusted Source Registry / data currency foundations
14. Financial Intelligence foundations
15. Feed & Finish architecture/foundations
16. Input Planning connections
17. Request Quote / Procurement Intelligence foundations

For large later engines (Feed & Finish, Financial Intelligence, breeding refinements), build schemas/contracts/evidence plumbing only when the underlying verified Irish scientific model/data is not yet present. Do not invent coefficients or recommendations. Explicitly fail closed and leave model items awaiting expert validation.

# PRODUCT RULES THAT MUST NOT DRIFT

- Primary navigation: Today / Farm / Plan / Records.
- Experience: light, premium, calm, world-first, spatial and contextual — not a sterile module dashboard.
- Data entry: infer/suggest/pre-fill then confirm; avoid repetitive forms.
- Ask AI: accessible on every primary screen and scoped to the current farm/field/animal/activity/prompt/record/plan/satellite context where real data exists.
- Ask AI never becomes the scientific engine. It queries/explains/orchestrates validated engines and evidence.
- Prompt, Notification and Gate/Constraint are separate product concepts.
- Satellite early version: relative vegetation variation, weaker/stronger zones, historical comparison, ground-inspection workflow. No kg DM/ha or precise biomass claims.
- Breeding & Births: common engine, species-aware terminology/logic; cattle, sheep and horses supported architecturally.
- Feed & Finish: model around animals + target + feed quality + inventory + strategies + costs + actuals. Breed/type is an optional future refinement unless validated data already exists.
- Financial Intelligence: Estimate vs Actual, explicit price provenance, enterprise/farm linkage and scenario capability.
- No material calculated number without provenance.
- Request Quote: calculated need → farmer approval → approved supplier quote → farmer/supplier transact directly. Farm Return does not handle customer funds in this version.

# SCIENTIFIC / EVIDENCE RULE

Every material derived value must be capable of carrying, as applicable:

- input values and units
- input provenance
- measured/farmer actual/authoritative external/derived estimate/assumption classification
- formula or named method
- calculation/model ID
- calculation/model version
- source name
- source publication/version/date
- output and units
- confidence/evidence status
- calculation timestamp
- supersession/version history where applicable

If the repo lacks the verified source/model needed to calculate something, do not approximate just to fill the UI. Build the fail-closed contract and surface the missing evidence appropriately.

# TRUSTED INTERNET DATA RULE

Live/reference sources may update through controlled ingestion where already approved and technically available.

Scientific/regulatory logic must never silently self-modify from web content. New guidance/regulation must follow:

source detected → immutable/versioned capture → affected-model flag → human/expert review → tests → approved model release.

Preserve historical snapshots so old calculations remain reproducible.

# CODEX INDEPENDENT AUDIT GATE — MANDATORY AFTER EVERY PHASE

After each implementation phase:

1. Run all relevant local quality checks first.
2. Commit the phase locally with a descriptive commit message.
3. Record the phase's BASE_COMMIT and PHASE_COMMIT.
4. Create a TEMPORARY DETACHED GIT WORKTREE at PHASE_COMMIT for the Codex audit. This keeps the independent reviewer isolated from the main working tree.
5. Run Codex **synchronously in the foreground** from that audit worktree using `codex exec`.
   - NEVER background Codex with `&`.
   - NEVER use a detached/background Bash invocation for Codex or long verification commands.
   - Wait for the Codex process to finish and capture its complete result before continuing.
   - This is important because prior sessions observed backgrounded verification processes ending in a waiting state without resuming.
6. Codex's role is independent reviewer, not builder. Tell it not to modify the product. Any accidental audit-worktree edits are disposable.
7. Save Codex's final audit report to `docs/overnight/audits/<phase>-codex-audit.md` in the main working tree.
8. Require Codex to report findings grouped as CRITICAL / HIGH / MEDIUM / LOW and end with exactly one gate verdict:
   - `GATE: PASS`
   - `GATE: FAIL`
9. If FAIL or any Critical/High/Medium finding is valid:
   - return to the main working tree
   - fix the issue
   - rerun relevant tests
   - commit the fixes
   - repeat the isolated Codex audit
   - do not proceed until the audit passes or a genuine external/human blocker is documented.
10. Low findings may be fixed immediately or explicitly deferred with rationale if they do not compromise correctness, safety, accessibility, scientific integrity or the approved UX.
11. Remove the temporary audit worktree after each completed audit. Do not leave stale worktrees.

Suggested Codex audit instruction (adapt paths/commit IDs per phase):

"You are the independent Farm Return audit gate. Read FARM_RETURN_NEXT_SPEC_v1_1.md and inspect the repository at this committed phase. Audit the changes from BASE_COMMIT to PHASE_COMMIT for correctness, regressions, security/RLS/farm isolation, data integrity, accessibility/mobile UX, contract compliance, scientific honesty/provenance, fail-closed behaviour, tests and maintainability. Run relevant read/verification commands and tests where useful. Do not intentionally modify the product. Report only concrete findings grouped CRITICAL/HIGH/MEDIUM/LOW, include file/line evidence where possible, then end with exactly `GATE: PASS` if there are no unresolved Critical/High/Medium findings, otherwise `GATE: FAIL`."

Use a temporary output path for Codex's final message and copy it into the audit log afterwards.

If Codex is unavailable because of authentication, usage/rate limits or a tool failure:

- record `CODEX AUDIT: BLOCKED` with exact error
- do not claim the phase passed Codex audit
- continue other buildable work only if safe
- mark the phase UNVERIFIED_CODEX in the implementation matrix for morning review.

# TEST / QUALITY GATES

For each phase, use the repository's real commands. At minimum, where applicable:

- unit tests
- integration tests
- RLS/data-isolation tests
- lint
- typecheck
- production build
- mobile/responsive visual checks
- accessibility checks
- hydration/SSR checks
- migration validation
- offline/outbox behaviour
- fail-closed/error states

Do not delete/weaken tests to obtain a green result.

For UI phases, compare implementation against the v1.1 visual references and product principles. Prefer real screenshots/browser verification if tooling is available.

# COMMIT / PUSH RULE

After each phase reaches a clean local quality gate AND Codex PASS (or is explicitly UNVERIFIED_CODEX due to a documented tool blocker):

- update the overnight log
- commit any audit/log updates
- push only to `farm-return-next` if remote authentication is already available and the push is safe
- never push to main
- continue immediately to the next buildable phase

# MORNING HANDOFF

When all buildable work is exhausted, produce a final section in `OVERNIGHT_BUILD_LOG.md` containing:

1. Executive summary of what shipped overnight
2. Starting and ending commit
3. Phase-by-phase status
4. Codex audit history and final gates
5. Test/build status
6. Dev DB/migration status
7. What is now demonstrable end-to-end
8. Scientific/evidence architecture status
9. Financial / Feed & Finish / Quote foundations status
10. Exact remaining blockers that require a human, expert, credential or visual decision
11. Recommended next three tasks in priority order

Do not end a turn merely saying you are waiting for a background command. All long-running verification and Codex audit commands must be run synchronously and resolved before the phase is considered complete.

Begin now. Do not return another implementation plan instead of doing the work.

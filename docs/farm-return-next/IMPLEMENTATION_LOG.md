# Farm Return Next — current implementation log

Historical record through frozen Campaign B: [unchanged archive](history/IMPLEMENTATION_LOG-through-b24c266.md).
Read historical sections only for a specific investigation. Rotate completed campaigns into
`history/` with their boundary SHA, retain a link here, and append one concise entry per task.
The archive and Git retain full provenance; no historical entry is deleted.

## Campaign C remaining programme — starting 465a523 (2026-09-30)

Architecture, deferral and validation preparation. **No production output changed.** The
engine stays `nutrient_engine_v1.2.0`. No frozen contract changed, and there was no
migration. Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING and
DRAFT.

- Follow-ups were logged as BLOCKERS `CC-FU-A` (card headline), `CC-FU-B` (LESS `MEASURED`
  label) and `CC-FU-C` (January as SPRING). No code changed for them.
- Added `slurry-rate-allocation.ts`, an unwired layer over a finished `NutrientPlan`.
  - It keeps requirement, available nutrient, share limit, allocated credit, remaining
    chemical requirement, rate constraints and final rate separate.
  - Every constraint carries full provenance.
  - Share caps are recorded, with binding UNDETERMINED on Index 1/2 (interaction
    provisional).
  - The 90 kg K guidance is recorded and NOT_ENFORCED.
  - `finalAllowedRate` is always DEFERRED, with no min(P, K).
- N yield scaling stays deferred: no stored source states a range.
- Per-nutrient P/K is deferred (architecture): it touches frozen shapes, about 11
  consumers, blend purchasing and statutory outputs.
- CC-B3 is designed (`CC_B3_PERSISTENCE_DESIGN.md`) and ready for a migration task.
- The blinded 50-case protocol, the `campaign-c-expert-validation.ts` types and
  comparison, and an empty template were added. Validation has not taken place.
- Record: `campaign-c/RATE_ALLOCATION_ARCHITECTURE.md` and `SOURCES_AND_CLAIMS.md` §8.
  Nothing was pushed.

## Campaign C verified rules within existing architecture — starting 942cc81 (2026-09-29)

Implementation review of the REPOSITORY_VERIFIED Teagasc rules against the existing engine.
**No production output changed**; engine stays `nutrient_engine_v1.2.0`; no migration.
Campaign C remains AI_SCIENTIFIC_ADJUDICATION, EXPERT_VALIDATION_PENDING, DRAFT.

- Organic share caps (P 50% / K 75%): IMPLEMENTATION_DEFERRED_ARCHITECTURE — they govern how
  much organic fertiliser to plan; the engine takes the planned slurry volume as an input and has
  no rate/allocation layer, and capping the credit would apply the AI_PROVISIONAL stacking reading.
- 90 kg K spring guidance: DEFERRED_EXACT_RULE_PROVISIONAL — no existing 90 kg rule; slurry-K
  counting is AI_PROVISIONAL; slurry K credit still not truncated.
- Yield scaling: P ±4 / K ±25 ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED (stored 5/6 t rows
  reproduced); N ±25 IMPLEMENTATION_DEFERRED_SUPPORTED_RANGE_UNCLEAR (only 5/6 t rows, no stated
  range, no statement for the grazed-previous-year rate; silage plans mock-only in real mode).
- Rate principles: organic-before-chemical balance and nutrient-content determination
  ALREADY_IMPLEMENTED_REPOSITORY_VERIFIED; rate-by-requirement IMPLEMENTATION_DEFERRED_ARCHITECTURE;
  `AI_PROVISIONAL_RATE_SELECTOR_V1` not implemented.
- Tests (`nutrients.test.ts`): over-cap LESS credit subtracted in full after the unchanged
  availability factors; P/K yield rows; N not yield-scaled; no rate selector; engine version.
- Record: `campaign-c/SOURCES_AND_CLAIMS.md` §7. Nothing pushed.

## Campaign C stored Teagasc evidence ingestion — starting 0c58a8c (2026-09-29)

Inspected the five frozen snapshots in
`docs/scientific-engine/v3/external_teagasc_2026-09-29/` directly (no web access) and recorded
sources, SHA-256, locators and classifications in SOURCES_AND_CLAIMS §6
([AI_ADJUDICATION §6](campaign-c/AI_ADJUDICATION_2026-09-29.md)).

- **REPOSITORY_VERIFIED / SOURCE_DIRECT, READY_FOR_IMPLEMENTATION_REVIEW:**
  - the 50% P / 75% K Index 1/2 share caps (kept separate from the × 0.50 / × 0.90 factors);
  - the 90 kg K spring text;
  - "February to April" wording;
  - N 25 kg per t DM (P 4 / K 25 already implemented).
- **Stay AI_PROVISIONAL / AI_REVIEW_ONLY (IMPLEMENTATION_DEFERRED_EXPERT_VALIDATION):**
  - the exact 1 Feb – 30 Apr boundary;
  - the slurry-K 90 kg reconciliation;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1` (the cereal source is P-led and states no min(P, K));
  - the cap/availability interaction, downgraded from the earlier SOURCE_DIRECT label because
    the source does not state it.
- The consistency test now recomputes the snapshot SHA-256 values and checks every quoted
  locator against the stored page text.
- **Unchanged:** production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B. The rule set stays DRAFT with EXPERT_VALIDATION_PENDING.

## Campaign C AI scientific adjudication (evidence-gated) — starting 2b6da92 (2026-09-29)

Recorded the authorised AI external Teagasc review as `SRC-AI-REVIEW-2026-09-29`
(EXTERNAL_RETRIEVAL_PERFORMED_BY_AUTHORISED_AI_REVIEW; no fingerprint and no local copy
claimed). The record is
[campaign-c/AI_ADJUDICATION_2026-09-29.md](campaign-c/AI_ADJUDICATION_2026-09-29.md).
Claims `CLM-AIR-*` are in SOURCES_AND_CLAIMS §5.

- **Status:** AI_SCIENTIFIC_ADJUDICATION with EXPERT_VALIDATION_PENDING. CC-B1 is
  AI_ADJUDICATED_EXPERT_VALIDATION_PENDING. Nothing is expert-approved, and the rule set
  stays DRAFT.
- **Production evidence gate:** only REPOSITORY_VERIFIED rules may change production. The
  following are AI_REVIEW_ONLY and deferred for evidence ingestion:
  - the organic share caps;
  - the 90 kg K spring-constraint reconciliation;
  - the February spring start;
  - N yield scaling;
  - `AI_PROVISIONAL_RATE_SELECTOR_V1`.
- **Already implemented, now frozen by regression tests:**
  - 6% LESS P = 0.5 and 7% LESS P = 0.6;
  - the 50%/90% availability factors (crop requirement untouched);
  - slurry K credit not truncated at 90;
  - no DM interpolation (6.3% blocks);
  - timing labels unchanged;
  - P/K yield scaling.
- **Deferred:**
  - GAP-04 paired P/K architecture (CC-B4A retained);
  - GAP-05 Level B and GAP-07/08 inputs;
  - GAP-08 crop-cycle persistence (no migration).
- **Unchanged:** no production code, engine `nutrient_engine_v1.2.0`, reference-case JSON,
  Campaign B and statutory outputs. No migration, push or deploy.

## CC-B1 Campaign C science adjudication — starting 0a92745 (2026-09-29)

Evidence-review task using repository evidence only. No production code, reference-case
JSON, migration, UI or Campaign B change. The record is
[campaign-c/ADJUDICATION_CC-B1.md](campaign-c/ADJUDICATION_CC-B1.md).

- CONF-01 is RESOLVED_WITH_SCOPE (6% spring LESS P 0.5 kg/m³, Green Book Tables
  9-1/9-4/9-8 against a single non-retained quotation). CONF-04 is RESOLVED_WITH_SCOPE
  (Feb–Apr; January OUT_OF_SCOPE). Both are pending §4 re-verification and reviewer
  ratification.
- CONF-02 is UNRESOLVED_CONFLICT (internal to the Green Book). CONF-03, GAP-01 and
  GAP-02..08 are INSUFFICIENT_EVIDENCE.
- Corrected CONFLICTS.md's claim that CONF-01 was "confirmed from a primary read".
  Added claims `CLM-GB-9-11-TXT` and `CLM-GB-14-INTRO`.
- Campaign C remains DRAFT. CC-B1 remains open, narrowed to the evidence requests in the
  record.

## CC-B4A close-out — final audited commit b6f0aea (2026-09-29)

CC-B4 is **RESOLVED** through the narrow CC-B4A correction. Campaign C remains DRAFT and not
approved; CC-B1 and CC-B3 remain open; no CONF or GAP item is resolved.

- Implementation `1b3d126` (engine `nutrient_engine_v1.1.0` → `nutrient_engine_v1.2.0`);
  primary audit `audit-20260929T113853Z-31803`: 0 findings. Final audit F001 (HIGH, frozen
  contract flag not flipped) fixed in `b6f0aea`. Final task audit
  `audit-20260929T135623Z-55385` over `b5f90c3..b6f0aea`: 0 Critical, 0 High, 0 Medium,
  0 Low.
- `BUILD_STATE.json.contracts_frozen` restored to `true` in this bookkeeping commit
  (DOMAIN_CONTRACTS.md close sequence, commit B); this commit is audited afterwards like any
  other.
- Independent per-nutrient P/K evidence was intentionally not implemented; it remains a
  possible separate architecture task.
- Retrospective process note (recorded, not silently corrected): CC-B2 (`c5d64c4`..`65bdedb`)
  also changed `calculateNutrientPlan`'s fail-closed behaviour in frozen `nutrients.ts`
  (F001: missing index → blocked LESS assessment; F003: N kept) without flipping
  `contracts_frozen` to `false` during its audit cycle, and none of its audits flagged it.
  CC-B2 is closed and clean, so no live risk remains from that gap.

## CC-B4A splashplate missing-index guard — starting b5f90c3 (2026-09-29)

Narrow production correction following the blocked CC-B4 investigation; not Campaign C
implementation and not a per-nutrient P/K redesign. Status: fixed in code, awaiting
independent audit.

- Root cause: `calculateNutrientPlan` fills a missing P/K Soil Index with an Index-1
  placeholder; the CC-B2 guard blocked only LESS (`ruleId !== "SLURRY_TABLE_9_8"`), so the
  captured and assumed-method splashplate branches returned an OK assessment with
  placeholder-derived P/K and `soilIndexAdjustmentApplied: { p: true, k: true }`, which
  `slurry-direct-economic-assessment` treated as supported science.
- Correction: the guard now applies to every OK slurry assessment, so a missing P or K index
  gives `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` (no value, so no
  adjustment metadata). N is kept through the existing F003 path; P and K offsets stay
  withheld together as before (paired fertility evidence). Requirement, products, NAP,
  statutory value and report exports were already withheld and are unchanged. Complete-data
  splashplate and all LESS behaviour unchanged.
- Implementation correction (LIFECYCLE §8): `nutrient_engine_v1.1.0` (affected: OK
  splashplate assessment on a placeholder index) → `nutrient_engine_v1.2.0`; stored v1.1.0
  records are not rewritten and are identifiable by `calculationVersion`. No new science.
- Reachability: `CONFIRMED_PRODUCTION_PATH` (`calculateNutrientPlan` → Nutrients, Scientific
  Evidence Report, What Matters economics). Live user exposure: UNKNOWN.
- Tests: CC-B4A block in `nutrients.test.ts` (3 missing cases × captured/assumed method,
  8 complete-data index pairs, version) and a What Matters economics case in
  `slurry-direct-economic-assessment.test.ts`; 7 of them fail against the pre-fix guard.
- Independent per-nutrient P/K evidence intentionally not implemented. Campaign C remains
  DRAFT; CC-B1 and CC-B3 remain open.
- Contract change (audit F001, HIGH): this changes `calculateNutrientPlan`'s fail-closed
  behaviour in frozen `nutrients.ts`, so `BUILD_STATE.json.contracts_frozen` is set to `false`
  for the CC-B4A audit cycle; no new worktree tasks are delegated while it is `false`, and
  in-flight worktree agents must rebase before continuing. It returns to `true` only in a
  separate bookkeeping commit after a clean final audit (DOMAIN_CONTRACTS.md close sequence).

## CC-B2 close-out — final audited commit 65bdedb (2026-09-29)

CC-B2 / RISK-01 is **RESOLVED** as a narrow production correction. Campaign C remains
DRAFT and not approved; this close-out records no scientific approval.

- Production correction: spring and summer LESS credit apply the existing Index 1/2
  factors (P × 0.50 by P Index, K × 0.90 by K Index); N unchanged. Engine version
  `nutrient_engine_v1.0.0` → `nutrient_engine_v1.1.0` (implementation correction).
- Audit remediation: F001 (missing index → OK placeholder-adjusted LESS assessment) and
  F002 (engine version) in `cac1d01`; F003 (missing P/K index erased the LESS N credit;
  N now kept, P/K uncredited) in `48ecdd6`; F004 (Organic nutrients card showed the
  unsupported-DM explanation for a missing soil index; now names the missing P and/or K
  index) in `65bdedb`, reviewed at desktop and 390×844.
- Final task audit `audit-20260929T101524Z-8042` over `d38561c..65bdedb`: 0 Critical,
  0 High, 0 Medium, 0 Low. Full `npm test` (252 files, 4006 tests), typecheck and build
  passed on `65bdedb`.
- Follow-up CC-B4 opened for the pre-existing splashplate missing-index behaviour (not
  introduced by CC-B2). CC-B1 and CC-B3 remain open; CONF-01..04 and GAP-01..08 untouched.

## CC-B2 LESS low-index P/K correction — starting d38561c (2026-09-29)

Narrow production correction of RISK-01 / CC-B2; not Campaign C implementation.

- `resolveAvailableSlurryNutrients` spring and summer LESS branches now apply the
  existing Index 1/2 factors (P × 0.50 by P Index, K × 0.90 by K Index; N unchanged)
  through a shared `applyLowSoilIndexAvailability` helper that `slurryAvailableKgHa`
  (Table 9-8) also uses, unchanged in behaviour. `soilIndexAdjustmentApplied` now
  reports the real adjustment. Evidence: `CLM-OM-T2-NOTE`, `CLM-GB-9-8-FN3` (existing
  repository records only; no new retrieval or approval).
- LESS applicability unchanged (exact DM rows, SPRING/SUMMER only). Unknown soil index
  keeps its existing fail-closed plan semantics (placeholder index never reaches
  requirement/products/NAP/statutory outputs). Statutory manure value and NAP untouched.
  Per-nutrient index reading matches the existing Table 9-8 path; GAP-04 stays open.
- Reachability: `CONFIRMED_PRODUCTION_PATH` — `calculateNutrientPlan` →
  `NutrientsPageClient` (Nutrients), `orchestration/scientific-evidence-report`,
  `app/actions/what-matters-pilot` (What Matters economics), plus reports/finance/
  alerts/fertiliser-plan callers. Live user exposure: UNKNOWN.
- Tests: new CC-B2 regression block and plan-level cases in `nutrients.test.ts`.
- Audit `audit-20260929T081756Z-17754` remediation: F001 — `calculateNutrientPlan` now
  returns `BLOCKED_INSUFFICIENT_EVIDENCE` / `MISSING_SOIL_FERTILITY_INDEX` for a LESS
  `availableNutrientAssessment` when a P or K index is missing (the Index-1 placeholder
  no longer yields an OK adjusted LESS credit; pre-existing Table 9-8 behaviour
  unchanged). F002 — implementation correction (LIFECYCLE §8): `NUTRIENT_ENGINE_VERSION`
  `nutrient_engine_v1.0.0` (affected; omitted the LESS Index 1/2 reduction) →
  `nutrient_engine_v1.1.0` (corrected); stored v1.0.0 records are not rewritten and are
  identifiable by that `calculationVersion`.
- Campaign C remains DRAFT; CC-B1 and CC-B3 remain open.

## Campaign C slurry science freeze — starting 29f787a (2026-09-28)

Research and specification only. No product, domain or schema change. Campaign B
behaviour is unchanged. Package: `campaign-c/`.

Campaign C used the repository's existing structured Teagasc evidence pack,
source-register metadata, recorded quotations and previously reviewed scientific
material. WebFetch and WebSearch were disabled for the run, so no fresh external-source
retrieval or independently verifiable source fingerprinting is claimed. External source
documents must be re-verified through an authorised evidence-ingestion workflow before
the rule set can become APPROVED.

- Froze DRAFT rule set `slurry-agronomy-ie-2026-v1`. Scope: cattle slurry, first-cut
  silage, spring (Feb–Apr) LESS, mineral soils, lab P/K, lab DM of exactly
  2/4/6/7%.
- Froze reference cases CC-001..018 with variants, plus the lifecycle contract.
- **Stopped for human review:** CONF-01, CONF-02, CONF-03 and GAP-01 (STOP 1, 2, 8).
- Found RISK-01/CC-B2: the existing LESS nutrient-credit path appears to omit the
  recorded Index 1/2 P/K availability reduction. Recorded for triage; not fixed.
- Added `src/domain/campaign-c-reference-cases.test.ts` (131 checks), covering the
  Campaign C draft reference-case data and relevant existing scientific functions.
- Production implementation remains **not authorised**.

## Agent harness token efficiency — starting b24c266 (2026-09-28)

Tooling/governance only. Campaign B remains frozen; Campaign C not started.
See `.agent/HARNESS_DIAGNOSIS.md` for the firsthand flow trace and measured context sizes.
Task manifest `.agent/TASK.json` pins the base. Replaced the implicit legacy baseline audit
and stale autopilot with the task workflow; retained independent primary/remediation/final
reviews, dependency expansion, all four quality checks and Critical/High blocking.
CLI JSON usage is recorded when exposed, otherwise UNKNOWN. Archived historical state/logs
byte-for-byte. Blocker index retains unresolved legacy constraints without declaring them closed.
Validation and audit outcome will be recorded at the final checkpoint.

Primary independent audit: one High (F001, conflicting mode flags could narrow final scope).
Fixed by rejecting conflicting modes, selecting the immutable task base for primary/final,
and validating final receipt base/head/clean state. Narrow independent before/after review
resolved F001 with 0 Critical/High; it did not repeat the primary audit.

Verification: 50 orchestration cases and 8 focused harness cases passed. Sandbox-independent
watchdog cleanup is covered directly. The expanded orchestration wrapper retains every case
with a 1180/1200-second allowance. An unchanged product test timed out under concurrent load
and passed all 15 tests in isolation; the final gate uses one test worker, with assertions and
product-test time limits unchanged. Final complete gate passed: 251 test files / 3846 tests; typecheck, lint and build PASS. Logs: `.agent/history/quality-20260928T195447Z-37358/`. Final independent audit is recorded after this commit in the task runtime receipt, which must match HEAD; no task may close without it.

# Task: CC-B4A — align splashplate missing-index handling with paired P/K evidence model

Starting HEAD: b5f90c3b12962edac5c863714221c06c1db50b5f

## Background

The original CC-B4 investigation established a real production defect but also identified an
architectural boundary.

Current behaviour:

- `calculateNutrientPlan` uses an internal Index 1 stand-in when soil P and/or K index is missing.
- Supported splashplate nutrient assessment currently consumes those stand-ins.
- The splashplate assessment can therefore return `OK`.
- It can report placeholder-derived P/K values.
- It can report `soilIndexAdjustmentApplied: { p: true, k: true }`.
- What Matters economics can treat that `OK` assessment as supported science.

However, existing plan-level behaviour already treats soil P and K fertility evidence as a pair:

- when either P or K index is missing, plan-level P/K offsets are withheld;
- P/K requirement and downstream fertiliser planning are withheld;
- existing LESS behaviour from CC-B2 uses the same paired P/K evidence boundary;
- nitrogen remains independently available.

The original CC-B4 task required known P and known K to remain independently usable when the
other was missing. That requirement cannot be implemented without splitting the shared
plan-wide P/K fertility model and changing behaviour also used by the closed CC-B2 path. That
broader redesign was correctly blocked.

THIS TASK DOES NOT AUTHORISE THAT REDESIGN.

## Goal

Apply the smallest safe production correction: extend the existing CC-B2
missing-soil-fertility-index guard to the supported splashplate nutrient-credit path.

When either soil P index or soil K index is missing:

- the splashplate available-nutrient assessment must NOT return `OK`;
- it must NOT expose placeholder-derived P/K as supported scientific evidence;
- it must NOT claim that P/K soil-index adjustments were supported by real soil evidence;
- valid slurry nitrogen credit must remain available;
- P and K must be withheld together, matching the existing paired P/K plan semantics;
- downstream consumers such as What Matters must not treat the splashplate P/K assessment as
  supported science.

This task intentionally preserves the existing paired P/K evidence architecture. It does NOT
implement independent per-nutrient P/K evidence.

## Campaign C status

Campaign C remains DRAFT and scientifically unapproved. Do not resolve CONF-01, CONF-02,
CONF-03, CONF-04 or GAP-01 through GAP-08. Do not interpret this implementation correction as
scientific approval.

## Required trace before editing

1. Locate the missing-index placeholder assignment in `calculateNutrientPlan`.
2. Locate the existing CC-B2 missing-index guard.
3. Confirm exactly why that guard currently excludes splashplate.
4. Locate all supported splashplate branches in `resolveAvailableSlurryNutrients`.
5. Trace nitrogen credit; P credit; K credit; availableNutrientAssessment status;
   `soilIndexAdjustmentApplied`; downstream nutrient offsets; Scientific Evidence Report; What
   Matters economics.
6. Confirm that existing plan-level P/K requirement and product logic already withholds P/K
   when either fertility index is missing.
7. Confirm that valid N credit is already capable of surviving the blocked assessment, as
   established during CC-B2/F003.
8. Confirm the current nutrient engine version.
9. Read the existing engine lifecycle/versioning contract and determine the required next
   engine version.
10. Identify all existing LESS missing-index tests and splashplate tests relevant to this
    correction.

## Frozen behaviour

For a supported splashplate application:

CASE 1 — P known, K known: preserve all existing behaviour. The correction must not change
valid complete-data splashplate outputs.

CASE 2 — P missing, K known: aggregate available nutrient assessment is not `OK`; reason
reflects missing soil fertility evidence; valid N credit remains available; P credit is not
supported; K credit is also withheld under the existing paired P/K plan rule; placeholder Index
1 values must not be represented as supported P/K science; metadata must not claim real P/K
soil-index adjustments.

CASE 3 — P known, K missing: aggregate assessment is not `OK`; valid N credit remains
available; both P and K credit are withheld under the existing paired rule; placeholder-derived
P/K must not be represented as supported science; metadata must be truthful.

CASE 4 — P missing, K missing: aggregate assessment is not `OK`; valid N credit remains
available; P and K are withheld; placeholder-derived P/K are not supported; no false
adjustment metadata.

## Expected status

Use the existing missing-soil-fertility evidence mechanism where appropriate. Expected existing
reason: `MISSING_SOIL_FERTILITY_INDEX`. Expected aggregate evidence state where consistent with
the current architecture: `BLOCKED_INSUFFICIENT_EVIDENCE`. Do not invent a new status unless
absolutely necessary.

## Nitrogen

N must remain unchanged. Missing P/K fertility evidence must not erase valid nitrogen credit
(CC-B2 F003 principle; preserve it). Do not change splashplate N scientific values, N timing,
NFRV assumptions or method applicability.

## Phosphorus and potassium

Under this task, P and K remain paired when soil fertility evidence is incomplete. This is
intentional. Do NOT attempt to make P independently available when K is missing, or K when P
is missing. That is a separate potential architecture task. The purpose of CC-B4A is only to
stop the splashplate assessment from treating placeholder-derived P/K as supported evidence.

## Placeholder semantics

The existing internal Index 1 fallback may continue to exist where required by legacy
arithmetic or plan plumbing. However it must not be mistaken for real farmer evidence; must not
result in an `OK` splashplate scientific assessment; must not produce truthful-looking P/K
adjustment metadata; must not cause downstream economics to treat those P/K values as
scientifically supported. Do not redesign all placeholder usage in this task.

## Metadata

When P and/or K fertility evidence is missing, `soilIndexAdjustmentApplied` or equivalent
metadata must not claim that the placeholder caused a scientifically evidenced adjustment. Use
the existing truthful representation already established by the LESS missing-index path where
possible. Do not fabricate provenance.

## What Matters / economics

After the correction the unsupported splashplate P/K assessment must not appear as supported
science; What Matters must not treat it as an `OK` P/K opportunity; valid N evidence must not
be zeroed merely because P/K evidence is incomplete. Do not redesign What Matters ranking or
economics. Only verify that the corrected evidence status is respected.

## Reports and plan outputs

Confirm existing plan outputs continue to behave as before: missing either P or K index
withholds P/K offsets; P/K requirement remains withheld; fertiliser product planning remains
withheld where already designed; N remains available where scientifically supported;
NAP/regulatory behaviour remains unchanged; report exports do not newly expose unsupported P/K.
Do not broaden this into report redesign.

## Engine versioning

This correction changes production nutrient-engine semantics for affected splashplate cases.
Read the lifecycle contract. If the active version is `nutrient_engine_v1.1.0` and the
repository's existing versioning rules require another version for this semantic correction,
increment appropriately (likely `nutrient_engine_v1.2.0`, but check the contract). Document the
affected previous version; corrected version; correction reason; that historical stored results
are not rewritten; that this is an implementation correction, not new science. Do not add a
migration.

## Required regression tests

1. Supported splashplate with P missing / K known.
2. Supported splashplate with P known / K missing.
3. Supported splashplate with both missing.
4. Supported splashplate with both known.
5. Missing P does not return an `OK` splashplate available nutrient assessment.
6. Missing K does not return an `OK` splashplate available nutrient assessment.
7. Both missing do not return an `OK` assessment.
8. Valid N credit survives missing P.
9. Valid N credit survives missing K.
10. Valid N credit survives both missing.
11. P/K credits are withheld together when either index is missing.
12. Missing fertility indices do not produce truthful-looking low-index P/K adjustment metadata.
13. Complete-data splashplate Index 1 behaviour remains unchanged.
14. Complete-data splashplate Index 2 behaviour remains unchanged.
15. Complete-data splashplate Index 3 behaviour remains unchanged.
16. Complete-data splashplate Index 4 behaviour remains unchanged.
17. Existing mixed known-index splashplate behaviour remains unchanged.
18. LESS complete-data behaviour remains unchanged.
19. LESS missing-index behaviour from CC-B2 remains unchanged.
20. CC-B2 F003 N-preservation behaviour remains unchanged.
21. Unsupported splashplate method/timing behaviour remains unchanged.
22. What Matters economics does not treat the corrected missing-index splashplate result as an
    `OK` supported P/K assessment.
23. Existing P/K plan withholding with incomplete fertility evidence remains unchanged.
24. Statutory/NAP behaviour remains unchanged.
25. Engine output reports the corrected version if a version bump is required.

At least one regression test must encode behaviour that would fail against the pre-CC-B4A
implementation.

## Scope boundary

DO NOT implement independent P/K partial evidence. Specifically, do not split the shared P/K
fertility check; the tracked `{ n, p, k }` requirement model; plan-wide P/K requirement
semantics; product recommendation P/K evidence semantics; the closed LESS CC-B2 behaviour.

## Do not change

Campaign C recommendation-rate science; CONF-01; CONF-02; CONF-03; CONF-04; GAP-01 through
GAP-08; slurry DM interpolation; slurry DM snapping; new DM classes; hydrometer calibration;
first-cut yield modelling; prior-input windows; whole-farm allocation; Campaign B regulatory
behaviour; statutory NAP calculations; regulatory neat-slurry quantities; What Matters ranking
policy; unrelated fertiliser logic; database schema; database migrations; unrelated UI;
production deployment; main branch; optimised agent harness. No fresh web research.

## STOP conditions

Return `BUILD_RESULT: BLOCKED <reason>` if:

1. extending the existing missing-index guard to splashplate cannot be done without splitting
   the plan-wide paired P/K model;
2. valid N cannot be preserved without substantial architecture changes;
3. LESS/CC-B2 behaviour would need to change materially;
4. Campaign B regulatory behaviour would need to change;
5. statutory calculations would need to change;
6. a database migration is required;
7. the engine lifecycle cannot safely represent the change;
8. splashplate nutrient values themselves prove scientifically disputed;
9. fixing the issue requires resolving CONF-01–04;
10. fixing the issue requires resolving GAP-01–08;
11. supported splashplate applicability must broaden;
12. What Matters requires a broad redesign rather than merely respecting the corrected evidence
    status;
13. the diagnosis proves incorrect;
14. scope expands beyond preventing placeholder-derived splashplate P/K from being treated as
    supported science.

## Documentation

Expected: `docs/farm-return-next/BLOCKERS.md`, `docs/farm-return-next/IMPLEMENTATION_LOG.md`,
`docs/farm-return-next/BUILD_STATE.json`. At build stage: record CC-B4A as fixed in code /
awaiting audit; preserve the historical blocked CC-B4 investigation; explain that the original
independent-P/K requirement was intentionally not implemented; record that this correction
aligns splashplate with the existing paired P/K evidence architecture; record engine version if
changed; leave CC-B1 open; leave CC-B3 open; leave Campaign C DRAFT. Do not prematurely mark
CC-B4 fully resolved before independent audit. Update Campaign C wording only if a factual
implementation-status statement becomes stale.

## Audit flow

After a successful build: `./scripts/agent-audit --primary`; for Critical/High findings
`./scripts/agent-fix` (and `--another-round` if needed); verify with
`./scripts/agent-audit --remediation <finding-id>`; finally `./scripts/agent-audit --final`.
Do not run a baseline-wide historical audit. Do not accept a new farmer-facing factual
regression merely because it is classified Medium.

## Completion criteria

1. the original false-OK splashplate missing-index defect is demonstrated;
2. supported splashplate with missing P and/or K no longer returns a falsely supported P/K
   assessment;
3. placeholder Index 1 does not masquerade as real fertility evidence;
4. valid N survives missing P/K;
5. P/K remain withheld together under the current paired architecture;
6. truthful metadata is returned;
7. What Matters no longer treats placeholder-derived splashplate P/K as supported science;
8. complete-data splashplate behaviour is unchanged;
9. LESS/CC-B2 behaviour is unchanged;
10. statutory behaviour is unchanged;
11. regulatory behaviour is unchanged;
12. engine versioning complies with the lifecycle contract;
13. historical records are not rewritten;
14. targeted regression tests pass;
15. broad relevant tests pass;
16. typecheck passes;
17. build passes;
18. full npm test passes if runnable;
19. documentation accurately records the correction;
20. Campaign C remains DRAFT;
21. CC-B1 remains open;
22. CC-B3 remains open;
23. independent P/K evidence architecture is explicitly not implemented;
24. no CONF or GAP is resolved by implication;
25. nothing is pushed.

Verify command: `npm run typecheck && npm run build`

# Task: Campaign B closure audit — prove production completeness and identify final gaps

Starting HEAD: 4f61f07

## Goal

Perform a comprehensive closure audit of Campaign B before beginning Campaign C.

Do not assume Campaign B is complete because its individual sub-tasks passed.

Trace the original Campaign B goals and the actual production code to determine:

1. what is fully implemented and live;
2. what is implemented but not consumed downstream;
3. what is implemented but blocked because migrations are unapplied;
4. what still requires code;
5. what belongs properly to Campaign C rather than Campaign B.

If Campaign B is genuinely complete except for deployment/migration state, document that
and close it.

If one or more genuine Campaign B implementation gaps remain, make only the smallest
safe changes required to close them, provided they do not cross a STOP boundary.

## Campaign B scope to verify

Campaign B originally covers:

- regulatory context;
- physical slurry volume vs regulatory neat-slurry quantity separation;
- spreadable area vs gross field area separation;
- canonical immutable evidence persistence;
- temporal integrity;
- deterministic evidence selection;
- home-produced grazing manure vs imported organic manure interpretation;
- peat / >20% organic-matter phosphorus rules;
- slurry-origin evidence;
- farmer-facing capture of blocking evidence;
- live loading into production regulatory calculations;
- provenance and auditability;
- fail-closed unknown/conflicting states;
- no physical -> neat substitution;
- no gross -> spreadable substitution.

Campaign B does NOT include:

- Campaign C agronomic recommendation science;
- slurry application-rate recommendations;
- whole-farm optimisation;
- What Matters ranking redesign;
- economic optimisation.

Do not pull Campaign C work backwards into Campaign B.

## A. Build a Campaign B requirement matrix

Trace the repository and create a clear internal matrix for every Campaign B requirement.

For each requirement record:

- requirement;
- canonical implementation;
- persistence source if any;
- production caller(s);
- farmer-facing capture if required;
- evidence/provenance state;
- tests;
- current status:
  - COMPLETE
  - COMPLETE_BUT_MIGRATION_UNAPPLIED
  - PARTIAL
  - BLOCKED
  - OUT_OF_SCOPE_CAMPAIGN_C

Do not mark something COMPLETE merely because a domain helper exists.

It must be reachable through the real production call chain where Campaign B requires
that fact.

## B. Mandatory production-call trace

Trace at minimum:

- `/housing`;
- `/fields`;
- `/nutrients`;
- Scientific Evidence Report;
- slurry planning;
- fertiliser-plan overview;
- Today / What Matters;
- canonical farm-data loaders;
- `slurry-regulatory-context`;
- `calculateNutrientPlan`;
- NAP compliance;
- regulatory evidence repositories;
- slurry-origin evidence;
- neat-slurry evidence;
- spreadable-area evidence.

For each caller identify which Campaign B facts it consumes and whether it receives
canonical status/provenance or only a reduced value.

## C. Spreadable-area closure decision

We already know spreadable-area evidence can be captured and persisted but historically
had no downstream consumer.

Determine whether that is:

1. a genuine unfinished Campaign B requirement; or
2. correctly deferred until Campaign C rate/total-volume recommendation logic.

Do not create a fake downstream use merely to mark Campaign B complete.

If spreadable area is only needed when Campaign C computes total recommended slurry
volume, classify it explicitly as OUT_OF_SCOPE_CAMPAIGN_C and document the boundary.

## D. Today / What Matters / fertiliser-plan boundary

Trace whether Campaign B evidence needs to be consumed directly by:

- Today / What Matters;
- slurry-plan prompts;
- fertiliser-plan overview.

Do not widen contracts just because these screens exist.

Determine whether:

- they already consume Campaign B through a canonical downstream calculation;
- they still have a real Campaign B correctness gap;
- or their use of these facts belongs to later recommendation/optimisation work.

If later work owns the requirement, document it rather than implementing it here.

## E. Blocker-reason propagation

Trace the current reduction from rich evidence states into `NutrientPlan` and other
public contracts.

Determine whether Campaign B correctness requires exact blocker reasons to propagate
downstream, or whether a fail-closed UNKNOWN/BLOCKED result is sufficient at this layer.

Do not widen a frozen contract simply to expose internal detail.

If precise blocker propagation is required for farmer-facing correctness, implement
the smallest safe change.

Otherwise document the boundary for the later UI/recommendation layer.

## F. Migration state

Trace all Campaign B migrations, including the regulatory evidence migration.

Do NOT apply migrations to Farm Return V1 Dev in this task.

Record for each relevant migration:

- filename;
- purpose;
- whether production code depends on it;
- behaviour when it is absent;
- whether the UI fails honestly;
- whether schema deployment is now the only remaining operational step.

Do not treat unapplied Dev migrations as incomplete application code if the application
already handles their absence honestly.

## G. Historical/provenance integrity

Confirm that:

- old neat-slurry evidence remains immutable;
- old spreadable-area evidence remains immutable;
- slurry-origin evidence remains historically attributable;
- completed/cancelled allocation history is not rewritten;
- conflicting evidence fails closed;
- stale refresh states cannot be presented as current;
- actor/capture/effective-date provenance remains available where required;
- small positive values remain distinct from zero.

Use existing tests where sufficient; add tests only for genuine uncovered requirements.

## H. Regulatory integrity regression

Confirm Campaign B still preserves:

- Article 17(8) home-produced grazing-manure treatment;
- imported organic manure treatment;
- chemical P accounting;
- concentrate-feed P handling;
- P Index 4 restrictions;
- >20% organic-matter rules;
- peat mapping rule;
- manure-P availability rules;
- livestock-manure N rules;
- unknown evidence fail-closed behaviour.

Do not reinterpret current law in this task unless an existing implementation is shown
to conflict with the already-established authoritative basis.

## I. Completion decision

At the end, make one of two determinations:

### Option 1 — Campaign B complete

Use this only if every Campaign B implementation requirement is either:

- genuinely complete; or
- explicitly and defensibly classified as Campaign C / later deployment work.

Update documentation to mark Campaign B COMPLETE IN CODE, while separately recording
unapplied migration/deployment state if applicable.

### Option 2 — Campaign B still partial

If a real Campaign B implementation gap remains, implement only the smallest safe fix
needed to close it.

If closing it requires:

- Campaign C science;
- optimisation;
- a new regulatory interpretation;
- applying migrations to Dev;
- materially widening a frozen contract;
- inventing evidence;

STOP and document the boundary instead.

## J. Required tests

Do not add large numbers of redundant tests.

Add tests only where the closure audit reveals an untested correctness requirement.

At minimum run the relevant existing Campaign B suites covering:

- regulatory context;
- regulatory evidence;
- neat-slurry temporal integrity;
- spreadable-area evidence;
- slurry-origin evidence;
- NAP/nutrients;
- Scientific Evidence Report;
- evidence UX.

Then run full:

`npm test`

Verify command: `npm run typecheck && npm run build`

## K. Documentation

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`
- `docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`

Add a concise Campaign B closure section containing:

- requirement matrix;
- production call-chain coverage;
- remaining migration/deployment state;
- items explicitly deferred to Campaign C;
- final Campaign B status.

Do not call Campaign B complete if a real application-code requirement remains open.

## L. Scope exclusions

Do NOT:

- implement Campaign C agronomic recommendation rules;
- recommend slurry rates;
- optimise whole-farm slurry allocation;
- change What Matters ranking;
- apply migrations to Farm Return V1 Dev;
- push or deploy;
- invent evidence;
- create artificial downstream consumers merely to make the matrix green.

## Verification

Run targeted Campaign B regression suites.

Then:

`npm test`

Verify command: `npm run typecheck && npm run build`

Only report DONE if the Campaign B completion decision is supported by the actual
production call chains and all verification passes.


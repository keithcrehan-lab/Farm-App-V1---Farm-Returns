# Task: Cattle C8P1 - Plan Compatibility Amendment

Task ID: cattle-c8p1-plan-compatibility-amendment-20261017
Starting HEAD: b66a31809c01f61db23f42f140aee124e6dd31ea
Verify command: `npx vitest run src/domain/plan src/domain/subject.test.ts --maxWorkers=1 && npm run typecheck && npm run lint`

# Cattle C8P1 — Plan Compatibility Amendment (C8P)

Predecessor: C8 (frozen by the campaign receipt `receipts/C8.json`). Successor: C9 (Plan interface), which is held until this phase freezes.
New file: `src/domain/plan/cattle-compatibility.test.ts`

## Phase contract

- **Outcome:** the smallest truthful extension of the Plan kernel contract that C9 needs to represent cattle work without coercing cattle concepts into Plan concepts that mean something else. Human architecture decision 2026-10-17 (C9 pre-build and blocker reviews B2–B6), registered as its own campaign phase so it is built, audited, frozen and closed before C9 starts.
- **Owner:** the Plan kernel contract additions listed under Scope, and nothing else. Cattle C0–C8 are frozen and unchanged. C9 (the cattle → Plan adapter) is NOT part of this phase.
- **Contract-change protocol:** this is a change to the Plan contract (`docs/farm-return-next/DOMAIN_CONTRACTS.md`, "Contract-change protocol"). Every change is additive: new union members, new table entries, one new tier and one new authority variant; no existing member, value, signature, ordering between existing tiers or behaviour changes. `BUILD_STATE.json.contracts_frozen` is set to `false` by the registration commit and set back to `true` by a docs-only commit after this phase's closure. The phase closure records the `IMPLEMENTATION_LOG.md` entry. Do not edit `BUILD_STATE.json` or `IMPLEMENTATION_LOG.md` yourself.
- **Dependency rule:** Plan must not import any `src/domain/cattle/` module. A Plan type may mirror a cattle shape structurally, using only shared modules Plan or cattle already use (for example `assessment-integrity.ts`'s `AssessmentFingerprint`).
- **Forbidden:** any C9 adapter code; any cattle file; changing an existing Plan member's meaning; renaming or removing anything; general Plan redesign; persistence, UI, migrations, network, AI, new npm dependencies, clock reads.

## Objective

Make the Plan kernel able to state, truthfully:
1. that a job targets a cattle animal or a cattle management group identified by the cattle C1 canonical identity, which is NOT the V1 `IndividualAnimal` / `LivestockGroup` identity;
2. that a Farm Return job originates from an obligation, from a system recommendation, or from several independent Farm Return origins;
3. that a job is ordinary management work with no evidenced hard obligation, material-loss, net-return or information objective;
4. that a hard deadline's authority is a canonical versioned source (source id + version + content fingerprint) rather than a V1 registered source, a farmer commitment or a derived record.

## Scope

1. **Subjects** (`src/domain/subject.ts`): add `SubjectType` members `CATTLE_ANIMAL` and `CATTLE_GROUP`, with `SUBJECT_TYPE_NOTES` entries stating that `CATTLE_ANIMAL` ids are cattle C1 `FarmReturnAnimalId`s and `CATTLE_GROUP` ids are cattle C1 `MANAGEMENT_GROUP` values, and that neither is the V1 `IndividualAnimal.id` / `LivestockGroup.id` (`ANIMAL` / `ANIMAL_GROUP`), nor interchangeable with them. A `SubjectRef` of one type never equals one of another type with the same id (`isSameSubject`, `subjectKey` already compare type).
2. **Creation source** (`src/domain/plan/job.ts`): add `FARM_RETURN` reasons `OBLIGATION`, `RECOMMENDATION` and `COMPOSITE`, as an additional union member so the existing member is not edited. Document: `OBLIGATION` — work derived from an obligation owned by a canonical domain; `RECOMMENDATION` — work proposed by a Farm Return system recommendation that no adviser has approved (never `ADVISER_APPROVED`); `COMPOSITE` — work supported by more than one distinct Farm Return origin, whose individual origins are retained by the producer (the creation source does not carry them; `supportingReasons` and the producer's own canonical object do). Existing `ROUTINE`, `SEASONAL`, `DATA_GAP` and `PROGRAMME` meanings are unchanged.
3. **Priority** (`src/domain/plan/priority.ts`): add tier `ROUTINE_MANAGEMENT` — normal farm-management work that should be planned but for which the authoritative evidence establishes none of a hard legal/compliance obligation, avoidance of material loss, expected net return or an information-gathering objective. Position: LAST (after `INFORMATION_VALUE`), so it never outranks a tier with an evidenced objective and the relative order of the four existing tiers is unchanged. Document the position and why.
4. **Hard-deadline authority** (`src/domain/plan/timing.ts`): add a `HardDeadlineAuthority` variant `{ kind: "VERSIONED_SOURCE"; sourceId: string; version: string; contentFingerprint: AssessmentFingerprint }` — a Plan-owned structural reference with the same fields as the cattle C0 `SourceVersionRef`, binding the canonical source identity, version and content fingerprint the deadline originates from. `hardDeadline()` accepts it unchanged. It must not be used for a derived evaluation record.
5. **Tests** in the new `src/domain/plan/cattle-compatibility.test.ts` (and, only where a test must enumerate every subject type, `src/domain/subject.test.ts`). The one existing expectation that must change is the exhaustive tier list in `src/domain/plan/farmer-order.test.ts` ("orders the four tiers with hard obligations first"): it lists the four original tiers in their existing order followed by `ROUTINE_MANAGEMENT` as the fifth and last tier (human decision 2026-10-17); nothing else in that file changes and no other farmer-order behaviour is weakened.
6. `docs/farm-return-next/DOMAIN_CONTRACTS.md`: append one section "Plan compatibility amendment (C8P1, cattle campaign)" at the end of the file listing exactly what was added and its semantics. Never edit an existing line.

## Out of scope

- The C9 adapter, any mapping table from cattle states to Plan values, and any `src/domain/cattle/` change.
- Any change to existing Plan behaviour, readiness, completion, scope resolution, audit events, routes or tests beyond what the additions require.
- `REGISTERED_SOURCE`, `ADVISER_APPROVED`, `ANIMAL`, `ANIMAL_GROUP` and the existing tiers keep their meaning.

## Required tests

Write these first and show they fail before the production change.
1. `CATTLE_ANIMAL` / `CATTLE_GROUP` refs with the same id as an `ANIMAL` / `ANIMAL_GROUP` ref are different subjects (`isSameSubject`, `subjectKey`, `normaliseSubjects`, `scopeIdentityKey`).
2. Every `SubjectType` has a `SUBJECT_TYPE_NOTES` entry, and an exhaustive `switch` over `SubjectType` with a `never` default compiles (a compile-time exhaustiveness fixture).
3. Each new creation reason round-trips through `createPlanJob` and its `JOB_CREATED` audit event unchanged.
4. `COMPOSITE` semantics: documented meaning; a COMPOSITE job keeps every supporting reason it was given.
5. `ROUTINE_MANAGEMENT` orders after `INFORMATION_VALUE` in `systemPriorityRank` / `compareSystemPriority`; the four existing tiers keep their relative order and ranks.
6. A `VERSIONED_SOURCE` hard deadline round-trips through `hardDeadline()` and `createPlanJob` with its source id, version and fingerprint intact; `hardDeadline()` still rejects an invalid due instant.
7. Existing Plan inputs remain valid and every existing Plan test passes unchanged, except the exhaustive tier-list assertion in `farmer-order.test.ts`, which gains `ROUTINE_MANAGEMENT` as its fifth and last entry; a regression test pins the four original tiers' ranks 0–3 and relative order.
8. Dedup identity (`planJobIdentityKey`) is unchanged for existing inputs.

## Acceptance criteria

- Additions exactly as in Scope; nothing else in Plan changes; no cattle file changes; Plan imports no cattle module.
- Every existing Plan and subject test passes unchanged except that one exhaustive tier-list assertion; the new tests pass; verify passes; full quality gate passes.
- DOMAIN_CONTRACTS.md section appended; strict full-phase audit CRITICAL=0 HIGH=0 MEDIUM=0.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when:
- an addition would require changing an existing Plan member, behaviour or test expectation — frozen-contract gate;
- a semantic choice is needed beyond the decisions written here — product decision gate;
- the change would need a cattle or C9 file — scope-expansion gate.

Gate tokens are written only when genuinely stopping, as `STOP: <TOKEN> — <one-sentence reason>`; never quote or mention them otherwise, and never use them as identifiers.

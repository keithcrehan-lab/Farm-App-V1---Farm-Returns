# Task: Cattle C1 - Canonical Animal Lifecycle

Task ID: cattle-c1-canonical-animal-lifecycle-20261009
Starting HEAD: 61c1124d8f206fc4d442fe7814e010a2edb0a186
Verify command: `npx vitest run src/domain/cattle src/domain/audit-trace.test.ts src/domain/assessment-integrity.test.ts && npm run typecheck && npm run lint && npm run build`

# Cattle C1 — Canonical Animal Lifecycle

## Objective

Build the canonical cattle animal-state layer for Farm Return.

Cattle owns animal truth. Other systems, including Plan, Adviser, Finance and future integrations, consume cattle state; they do not create competing animal truth.

C1 establishes:

- immutable Farm Return animal identity;
- external animal identifiers such as official tags;
- provenance-aware identity facts;
- date of birth;
- sex;
- breed facts;
- lifecycle state/history;
- location/holding history;
- management-group history;
- source corrections without destroying prior provenance;
- deterministic historical/as-of projection;
- a stable animal snapshot that later C0 Evidence Packs can bind to.

This is a pure deterministic domain phase.

Do NOT implement real cattle science, legal rules, recommendations, UI or integrations.

Starting point is the accepted/frozen C0 HEAD:

61c1124d8f206fc4d442fe7814e010a2edb0a186

C0 is now treated as frozen.

Before making changes, inspect:

- .agent/campaigns/cattle-engine-v1/CAMPAIGN.md
- .agent/skills/cattle-evidence-rules.md
- docs/farm-return-next/DOMAIN_CONTRACTS.md
- src/domain/cattle/
- src/domain/evidence.ts
- src/domain/audit-trace.ts
- src/domain/assessment-integrity.ts
- src/domain/source-register.ts

Reuse existing primitives only where their semantics genuinely fit.

Do not modify frozen C0 rule/evaluation semantics merely to make C1 cleaner.

If C1 requires a material change to C0 or another frozen Farm Return contract, STOP for human review.

==================================================
1. CANONICAL ANIMAL IDENTITY
==================================================

Every bovine must have an immutable Farm Return internal identifier.

Conceptually:

FarmReturnAnimalId

This is the canonical primary identity inside Farm Return.

External identifiers MUST NOT become the database/domain primary identity.

Examples of future external identifiers include:

- official bovine tag;
- electronic identifier;
- management identifier;
- processor/mart reference;
- external database identifier.

Do not implement real AIM/ICBF API behaviour in C1.

Requirements:

- internal animal ID is immutable;
- species for this vertical is BOVINE;
- external identifier changes must never create a new Farm Return animal automatically;
- historical external identifiers must remain available;
- replacing/correcting an external identifier must not erase the previous evidence;
- two internal animals claiming the same active external identifier must be surfaced as a register-level conflict;
- never silently merge animals because their identifiers match.

Do NOT invent official tag-format rules in C1.

==================================================
2. INFORMATION BOUNDARIES
==================================================

Preserve the architecture established in C0.

C1 animal state contains FACTS and OBSERVATIONS OF STATE.

It must not contain:

- recommendations;
- scientific targets;
- legal conclusions;
- veterinary conclusions;
- economic decisions.

Keep distinct:

FACT
OBSERVATION
INTENT
RULE
DERIVED VALUE
PREDICTION
OBLIGATION
RECOMMENDATION

C1 deals only with canonical animal facts/state/history.

==================================================
3. ANIMAL DATA PROVENANCE
==================================================

Do not confuse:

A. C0 evidence sources used to justify scientific/legal rules

with

B. operational animal-data provenance.

C1 needs an explicit operational provenance model.

A provenance record should be capable of representing, without claiming an integration exists:

- source category/system;
- source record reference if one exists;
- observed/source timestamp if supplied;
- received-at timestamp — when Farm Return learned the information;
- assertion/event identifier;
- optional actor/origin metadata where appropriate;
- correction/supersession relationship;
- quality/state needed to preserve UNKNOWN or CONFLICTING evidence.

Architect source categories for future systems such as:

- official registry;
- breeding/performance database;
- farmer;
- veterinary source;
- device;
- external farm software;
- mart/market;
- processor;
- other.

Do not claim that AIM, ICBF, NVPS or any other system is currently connected.

Do not invent their API fields.

==================================================
4. BITEMPORAL STATE — NON-NEGOTIABLE
==================================================

Farm Return must distinguish:

1. VALID / EFFECTIVE TIME
   When the fact or assignment was true in the physical world.

2. KNOWLEDGE TIME
   When Farm Return actually received/knew that information.

This is essential for audit reproducibility.

Example:

- Farm Return receives a DOB on 1 March.
- On 1 June a source sends a correction.
- A recommendation generated on 1 April must still be reproducible using the information Farm Return knew on 1 April.
- A current reconstruction of the animal's past may use the corrected information if the caller deliberately selects a later knowledge cutoff.

Animal projection must therefore support an explicit query concept equivalent to:

effectiveAt
knowledgeCutoff

Do not silently use Date.now().

Both times must be explicit or deterministically provided by the caller.

The resulting snapshot must record both.

Use deterministic, timezone-safe representations.

Avoid mutable JavaScript Date objects inside canonical persisted/domain structures where practical.

==================================================
5. CANONICAL IDENTITY FACTS
==================================================

C1 must support provenance-aware assertions for at least:

- date of birth;
- sex;
- breed / breed description;
- external identifiers.

Requirements:

- absence = UNKNOWN, never a made-up default;
- multiple agreeing active assertions may resolve as known while retaining provenance;
- materially conflicting active assertions resolve as CONFLICTING_EVIDENCE;
- never silently choose one source simply because it arrived last;
- do not invent a source-precedence hierarchy in C1;
- a correction/supersession must preserve the earlier assertion in history;
- malformed supersession must fail closed;
- source updates must never silently rewrite historical evidence.

Sex should model biological sex only.

Do not mix sex with production classes such as bullock/heifer/cow.

Breed must not be a hard-coded Irish breed enum.

It must be capable of preserving source-provided code/label information and future mixed/composite descriptions without inventing genetics.

==================================================
6. SOURCE CORRECTIONS / SUPERSESSION
==================================================

Canonical assertions/history must be append-only from an audit perspective.

Support correction through an explicit supersession relationship or equivalent immutable mechanism.

Required behaviour:

- old assertion remains in history;
- new assertion can supersede it;
- active projection honours only supersession information known by the knowledge cutoff;
- broken supersession target -> fail closed;
- conflicting competing corrections -> explicit conflict;
- cycle -> fail closed;
- duplicate assertion/event ID with identical content may be idempotent;
- duplicate ID with different content must never silently overwrite.

Do not hard-delete historical truth.

==================================================
7. LOCATION / HOLDING HISTORY
==================================================

C1 needs a canonical temporal location assignment model.

It must be capable of referencing future Farm Return locations such as:

- holding;
- field;
- housing/shed;
- external location;
- other opaque location reference.

Do not add map/UI behaviour.

Requirements:

- valid-from;
- optional valid-to;
- provenance/knowledge time;
- historical projection;
- current projection;
- no hidden assumption that missing location means the home farm;
- overlapping incompatible active physical locations => CONFLICTING_EVIDENCE;
- boundary semantics must be explicit and tested, preferably inclusive start / exclusive end.

Do not implement cattle movement legislation here.

This is physical/canonical state only.

==================================================
8. MANAGEMENT GROUP HISTORY
==================================================

C1 must support animals moving between management groups without losing history.

Required:

- opaque group ID/reference;
- valid-from;
- optional valid-to;
- provenance;
- knowledge time;
- historical membership;
- current membership projection;
- deterministic handling of out-of-order ingestion.

For the Cattle V1 management-group concept, conflicting simultaneous active management groups should fail closed rather than choosing one arbitrarily.

Do not build group UI.

Do not build performance logic.

==================================================
9. LIFECYCLE HISTORY
==================================================

Model a small neutral cattle lifecycle-state history sufficient to express physical canonical state.

Do not encode legal conclusions in lifecycle status names.

The model must support at minimum the conceptual ability to distinguish:

- animal currently present/active in the relevant holding context;
- animal no longer present / departed;
- animal deceased;
- unknown.

Choose precise neutral terminology after inspecting existing repository conventions.

Each status assertion/change must have:

- effective time;
- knowledge time;
- provenance;
- immutable history.

Contradictory simultaneously effective lifecycle states must be explicit conflict.

Do not implement registration, TB, BVD, movement eligibility or slaughter rules.

==================================================
10. ANIMAL LEDGER
==================================================

Create a canonical Cattle animal record/ledger that preserves the evidence necessary to reconstruct state.

It should conceptually be capable of carrying:

- FarmReturnAnimalId;
- identity fact assertions;
- external identifier history;
- location assignments;
- management-group assignments;
- lifecycle-state history.

Do not add future C2+ domains merely to make the object look complete.

Specifically DO NOT add yet:

- weights;
- ADG;
- BCS;
- fertility events;
- calving;
- service events;
- treatments;
- medicine;
- vaccinations;
- TB;
- BVD;
- feed;
- economics;
- production goals;
- recommendations.

Those belong to later phases.

==================================================
11. DETERMINISTIC PROJECTION
==================================================

Implement a pure deterministic projection from the canonical ledger to an animal snapshot.

Projection must not depend on insertion order.

The same logical ledger content provided in a different array/order sequence must produce the same projected state.

Projection should expose, as appropriate:

- animal ID;
- species;
- effectiveAt;
- knowledgeCutoff;
- resolved DOB state/value/evidence;
- resolved sex state/value/evidence;
- resolved breed state/value/evidence;
- resolved current external identifier state/history reference;
- resolved lifecycle state;
- resolved physical location;
- resolved management group;
- missing/conflicting evidence issues;
- provenance references needed to explain each result.

UNKNOWN and CONFLICTING_EVIDENCE must remain first-class.

Do not convert missing information to null-as-zero or invented values.

==================================================
12. HISTORICAL REPRODUCIBILITY
==================================================

The following must work:

A source assertion received after a historical recommendation must not appear when reconstructing the snapshot using the earlier knowledge cutoff.

Example test:

old fact known at T1
recommendation-time knowledge cutoff = T2
corrected fact arrives at T3
T1 < T2 < T3

Projection with knowledgeCutoff T2:
=> old fact.

Projection with knowledgeCutoff after T3:
=> corrected fact, subject to its validity interval.

Both histories remain auditable.

This behaviour is mandatory.

==================================================
13. SNAPSHOT INTEGRITY
==================================================

C0 Recommendation Evidence Packs will eventually need to bind to the exact animal state used by a recommendation.

C1 should therefore provide a deterministic snapshot/content fingerprint if this can safely reuse the established Farm Return integrity primitives.

Requirements:

- deterministic;
- schema/version identified;
- same logical projected state -> same fingerprint regardless of input ordering;
- material resolved-state/provenance change -> different fingerprint;
- effectiveAt and knowledgeCutoff included;
- UNKNOWN/conflict state included;
- no mutable caller references;
- no claim that the fingerprint is a digital signature.

Reuse existing canonicalisation/hash-provider architecture where semantically safe.

Do NOT alter frozen slurry/fertiliser fingerprint semantics.

If this cannot be added without changing a frozen shared contract, STOP and report instead.

==================================================
14. IMMUTABILITY / ALIAS SAFETY
==================================================

C0 found subtle caller-mutation defects, so C1 must be adversarial about object ownership.

After an assertion/event/assignment has entered the canonical ledger:

- later mutation of the caller's original input object must not rewrite the ledger;
- later mutation of objects returned by a projection must not rewrite the underlying ledger;
- fingerprinted content must correspond to the actual retained snapshot;
- dynamic getter/proxy inputs must not be able to create different retained values across repeated reads.

Prefer materialising/copying caller-owned declarative input at the domain boundary.

Do not attempt to make hostile JavaScript objects a security boundary, but do prevent ordinary aliasing and time-of-check/time-of-use defects.

==================================================
15. REGISTER-LEVEL IDENTITY CHECK
==================================================

Provide a pure register-level validation/projection capable of detecting when two different Farm Return animal IDs claim the same currently active external identifier under the same identifier scheme.

Required behaviour:

- report explicit conflict;
- preserve both animals;
- never merge automatically;
- historical duplicate no longer active should not necessarily block current projection;
- respect effectiveAt and knowledgeCutoff.

Do not build persistence.

==================================================
16. REQUIRED ADVERSARIAL TESTS
==================================================

At minimum add tests covering:

1. empty animal record -> explicit UNKNOWN identity fields.
2. normal DOB/sex/breed facts resolve.
3. agreeing assertions from multiple sources preserve provenance.
4. conflicting DOB assertions -> CONFLICTING_EVIDENCE.
5. conflicting sex assertions -> CONFLICTING_EVIDENCE.
6. source correction supersedes prior assertion without deleting history.
7. correction received after knowledge cutoff is invisible to earlier historical snapshot.
8. later knowledge cutoff sees correction.
9. broken supersession target fails closed.
10. supersession cycle fails closed.
11. same record/assertion ID + identical content is idempotent where supported.
12. same ID + changed content is rejected/conflict, never overwritten.
13. external identifier replacement retains old identifier history.
14. two animals with same current external identifier -> register conflict.
15. two animals with historically reused/non-overlapping external identifier do not create a false current conflict.
16. historical location projection.
17. overlapping incompatible current locations -> conflict.
18. location interval boundary behaviour.
19. historical management-group projection.
20. overlapping conflicting current management groups -> conflict.
21. lifecycle state projection.
22. conflicting lifecycle states -> conflict.
23. out-of-order ingestion produces same snapshot.
24. mutation of original caller input after ingestion cannot alter ledger.
25. mutation of projection output cannot alter ledger.
26. same logical snapshot with different input ordering -> same fingerprint.
27. material state/provenance change -> changed fingerprint.
28. effectiveAt or knowledgeCutoff change is bound into fingerprint.
29. no Date.now/randomness in deterministic projection.
30. no C2+ domain concepts leaked into C1.

Add further tests where implementation risks justify them.

==================================================
17. DOCUMENTATION / CONTRACT
==================================================

Update docs/farm-return-next/DOMAIN_CONTRACTS.md narrowly.

Document:

- C0 is frozen at accepted semantics;
- C1 canonical animal ownership;
- internal vs external identity;
- operational provenance;
- bitemporal state;
- correction/supersession semantics;
- deterministic animal snapshot;
- snapshot fingerprint semantics;
- UNKNOWN/conflict rules;
- C1 exclusions.

Do not rewrite unrelated contract sections.

==================================================
OUT OF SCOPE
==================================================

Explicitly out of C1:

- Supabase/database migrations;
- persistence;
- cattle UI;
- Farm map changes;
- Plan integration;
- Adviser integration;
- Finance integration;
- real AIM connector;
- real ICBF connector;
- real NVPS connector;
- HPRA ingestion;
- official tag-format rules;
- BVD;
- TB;
- movement eligibility;
- medicine withdrawals;
- vaccines;
- veterinary diagnosis/treatment;
- animal weights;
- ADG;
- production targets;
- breeding logic;
- finishing logic;
- slaughter readiness;
- economics;
- recommendations;
- notifications;
- external research.

Use synthetic test data only.

==================================================
STOP CONDITIONS
==================================================

STOP with human review if:

1. C1 requires changing frozen C0 rule/evaluation semantics.
2. C1 requires changing frozen slurry/fertiliser contracts.
3. A database migration appears necessary.
4. A real AIM/ICBF/NVPS/HPRA API assumption is required.
5. Legal/scientific/veterinary interpretation is required.
6. A source-precedence decision is needed to resolve conflicting facts.
7. Scope begins to include C2+ work.
8. A cross-domain generic animal refactor becomes necessary.
9. Existing repository architecture materially contradicts this brief.

Do not silently broaden scope.

==================================================
ACCEPTANCE CRITERIA
==================================================

C1 may close only if:

- immutable Farm Return animal identity exists;
- external identifier history is separate from internal identity;
- provenance-aware DOB/sex/breed assertions work;
- corrections preserve prior history;
- valid time and knowledge time are separate and tested;
- historical snapshots are reproducible;
- location history works;
- management-group history works;
- lifecycle history works;
- missing information remains UNKNOWN;
- conflicting evidence remains explicit;
- projection is deterministic and order-independent;
- caller mutation cannot rewrite retained evidence;
- duplicate external identifiers across animals are detected;
- snapshot integrity/fingerprint works or the task correctly STOPs because safe reuse is impossible;
- C0 behaviour is unchanged;
- no C2+ logic is introduced;
- targeted tests pass;
- typecheck passes;
- lint passes;
- build passes;
- no Critical/High audit findings remain.

After completion, STOP.

Do not start C2.
Do not push.
Do not deploy.

## Scope

As stated in the task brief above; nothing beyond it.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

## Acceptance criteria

- The outcome stated in the task brief is delivered.
- The verify command passes.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

## STOP conditions

Stop with:

BUILD_RESULT: BLOCKED <reason>

if:

- task requires unsupported scientific interpretation;
- task requires external evidence not already available;
- task requires a migration without explicit authorisation;
- task requires frozen-contract changes not explicitly authorised;
- task scope materially expands;
- acceptance criteria contradict existing code/contracts;
- required files/context are unavailable.

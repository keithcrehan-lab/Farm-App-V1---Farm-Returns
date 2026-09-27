# Task: Campaign B — Regulatory context, physical slurry identity, spreadable area and minimum evidence UX
Starting HEAD: 06b229c

## Campaign purpose

Build the regulatory and physical-farm context required before Farm Return can safely generate slurry recommendations.

Campaign A established truthful evidence semantics and wiring.

Campaign B must now establish:

1. the distinction between physical slurry volume and regulatory neat slurry;
2. the farm regulatory context required for later compliance calculations;
3. defensible spreadable-area evidence;
4. a minimal evidence-check UX that asks the farmer only for genuinely missing blocking facts.

This campaign MUST NOT implement the final scientific slurry-rate engine, whole-farm optimiser, or final recommendation ranking.

---

# Non-negotiable principle

Farm Return must never make a regulatory, physical-resource, or land-area assumption merely to keep a calculation running.

Specifically:

- physical slurry volume is not automatically regulatory neat slurry;
- gross mapped field area is not automatically spreadable area;
- missing statutory context is not false/zero;
- home-produced grazing livestock manure must not be treated as if all slurry N/P is simply an additional Table 15 allowance;
- scientific nutrient value and statutory nutrient accounting must remain separate ledgers;
- current law/rules must be versioned and traceable;
- farmer-declared regulatory facts must remain distinguishable from system-derived facts;
- uncertainty or unresolved applicability must block the affected regulatory conclusion rather than silently choosing a convenient interpretation.

---

# Existing architecture to preserve

Do not create competing evidence/provenance systems.

Reuse the canonical evidence context and provenance architecture established through:

- Phase 7.1 provenance/fingerprinting;
- Campaign A evidence wiring;
- Phase 1A slurry lifecycle/reconciliation.

Do not rewrite historical calculations when regulatory rules change.

Historical calculations must remain reproducible against the ruleset/evidence snapshot that originally produced them.

---

# Regulatory scope

This campaign is for Irish farms and the current Irish regulatory context already represented/documented in the repository.

Do not rely on memory alone for regulatory semantics.

Before implementing any regulatory rule:

- inspect the repository's existing authoritative source citations;
- verify the exact rule/version already adopted by the app;
- preserve source/version/applicability metadata.

If a required rule is not already sufficiently evidenced in the repository:

STOP.

Document the exact unresolved rule and return BUILD_RESULT: BLOCKED rather than inventing or extrapolating legal meaning.

---

# Internal checkpoints

Complete these in order.

Do not cross a checkpoint by inventing scientific or regulatory semantics.

---

# CHECKPOINT B1 — Physical slurry versus regulatory neat slurry

## Objective

Establish a canonical distinction between:

- physical slurry volume currently in storage;
- regulatory neat slurry volume where that quantity is actually known;
- agronomic composition evidence.

These must not be interchangeable.

---

## B1.1 Physical volume

Phase 1A remains authoritative for physical slurry availability.

Physical volume represents the actual liquid/resource in a store after:

- latest valid observation;
- completed withdrawals;
- active reservations where relevant to planning.

Do not alter Phase 1A reconciliation semantics.

---

## B1.2 Regulatory neat slurry

Audit every calculation that currently assumes the physical tank volume is equivalent to regulatory neat cattle slurry.

The system must support:

- physical volume known, regulatory neat volume unknown;
- physical and regulatory neat volume both known;
- regulatory neat proportion/equivalent only where backed by a legitimate evidence source;
- no implicit 1:1 conversion.

If rainwater, dairy washings, dirty-yard water or other dilution may be part of physical stored volume, do not silently treat the full tank as statutory neat slurry.

Do not derive a neat-slurry fraction without an approved existing rule or farmer/source evidence.

Unknown must remain unknown.

---

## B1.3 Agronomic composition remains separate

Do not collapse regulatory neat identity into agronomic composition.

A store may simultaneously have:

- known physical volume;
- unknown neat-slurry regulatory equivalent;
- known or unknown DM;
- known or unknown agronomic N/P/K composition.

Those are distinct facts.

Add tests proving each can vary independently.

---

# CHECKPOINT B2 — Farm regulatory context

## Objective

Create or extend the canonical regulatory context required for later slurry compliance calculations.

This checkpoint establishes the evidence/context only.

Do not yet build the final field slurry recommendation engine.

---

## B2.1 Statutory manure context

Trace the current implementation of manure N/P regulatory accounting.

Preserve the established distinction between:

- statutory total nutrient values;
- agronomic crop-available nutrient values.

Where the repository already contains adopted statutory cattle-slurry factors, preserve their source/version/applicability.

Do not use agronomic available N/P values as statutory totals.

Do not use statutory nutrient values as agronomic fertiliser replacement values.

---

## B2.2 Home-produced grazing livestock manure

Audit any implementation that effectively does:

`Table 15 allowance / cattle slurry nutrient concentration = maximum home-produced slurry application`

That simplistic interpretation is not acceptable where current adopted rules distinguish manure produced by grazing livestock on the holding from additional Table 15 N/P allowances.

Do not build a new legal interpretation from memory.

Use only the versioned regulatory rule already established in the repository.

If the current repo does not contain enough authoritative evidence to implement this correctly:

STOP and document the missing legal interpretation.

Do not silently retain a known-wrong simplified cap.

---

## B2.3 Organic N context

Where existing regulatory architecture supports it, make the farm's relevant organic-N regulatory context available to downstream calculations.

Do not assume derogation status.

Do not assume a generic limit when actual farm regulatory status is required.

Represent missing/unknown derogation or equivalent context explicitly.

Campaign B should establish the evidence boundary.

Do not invent a full NMP engine unless one already exists and only needs truthful wiring.

---

## B2.4 Farmer P/K overrides

Campaign A correctly preserved farmer P/K overrides.

For compliance/regulatory use:

- do not automatically treat a farmer-adjusted P index as equivalent to laboratory evidence if the regulation requires a qualifying soil result;
- preserve the effective agronomic value separately from the compliance-valid evidence value;
- if compliance applicability cannot be established from existing evidence, mark compliance value unavailable/blocked.

This was intentionally deferred from Campaign A and belongs here.

Do not discard the farmer override.

---

# CHECKPOINT B3 — Spreadable-area evidence

## Objective

Stop treating gross mapped area as automatically equivalent to slurry-spreadable area.

---

## B3.1 Gross area versus spreadable area

Represent separately:

- gross mapped area;
- known excluded area;
- defensible spreadable area;
- unknown spreadable area.

Gross mapped area may be used as a geometric reference but must not silently become regulatory spreadable area.

---

## B3.2 Existing exclusion evidence

Audit existing stored evidence relevant to land eligibility/exclusions, including where available:

- water-related answers;
- commonage context;
- existing field status;
- existing geometry/buffer information;
- any current exclusion metadata already held by the app.

Reuse valid existing evidence.

Do not ask the farmer again for facts Farm Return already holds.

Do not infer a legal buffer geometry unless an approved regulatory rule and required geometry are both available.

---

## B3.3 Unknown spreadable area

If defensible spreadable area cannot yet be established:

- preserve gross area;
- mark spreadable area unknown;
- block calculations that require total allowable volume based on spreadable hectares;
- do NOT block a purely per-hectare agronomic RATE calculation merely because total spreadable hectares are unknown, unless another required fact is missing.

This distinction is important:

unknown spreadable area is normally a TOTAL_VOLUME blocker, not automatically a RATE blocker.

Add regression tests.

---

## B3.4 Field status

Archived/inactive fields remain excluded from current planning as established in Campaign A.

Do not create additional agronomic field exclusions here unless they are clearly regulatory/physical and supported by existing evidence.

---

# CHECKPOINT B4 — Minimum evidence-check UX

## Objective

Create the smallest farmer interaction necessary to resolve genuine regulatory/physical blockers.

This is NOT a large questionnaire.

The intended sequence is:

1. use reliable stored evidence;
2. use approved deterministic derivations;
3. identify unresolved blockers;
4. ask only for the minimum missing facts;
5. re-evaluate immediately after confirmation.

---

## B4.1 Evidence blocker classes

Reuse or extend existing blocker architecture.

At minimum preserve the conceptual distinction between:

- RATE_BLOCKING;
- COMPLIANCE_BLOCKING;
- TOTAL_VOLUME_BLOCKING;
- ECONOMIC_BLOCKING;
- ACTIONABILITY_BLOCKING;
- NON_BLOCKING.

Do not collapse all missing evidence into a generic "cannot continue".

Use existing canonical names if the repository already defines equivalent concepts.

---

## B4.2 Do not ask twice

If Farm Return already has a still-valid canonical answer, do not ask again.

This applies to Campaign A evidence such as:

- commonage;
- water/buffer-related answers;
- soil evidence;
- slurry DM;
- application evidence;
- physical storage observations.

If evidence is stale, conflicting, or legally insufficient, disclose that rather than pretending it is absent.

---

## B4.3 Batch confirmations

Where multiple fields share the same unresolved farm-level fact, ask once at the farm level rather than field-by-field.

Where a fact is genuinely field-specific, keep it field-specific.

Do not copy one field answer across other fields unless identity is explicit.

---

## B4.4 Farmer-facing language

Do not expose internal terminology such as:

- regulatory enum names;
- blocker codes;
- SQL/database names;
- evidence class identifiers.

Use plain language.

Examples of desired style:

"Farm Return knows the tank contains 106 m³, but it does not yet know how much of that is neat cattle slurry for regulatory calculations."

or:

"Field size is known, but the spreadable area has not yet been confirmed."

Do not claim a rule is legally required unless supported by the adopted regulatory source.

---

# Canonical output boundary

By the end of Campaign B, downstream slurry recommendation work should be able to inspect a versioned context containing, where relevant:

- physical slurry available;
- regulatory neat-slurry evidence/state;
- agronomic composition evidence/state;
- soil compliance evidence distinct from agronomic effective values;
- gross field area;
- spreadable-area evidence/state;
- farm regulatory context;
- unresolved blockers by layer;
- provenance/source;
- recorded/effective timestamps;
- regulatory ruleset version.

Do not calculate recommended m³/ha here.

Do not optimise whole-farm slurry allocation here.

---

# Explicit exclusions

## Campaign C — scientific ruleset

Do not implement or resolve:

- canonical Teagasc slurry DM composition table;
- DM interpolation;
- first-cut silage crop-rate rules;
- P/K slurry availability transformations;
- reseed adjustments;
- pH response multipliers;
- current unresolved 33 m³/ha versus spring K-cap evidence conflict;
- scientific confidence scoring.

If Campaign B requires choosing one of these, STOP.

---

## Campaign D — recommendation engine

Do not implement:

- recommended slurry rate in m³/ha;
- recommended total slurry volume;
- field ranking;
- whole-farm finite-resource optimisation;
- field selection;
- system recommendation output.

---

## Campaign E — farmer decision/actionability

Do not implement:

- recommendation overrides/reallocation;
- new Rainfall Window Score logic;
- final weather actionability;
- final What Matters recommendation card.

---

# Database/schema policy

Prefer no migration.

If the existing schema cannot preserve one of the required distinctions, especially:

- physical volume versus regulatory neat slurry;
- gross versus spreadable area;
- compliance-valid soil evidence versus farmer agronomic override;

STOP.

Document:

- exact missing persistence capability;
- affected tables/columns;
- why application-only code cannot preserve the distinction;
- minimal proposed schema change;
- compatibility implications.

Return BUILD_RESULT: BLOCKED.

Do not create or push a migration automatically.

---

# No Dev mutation

Do not mutate Farm Return V1 Dev data as part of this build.

No migration push.

No synthetic rows inserted into Dev.

Use fixtures/tests only.

---

# Testing requirements

Add focused regression tests for every confirmed change.

At minimum cover:

A. known physical slurry volume + unknown regulatory neat volume remains two distinct states;

B. physical tank volume never silently becomes neat slurry 1:1;

C. known regulatory neat volume remains distinguishable from physical volume;

D. agronomic composition remains independent from neat-slurry regulatory identity;

E. missing regulatory evidence remains missing, not false/zero;

F. statutory nutrient values remain separate from agronomic available nutrients;

G. farmer P/K override is not silently accepted as compliance-valid laboratory evidence;

H. gross mapped area does not silently become spreadable area;

I. unknown spreadable area blocks total-volume calculation but does not automatically block an otherwise valid per-ha rate context;

J. archived fields remain excluded from current planning;

K. existing commonage answer is reused;

L. existing water/buffer answer is reused;

M. one farm-level missing fact is not repeatedly requested per field;

N. known evidence prevents duplicate asks;

O. conflicting evidence remains conflict rather than arbitrary resolution;

P. downstream context exposes blocker layer/type truthfully;

Q. full existing test suite remains green.

Run targeted tests after each checkpoint.

Then run:

`npm test`

and the verify command.

---

# Documentation

Update the existing slurry recommendation evidence/regulatory documentation.

Record:

- regulatory rules actually implemented;
- exact source/version already adopted by the repository;
- physical-versus-neat semantics;
- gross-versus-spreadable-area semantics;
- evidence/blocker behaviour;
- items deferred to Campaign C;
- any unresolved regulatory questions.

Do not rewrite historical audit findings.

Do not claim regulatory certainty where the repo evidence does not support it.

---

# Completion report

Report:

1. starting HEAD;
2. final HEAD/worktree state;
3. files changed;
4. B1–B4 checkpoint status;
5. each regulatory/physical finding as:
   - FIXED;
   - NOT REPRODUCIBLE;
   - DEFERRED;
   - BLOCKED;
6. tests run/results;
7. whether a migration is required;
8. unresolved regulatory questions;
9. Campaign C dependencies;
10. any open concerns.

---

# STOP conditions

Return BUILD_RESULT: BLOCKED rather than guessing if:

- physical volume cannot be distinguished from regulatory neat volume without schema change;
- spreadable area cannot be represented truthfully without schema change;
- a legal/regulatory interpretation is not sufficiently supported by the repository's authoritative evidence;
- compliance-valid soil evidence cannot be separated from farmer agronomic override;
- implementing the next step would require resolving a Campaign C scientific conflict;
- unknown would need to become zero/default;
- historical evidence would need to be rewritten;
- a migration is required.

---

# Definition of done

Campaign B is complete only when:

- physical slurry and regulatory neat slurry are distinct;
- statutory and agronomic nutrient ledgers remain distinct;
- farm regulatory evidence is available without invented legal interpretation;
- farmer P/K overrides do not masquerade as compliance evidence;
- gross area does not masquerade as spreadable area;
- unknown spreadable area remains an explicit total-volume blocker;
- existing evidence is reused before asking the farmer;
- blocker classes are truthful;
- no Campaign C/D/E logic leaks into this campaign;
- targeted tests pass;
- full tests pass;
- typecheck passes;
- build passes;
- documentation reflects the implemented rules and unresolved boundaries.

Verify command: `npm run typecheck && npm run build`

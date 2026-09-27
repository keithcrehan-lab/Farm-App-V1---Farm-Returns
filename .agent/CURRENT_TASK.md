# Task: Campaign B stabilisation — regulatory evidence state regressions
Starting HEAD: 2c27ec8

## Context

Campaign B is not complete.

The current Campaign B checkpoint contains useful domain work, but the wider campaign is blocked by:

- persistence/schema requirements for farmer-supplied regulatory neat-slurry evidence and spreadable-area evidence;
- unresolved regulatory interpretation for home-produced grazing-livestock manure P;
- remaining farmer-facing UX/wiring work.

Before addressing those blockers, fix the three confirmed Codex regressions in the domain logic already implemented.

Do not expand scope beyond these regressions.

---

## Finding 1 — HIGH

### Unavailable neat-slurry evidence becomes known

Location:

`src/domain/slurry-regulatory-context.ts`

Confirmed behaviour:

An input such as:

- `volumeM3: 100`
- `status: "unavailable"`

can currently produce:

- evidence `state: "known"`

and downstream `fieldPlannedRegulatoryNeatSlurry` can convert non-verified evidence into a usable `farmer_adjusted` statutory quantity.

This is invalid.

### Required behaviour

Evidence explicitly marked unavailable must never produce a known regulatory neat-slurry value.

Preserve the distinction between:

- known;
- missing;
- unavailable;
- conflicting;

using the repository's existing canonical evidence states where available.

Do not infer a statutory quantity from unavailable evidence.

Do not relabel unavailable evidence as `farmer_adjusted`.

When deriving field-level regulatory neat-slurry evidence from an allocation, preserve the source/evidence state and confidence/trust semantics from the underlying evidence.

A numeric value being present in storage is not sufficient to make that value legally usable if its evidence state is unavailable.

### Tests

At minimum prove:

A. `volumeM3 > 0` + status unavailable does not become known;

B. unavailable source evidence remains unavailable through field allocation derivation;

C. unavailable evidence supplies no statutory nutrient quantity;

D. genuinely known verified neat-slurry evidence remains usable;

E. known explicit zero remains distinguishable from unavailable/missing if the domain permits an explicit known zero.

---

## Finding 2 — MEDIUM

### Unknown soil-test validity disappears from compliance blockers

Location:

`src/domain/slurry-regulatory-context.ts`

Confirmed behaviour:

Laboratory P evidence can exist while:

- soil-test age validity is unresolved/blocked;
- supporting sample/test date is missing;

but `buildSlurryEvidenceChecks` currently emits no soil compliance blocker.

This silently treats unresolved compliance validity as acceptable.

### Required behaviour

If laboratory evidence exists but its regulatory validity cannot be established because required supporting evidence is missing:

- preserve the laboratory result;
- do not discard it;
- do not treat it as compliance-valid;
- emit a COMPLIANCE_BLOCKING evidence requirement;
- ask only for the genuinely missing supporting fact.

For the confirmed case, if the missing fact is the laboratory sample/test date, ask for/identify that missing date rather than asking for an entirely new soil test.

Do not invent a sample date.

Do not treat analysis date as sample date unless an already-adopted rule explicitly says they are equivalent.

### Tests

At minimum prove:

F. lab P index + missing date + unresolved validity produces a compliance blocker;

G. the retained laboratory index remains preserved;

H. the blocker identifies the missing supporting evidence rather than treating the soil result as absent;

I. valid qualifying laboratory evidence produces no duplicate blocker.

---

## Finding 3 — MEDIUM

### Farmer override triggers unnecessary new soil-test request

Location:

`src/domain/slurry-regulatory-context.ts`

Confirmed behaviour:

When Farm Return has:

- retained laboratory P evidence;
- soil-test validity = VALID;
- a farmer agronomic P override;

the evidence-check layer asks the farmer to obtain/provide a new soil test.

That is incorrect because the qualifying laboratory evidence already exists.

### Required behaviour

Assess these two things separately:

1. laboratory evidence used for compliance eligibility;
2. farmer-adjusted effective value used for agronomic planning.

A farmer override must not erase or replace the underlying laboratory node.

If the retained laboratory evidence is valid for compliance:

- reuse it;
- do not ask for another soil test merely because an agronomic override exists.

The farmer override remains clearly distinguishable and must not itself masquerade as compliance-valid laboratory evidence.

If the override creates a separate unresolved applicability issue:

- disclose that issue truthfully;
- do not convert it into "missing soil test" unless the soil test is genuinely missing.

### Tests

At minimum prove:

J. valid lab P evidence + farmer agronomic override does not request a new soil test;

K. compliance evidence remains the laboratory node;

L. agronomic effective value remains the farmer override;

M. the two provenances remain distinguishable;

N. missing laboratory evidence still correctly produces the appropriate blocker.

---

## Scope boundaries

Do NOT implement:

- schema changes;
- migrations;
- persistence for new neat-slurry farmer input;
- persistence for spreadable-area input;
- Table 15/home-produced grazing livestock manure interpretation;
- new regulatory calculations;
- scientific slurry-rate rules;
- whole-farm optimisation;
- recommendation ranking;
- new What Matters wiring;
- new farmer-facing Campaign B screens.

Do not modify Phase 1A lifecycle semantics.

Do not change Campaign A evidence semantics except where needed to preserve them.

This task is only a stabilisation of existing Campaign B evidence-state logic.

---

## Core rules

- unavailable must not become known;
- missing must not become zero;
- farmer override must not replace source laboratory evidence;
- unresolved regulatory validity must remain unresolved;
- existing qualifying evidence must be reused before asking the farmer again.

---

## Testing

Run the targeted regulatory-context tests first.

Then run:

`npm test`

The full existing suite must remain green.

---

## Completion report

Report:

1. exact files changed;
2. each of the three Codex findings and how it was fixed;
3. regression tests added;
4. targeted test result;
5. full test result;
6. typecheck result;
7. build result;
8. confirmation that no migration/schema/regulatory-rule expansion occurred;
9. any remaining Campaign B blockers.

Verify command: `npm run typecheck && npm run build`

# Task: Campaign B temporal integrity — fail closed when current store comparability is unestablished

Starting HEAD: 85d4ae1

## Goal

Fix the single remaining Codex MEDIUM from:

`.agent/history/audit-20260927T222143Z.md`

The temporal-integrity fix correctly prevents comparisons between known physical
volume and regulatory neat-slurry evidence from different store states, but the
gate is currently bypassed when the current physical volume itself is missing.

As a result, historical or undated neat-slurry evidence can incorrectly become a
current `known` regulatory neat quantity even though comparability with the
current physical store state has not been established.

This task fixes only that gap.

## Core invariant

A regulatory neat-slurry evidence record may be used as the CURRENT regulatory
neat quantity only when Farm Return can establish that it is legitimately
comparable with the current physical store state.

Historical evidence must remain preserved separately.

Absence of current physical evidence or absence of the temporal provenance needed
to compare the two facts must fail closed — never promote the historical neat
record to a current known quantity.

Use the existing canonical reason where applicable:

`REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE`

Do not invent a conflict when evidence is merely insufficient.

## Required behaviour

Trace the existing logic in:

- `src/domain/slurry-regulatory-context.ts`
- `src/domain/regulatory-evidence-records.ts`
- relevant physical store timing/lifecycle helpers
- existing temporal-integrity tests from the previous task

Then make the smallest correction so that:

1. Known neat evidence + missing current physical volume does NOT become a
   current known regulatory-neat quantity.

2. Known neat evidence + current physical timing but missing physical quantity
   fails closed as not comparable/current-state unresolved.

3. Undated neat evidence does NOT become current known when temporal
   comparability cannot be established.

4. Missing/insufficient physical timing required for comparison does NOT become
   current known.

5. Historical neat evidence remains intact in the underlying evidence record;
   this fix changes only whether it can be promoted into the current
   `storeSlurryIdentity` regulatory-neat fact.

6. Do not reinterpret insufficient evidence as
   `NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME`.

7. Genuine comparable known physical + known neat behaviour from the previous
   temporal task remains unchanged:
   - comparable neat <= physical => existing known behaviour;
   - comparable neat > physical => genuine conflict.

8. Later withdrawal/new physical-observation scenarios from the previous task
   remain fail-closed unless a temporally comparable newer neat observation
   exists.

9. Explicit zero is historical evidence like any other observation. It must not
   be promoted to the CURRENT store state solely because its numeric value is
   zero when current-state comparability is otherwise unestablished.

10. No evidence value may be fabricated, clamped, rewritten or deleted.

## Required regression tests

At minimum prove:

A. missing current physical volume + dated known neat observation =>
   NOT current known; returns canonical not-comparable/missing outcome;

B. missing current physical volume + undated known neat observation =>
   NOT current known;

C. known physical volume + undated neat observation =>
   fail closed when temporal comparability cannot be established;

D. known neat evidence older than a newer physical observation =>
   remains historical but is not current known;

E. known neat evidence predating a completed withdrawal =>
   remains historical but is not current known;

F. comparable current physical 100 m3 + neat 80 m3 =>
   existing known result remains unchanged;

G. comparable current physical 100 m3 + neat 120 m3 =>
   existing genuine conflict remains unchanged;

H. unestablished comparability never produces
   `NEAT_SLURRY_EXCEEDS_PHYSICAL_VOLUME`;

I. explicit zero with unestablished current-state comparability =>
   not promoted to current known zero;

J. explicit zero with legitimately established current-state comparability =>
   existing valid zero behaviour remains unchanged;

K. historical persisted neat evidence itself is not mutated or deleted by this
   resolution rule.

## Important distinction

Do NOT discard historical regulatory-neat evidence.

The persisted evidence ledger and the current usable store-state fact are
different concepts:

- persisted evidence = what was observed/declared at that historical time;
- current regulatory-neat fact = evidence that is proven applicable to the
  current store state.

This task changes only the second.

## Scope exclusions

Do NOT:

- change database schema or migration;
- apply anything to Farm Return V1 Dev;
- change immutable evidence-record persistence;
- change tied-observation resolution;
- change timestamp ordering;
- invent same-day/hour tolerances;
- alter Irish regulatory interpretation;
- resolve Table 15/home-produced grazing-manure treatment;
- change nutrient coefficients;
- add farmer-facing UI;
- wire What Matters;
- implement slurry recommendation rates or optimisation.

## Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record:

- the Codex finding;
- the distinction between historical persisted neat evidence and a current
  usable regulatory-neat fact;
- that missing physical/current-state comparability now fails closed;
- no schema/migration change;
- no migration applied to Farm Return V1 Dev;
- Campaign B overall remains PARTIAL.

## Verification

Run focused tests for:

- slurry-regulatory-context;
- regulatory-evidence-records;
- slurry lifecycle/reconciliation where affected.

Then run full `npm test`.

Verify command: `npm run typecheck && npm run build`

Only report DONE if all focused tests, full tests, typecheck and build pass.


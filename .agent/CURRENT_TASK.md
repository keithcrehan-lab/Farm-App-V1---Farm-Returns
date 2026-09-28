# Task: Campaign B minimal evidence UX — regulatory neat slurry and spreadable area

Starting HEAD: 07fe859

## Goal

Complete the remaining minimal farmer-facing Campaign B evidence capture for:

1. regulatory neat-slurry quantity evidence; and
2. field spreadable-area evidence.

The persistence, canonical selection, temporal integrity and live read paths for these
facts already exist and have been independently audited.

This task must reuse those existing canonical evidence systems.

Do not create parallel state, duplicate selectors or silent fallbacks.

Do not change Campaign C science, optimise slurry allocation or change What Matters
ranking.

## Core principles

The farmer should only be asked for a fact Farm Return genuinely cannot establish.

Never substitute:

- physical slurry-store volume for regulatory neat-slurry quantity;
- gross mapped field area for spreadable area;
- an estimate for a measured/declarative fact without explicitly recording its
  evidence class;
- zero for unknown.

Unknown remains unknown.

The UX must make clear what the farmer is declaring and why it matters without
exposing internal legal/domain codes.

## A. Mandatory trace before implementation

Trace the existing production paths for:

### Regulatory neat-slurry evidence

- evidence table/migration;
- repository/loader;
- mapper/row type;
- canonical selector;
- temporal-comparability rules;
- store current physical volume;
- slurry planning workflow;
- Nutrients/NAP;
- Scientific Evidence Report.

### Spreadable-area evidence

- evidence table/migration;
- repository/loader;
- mapper/row type;
- canonical selector;
- gross field area;
- field detail/edit screens;
- Nutrients;
- slurry planning;
- any existing field-area inputs.

Also inspect the newly completed slurry-origin evidence UX and reuse its interaction,
provenance and server-action conventions where appropriate.

Do not assume the most convenient screen is the correct capture location.

## B. Regulatory neat-slurry capture

Add the smallest farmer-facing interaction required to create canonical regulatory
neat-slurry evidence for a slurry store.

The farmer must be able to explicitly provide the regulatory quantity where they have
a defensible value.

Requirements:

1. no value is prefilled from physical store volume;
2. physical volume may be shown as contextual information only if clearly labelled as
   a different fact;
3. saving creates a new immutable evidence record through the existing canonical
   persistence path;
4. do not overwrite historical evidence;
5. preserve authenticated actor/capture timestamp/effective-date conventions;
6. current canonical evidence must update only through the existing selector;
7. unavailable/not-known must remain representable without inventing zero;
8. historical/non-comparable evidence must not become current merely because the UI
   was opened;
9. explicit zero must retain its existing audited semantics;
10. farmer-facing wording must not imply that physical slurry and statutory neat
    slurry are automatically the same.

If the domain requires an evidence source/provenance choice, keep the options minimal
and truthful.

Do not add unsupported laboratory/certificate semantics.

## C. Spreadable-area capture

Add the smallest farmer-facing interaction required to explicitly establish a field's
spreadable area.

Requirements:

1. show gross/mapped field area separately where useful;
2. never prefill spreadable area with gross area as though it were established;
3. a farmer may explicitly declare a spreadable-area value;
4. zero is allowed only as an explicit known zero;
5. positive spreadable area cannot silently exceed gross area;
6. if greater-than-gross is entered, reject or preserve it as invalid evidence
   according to the already-audited canonical rules — never clamp it;
7. saving creates immutable/add-only evidence;
8. provenance/actor/capture information survives;
9. reloading the screen must show the current canonical state;
10. previous evidence/history remains intact.

Place this interaction where a farmer would naturally manage the relevant field
rather than creating an unrelated settings screen.

## D. Farmer effort / UX

Minimise repeated data entry.

If a still-valid canonical value already exists:

- show it;
- show when it was established where useful;
- allow the farmer to revise it by creating new evidence;
- do not ask again on every visit.

Use plain language.

Avoid phrases such as:

- `REGULATORY_NEAT_SLURRY_NOT_COMPARABLE_WITH_CURRENT_STORE_STATE`
- `SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT`
- enum values;
- raw database/status codes.

Translate blocked/conflicting states into concise farmer-facing explanations.

Do not conceal uncertainty.

## E. Evidence history and reviewability

The farmer must be able to see enough context to understand the current value they
are relying on.

At minimum, for the current canonical value show where applicable:

- value;
- unit;
- when it was recorded/effective;
- whether it is currently usable.

Do not build a large evidence-history management product in this task.

Full historical records must remain preserved in persistence even if only the current
fact is shown in the normal UI.

## F. Server actions / persistence

Use existing Campaign B repository and server-action patterns.

Requirements:

- authenticated farm/subject ownership checks;
- immutable inserts;
- database-owned actor/capture semantics where already enforced;
- canonical reload after successful save;
- honest error states;
- no optimistic display of an evidence value that failed to persist;
- no direct client writes bypassing the canonical repository path.

If the existing migration/table is missing from the environment, surface an honest
unavailable/setup error.

Do not silently interpret a missing table as a successful save.

## G. Production wiring

After a successful save and canonical reload:

### Neat slurry

The existing production regulatory context must consume the new canonical evidence.

Do not add another per-screen interpretation.

### Spreadable area

Existing production callers that already accept spreadable-area evidence should
consume the new fact through the canonical path.

If a downstream contract does not currently accept the fact, do not widen a frozen
contract merely to make the UI appear useful.

Document that caller for the next task.

## H. Required tests

At minimum cover:

### Neat slurry

A. no evidence => remains unknown/not established;

B. form never pre-populates regulatory neat quantity from physical store volume;

C. valid farmer declaration persists and reloads;

D. previous evidence remains in history after a new declaration;

E. explicit zero survives with correct semantics;

F. unavailable/not-known remains distinct from zero;

G. historical/non-comparable evidence remains blocked;

H. failed write does not show false success;

I. authenticated subject/farm boundary enforced;

J. internal reason codes are not shown to the farmer.

### Spreadable area

K. missing evidence never defaults to gross area;

L. valid farmer-declared area persists and reloads;

M. gross area is visually/semantically distinct from spreadable area;

N. explicit zero survives;

O. greater-than-gross input is never silently clamped;

P. conflicting/invalid canonical evidence remains visibly unresolved;

Q. failed write does not show false success;

R. actor/provenance/capture metadata survives DB -> mapper -> domain;

S. old evidence is preserved after revision;

T. internal codes are not leaked.

### Regression

U. slurry-origin evidence behaviour remains unchanged;

V. regulatory neat-slurry temporal-integrity tests remain green;

W. spreadable-area tie/conflict tests remain green;

X. physical store volume remains unchanged by regulatory evidence capture;

Y. gross field geometry/area remains unchanged by spreadable-area capture;

Z. existing Nutrients and Scientific Evidence Report behaviour does not regress.

## I. Migration status

Do not apply migrations to Farm Return V1 Dev.

Trace which Campaign B migrations are required by these forms and document whether
they are already applied or remain unapplied.

The application must not pretend a save succeeded when the required schema is absent.

Do not create a new migration unless the existing audited schema genuinely cannot
support the capture.

## J. Screen review

Perform a focused desktop/mobile review of any screens changed.

Check:

- no horizontal overflow;
- labels understandable without legal knowledge;
- save/cancel/retry states;
- existing value/revision state;
- unknown/conflicting state;
- distinction between physical vs regulatory quantity;
- distinction between gross vs spreadable area.

Do not redesign unrelated parts of the application.

## K. STOP conditions

STOP rather than guessing if:

1. the existing evidence schema cannot represent the farmer declaration safely;
2. a physical-volume -> neat-volume conversion would be required;
3. gross area would need to be treated as spreadable area;
4. a new scientific/regulatory interpretation is required;
5. a frozen downstream contract must materially change;
6. the required database migration must be applied to Farm Return V1 Dev to proceed;
7. persistence cannot preserve immutable provenance;
8. current UI architecture cannot distinguish current canonical evidence from raw
   historical observations without duplicating selector logic.

Document the exact blocker.

## L. Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`
- relevant Campaign B evidence documentation

Record:

- capture location for each fact and why;
- canonical persistence path reused;
- provenance model;
- missing/unavailable behaviour;
- migration status;
- downstream callers now satisfied;
- remaining Campaign B gaps.

Campaign B remains PARTIAL unless all remaining requirements are genuinely complete.

## M. Scope exclusions

Do NOT:

- change current Irish regulatory interpretation;
- alter nutrient coefficients;
- implement Campaign C;
- recommend slurry rates;
- optimise whole-farm allocation;
- change What Matters ranking/selection;
- add unrelated settings screens;
- apply migrations to Farm Return V1 Dev;
- push or deploy;
- infer regulatory neat quantity;
- infer spreadable area from gross area;
- reopen clean slurry-origin logic unless a direct regression is exposed.

## Verification

Run targeted evidence, repository, server-action and affected UI tests.

Run relevant Campaign B regression tests.

Then full:

`npm test`

Verify command: `npm run typecheck && npm run build`

Only report DONE if:

- both farmer declarations persist through canonical evidence paths;
- no silent substitutions exist;
- unknown/invalid states fail closed;
- affected screens have been reviewed;
- all tests and verification pass.


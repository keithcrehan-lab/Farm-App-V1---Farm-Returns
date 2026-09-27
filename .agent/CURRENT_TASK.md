# Task: Campaign B schema and persistence — regulatory neat-slurry evidence and spreadable-area evidence

Starting HEAD: c6d2d3f

## Goal

Implement the minimum canonical persistence layer needed for Campaign B so Farm Return can store and reload:

1. regulatory neat-slurry evidence for a slurry store/housing record; and
2. spreadable-area evidence for a field,

without conflating either with existing physical-volume, agronomic-composition or gross-field-area facts.

This is a persistence/evidence task only.

Do NOT implement new statutory interpretation, slurry recommendation rates, optimisation, What Matters UX, farmer-facing evidence forms or Campaign C science.

Do NOT apply any migration to Farm Return V1 Dev.

## Governing principles

Farm Return must continue to satisfy:

- no unknown silently becomes zero;
- no physical slurry volume silently becomes regulatory neat-slurry volume;
- no gross field area silently becomes spreadable area;
- evidence provenance survives persistence and reload;
- known zero remains distinguishable from missing;
- scientific/agronomic, regulatory/compliance and physical/economic ledgers remain separate;
- historical/auditable evidence must not be rewritten merely because a newer observation exists.

Trace the existing schema, domain types, mappers and persistence patterns before selecting the storage design.

Prefer the smallest additive schema that fits existing architecture.

Do not invent a new generic evidence framework if an existing audited persistence pattern can represent these facts safely.

## A. Regulatory neat-slurry persistence

Inspect the existing housing/slurry-store schema and the canonical types introduced in Campaign B.

Persist enough information to reconstruct the existing regulatory neat-slurry evidence semantics after a real database round trip.

The persisted model must preserve, at minimum:

- genuinely missing/not established evidence;
- known evidence;
- explicit known zero;
- evidence status/provenance;
- source description;
- recorded/effective date where applicable;
- unavailable evidence where that is a real recorded evidence state.

A reload must not silently upgrade evidence trust.

A physical store volume is NOT regulatory neat-slurry evidence.

Existing stores with no new evidence must remain unknown/not established after migration. No backfill may convert physical volume into neat volume.

If conflict is a derived state from incompatible source facts, keep it derived rather than inventing a persisted "conflict" declaration merely to satisfy a test.

If representing the required evidence faithfully requires multiple immutable observations rather than mutable columns, use the repository's existing audit/history patterns where practical. Explain the choice in the implementation log.

## B. Spreadable-area persistence

Add a canonical persisted distinction between:

- gross field area; and
- defensible spreadable area.

The persisted spreadable-area model must preserve:

- missing/unknown;
- known zero;
- known positive area;
- provenance/status;
- source;
- recorded/effective date where appropriate.

Do NOT default spreadable area to gross field area.

Do NOT infer spreadable area from mapped hectares, gross polygon area or current field area.

A positive spreadable area must not exceed the field's canonical gross area when the gross area is known.

Do not silently rewrite a previously recorded spreadable-area observation when gross area changes. If the current combination becomes invalid, surface a canonical blocked/conflicting outcome rather than falsifying the historical evidence.

Unknown spreadable area may block whole-field TOTAL_VOLUME calculations later, but this task must not implement recommendation-rate or optimiser logic.

## C. Database migration requirements

Migration must be:

- additive and forward-only;
- non-destructive;
- safe for all existing rows;
- no false known-value backfills;
- owner/farm scoped consistently with existing RLS;
- no new public data exposure;
- no destructive replacement of existing physical-volume or field-area columns.

If tables are added, follow existing RLS/grant conventions.

If columns are added, null/default semantics must preserve unknown honestly.

Do not run `supabase db push --linked`.

Do not mutate Farm Return V1 Dev.

Static migration tests are acceptable for this task if no local PostgreSQL harness exists, but explicitly record that they are not real PostgreSQL execution.

## D. Canonical application persistence

Add or extend the minimum real farm-data read/write paths required to round-trip these facts.

On load:

- regulatory neat-slurry evidence must reconstruct the same canonical evidence meaning used by `slurry-regulatory-context`;
- spreadable area must reconstruct its canonical evidence meaning;
- missing DB values must remain missing;
- explicit zero must remain known zero;
- status/source/date must not be discarded.

On write:

- reject malformed/non-finite/negative values;
- reject spreadable area greater than known gross area;
- never coerce invalid data into zero;
- retain farm/owner scoping;
- do not add farmer-facing UI in this task.

## E. Required regression tests

Add focused tests proving at least:

1. existing store with no regulatory-neat evidence remains NOT_ESTABLISHED after mapping/reload;
2. physical store volume alone never becomes regulatory neat volume;
3. persisted known neat volume survives a mapper/persistence round trip;
4. persisted explicit 0 m3 remains known zero;
5. unavailable neat evidence remains unavailable after reload;
6. evidence status/source/date survive reload;
7. invalid neat evidence is rejected rather than coerced;
8. missing spreadable area remains missing — never gross area;
9. explicit spreadable area 0 ha remains known zero;
10. positive spreadable area survives round trip with provenance;
11. spreadable area > known gross area is rejected or returned as a canonical invalid/conflicting state — never silently clamped;
12. changing gross area does not silently rewrite historical spreadable-area evidence;
13. existing records migrate without acquiring false neat-slurry or spreadable-area facts;
14. no existing physical-volume or gross-area behaviour regresses.

Use existing domain vocabulary and evidence types where possible.

## F. Documentation/state

Update in the SAME commit:

- `docs/farm-return-next/BUILD_STATE.json`
- `docs/farm-return-next/IMPLEMENTATION_LOG.md`

Record:

- selected persistence design and why;
- exact distinction among physical volume, regulatory neat volume and agronomic composition;
- exact distinction between gross area and spreadable area;
- migration file(s);
- whether migration SQL has only static coverage or was executed against real PostgreSQL;
- explicitly: migration NOT applied to Farm Return V1 Dev;
- Campaign B remains partial after this task.

## STOP conditions

STOP rather than guessing if:

1. the distinction cannot be represented without changing a frozen contract outside this task's allowed vertical;
2. existing schema ownership/RLS semantics are insufficiently clear to add a safe migration;
3. implementing persistence would require deciding the unresolved home-produced grazing-manure statutory interpretation;
4. the existing app has two incompatible canonical concepts of spreadable area and there is no defensible choice;
5. migration would require destructive rewriting/backfilling of existing evidence.

If stopped, document the exact blocker with file/schema evidence. Do not invent a workaround.

## Scope exclusions

Do NOT:

- resolve the outstanding Table 15 / home-produced grazing-manure interpretation;
- add or alter statutory nutrient coefficients;
- implement Campaign C scientific rules;
- recommend slurry rates;
- optimise finite slurry allocation;
- wire this into What Matters;
- create new farmer-facing evidence forms;
- apply migrations to Dev;
- alter frozen Phase 5–11 behaviour beyond the minimal persistence adapters needed here.

## Verification

Run targeted tests for every changed domain/persistence/migration module.

Then run the full test suite.

Verify command: `npm run typecheck && npm run build`

Only report DONE if:
- targeted tests pass;
- full `npm test` passes;
- verify command passes;
- migration has NOT been applied to Farm Return V1 Dev;
- BUILD_STATE and IMPLEMENTATION_LOG are updated in the same commit.


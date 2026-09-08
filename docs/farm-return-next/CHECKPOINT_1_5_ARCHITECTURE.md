# Checkpoint 1.5 — Intelligence & Extensibility Architecture

Architecture-only checkpoint. No livestock feature, AI assistant, or new
integration ships in this checkpoint — see "What was deliberately not
built" below. This document is the factual record of what changed, what
was reused, and why, per the checkpoint brief's own documentation
requirement.

## Phase 0 — what already existed (inspection findings)

Before writing anything, the existing architecture was inspected for
every concept the brief names. Most of them already existed, several
fully maturely — this checkpoint's real job turned out to be mostly
*documenting and lightly extending* existing contracts, not building new
ones.

| Brief concept | Already existed as | Verdict |
|---|---|---|
| Provenance | `Provenance`/`TrackedValue<T>` (`types.ts`), `farmerAdjust`/`verify`/`hasFarmerInput` (`provenance.ts`) | Reused, unchanged |
| Confidence/knowledge state | `DataStatus` (`types.ts`); `EvidenceState` (`evidence.ts`); `JobEvidenceTier` (`job-session-evidence.ts`) — three purpose-built vocabularies, each answering a genuinely different question, each with its own doc comment explaining why it isn't the other two | Reused, unchanged. No fourth enum added — see below |
| Evidence (job-session-specific) | `ProvenanceEntry`/`ProvenanceOrigin`/`buildJobSessionProvenance` (`job-session-provenance.ts`) | Reused, unchanged |
| Structured scientific result | `EngineOutcome<T>`/`ok()`/`EvidenceState` (`evidence.ts`) — already fail-closed, already used in ~75 call sites | Extended, non-breaking (see below) |
| Source references | `SourceReference`/`SourceId`/`SOURCE_REGISTER` (`source-register.ts`) — a real, dated, URL-cited Teagasc/S.I./Met Éireann/CSO registry | Reused, unchanged. Wired into the new `CalculationExplanation.sourceIds` |
| Animal | `IndividualAnimal` (`types.ts`), real table `livestock_individuals` with a same-farm trigger | Reused, unchanged — a separate, disconnected future-shape type was added alongside it instead (Codex audit MEDIUM, round 1; see below) |
| AnimalGroup | `LivestockGroup` (`types.ts`) — already distinguishes grazing vs. housed (`system`), management intent (`goal`), category | Reused, **not** extended (see "duplicate abstraction avoided" below) |
| Measurement (animal weight specifically) | `WeightObservation` (`types.ts`), real table `livestock_weight_observations` with a same-farm trigger | Reused, unchanged; cited as the existing precedent for the new generic `Measurement<T>` |
| Farm scoping / ownership | `.eq("farm_id", farmId)` on every real query in `src/lib/farm-data/*.ts`, backed independently by database `*_check_same_farm` triggers (`supabase/migrations/20260828070000_cross_farm_integrity.sql` and later migrations) — client-supplied ownership is never trusted anywhere in this codebase already | Reused, unchanged. The new `FarmContext` builder adds a defence-in-depth re-check on top |
| Generic subject/target reference | Explicitly **rejected once already**: `supabase/migrations/20260829020000_jobs_weight_observation_reference.sql`'s own header comment chose a narrow, job-type-specific nullable FK over a generic `target_type`/`target_id` polymorphic column, reasoning that inventing the general shape for one caller "would be exactly the schema decision [a future general model] was trying to avoid pre-empting" | New TypeScript-only `SubjectRef` added (see below) — deliberately **not** retrofitted onto `job_sessions` or any other existing table |
| Activity/orchestration subject binding | `job_sessions.primaryFieldId`/`fieldSegments` (GPS Job Mode) is genuinely field-shaped; `activityType` is already a free string, not a closed field-only enum | Left **completely untouched** — GPS Job Mode is closed and not reopened. `SubjectRef` is available for a *future* non-field activity to use, without needing this contract to change first |
| External system id mapping | Did not exist | New (see below) |
| AI-readable farm context | Did not exist | New (see below) |

## What was added

### 1. `src/domain/subject.ts` — generic subject model (brief item 1)

`SubjectType` (`FARM`/`FIELD`/`ANIMAL`/`ANIMAL_GROUP`/`MACHINE`/
`BUILDING`/`INPUT`/`STORAGE`) and `SubjectRef` (`{ type, id }`, no
embedded farm id — see the module's own doc comment for why not). Pure
TypeScript, no migration, no change to any existing table. Consumed by
the two new contracts below (`Measurement`, `ExternalReference`), proving
the abstraction is load-bearing rather than declared and unused.

`job_sessions` was deliberately **not** given a `primarySubject` field in
this checkpoint — nothing today needs it (fertiliser spreading is the
only real vertical), and the codebase's own precedent above
(`jobs_weight_observation_reference.sql`) argues against inventing a
general schema shape ahead of a second real consumer.

**Precise claim, corrected after Codex audit MEDIUM (round 1,
2026-09-08)**: the first version of this document overstated this as
"the orchestration layer is not structurally limited to fields", already
achieved. It is not, yet — `job_sessions.primaryFieldId`/`fieldSegments`
remains the real, live, field-only Activity contract, and supporting a
genuinely non-field activity will still require changing that contract
(additively, as described above) or building a parallel association;
`SubjectRef` existing does not, by itself, make that change unnecessary.
What this checkpoint actually delivers is narrower and honestly stated
as such: a **proposed, reusable vocabulary** for that future change, with
two real consumers already proving it isn't merely declared and unused
(`Measurement`, `ExternalReference`) — not delivered field-independence
for `job_sessions` itself.

**`SubjectType`'s four not-yet-backed variants (`MACHINE`/`BUILDING`/
`INPUT`/`STORAGE`) were reviewed against Codex audit MEDIUM (round 1,
2026-09-08) and kept, not narrowed** — the checkpoint brief's own item 1
names these exact eight subjects verbatim ("The future conceptual
subjects include: FARM, FIELD, ANIMAL, ANIMAL_GROUP, MACHINE, BUILDING,
INPUT, STORAGE"), so narrowing the union would contradict an explicit
instruction, not merely a stylistic preference. The finding's underlying
concern — that this risks becoming the same premature generic-schema
decision `jobs_weight_observation_reference.sql` deliberately avoided —
is taken seriously but doesn't apply the same way here: that migration's
own concern was a *database* column with real query/index/trigger
consequences invented for one caller; `SubjectType` is a plain TypeScript
union with zero persistence and zero runtime resolution logic anywhere
in this checkpoint that assumes any of the four has a real backing
table. Adding a case costs nothing and resolves nothing on its own — see
`subject.ts`'s own `SUBJECT_TYPE_NOTES`, which already discloses,
variant by variant, which of the eight has no backing entity yet, so no
future reader is misled into thinking one exists.

### 2. `IndividualAnimal` — future shape documented, real entity unchanged (brief item 2)

**Corrected after Codex audit MEDIUM (round 1, 2026-09-08)**: the first
version of this checkpoint added `parentIds`/`lifecycleStatus` directly
onto `IndividualAnimal` itself — the real, persisted, round-tripped
entity `rowToIndividualAnimal` (`src/lib/farm-data/mappers.ts`) actually
returns. Since `livestock_individuals` has no backing columns for either
field, every real `IndividualAnimal` a caller ever saw would have had
them permanently `undefined` — indistinguishable from "this animal
genuinely has no parents", a materially misleading claim for a *live*
entity, unlike `ConcentrateFeedSpec`'s own honest "not yet a stored
entity" disclosure (that type is only ever a function parameter, never a
real record's own mapper output).

Fixed by moving both fields into a new, entirely separate
`FutureIndividualAnimalLifecycleFields` interface in `src/domain/types.ts`
— never merged into `IndividualAnimal`, never returned by any real
function. `IndividualAnimal` itself is back to its pre-checkpoint shape,
unchanged. A future breeding/movement feature that actually implements
this extends `IndividualAnimal`'s real schema/mapper/input types
*together, in the same commit* — this checkpoint does not migrate a live
table to satisfy a feature that does not exist yet.

**`LivestockGroup` was deliberately left unchanged** — it already
distinguishes grazing/housed (`system`) and management intent (`goal`);
adding a redundant `groupKind` alongside those would have been exactly
the "duplicate abstraction merely because it appears in the brief" the
checkpoint brief itself warns against. `LivestockGroup` is documented
(`subject.ts`'s own `SUBJECT_TYPE_NOTES`) as the existing `ANIMAL_GROUP`
anchor.

### 3. Activity extensibility (brief item 3)

No code change. `job_sessions`/`job_actuals` (GPS Job Mode) are
untouched, per the campaign's own explicit "do not reopen" instruction.
`activityType` was already a free string before this checkpoint — it was
never closed to a field-only enum. Documented here as the real,
inspected finding, not asserted without checking.

### 4. `src/domain/measurement.ts` — generic Measurement (brief item 4)

`Measurement<T>` — `subject` (a `SubjectRef`), `value`, `unit?`,
`occurredAt`, `recordedAt`, `origin` (a new small closed vocabulary, see
below), `source` (free text), `status` (**reuses `DataStatus`** — no new
confidence enum), `evidence?` (`EvidenceItem[]`), `previous?` (the same
never-overwrite-provenance chain `TrackedValue`/`JobEvidenceValue`
already use). Plus `reviseMeasurement()`, mirroring
`farmerAdjust`/`verify`/`reviseActualValue`'s own revision discipline.

**Not** a retrofit of `WeightObservation` — that type is real, live,
tested, and cross-farm-enforced already; retyping it would touch a
working feature for no functional benefit, exactly the churn this
checkpoint's brief says to avoid. `Measurement<T>` is the pattern a
*genuinely new* measurement kind (grass cover, soil moisture, machinery
telemetry — none of which have a bespoke table yet) should follow. It has
no persistence of its own in this checkpoint.

**Farm-scoping fix, Codex audit CRITICAL (round 1, 2026-09-08)**: the
first version of `reviseMeasurement` accepted a revision whose own
`farmId`/`subject` differed from the measurement being revised, chaining
the original under the new one's `.previous` regardless — a real
cross-farm relation (one farm's data embedded inside another farm's own
provenance chain), exactly the class of bug this checkpoint's own
non-negotiable invariant exists to prevent. `reviseMeasurement` now
throws if `farmId` or `subject` would change (a revision is a correction
to the *same* real-world measurement; a different farm or subject is a
new `Measurement`). `measurement()`/`reviseMeasurement()` also now both
reject any attached `EvidenceItem` whose own `externalReference.farmId`
doesn't match the measurement's own farm — the same invariant applied to
evidence, not just the measurement itself.

**Round 1's fix was itself incomplete, Codex audit CRITICAL (round 2,
2026-09-08)**: it validated only `reviseMeasurement`'s two arguments —
`measurement()` (the more primitive constructor, callable directly, not
only through `reviseMeasurement`) accepted an arbitrary `previous` with
no validation at all, and a mismatch buried two or more revisions deep
(not just the immediate parent) was never checked. `measurement()` now
walks the entire `.previous` chain itself, checking every node's own
farm/subject/evidence, and `reviseMeasurement` delegates its final
construction to `measurement()` so there is exactly one real choke
point. The evidence array is also now copied at construction (round 1's
own shallow spread left it as the caller's exact same array, mutable
after the fact).

**Round 2's copy was itself incomplete, Codex audit CRITICAL (round 3,
2026-09-08)**: copying the `evidence` *array* left each `EvidenceItem`
inside it, that item's own `externalReference`, and the measurement's
own `subject` as the caller's exact same objects — mutating
`evidence[0].externalReference.farmId` (or `subject.id`) *after*
construction would silently reopen the invariant without ever calling
`measurement()` again. Fixed comprehensively: `subject`, `evidence`
(each item and its `externalReference`), and the entire inherited
`.previous` chain are now copied into fresh objects and frozen with
`Object.freeze` — a later mutation attempt genuinely throws (ES module
strict mode), not just fails silently. `Measurement.evidence` is now
typed `readonly EvidenceItem[]`, matching its real runtime shape. A
cyclic `.previous` chain (only reachable via a hand-crafted object, not
through normal construction) is rejected outright rather than looping
forever, via a visited-node `Set` in the chain validator.

**Round 3's freeze check was itself spoofable, Codex audit CRITICAL
(round 4, 2026-09-08)**: the `.previous`-chain freezer short-circuited
whenever a node's own top level already read as `Object.isFrozen`,
treating that as proof its *whole* subtree was safe — but
`Object.freeze` is shallow, so a caller could hand in
`Object.freeze({ ...someMeasurement, subject: mutableSubject, evidence:
[mutableItem] })`: the node itself reads as frozen, the shortcut
returned immediately, and `subject`/`evidence` stayed fully mutable
underneath. The shortcut is removed entirely — every node in the
`.previous` chain is now unconditionally walked and frozen (a genuine
no-op, at worst, for a node already correctly frozen), closing the last
spoofable path.

### 5/6/7. Provenance, confidence, evidence (brief items 5–7)

No new confidence enum. The existing three (`DataStatus`, `EvidenceState`,
`JobEvidenceTier`) already cover every distinct question this app asks —
see the table above and each module's own doc comment for the reasoning
already recorded before this checkpoint began. `Measurement.status`
reuses `DataStatus` directly.

One new file, `src/domain/evidence-item.ts` — `EvidenceKind`
(`gps_trace`/`farmer_confirmation`/`photo`/`receipt`/
`weigh_head_measurement`/`sensor_reading`/`laboratory_result`/`other`)
and `EvidenceItem` (`kind`, `description`, `capturedAt?`,
`externalReference?`). Deliberately named and documented to avoid
confusion with `evidence.ts`'s `EvidenceState` (a different concept —
"how strong is the scientific basis" vs. "what concrete thing backs this
value"). No media upload or hardware integration — an `EvidenceItem`
only describes that evidence exists.

One new small vocabulary, `Measurement.origin`
(`MeasurementOrigin` in `measurement.ts`) — `farmer_entered`/`phone_gps`/
`farm_return_calculation`/`met_eireann`/`teagasc`/`satellite_estimate`/
`laboratory_result`/`sensor`/`eid_or_weigh_head`/`imported_dataset`/
`external_api`/`ai_inferred`, matching the brief's own list. This is the
one genuinely new enum this checkpoint adds — justified because none of
the three existing tier vocabularies, nor `ObservationSource`
(`src/orchestration/observe/index.ts`, ingestion-time origin), answer
"which kind of external/computed origin produced this specific reading",
and `Measurement` is a real, new consumer for it.

### 8/9. Structured scientific results + source references (brief items 8–9)

`evidence.ts` is a frozen contract. This is a **non-breaking, additive**
change (`DOMAIN_CONTRACTS.md`'s own carve-out — a new optional parameter
with a default reproducing prior behaviour), not a step-4 contract
change: `ok<T>(value, evidenceState, explain?)` gained an optional third
parameter, and `EngineOutcome`'s `"OK"` branch gained an optional
`explain?: CalculationExplanation` field (`inputs?`, `assumptions?`,
`warnings?`, `sourceIds?: SourceId[]`, `calculatedAt?`). Every one of the
codebase's ~75 existing `ok()` call sites is unaffected — `explain` is
`undefined` unless a caller opts in, and the field is genuinely absent
from the object (not present-and-`undefined`) when omitted, verified by
`evidence.test.ts`'s own new tests.

`sourceIds` cites `source-register.ts`'s existing `SourceId` union
directly — no new citation registry, no fabricated source. No existing
calculation was changed to populate `explain` in this checkpoint (that
would be scope creep into real calculation changes, which the brief
explicitly says to avoid — "do not blindly wrap every calculation").

### 10. `src/domain/external-reference.ts` — external system ids (brief item 10)

`ExternalSystemKind` (`government_animal_system`/`eid`/`weigh_head`/
`accounting`/`machinery_telemetry`/`laboratory_system`/`other`) and
`ExternalReference` (`farmId`, `subject: SubjectRef`, `system`,
`externalId`, `capturedAt?`, `source?`). TypeScript contract only — no
table, no migration, no integration. Explicitly documented as the
general shape `jobs_weight_observation_reference.sql`'s own migration
comment predicted a future need for, without pre-empting that decision
now.

### 11/12/13. AI-readable farm context + tool/write boundary (brief items 11–13)

`src/orchestration/ai-context/index.ts` — the one genuinely new, real,
*working* piece this checkpoint ships (not just a type):

- `FarmContext`/`FarmContextInputs`/`buildFarmContext()` — a pure
  assembly function, deterministic given its arguments (`generatedAt` has
  no default — Codex audit LOW, round 1, 2026-09-08: an earlier version
  defaulted it to `new Date().toISOString()`, which made "deterministic"
  false for a caller that omitted it; the one real caller now always
  supplies it explicitly). Bounded (field/animal-group summaries plus an
  animal count, not full records), farm-scoped, and defensive: it
  re-filters every supplied collection against the requested `farmId` and
  throws if the farm itself doesn't match, rather than trusting its own
  inputs were already correctly scoped.
  **Provenance-preserving, Codex audit HIGH (round 1, 2026-09-08)**: the
  first version returned a bare `.value` for a field's `plannedUse`/a
  group's `count`, stripping the `status`/`source` every `TrackedValue`
  in this app already carries — exactly the "is this farmer-verified or
  estimated" distinction a future AI answer needs, and exactly what this
  whole checkpoint is meant to preserve. Both now carry
  `{ value, status, source }`, not the full `.previous` history (the
  snapshot stays bounded; history is available from the real record
  itself via its own `id`).
- `getFarmContextForCurrentUser()` — the real, callable entry point.
  Takes **no farm id parameter at all**; it always resolves the current
  authenticated session's own farm via the existing
  `getFarmForCurrentUser()`, then calls the existing
  `listFieldsForFarm`/`listLivestockGroupsForFarm`/
  `listIndividualAnimalsForFarm` — no new query, no new table.

No LLM, no prompt template, no embeddings, no chat UI. This module does
not know an AI assistant will ever call it.

**The read/write boundary** (documented in the module's own header
comment, restated here per the brief's item 13): reading farm context may
happen without confirmation; a future AI **action** that changes farm
state must go through the ordinary application/domain commands this app
already has (`act/index.ts`, `job-session/index.ts`, real
`src/app/actions/*.ts` server actions) — never a direct database write
invented for AI's own convenience — and the scientific/domain engines
remain the sole source of truth for every calculation an AI might
explain. Nothing in this checkpoint enforces this against a real AI
caller, because none exists yet; it is a documented invariant for
whichever future code adds one.

## What was deliberately NOT built

Per the checkpoint brief's own guardrails, none of the following exist
after this checkpoint: an AI chat screen, any LLM/Claude/ChatGPT
integration, embeddings or a vector database, an autonomous agent, any
livestock/medicine/calving/breeding/movement UI, EID hardware support,
a government submission integration, an accounting/supplier integration,
any new GPS feature, background GPS, or a mobile shell. No database
migration was written. `LivestockGroup` was not extended (see above —
avoiding a duplicate abstraction). `WeightObservation` was not retyped.
`job_sessions`/`job_actuals`/GPS Job Mode were not touched.

## Evidence register

No new `docs/evidence-register.md` entry was added for this checkpoint's
new modules. `SCIENTIFIC_RULES.md`'s "New Next-only calculations" rule
requires one for "a new domain calculation" before it "reaches a
production screen as anything other than explicitly-labelled sample
data" — none of this checkpoint's new code computes an agronomic,
regulatory, or financial figure (they are pure shape/type definitions
plus a data-shaping read model, `buildFarmContext`, analogous to
`job-session-provenance.ts`'s own `buildJobSessionProvenance`, which
similarly has real logic but no evidence-register entry because it
produces no scientific/regulatory number either), and none of it is
wired into any production screen at all.

## Migrations

None. Every new concept in this checkpoint is a pure TypeScript domain
contract with no persistence of its own (see each section above) — the
brief's own "do not create migrations simply to satisfy theoretical
future needs if TypeScript/domain contracts are sufficient for now" rule
was the deciding factor for every one of them.

## Farm-scoping invariant — how this checkpoint honours it

- `SubjectRef` carries no farm id of its own, by design — a reference is
  never itself an ownership claim; whatever eventually *resolves* one
  must do so through a real, farm-scoped query (see `subject.ts`'s own
  doc comment).
- `ExternalReference`/`Measurement` both require `farmId` explicitly on
  every instance, so a future persisted table for either has a real
  column to enforce against — but enforcement itself, when that table
  exists, must be a database trigger (`*_check_same_farm`), matching
  every other farm-scoped table in this app; a TypeScript field alone is
  documented, not claimed, as sufficient.
- `getFarmContextForCurrentUser()` cannot be asked for another farm's
  context — there is no parameter for one.
- `buildFarmContext()` re-validates every input collection's own `farmId`
  and drops (fields/groups/animals) or throws (the farm itself)
  on a mismatch, rather than trusting its caller. Covered by a dedicated
  regression test (`ai-context/index.test.ts`'s "Codex-relevant
  farm-scoping regression" case) constructing exactly the cross-farm
  input shape a real bug would produce.

## Future extension points

- A second real Activity vertical (beyond fertiliser spreading) that
  needs a non-field subject can add `primarySubject?: SubjectRef`
  additively to `job_sessions`/`JobSessionRecord`, alongside — never
  replacing — `primaryFieldId`/`fieldSegments`.
- A real EID/weigh-head/accounting integration can persist
  `ExternalReference` once it exists, with a same-farm trigger checked
  against the real entity `subject` resolves to.
- A real new measurement kind (grass cover, soil moisture) can persist
  `Measurement<T>` once a real feature needs it, with the same same-farm
  discipline.
- A future calculation can populate `EngineOutcome.explain` incrementally,
  one module at a time, with zero impact on any consumer that doesn't
  read it yet.
- A future AI assistant calls `getFarmContextForCurrentUser()` (or a
  similarly-shaped, purpose-specific read function added the same way)
  for reads, and the existing domain/orchestration commands for writes.

## Known limitations

- `FarmContext` does not yet include weather-derived state, scientific
  results (nutrient plans, spreading suitability), upcoming jobs, or
  activities/actuals — a real, disclosed gap (see the type's own doc
  comment), not silently omitted. Extending it is additive when a real
  question needs one of those.
- `docs/data-model.md` (the V1-era source-of-truth document) already
  predates `IndividualAnimal`/`WeightObservation` entirely (a pre-existing
  gap from "Real Mode Completion Phase 12", not introduced by this
  checkpoint) and was not retroactively reconciled here — out of scope
  for an architecture-only checkpoint; `DOMAIN_CONTRACTS.md` and this
  document are the current, actively-maintained source of truth for Farm
  Return Next work.
- No real AI caller exists to test the read/write boundary against in
  practice — it is a documented convention, not a code-enforced one, for
  the reasons given in section 11–13 above.

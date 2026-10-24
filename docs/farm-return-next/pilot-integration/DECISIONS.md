# Pilot Integration — durable decisions

Only architectural and product decisions that later phases must respect. No implementation history.

## D1 — One production cattle model (P0)

The existing tables are the only production source of truth for cattle:
- `livestock_groups`;
- `livestock_individuals`;
- `livestock_weight_observations`;
- `farms`;
- `housing`.

The frozen cattle model (C1 ledgers, C4 weight records) is an evaluation view rebuilt from those rows on each
request. It is never stored as a second model. No cattle-specific table duplicates an animal, group or weight.

## D2 — Animal identity (P0)

One animal is identified by `livestock_individuals.id` (uuid) at every layer:

| Layer | Identity |
|---|---|
| Database | `livestock_individuals.id`, owned by `farm_id` |
| Frozen engines | C1 `animalId` = that uuid string (an opaque `FarmReturnAnimalId`) |
| C10 view-models | `animalId` = that uuid |
| Real route | `/cattle/animals/<uuid>`. In P1 the existing `[tag]` segment is read as the animal id in real mode; demo mode keeps the tag. |
| `/livestock` | the same uuid (`IndividualAnimal.id`) |

The rules:
- **Tag:** `tag_number` is a farmer-facing label, not identity. It is nullable, has no uniqueness constraint, and
  is never used to look an animal up in real mode. It becomes a C1 `EXTERNAL_IDENTIFIER` with scheme
  `FARM_RETURN_TAG_NUMBER`, verbatim and unnormalised. A missing tag is shown as not recorded.
- **Group:** `livestock_groups.id` (uuid) is the C1 `MANAGEMENT_GROUP` value, the C4 `groupRef` and the group route
  segment. `label` is a display label only.
- **Farm isolation:** the farm id is never part of an engine id. It is enforced at the source read (D6).
- **No collision with demo:** demo ids are `SYNTH-*` and exist only when Supabase is not configured, so real and
  demo identities never share a process. Real-mode output must contain no `SYNTH-` id.

## D3 — Field mapping (P0)

`real field → adapter → frozen input`. `—` means not asserted, so the frozen engine reports its own
unknown or not-recorded state. Nothing is defaulted.

| Real field | Adapter | Frozen input |
|---|---|---|
| `livestock_individuals.id` | as is | C1 `animalId`, C4 `animalId` |
| `tag_number` | non-null → assertion, `validFrom = created_at` | `EXTERNAL_IDENTIFIER {scheme FARM_RETURN_TAG_NUMBER, identifier}`; null → — |
| `date_of_birth` (date) | non-null → `YYYY-MM-DD` | `DATE_OF_BIRTH`; null → — |
| `sex` `male`/`female` | upper-case | `SEX MALE`/`FEMALE`; null → — |
| `breed` (text) | `{codeSystem:null, code:null, label, components:[]}` | `BREED`; null → — |
| `category` (suckler_cow…) | not mapped (C1 has no production class) | — (shown on `/livestock` only) |
| status | **no column exists** | — (no `LIFECYCLE_STATUS`; never assumed `PRESENT`) |
| `group_id` | non-null → assertion, `validFrom = created_at` (D4) | `MANAGEMENT_GROUP <group uuid>`; null → ungrouped |
| location / housing per animal | **no column exists** | — (location not recorded) |
| `livestock_groups.housing_id` | not attributed to animals | — (group housing is not animal location) |
| `goal_status` (free text) | not parsed | — (not a C6 declaration) |
| `livestock_weight_observations.id` | as is | C4 `recordId`, `provenance.sourceRecordRef` |
| `weight_kg` | as is | `weight {value, unit: KILOGRAM}` |
| `observed_date` (date) | `<date>T00:00:00Z` (D5) | C4 `observedAt` |
| `source` (free text) | not parsed, not copied into the engine | stays on the row; reachable via `provenance.sourceRecordRef` |
| method / basis | **no column exists** | `method: UNKNOWN` → basis UNKNOWN, "Method not recorded" |
| weight `created_at` | as is | `provenance.receivedAt` (knowledge time) |
| animal `created_at` | as is | assertion `provenance.receivedAt` |
| who entered it | the farm's own record | `provenance.sourceCategory: FARMER` |

Every assertion and weight carries `sourceSystem: "farm-return"` and `sourceRecordRef: <row id>`.
Weights carry `deviceRef`, `quality` and `conditionsNote` as `null`, and `supersedes` as `[]` (the table is
insert-only).

## D4 — Group membership time (P0)

C1 needs a `validFrom` for a membership. The application never updates `livestock_individuals`: there is no
reassignment path, so `group_id` is fixed at insert. Membership is therefore asserted from the row's
`created_at`, which is the earliest instant Farm Return knew it. When a reassignment write is added later, it
must record dated membership history. Overwriting `group_id` in place would make this assertion false.

## D5 — Evaluation time (P0)

Real mode evaluates at one viewpoint per request: `effectiveAt = knowledgeCutoff =` the server's request instant,
truncated to whole seconds. Demo mode keeps its fixture viewpoint. A date-only real weight is placed at 00:00 UTC
of its date, so a weight recorded today is in view at once. Precision is still the date, and the UI never shows a
time for it.

## D6 — Tenant boundary (P0)

The farm is resolved server-side only, by `getFarmForCurrentUser()` (auth-verified user → that user's single farm;
`farms_user_id_unique`). The adapter:
- reads groups, animals and weights with `.eq("farm_id", farm.id)`, under RLS that already limits every
  `livestock_*` row to the farm's owner;
- resolves a route animal or group id only within that farm-scoped result;
- handles an id that is unknown, malformed or from another farm identically: `notFound`, with no existence signal.

Database triggers (`*_check_same_farm`) keep group membership and weights on the same farm as the animal. No
real-mode function accepts a `farmId` from the client.

## D7 — What the integration may change (P0)

- **May change** where integration evidence requires it: the routes `src/app/(app)/cattle/**` and the components
  `src/components/cattle/**`. This covers the mode switch, linking by `animalId`, hiding demo-session controls in
  real mode, and real-mode explanatory copy.
- **Must not change:**
  - `src/domain/cattle/**` (including the presentation builders);
  - `src/domain/plan/**`;
  - `src/domain/animal-plan/**`;
  - the demo data.

Composition around the frozen builders, such as listing ungrouped animals by building their profiles, is
preferred over editing them.

## D8 — Parts with no real store (P0)

Farm Return holds no real records for the following parts:
- health and medicine (C3);
- obligations (C2);
- programmes (C7);
- performance targets and policies (C5 comparison);
- goal declarations (C6);
- mart prices or cost ledger for the plan.

In real mode, each of these is passed as not supplied:
- `null` in the C8/C9 request;
- no per-animal C3/C6 run;
- `costs: UNAVAILABLE`.

They are never passed as an empty fixture-like catalogue, so that the frozen engines report unknown, not "none".
The frozen C8 default candidate-action registry is used unchanged. Choosing a different registry is a policy
decision that needs explicit authorisation.

## D9 — Work in P1 (P0)

There is no persisted Plan job store. In P1, Work is the current C9 evaluation at the request viewpoint: one run,
with jobs created fresh from its proposals. It is labelled as a current evaluation. Retained job lifecycle
(completion, deferral, continuity of when a job was raised) is out of P1 and needs its own persistence decision.
The shared job-reconciliation logic is reached from a neutral module, never by importing `src/server/cattle-demo/`.

## D10 — Weight writes reuse the existing path (P0, for P2)

Real weights are written only through `addWeightObservation` (`livestock_weight_observations`, insert-only,
same-farm trigger). C10 Record Weight in real mode must reuse it via a server action that resolves the farm
server-side. Collection method needs a new nullable column, which is a P2 migration (see STATE.md).

## D11 — "Not in a group" (P1)

A null `livestock_individuals.group_id` is a recorded fact: the animal is not assigned to a group. Frozen C1 cannot
express "no group", because no `MANAGEMENT_GROUP` assertion means unknown, so C4 would show an ungrouped animal as an
unresolved member of every group. The adapter therefore:
- resolves each C4 group scope over the animals that have a recorded group;
- lists ungrouped animals separately;
- gives C9 no group scopes, because all real work is per animal.

This changes no frozen semantics: it chooses the population a scope is resolved over. If group-level work is ever
planned, this decision must be revisited.

## D12 — Weighing method is not stored (P2)

The C10 sheet never asked the farmer how the animal was weighed: its "Recorded as a scale weighing" line was a
demonstration claim. Storing SCALE for real entries would fabricate evidence, so P2 adds no `method` column (option
A, no migration):
- the real sheet says the weight is saved with the method not recorded;
- every real weight reads back as C4 `method: UNKNOWN`.

A method column is added only together with a real farmer choice of method. That needs a nullable column constrained
to C4 `WEIGHT_COLLECTION_METHODS`, with old rows read as UNKNOWN.

**Dates:**
- **Stored date:** the farmer's calendar date in Ireland (`Europe/Dublin`). "Now" is decided by the server at save
  time, and later dates are refused.
- **Engine time:** unchanged from D5, 00:00 UTC of that date, so the date never drifts.
- **Accepted edge:** a weight dated "today" that is saved between 00:00 and 01:00 Irish summer time only comes into
  the engine's view at 01:00 (00:00 UTC).
- **Same-day weights:** two different weights on the same date compete under frozen C4, so the latest weight shows as
  a conflict and neither is taken as latest.

## D13 — Weight-write idempotency (P2)

Each opening of the Record Weight sheet generates one submission id (a uuid), which becomes the row's primary key. This
is the repository's existing client-generated-id pattern (`insertSoilCoreObservation`, `insertJobSession`).

| Case | Result |
|---|---|
| The same submission arrives again (double press, network retry, action retry) | It hits the primary key (`23505`) and returns the row it created. |
| The same id arrives with a different animal, kg, date or source | `DUPLICATE_CONFLICT`. Nothing is written or overwritten. |
| The id belongs to a row this farm can't see | `DUPLICATE_CONFLICT`. Nothing is written or overwritten. |
| A new opening of the sheet | A new id, so a legitimate second weight with the same animal, date and kg is a second row. |

Duplicates are never detected by content. No migration was needed, because `id` was already a uuid primary key.

# Pilot Integration — state

| | |
|---|---|
| Current phase | P0 complete → P1 next (not started) |
| Branch | `pilot-integration-v1` (from `campaign-cattle-engine-v1` @ `59fff03`, cattle-engine-v1 CLOSED, C10 frozen at `510f003`) |
| Implementation SHA | `59fff03`: no Pilot Integration production code yet (P0 is documents only) |
| Status | `READY_FOR_P1_REAL_CATTLE_READS` |
| Verification | Schema, repositories, RLS and triggers read. A throwaway probe (not committed) ran real-shaped ledgers through the frozen C1, C4, C5, C8, C9 and C10 builders with all fixture parts `null`: everything accepted, the herd and profile rendered, weight basis "Method not recorded". |
| Open blocker | none |
| Pushed | no |

## Next action: P1 real cattle reads (read-only)

**New files:**
- `src/lib/farm-data/cattle-source.ts`: a `server-only`, farm-scoped reader of groups, individuals and weights,
  including `created_at`.
  - It pages weights, or fails closed if a page is full. `listWeightObservationsForFarm` is unbounded and
    PostgREST caps rows, so history would silently truncate.
- `src/server/cattle-real/real-records.ts`: pure rows → C1 ledgers, C4 records and `CattleDirectory`, per D3–D5.
- `src/server/cattle-real/real-service.ts`: a `server-only` single-viewpoint run of the frozen exports.
  - Runs C1, C4 group scopes, C5 (no targets), C8/C9 with D8 parts `null`, and jobs per D9.
  - Produces `realHerdView(farm)` and `realAnimalView(farm, animalId)`.
  - Defines its own `node:crypto` sha256 `CattleHash`, never `test-fixtures`.
- The shared reconcile logic is moved to a neutral server module, re-exported by `demo-replay.ts` with no
  behaviour change (D9).
- Tests: `src/server/cattle-real/*.test.ts`, with a mocked Supabase client for the reader.

**Changed files:**
- `src/app/(app)/cattle/page.tsx`, `groups/[groupRef]/page.tsx` and `animals/[tag]/page.tsx`: in real mode, resolve
  the farm server-side and show the real view.
  - No farm → `CattleUnavailable`.
  - Unknown or foreign id → `notFound`.
- `animals/[tag]/plan/page.tsx`: in real mode, an explicit "selling plan unavailable: no mart prices or costs
  recorded" state.
- `src/components/cattle/HerdScreens.tsx`, `AnimalProfileScreen.tsx` (and the `CattleUnavailable` copy): add a
  mode prop.
  - Real mode links by `animalId`.
  - Real mode hides demo-session controls: Record Weight, goal and plan edits, reset, and scenario.
  - Real mode never calls the demo server actions.
  - Real mode adds a short "not kept in Farm Return yet" line where a D8 part shows as unavailable.
- A small real-mode list of ungrouped animals and headcount-only groups (groups with no individual animals). They
  must not appear as "0 animals" or vanish.
- No change to `src/domain/**`, `src/server/cattle-demo/**` or the schema.

**Acceptance:**
1. A signed-in farmer's `/cattle` shows their real groups (labels), animals (tag or "not recorded", sex, breed,
   age from DOB) and weights, with history and latest weight. Basis shows "Method not recorded".
2. C5 ADG and trend show where at least two real weights exist. Target comparison shows as not available. A
   projection is shown only if C5 produces one.
3. Ungrouped animals and headcount-only groups are visible and correctly described.
4. Health, goals, programmes, obligations, costs, mart and plan show as unavailable or not recorded, never "none"
   or €0.
5. Real-mode output contains no `SYNTH-` id, demo label, fixture price, cost, target or programme. A test asserts
   this over the whole serialised view.
6. Tenant tests:
   - farm B's animal id or group id on farm A's routes → `notFound`, identical to a nonexistent id;
   - the reader filters every query by the server-resolved farm;
   - no real-mode function takes `farmId` from the client.
7. No farm, or a read failure → an explicit unavailable state, never demo data.
8. An invalid stored weight (e.g. ≤ 0, no DB check) → explicit weights-unavailable, never silently dropped.
9. Demo mode (Supabase unconfigured) is unchanged: the existing C10 suites pass.
10. Phase completion: the cattle and affected suites, typecheck, lint, build, and a signed-in browser journey on
    Farm Return V1 Dev. No full gate unless the change turns out to be broad.

## P2 preview: Record Weight

- **Where weights are stored:** `livestock_weight_observations`. Columns: `farm_id`, `animal_id`, `weight_kg`,
  `observed_date` (date), `source` (free text), `created_at`. The table is insert-only, has RLS owner policies and a
  same-farm trigger.
- **How a weight is written:** `addWeightObservation` (`src/lib/farm-data/individual-animals.ts`).
  - Callers: `addWeightObservationAction` (`/livestock`, source `"Farmer entered"`) and
    `actRecordWeightObservation` (orchestration).
  - The action takes `farmId` from the client. RLS and the trigger stop cross-farm writes, but P2's cattle action
    must resolve the farm server-side.
- **Metadata kept:** date, kg and free-text source. There is no method/basis, no unit (kg implied), no time of day,
  no device and no idempotency key.
- **What C10 reuse needs:**
  - a real-mode server action that calls `addWeightObservation`, validating kg > 0 and a date;
  - `revalidatePath` of `/cattle` and `/livestock`;
  - re-evaluation by reload.
- **Schema change:** recording method needs one forward-only migration: a nullable `method` column checked
  against C4 `WEIGHT_COLLECTION_METHODS`, with null mapping to `UNKNOWN`. Duplicate-submit protection
  (idempotency key) is optional and is the P2 decision.

## Known gaps (affecting P1/P2 only)

- **Fixed in P1:** weight reads are unbounded, and PostgREST truncates them silently.
- **Missing columns:** no lifecycle status, no per-animal location or housing, and no weight method. These are
  shown as not recorded. Method is addressed in P2.
- **Free-text goals:** `goal_status` is not a C6 goal, so C10 shows no declared goal while `/livestock` may show
  the free text. To be resolved in P3.
- **Programme recommendations:** with programmes not supplied, frozen C8 still raises a not-actionable
  "complete programme action — insufficient evidence" recommendation for animals with a date of birth, and C9
  turns it into work. P1 shows it as the engine reports it. Suppressing it would be a registry or policy decision.
- **Unavailable copy:** frozen "couldn't be read" wording is written for failures. P1 adds real-mode context
  lines rather than editing the frozen display states.
- **Mart prices:** a real `market_price_observations` table exists. Connecting it to the plan's mart provider is
  later work. Until then, the plan is unavailable in real mode.

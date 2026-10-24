# Pilot Integration — state

| | |
|---|---|
| Current phase | P1 complete → P2 next (not started) |
| Branch | `pilot-integration-v1` (P0 docs `9f6a1cb`) |
| Implementation SHA | `ef9f12f` (P1 real cattle reads) |
| Status | `READY_FOR_P2_REAL_CATTLE_WRITES` |
| Pushed | no |
| Open blocker | none |

## What P1 delivered

A signed-in farmer's `/cattle` reads the farm's own records. Read-only: nothing is written.

The read path:
1. `getFarmForCurrentUser` resolves the farm server-side.
2. `src/lib/farm-data/cattle-source.ts` reads that farm's rows. Groups come from the existing reader. Individuals
   and weights are paged with an exact count, and the read fails closed on a mismatch.
3. `src/server/cattle-real/real-records.ts` translates the rows (pure, D3–D5).
4. `src/server/cattle-real/real-service.ts` runs the frozen C1/C4/C5/C8/C9/Plan exports at one viewpoint, with the
   D8 parts not supplied.
5. The C10 view builders produce the view-models.
6. The real screens render them: `RealHerdScreen`, `RealGroupScreen` and `RealAnimalProfileScreen`.

**What the screens show:**
- **Herd and groups:** real groups and animals, linked by uuid. Animals with no group are listed separately.
  Headcount-only groups are shown as "N head on Livestock · individual animals not recorded". A group whose
  Livestock headcount differs from its individually recorded animals says so.
- **Animal:** tag (or "not recorded"), sex, breed, age, group, weight history and latest weight. Every weight's
  method shows as "Method not recorded".
- **Performance:** C5 gain is shown where two or more weights exist. With no target held, the profile says "No target
  set". There is no projection.
- **Not held in Farm Return:** health, costs and goal show as unknown, with a real-mode note.
- **Work:** the frozen engine's current proposals, including the not-actionable programme item.
- **Animal plan:** shown as unavailable.

**Demo mode is unchanged:** it still serves the tag routes, Record Weight, plan, photos and controls.

**Read failures:** no farm, or a read that fails or is incomplete, gives an explicit unavailable screen.

**Other changes:**
- The Plan-job reconciliation moved unchanged to `src/server/cattle-plan/plan-jobs.ts` (D9), and
  `demo-replay.ts` re-exports it.
- `CattleUnavailable` copy is now supplied by the real service.
- No change to `src/domain/**`, the schema or the demo data.

## Verification (P1)

**Targeted tests:** 35 pass.
- `cattle-source.test.ts` (7): pagination under a 400-row server cap, fail-closed paths, farm filter.
- `real-cattle.test.tsx` (28): all 18 brief cases, tenant isolation, and the demo-import graph check. The
  demo-import check was shown to fail when a demo import was planted.

**Affected suites:** 99 files, 2,191 tests pass. These cover `src/components/cattle` (the complete C10 suite),
`src/server`, `src/domain/cattle`, `src/domain/plan`, `src/domain/animal-plan`, `src/lib/farm-data`, the app routes
and the actions.

**Typecheck, lint and build:**
- Typecheck is clean.
- Lint shows 0 errors; the only warnings are the 2 pre-existing ones in frozen C8.
- The build passes, with all four cattle routes dynamic.

**Browser:**
- **Real mode:** on a local production server, every cattle route redirects unauthenticated requests to `/sign-in`.
- **Demo mode:** a dev server with Supabase unset still renders the demonstration herd, tag links and demo controls.
- **Not done: the signed-in journey.** No dev test account was available to the agent, and creating one means signing
  up on the hosted Supabase. That step is still to be done by a person (see Next action).

**Not run, by design:** the full quality gate, Codex, and an independent audit.

## Next action

1. **(Person, optional before P2.)** Sign in to Farm Return V1 Dev locally, with a farm that has groups, animals and
   weights on `/livestock`. Then walk Cattle → group → animal and confirm the P1 behaviour above.
2. **P2: real cattle writes.** Start with Record Weight:
   - add a real-mode server action that resolves the farm server-side and calls `addWeightObservation`, validating
     kg > 0 and the date;
   - revalidate `/cattle` and `/livestock`;
   - add a forward-only migration for a nullable `method` column (checked against C4 `WEIGHT_COLLECTION_METHODS`,
     null mapping to `UNKNOWN`), and map it in `real-records.ts`;
   - decide duplicate-submit protection;
   - run the full quality gate after the first write path.

## Known gaps (affecting P2+)

- **Goals:** `goal_status` free text is not a C6 goal (a P3 issue).
- **Work persistence:** Work is re-evaluated on each load, and jobs are not persisted (D9).
- **Frozen copy:** some frozen "couldn't be read" wording is meant for failures. Real-mode notes give the context
  beside it.
- **Mart prices:** the real `market_price_observations` table is not connected, so the plan stays unavailable.
- **Group reassignment:** must record dated history (D4).

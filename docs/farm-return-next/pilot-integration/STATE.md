# Pilot Integration — state

| | |
|---|---|
| Current phase | P2 complete → P3 next (not started) |
| Branch | `pilot-integration-v1` (P0 `9f6a1cb`, P1 `ef9f12f` / `f2673f0`) |
| Implementation SHA | `867bdb2` (P2 real Record Weight) |
| Status | `READY_FOR_P3_ONE_CATTLE_PRODUCT` |
| Pushed | no |
| Open blocker | none |

## What P2 delivered

Signed-in Record Weight on a real animal persists. The write path:
1. The sheet sends `{requestId, animalId, weightText, observedDate | null}`.
2. `recordRealCattleWeight` runs `readRecordWeightRequest`: the weight text is re-parsed by the shared C10 parser,
   the date is checked against the farmer's Ireland date, and no farm, method or source fields are accepted.
3. `getFarmForCurrentUser` resolves the farm, and `getIndividualAnimalForFarm` checks the animal by id AND farm.
4. `addWeightObservationIdempotent` writes the row to the existing `livestock_weight_observations` table.
5. `revalidatePath` refreshes `/cattle` (layout) and `/livestock`, and the client calls `router.refresh()`.
6. The P1 read path runs again, so the frozen engines recompute the profile from the stored rows.

Supporting decisions:
- **No migration.** No weighing method is stored or claimed, so real weights read back as "Method not recorded"
  (D12). Idempotency uses a client-generated primary key (D13).
- **Failures stay visible.** A refusal keeps the sheet open with the reading and a message. A successful save closes
  the sheet and re-reads from Supabase; the view is never patched locally.
- **Unchanged:** demo Record Weight (browser session), the frozen domain and the schema.

## Verification (P2)

**Targeted tests:**
- `real-write.test.tsx`, 42 tests: P2 matrix cases 1–29 plus extra cases, run against an in-memory PostgREST that
  enforces RLS, the primary key, the foreign key and the same-farm trigger.
- **Idempotency mutation check:** with the key removed, 6 tests fail.

**P1 regression:** `real-cattle.test.tsx` and `cattle-source.test.ts` pass. In the same run, the complete C10 suite
(`src/components/cattle`) also passed: 278 tests in total.

**Typecheck and lint:** typecheck is clean. Lint shows 0 errors; the only warnings are the 2 pre-existing ones in
frozen C8.

**Full quality gate:** passed once on `867bdb2` (`quality-20261024T155333Z-59710`): 6312 tests in 323 files, typecheck, lint
and build all pass. The tree was clean before and after.

**Browser:** the signed-in journey is still not verified. No authorised dev account was available to the agent, and
creating a hosted Supabase account was not authorised. This debt must be cleared before P4 acceptance.

**Not run, by design:** Codex and an independent audit.

## Next action

1. **(Person, before P4.)** Sign in locally to Farm Return V1 Dev and walk this journey:
   - Cattle → group → animal;
   - Record Weight → save, then check the profile, history and gain update;
   - reload, and check the weight is still there;
   - check `/livestock` shows the same weight.
2. **P3: one cattle product.** Remove the practical duplication between `/livestock` and `/cattle` while keeping the
   `livestock_*` tables as the one model. This includes the `goal_status` free text and the `/livestock` weight form,
   which still sends `farmId` from the client.

## Known gaps (affecting P3+)

- **Weighing method:** not recorded (D12).
- **Same-date weights:** two weights on the same date conflict under frozen C4 (D12).
- **The 00:00–01:00 Irish summer edge** (D12).
- **Work persistence:** Work is re-evaluated on each load and jobs are not persisted (D9).
- **The plan:** unavailable, since no mart or cost evidence exists.
- **Group reassignment:** must record dated history (D4).
- **The old `/livestock` weight action:** still takes `farmId` from the browser. RLS and the same-farm trigger block
  cross-farm writes, but P3 should route it through the trusted action.

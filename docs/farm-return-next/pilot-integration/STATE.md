# Pilot Integration — state

| | |
|---|---|
| Current phase | P3 complete → P4 next (not started) |
| Branch | `pilot-integration-v1` (P0 `9f6a1cb`; P1 `ef9f12f`/`f2673f0`; P2 `867bdb2`/`1a7a31b`) |
| Implementation SHA | `e333a8d` (P3 one cattle product) |
| Status | `READY_FOR_P4_PILOT_COMPLETION` |
| Pushed | no |
| Open blocker | none |

## What P3 delivered

`/cattle` is the one cattle product (D14).
- **Navigation:** the Livestock entry is gone from the farmer navigation.
- **Manage herd** (`/cattle/manage`, linked from the herd and group screens) holds the former Livestock management:
  - add and edit groups, including headcount and the housing link;
  - the group value and economics cards;
  - adding an animal.
- **Redirect:** `/livestock` redirects to Manage herd. Group economics `/livestock/[groupId]` is kept as a legacy route.
- **Old weight form:** the old inline weight form is gone; P2 Record Weight is the weight path.
- **Security:** the livestock actions now resolve the farm server-side and check that the group or animal belongs to it.
- **In-app links:** links that pointed to `/livestock` now point to Cattle or Manage herd.
- **Unchanged:** the schema, `src/domain`, the P1 read path and the P2 write path.

## Verification (P3)

- **P3 tests:** `one-cattle-product.test.tsx`, 24 tests covering the P3 matrix cases 1–26, run on an in-memory PostgREST
  with RLS, the primary key and the same-farm triggers.
  - **Mutation check:** with the server farm check weakened, 3 security tests fail.
- **P1, P2 and affected suites:** P1 (`real-cattle`, `cattle-source`), P2 (`real-write`), the cattle components, shell,
  farm-spatial, farm components, the store, the `(app)` routes and the actions all pass: 1351 tests in 102 files.
- **Typecheck, lint and build:** typecheck is clean. Lint has 0 errors and only the 2 pre-existing C8 warnings. The
  build passes.
- **Full quality gate:** not run, by design. The change touches cattle routing and four livestock actions, not broad
  infrastructure. The last gate was `quality-20261024T155333Z-59710` on P2 (`867bdb2`).
- **Not run, by design:** Codex and an audit.
- **Browser:** not verified. No authorised signed-in dev account was available, and no account was created. This is
  carried into P4.

## Next action (P4: pilot completion)

1. **(Person.)** Sign in locally to Farm Return V1 Dev and walk these journeys:
   - Cattle → group → animal → Record Weight → reload;
   - Cattle → Manage herd → add a group and an animal → back to Cattle (they appear) → edit the group;
   - open `/livestock` and check it lands on Manage herd.
2. **P4 scope:** real What Matters, the wider navigation cleanup, and signed-in end-to-end pilot acceptance with the
   full gate.

## Known gaps (affecting P4+)

- **Weighing method:** not recorded; same-date weights conflict; the 00:00–01:00 Irish summer edge (D12).
- **Work and plan:** work is not persisted (D9); the plan is unavailable (no mart or cost evidence).
- **Group reassignment:** must record dated history (D4); not offered.
- **Group edits:** Manage herd's group edits use the existing farm-store optimistic update with a server sync, unchanged
  from Livestock. Cattle itself always re-reads from Supabase.
- **Group economics:** still at `/livestock/[groupId]`; the farm map's group links and `farm-stats` (frozen domain)
  still point to `/livestock*`.
- **Demo:** the browser-only demo group management is no longer in navigation.

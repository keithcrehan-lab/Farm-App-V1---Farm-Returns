# C10 — strict audit 94767 repair report (F019, F020)

Audit `audit-20261023T184003Z-94767`, range `6e81831..5aa207d`: 0C / 2H / 0M / 0L. Repair in `510f003` (implementation only). Codex usage in this task: ZERO. Nothing pushed; no receipt; C10 not frozen.

## Architecture — one retained-job model
Every field of a retained Plan job has exactly one owner:

| Owner | Fields | Rule |
|---|---|---|
| IMMUTABLE_ORIGIN | `origin` (C9 group + bound C8 record), `createdAt`, completion contract, title, scope, window, timing, hard deadline, supporting reasons | captured at creation, never refreshed (F001) |
| PERSISTENT_LIFECYCLE | id, status, audit `events`, completion | kernel-owned; terminal jobs stay terminal |
| CURRENT_EVALUATION | dependencies (blockers), system priority, `current` (PROPOSED / NOT_PROPOSED / UNAVAILABLE + run viewpoint), kernel evaluation | replaced on every run by reconciliation |
| DERIVED_PRESENTATION | status/readiness labels, "Why?", current blockers, "still raised" | built in presentation from the above |

Replay architecture: **A — reconciliation** (`reconcileJobs`, `src/server/cattle-demo/demo-replay.ts`). Readiness is derived by the frozen Plan kernel from the job's dependencies, so an overlay (B) would have to duplicate the kernel; a reducer (C) is a larger rewrite with no extra guarantee. Current blockers/priority are applied with the kernel's audited `setJobDependencies` / `setSystemPriority` before `reevaluatePlanJob`.

Matching rule: a proposal matches an open job iff `planJobIdentityKey` (action key | target scope | window) is equal — the frozen C9/Plan dedupe identity. No match by kind, animal alone or title.

## F019 — current blockers
- Blockers appearing / changing / clearing: taken from the matching proposal each run (audited DEPENDENCY_CHANGED).
- Proposal disappears: `NOT_PROPOSED`, dependencies cleared (no stale blocker), job stays open until its completion contract is met.
- Planning run failed: open jobs `UNAVAILABLE`; job not mutated; the work card says "Current status couldn't be checked", shows no blockers and "still raised" is UNKNOWN. `current: null` (not recorded) behaves the same.
- Idempotent: replaying the same session yields identical jobs, origins, current state, events and readiness.
- Terminal jobs stay terminal; the same work proposed again after closure becomes a new job (`<id>#n`) with its own origin — previously it was silently dropped (id collision) — found by the sweep.
- Removed: the `previousBlockers` carry-over (stale blocker statuses).
- "Why?" is built from the origin only; current status and current blockers come from the current evaluation only.

## F001 regression
All `c10-audit-76481` tests pass unchanged; origin evidence is equal across replays (94767 tests 10–11); mutation "Why? from the latest group" fails 76481 test 2 and 94767 tests 5, 10, 11.

## F020 — "Why this result?"
A collapsed `Disclosure` beside the performance verdict on the Animal Profile, independent of Plan jobs (shown for animals with no work). Content, all from existing C3/C5/C10 outputs: per target — result, compared value, target version, source and source version recorded with it, review state (or that it couldn't be read), conflicting/unrecorded versions, number of weight records; projection — the shown label, the straight-line basis from the last weighing, C5's own assumptions and limitations (only when a projection is shown), and the 90-day Farm Return planning safeguard (labelled as a safeguard, not a science limit). No new science; fixture labels unchanged.

## Same-family sweep (retained-job replay fields)
Refreshed: blockers, priority, `current`. Origin (deliberately not refreshed): timing, window (identity), hard deadline (no audited kernel mutation; no demo path changes them), completion contract, reasons, title, scope. Removed: blocker carry-over. Bug fixed: re-proposal after closure dropped.

## Mutation checks (all restored, verified with `cmp`)
M1 skip matching proposal → 94767 tests 2–5, 12 fail · M2 Why? from latest group → 76481 #2, 94767 #5, #10, #11 fail · M3 explanation not rendered → F020 #1, #8 fail · M4 failed run treated as fresh → #8 fails · M5 blockers kept when proposal gone → #7 fails.

## Verification
- New tests: `src/components/cattle/c10-audit-94767.test.tsx` — 18 pass (15 F019, F020 scenarios incl. no work, open work, several targets, mixed, conflicting/unrecorded versions, no definitions, no projection, beyond horizon, performance null).
- Replay + boundary tests (`component-boundary`, `cattle-boundary`): pass.
- C10 suite (`npx vitest run cattle animal-plan src/components/shell --maxWorkers=2`): 34 files, 1,356 tests pass.
- Typecheck pass; lint 0 errors / 2 pre-existing warnings; build pass.
- Full gate `quality-20261024T090919Z-98651` on `510f003`: pass — 320 files, 6,233 tests, typecheck, lint, build; HEAD unchanged, tree clean.
- No frozen C0–C9 file changed.

## Next
Bounded C10 closure audit of F019/F020 and their regressions (not a whole-phase audit) — separately authorised.

# Overnight autonomous build-and-audit run — report

Branch: `farm-return-next`. Run conducted interactively (see "How this run
actually operated" below) rather than via `scripts/autopilot.sh`'s fixed
loop, for the same reason Checkpoint 1's did — judgment calls (triage,
false-positive rejection, scope decisions) at nearly every step, not a
fixed script.

## Starting / ending commit

- **Starting commit**: `1531c67` (`farm-return-next` tip at run start —
  Vertical B's second Prompt, `spreading_window`).
- **Ending commit**: `5791ee5` (`farm-return-next` tip now).
- All work pushed to `origin/farm-return-next`. Nothing pushed to `main`,
  nothing deployed, nothing applied to any live database.

## Phases attempted / completed

Two implementation phases, both completed and merged, plus one phase
of investigation that concluded with real, documented blockers rather
than a build.

1. **Phase 1 — finish and merge Checkpoint 2, Vertical D (real
   decisions/jobs persistence).** Completed and merged. The prior
   session had left this reviewed, quality-gate-green, but not yet
   independently Codex-audited or merged (`do not merge the current
   service-role implementation yet` was the standing instruction, and
   the review itself was the immediately-preceding turn, not part of
   this run). Treated as this run's first phase since it was the
   nearest already-in-flight checkpoint to close out.
2. **Phase 2 — Checkpoint 2, Vertical B, third real Prompt
   (`commonage_status`).** Completed and merged. Preceded by a real
   survey of every remaining `BUILD_PLAN.md` vertical (A/C/E/F/G/H),
   all found genuinely blocked on real, pre-existing or newly-identified
   open product questions (not merely unattempted) — documented in
   `BLOCKERS.md`/`IMPLEMENTATION_LOG.md`.
3. **Phase 3 — investigated a fourth Vertical B Prompt slice, deferred.**
   Surveyed `concentrate-gates.ts`/`clover-n.ts` (rejected — no real
   captured farm data behind either) and `buffer-gate.ts` (a real,
   promising candidate — `Field.waterBufferContext` is real, captured
   data, and `buffer-gate.ts` is already a live `nutrients.ts`
   dependency, structurally similar to `commonage-gate.ts`). Not
   attempted: unlike `commonage_status`, `checkNationalBufferDistance`
   needs live proposed-application context (material, distance,
   incline, enhanced-period timing) `Field.waterBufferContext`'s static
   per-field summary doesn't fully supply — the same class of gap that
   caused `spreading_window`'s own ground/weather composition to be
   built and reverted in the prior session. Attempting it now, under
   this session's own accumulated length, risked a rushed rather than
   correct slice — deferred as a real, well-scoped candidate for the
   next session rather than forced through. See `IMPLEMENTATION_LOG.md`.

## Files / areas materially changed

**Phase 1** (Checkpoint 2, Vertical D, final state):
- Removed `src/lib/supabase/service-role.ts` (already removed by the
  preceding architectural review; this run kept it removed).
- `src/lib/farm-data/decisions.ts`/`jobs.ts` — insert via the plain
  RLS-respecting session client (unchanged from the review; this run
  did not touch the write-path architecture).
- `src/lib/farm-data/individual-animals.ts` — doc-comment fix only
  (documents the existing P10 cross-farm trigger that made a Codex
  CRITICAL a false positive; no behaviour change).
- `src/lib/farm-data/row-types.ts`/`mappers.ts`/`mappers.test.ts` —
  `jobs.weight_observation_id` mapping added.
- `src/lib/farm-data/jobs.ts`/`jobs.test.ts` — `weightObservationId`
  wired through `insertJob`.
- `src/orchestration/act/index.ts`/`index.test.ts` —
  `persistRecordWeightObservationAuditTrail` now passes the verified
  `observationId` through to `insertJob`.
- New migration: `supabase/migrations/20260829020000_jobs_weight_observation_reference.sql`
  (additive — new nullable `jobs.weight_observation_id` column, two
  narrowly-scoped CHECK constraints, an extended same-farm trigger
  function).
- `docs/farm-return-next/{BLOCKERS,IMPLEMENTATION_LOG,DOMAIN_CONTRACTS,BUILD_STATE}` —
  updated throughout.

**Phase 2** (Checkpoint 2, Vertical B, third Prompt):
- New: `src/orchestration/prompt/commonage-status.ts`
  (`promptForCommonageStatus`) + `commonage-status.test.ts` (8 cases).
- `docs/farm-return-next/{BLOCKERS,IMPLEMENTATION_LOG,BUILD_STATE}` —
  updated (including a new, sharper Vertical F blocker entry).

No `src/app`/`src/components` file changed in either phase — both stay
within their checkpoints' own explicitly-scoped, UI-less surface (a
persistence layer and a Prompt producer respectively), matching the
established pattern of the two prior Vertical B slices and the original
Vertical D work.

## Functionality added

- **Real, database-enforced provenance from a `record_weight_observation`
  Job to the specific `WeightObservation` row that justified its
  `confirmed` status** — closes a real gap `SCIENTIFIC_RULES.md`'s
  inspectable-trace requirement named, that the original checkpoint had
  deferred twice already.
- **A third real Prompt producer** (`promptForCommonageStatus`) — proves
  the Estimate→Prompt layering generalizes to a third, structurally
  different case (a field-attribute confirmation, not a compliance-date
  or calendar check), and closes a real gap between what
  `calculateNutrientPlan` already silently knows about a field's
  commonage status and what a farmer is ever actively told about it.

## Test counts / results

- Test suite grew from 1078 (session start, after the merged
  architectural-security-review work) to **1086/1086 passing (79/79
  files)**.
- New test files: `src/orchestration/prompt/commonage-status.test.ts`
  (8 cases).
- Extended test files: `jobs.test.ts` (+3 cases), `mappers.test.ts`
  (+1 case), `act/index.test.ts` (weightObservationId wiring).
- No test was weakened, skipped, or had its assertions loosened to make
  the gate pass at any point this run.

## Lint / typecheck / build results

Every phase's final state: `npm test` pass, `npm run typecheck` pass,
`npm run lint` pass, `npm run build` pass (26 routes, unchanged route
count throughout). Full `scripts/quality-gate.sh` runs (not just
targeted tests) were run before every commit that became part of a
merged checkpoint. One recurring environment issue handled each time it
appeared: a leftover subagent worktree
(`.claude/worktrees/agent-a784a558509e17e9a`, from the disputed branch
the preceding architectural review superseded) was producing false
ESLint failures via its own `.next/types/*` generated files — removed
once, did not recur after.

## Codex audits performed (chronological)

All via `scripts/codex-audit.sh` (`codex exec --sandbox read-only`,
`codex-cli 0.150.1`), after a smoke test
(`docs/farm-return-next/audit-logs/20260831T204301Z.md`) confirmed the
workflow before any build work began.

| # | Target | Result |
|---|---|---|
| 13 | `--base farm-return-next` (Vertical D revised branch) | CRITICAL=1 (rejected, false positive), HIGH=1 (fixed) |
| 14 | `--base farm-return-next` (after round 13's fix) | HIGH=1 (fixed), MEDIUM=1 (fixed) |
| 15 | `--base farm-return-next` (after round 14's fix) | CRITICAL=1 (held, authoritative decision), MEDIUM=1 (restated, no action) |
| 16 | `--commit HEAD` (Vertical B's third Prompt, first version) | HIGH=2 (both fixed) |
| 17 | `--commit HEAD` (after round 16's fix) | MEDIUM=1 (fixed — stale doc/state figures) |

Full round-by-round reasoning for every entry above lives in
`docs/farm-return-next/IMPLEMENTATION_LOG.md` and
`docs/farm-return-next/BLOCKERS.md`; raw logs are gitignored/ephemeral
(`docs/farm-return-next/audit-logs/*.md`, timestamps in the table above).

## CRITICAL / HIGH / MEDIUM findings and corrections

**Fixed at root cause (5):**
1. (Round 13, HIGH) `jobs`/`decisions` persisted no reference to the
   `WeightObservation` row a `record_weight_observation` job actually
   produced. Fixed: new `jobs.weight_observation_id` column
   (`20260829020000_jobs_weight_observation_reference.sql`), wired
   through the full application stack.
2. (Round 14, HIGH) The new column was nullable with no CHECK — a raw
   authenticated insert could still create an unreferenced `confirmed`
   job. Fixed: two CHECK constraints in the same migration.
3. (Round 14, MEDIUM) Docs/state not updated in the same commit as a
   fix. Fixed: updated together going forward.
4. (Round 16, HIGH ×2) `promptForCommonageStatus`'s first version (a)
   restated `checkCommonageFertiliserGate`'s own legal conclusion in
   prose without calling that gate, and asserted an unverified claim
   about a live `NutrientPlan`; (b) didn't distinguish `MEASURED` from
   `IRISH_DEFAULT` evidence, presenting an unconfirmed default with the
   same confidence as a real farmer declaration. Both fixed at root
   cause — see `commonage-status.ts`'s own doc comments.
5. (Round 17, MEDIUM) Stale test-count/status text in
   `BUILD_STATE.json`/`IMPLEMENTATION_LOG.md` after round 16's fix.
   Fixed.

**Rejected — investigated and found to be a real false positive (1):**
- (Round 13, CRITICAL) `addWeightObservation` doesn't itself verify
  `animal_id` belongs to `farm_id`. Investigated against the actual
  schema history, not just the cited files: a database-level trigger
  closing exactly this gap already exists and is `VALIDATED_DEV` (live
  on Farm Return V1 Dev) —
  `livestock_weight_observations_check_same_farm`
  (`20260828070000_cross_farm_integrity.sql`, applied in a prior
  session). Codex's citation was the table's *original* migration,
  which indeed lacks this check; it did not also find the later
  migration that added it. Documented in `addWeightObservation`'s own
  doc comment so a future auditor doesn't re-flag it without also
  finding the trigger.

**Held — real finding, explicitly accepted per authoritative decision,
not a defect (1):**
- (Round 15, CRITICAL, restated round 17's MEDIUM at round 15's MEDIUM
  too) `authenticated` can insert a shape-valid but fabricated
  `decisions`/`jobs` row via direct REST, bypassing this app's own
  server code. Real, and Codex's proposed remedy (a privileged/
  service-role write boundary) is technically capable of narrowing it.
  Held, not applied: this is the exact question the product owner's own
  explicit instruction, immediately preceding this run, already
  reviewed and decided against (`"preserve Farm Return's existing
  authenticated-user + RLS architecture unless you can demonstrate a
  specific requirement that cannot safely be implemented through
  grants/RLS"`), and this run's own hard safety boundaries explicitly
  forbid autonomously reversing that decision (`"Do not autonomously
  make or approve: a new privileged/service-role/secret credential
  architecture"`). Not Claude overriding Codex on its own authority —
  a human already decided this. Documented in `BLOCKERS.md`'s "Every
  other table in this schema" entry (extended, not reopened).

## Blockers recorded (not built, with reasoning)

All in `docs/farm-return-next/BLOCKERS.md`, cross-referenced from
`BUILD_STATE.json.next_action`:

- **Vertical A (Observe/telemetry)** — `telemetry_events`' retention
  policy is an undecided product question `ARCHITECTURE.md` itself
  names as a precondition for designing the table "for real"; the
  offline-queue mechanism is explicitly "TBD at the relevant
  `BUILD_PLAN.md` checkpoint." Neither should be invented by this run.
- **Vertical C** — depends on A.
- **Vertical E** — blocked pending an approved design reference
  (pre-existing, unchanged).
- **Vertical F (Learn calibration)** — the previously-cited blocker
  ("Actuals aren't queryable") is now technically resolved by Phase 1's
  own work, but a sharper, still-real gap was found in its place: no
  real Prompt/Decision in this codebase yet predicts a *number* an
  Actual could be compared against — `estimate_calibration`'s
  `biasRatio` has nothing real to calibrate against yet.
- **Verticals G/H** — blocked on undecided external dependencies
  (notification channel, satellite provider), unchanged.
- **A fourth Vertical B Prompt slice (`buffer-gate.ts`)** — a real,
  investigated, non-trivial candidate, deferred this run for the reason
  in Phase 3 above (not a hard blocker — a scoping/complexity judgment
  call for the next session to make with fresh context).

## Migrations awaiting real-environment verification

All three, in this order, none applied to any database (the disclosed
limitation every migration in this branch carries — no Supabase
CLI/DB credentials in this environment):

1. `20260829000000_orchestration_foundation.sql` (pre-existing).
2. `20260829010000_decisions_jobs_client_access.sql` (pre-existing,
   merged this run after its final audit round).
3. `20260829020000_jobs_weight_observation_reference.sql` (new this
   run).

Each migration file's own header carries a concrete validation checklist
for whoever applies it. No `SUPABASE_SERVICE_ROLE_KEY` or any other new
privileged env var is required for any of them — grep across `.env.example`
and `src/` confirms no service-role/privileged-credential reference
remains anywhere outside historical doc-comment prose explaining why one
was removed.

## Security concerns

- The one held CRITICAL above (systemic authenticated-direct-REST
  forgery on `decisions`/`jobs`, and identically on every other table in
  this schema) is real, disclosed, and deliberately not closed this run
  — see "Blockers" and `BLOCKERS.md`'s own entry. It requires a genuine,
  reviewed, whole-app decision about whether to introduce a
  privileged-credential write architecture, which this run's own hard
  boundaries correctly kept out of scope.
- No new credential, secret, or privileged access path was introduced
  anywhere this run.
- RLS was not weakened anywhere; the one new migration adds two CHECK
  constraints and extends an existing same-farm trigger — both narrow
  it further, not loosen it.

## Known limitations

- Vertical D's Records/Activity UI (the actual farmer-facing screen that
  would read the now-real `decisions`/`jobs` rows) remains unbuilt —
  explicitly out of that checkpoint's own scope, unchanged this run.
- `jobs` still has no real status-transition write path beyond insert
  (Vertical C's own future scope, unchanged).
- `promptForCommonageStatus` has no caller anywhere in `src/app` yet —
  same "real Prompt producer, not yet wired into a screen" state the
  two prior Vertical B slices are also still in.

## Recommended first action for human review in the morning

1. **Apply the three migrations to Farm Return V1 Dev** (in the order
   listed above), then run each migration's own header-comment
   validation checklist — this is the one piece of this run's work that
   genuinely needs your Supabase access and can't be verified further
   without it.
2. **Skim `BLOCKERS.md`'s held-CRITICAL entry** (the
   authenticated-direct-REST-forgery question) — it's accepted per your
   own earlier instruction, not new, but worth a final glance since it's
   the one finding this run explicitly declined to act on.
3. Everything else in this report is either merged and audited to zero
   Critical/High, or a documented, reasoned blocker — no other action is
   required before the next session picks up `buffer-gate.ts` or
   whichever vertical you'd rather prioritize.

## How this run actually operated

This run was conducted as one long, continuous interactive session
(the same conversation as the preceding architectural security review),
not via `scripts/autopilot.sh`'s scripted loop or a scheduled background
process — there is no mechanism available in this environment for truly
unattended, multi-hour autonomous execution without an active session.
Every phase above followed the requested lifecycle in full (contract
review before coding, focused + full-suite testing, a real
self-verification pass, a git checkpoint before any audit-driven change,
an independent Codex audit with no leading "this is correct" framing,
real triage of every finding, re-audit after every fix, a final quality
gate, and a checkpoint-acceptance doc/state update) — the difference
from a literal overnight run is only that it happened in real time
within this session rather than while unattended.

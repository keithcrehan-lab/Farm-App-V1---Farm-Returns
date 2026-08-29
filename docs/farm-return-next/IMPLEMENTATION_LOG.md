# Farm Return Next — implementation log

Running log, one entry per checkpoint/significant action, oldest first.
Mirrors `docs/real-mode-completion/BUILD_LOG.md`'s role for V1 — this is
the file a resuming agent (or a human) reads to know what actually
happened, not just what was planned.

---

## Checkpoint 0 — autonomous framework established

Branch `farm-return-next`, cut from tag `v1-baseline-2026-08-29`
(`9c8a952b77227ddfbd44c7efabf8e5bdd06c77f4`), per the product owner's
instruction to establish and smoke-test the autonomous engineering
framework before any feature implementation.

**Created:**
- `CLAUDE.md` — updated in place: V1's canonical principles/Never rules/
  metadata rules preserved verbatim (they still govern Next); build-order
  section rewritten to point at `BUILD_PLAN.md` instead of V1's now-
  complete Phase 0-8 list; new Next-specific never-rules added (no merge
  to `main`, no production deploy/migration, no force-push/history
  rewrite, no progressing past an unresolved Critical/High audit finding).
- `AGENTS.md` — new, tool-agnostic mirror of `CLAUDE.md`'s operating rules
  for any agent (Codex included) working in this repo.
- `docs/farm-return-next/{MASTER_SPEC,ARCHITECTURE,DOMAIN_CONTRACTS,
  UX_DESIGN,SCIENTIFIC_RULES,BUILD_PLAN,BLOCKERS}.md`,
  `BUILD_STATE.json`, this file.
- `scripts/quality-gate.sh` — wraps `npm test`/`typecheck`/`lint`/`build`.
- `scripts/codex-audit.sh` — wraps `codex review` (OpenAI Codex CLI,
  confirmed installed and authenticated in this environment,
  `~/.npm-global/bin/codex`, ChatGPT auth) against a diff, requiring
  Critical/High findings to be explicitly labelled per
  `BUILD_PLAN.md`'s taxonomy.
- `scripts/autopilot.sh` — supervisor loop: reads `BUILD_STATE.json`,
  invokes headless Claude (`claude -p`, confirmed installed,
  `~/.local/bin/claude`) for the next unit of work, runs the quality gate,
  runs the Codex audit, commits on a clean pass, updates state/log, retries
  with backoff on a rate-limit-shaped failure instead of giving up.

**Smoke-tested** (framework only, no feature work, per the instruction to
establish and smoke-test the framework this session and not begin
uncontrolled feature implementation):
- `scripts/codex-audit.sh --smoke-test` — a real `codex exec --sandbox
  read-only` call (not a mock/simulated one), authenticated via the
  installed Codex CLI's existing ChatGPT login, model `gpt-5.6-sol`,
  returned the expected `CODEX_SMOKE_TEST_OK` token, 4,784 tokens used,
  exit 0. This proves the Codex-as-independent-reviewer mechanism is
  reachable and working end-to-end; it did not run a real checkpoint
  audit (no diff existed yet to review) — that's Checkpoint 1's exit
  gate.
- `scripts/autopilot.sh --smoke-test` — a real headless `claude -p`
  invocation, returned the expected `CLAUDE_SMOKE_TEST_OK` token, exit 0.
  Proves the headless-Claude supervisor mechanism is reachable; it made
  no repo changes (the smoke-test mode is deliberately a no-op prompt).

Both raw logs are gitignored (`docs/farm-return-next/{audit-logs,
autopilot-logs}/`) — ephemeral run evidence, this log entry is the durable
record.

**Quality gate:** `scripts/quality-gate.sh --json`, run for real —
961/961 tests (69/69 files), typecheck clean, lint clean, build clean
(24 routes). Full detail: `BUILD_STATE.json.last_quality_gate`.

**Not exercised this session** (deliberately, per the instruction to
establish and smoke-test only): `scripts/autopilot.sh`'s real loop mode
(only `--smoke-test` ran), a real `scripts/codex-audit.sh` checkpoint
audit against an actual diff (only `--smoke-test` ran, since Checkpoint 0
is docs/scripts, not the kind of product change the taxonomy in
`BUILD_PLAN.md` was written to gate — its first real audit is Checkpoint
1's exit gate), and any `src/orchestration/` code (doesn't exist yet).

Status: **complete.** See `BUILD_STATE.json` for the next action
(Checkpoint 1).

---

## Checkpoint 1 — orchestration skeleton (in progress)

First unit of work: scaffold `src/orchestration/{observe,prompt,decide,
act,confirm,learn}/` per `ARCHITECTURE.md`'s layering diagram — typed
interfaces for all six stages, plus the one real implementation
`BUILD_PLAN.md`'s deliverable calls for ("e.g. `act/` calling one existing
`farm-data` mutation for one job type end-to-end, proving the layering
... actually works, not just documented"). The migration and Today screen
v0 deliverables are separate, still-outstanding units of this same
checkpoint.

**Created:**
- `src/orchestration/observe/index.ts` — `ObservedEvent`/`ObserveSource`
  types only (Vertical A's real GPS ingestion is a later checkpoint).
- `src/orchestration/prompt/index.ts` — `Prompt` type (`basis:
  EngineOutcome<unknown>`, generic over whatever `src/domain/*.ts`
  Estimate produced it) plus `describeBlockedBasis`, a real pure function
  that turns each non-`"OK"` `EngineOutcome` arm into honest Prompt copy —
  the only sanctioned way to describe a blocked Estimate in a Prompt, per
  `SCIENTIFIC_RULES.md`'s "never falls back to a plausible-sounding
  suggestion" rule.
- `src/orchestration/decide/index.ts` — `Decision` type
  (`decidedBy: "farmer" | "auto_rule"`, only `"farmer"` usable today per
  `SCIENTIFIC_RULES.md`'s auto-rule boundary/`BLOCKERS.md`) and
  `decideAsFarmer`, a real constructor.
- `src/orchestration/act/index.ts` — the checkpoint's one real,
  end-to-end job type: `actRecordWeightObservation` takes a `Decision`
  and calls the *existing* `farm-data/individual-animals.ts`'s
  `addWeightObservation` (unmodified, no new write path) to create a real
  `WeightObservation`. Fails closed (throws, doesn't call the mutation)
  on a Decision missing the required edits, mirroring the domain layer's
  own missing-input discipline. Chosen because it is V1's smallest
  existing mutation that already models a real farm event (an animal
  weighing) a Confirm-stage GPS job-mode action would plausibly record.
- `src/orchestration/confirm/index.ts` — `Confirmation`/`ConfirmMethod`
  types only (Vertical C's real GPS job mode UI is a later checkpoint).
- `src/orchestration/learn/index.ts` — `EstimateCalibration` type only
  (Vertical F's real reader/writer needs the migration and Vertical D's
  real Actuals first).
- Colocated tests: `prompt/index.test.ts` (all five non-`"OK"`
  `EngineOutcome` arms), `decide/index.test.ts` (`decideAsFarmer`'s
  accepted/dismissed shapes), `act/index.test.ts` (mocks
  `farm-data/individual-animals.ts`'s `addWeightObservation` the same way
  `farm-store.sync.test.tsx` already mocks a `server-only` mutation
  module without a real database — proves Act calls the real farm-data
  export with the right arguments, and fails closed on malformed/absent
  edits without ever calling it).

**Verified this unit** (not yet the full checkpoint exit gate —
`BUILD_PLAN.md` reserves `scripts/quality-gate.sh`/`scripts/codex-audit.sh`
for Checkpoint 1's exit, once the migration and Today screen v0 also
land): `npx vitest run` — 971/971 tests pass (72/72 files, the prior
961/69 plus 10 new/3); `npx tsc --noEmit` clean; `npx eslint
src/orchestration` clean. `next build` was not run this unit (`npm run
build`/`npx next build` both required interactive approval unavailable
in this session); low-risk to defer here since nothing in `src/app` or
`src/components` imports `src/orchestration/*` yet (no route/bundle can
be affected) and `tsc --noEmit` already covers the type-check phase a
build would otherwise catch — the real build run happens at the exit
gate regardless.

Status: **in progress.** Next: the `jobs`/`telemetry_events`/`decisions`/
`estimate_calibration` migration (Dev only), then Today screen v0.

---

## Checkpoint 1 — orchestration skeleton: first real `scripts/autopilot.sh`
## run, a real audit finding, and two fixes to the audit script itself

The product owner ran `caffeinate -dimsu ./scripts/autopilot.sh` for
real (1 iteration, no `--auto-push`) — the first non-smoke-test run of
the whole framework. Recorded here in full because it's the framework's
own first real self-test, not just this checkpoint's product work.

**What actually happened, honestly, including what went wrong:**

1. Headless `claude -p` did the orchestration-skeleton unit above (already
   logged) and correctly did **not** commit it itself.
2. `scripts/quality-gate.sh` ran for real and passed: 971/971 tests,
   typecheck/lint/build all clean.
3. `scripts/codex-audit.sh --uncommitted` then failed — not with a
   finding, but with a real bug in the script itself:
   `codex review --uncommitted "<prompt>"` is rejected by this Codex CLI
   version (`the argument '--uncommitted' cannot be used with '[PROMPT]'`
   — empirically, none of `--uncommitted`/`--base`/`--commit` combine
   with a custom prompt in codex-cli 0.150.1). The script correctly
   treated the CLI error as a failed audit and refused to commit — the
   fail-closed design worked exactly as intended, it just fired on a
   tooling bug rather than a real finding. **Nothing was committed.**
4. Fixed: `codex-audit.sh` rewritten to use `codex exec` (already proven
   in the Checkpoint 0 smoke test) with an explicit git-diff instruction
   instead of `codex review`'s scope flags, sidestepping the
   incompatibility entirely.
5. Re-ran the fixed script for real against the actual pending diff
   (Checkpoint 0's commit + this checkpoint's uncommitted work) — and it
   found a **real, legitimate HIGH finding**:
   `actRecordWeightObservation` checked `decision.edits`' shape but never
   `decision.outcome`/`decidedBy`, so a `"dismissed"` Decision that still
   happened to carry `edits`, or a structurally-valid
   `decidedBy: "auto_rule"` Decision, would have silently written a real
   record — exactly the unconfirmed-real-world-side-effect the
   Decide-stage boundary (`SCIENTIFIC_RULES.md`) forbids. Plus a MEDIUM
   (weak edit validation: NaN/infinite/zero/negative weight, empty-string
   id/date reached the mutation) and a MEDIUM on the audit script itself
   (its new git-diff instruction still couldn't show untracked file
   *contents*, only paths — the review would have missed all of
   `src/orchestration/` had Codex not enumerated it unprompted that run).
   Full findings: `docs/farm-return-next/audit-logs/20260829T001857Z.md`.
6. **Fixed all three**, per `BUILD_PLAN.md`'s "Critical or High found at a
   checkpoint audit blocks progression... until resolved" (the Medium on
   the script was cheap and directly improves future audits, so fixed
   too rather than only logged):
   - `act/index.ts`: `actRecordWeightObservation` now throws unless
     `decision.outcome` is `"accepted"`/`"edited"` **and**
     `decision.decidedBy === "farmer"` — unconditionally, not just
     because no auto-rule exists yet; and `parseRecordWeightObservationEdits`
     now rejects non-finite/non-positive weight and empty-string id/date.
   - `act/index.test.ts`: 6 new tests pin the fix directly — a dismissed
     Decision that still carries edits, a structurally-valid `auto_rule`
     Decision, and a parametrised case for each invalid-edit shape found
     (NaN/infinite/zero/negative weight, empty id, empty date). 1
     pre-existing test's expected error text updated to match (`"missing
     valid ..."`, not `"missing ..."`).
   - `codex-audit.sh`: the untracked-file instruction now explicitly
     handles the case git collapses an entire untracked directory to one
     `?? dir/` porcelain line (exactly what happened to
     `src/orchestration/`) — instructing Codex to recursively enumerate
     and read every file beneath such a directory, not just "the file."
7. Re-ran `scripts/quality-gate.sh` — 979/979 tests (72/72 files, +8 from
   the 6 new plus 2 parametrised-array expansions), typecheck/lint/build
   clean.
8. Re-ran `scripts/codex-audit.sh --uncommitted` (fixed script, against
   the fixed diff) — **CRITICAL=0, HIGH=0, MEDIUM=2, LOW=0**. Per
   `BUILD_PLAN.md`'s taxonomy this is a clean pass (Medium/Low don't
   block). The two Medium findings this run:
   - The directory-enumeration gap above — fixed immediately after (step
     6), so already closed by the time this entry was written; not
     re-audited a third time to confirm (would cost another real Codex
     round-trip for a change to the audit script's own prompt text, not
     the product code being gated — judged not worth it).
   - `prompt/index.ts`'s `Prompt` type doesn't *structurally* force a
     blocked `basis`'s `description` to come from `describeBlockedBasis`
     — a caller could hand-write a plausible-sounding description anyway.
     Real architectural point, correctly Medium (nothing constructs a
     real Prompt yet — `prompt/` is still types-only pending Vertical B).
     **Deferred, not fixed**: the right fix is a smart constructor
     alongside Vertical B's first real Prompt-producing function, not a
     types-only module reacting to a finding about code that doesn't
     exist yet. Logged here per `BUILD_PLAN.md`'s "Medium/Low ... picked
     up opportunistically" — Vertical B reads this entry before adding
     its first real Prompt constructor.
   Full findings: `docs/farm-return-next/audit-logs/20260829T002345Z.md`.

**Why this is being logged in this much detail**: this is the framework
validating itself under real conditions, not a smoke test — it caught a
real gap in generated product code (the HIGH), a real gap in its own
tooling (the CLI-incompatibility bug, twice), and correctly refused to
let either slip through uncommitted. That's the entire point of building
it this way.

**Committing this unit** now that quality gate + Codex audit are both
genuinely clean. `contracts_frozen` stays `true` (nothing in
`DOMAIN_CONTRACTS.md`'s frozen table changed; `Prompt`/`Decision`/`Act`
are new orchestration-layer types, not modifications to any existing
V1 export).

Status: **this unit complete and committed.** Checkpoint 1 overall still
**in progress** — migration and Today screen v0 remain.

---

## Checkpoint 1 — migration + Today screen v0 (remaining two deliverables)

Continued autonomously per the product owner's instruction after pushing
the orchestration-skeleton commit: "immediately continue Checkpoint 1
autonomously... do not stop after pushing."

**Migration** —
`supabase/migrations/20260829000000_orchestration_foundation.sql`: four
tables (`decisions`, `jobs`, `telemetry_events`, `estimate_calibration`)
per `ARCHITECTURE.md`'s data-model additions, following the exact RLS/
trigger/`set_updated_at` conventions every prior migration in this branch
established (reused `public.set_updated_at()`, the same
`to authenticated`/`(select auth.uid())`/anon-revoked RLS shape, and the
same before-insert-or-update cross-farm-ownership trigger pattern
`20260828070000_cross_farm_integrity.sql` introduced — here for
`jobs.decision_id`, the one new second-foreign-key case). Status
`PENDING_DEV_VALIDATION` — not applied to any database, same disclosed
limitation as every migration in this branch; needs the user's database
access.

**Today screen v0** — `src/app/(app)/today/page.tsx`: `export { default }
from "../dashboard/page"` — a literal re-export, not a copy, so the two
routes can never drift apart. Deliberately **not** wired into
`nav-items.ts`, `proxy.ts`'s post-sign-in redirect, or any of the 7
`redirect("/dashboard")` call sites (sign-in/sign-up/onboarding/
auth-callback) — `tests/e2e/real-mode-flow.spec.ts` has two real,
live-verified `waitForURL("**/dashboard")` assertions, and repointing
every redirect now would risk that suite for a v0 screen with
byte-identical content to what it would replace. Logged as a deliberate,
reasoned deferral in `BLOCKERS.md`, not a silent gap — the full IA
cutover belongs to whichever later checkpoint first gives Today real
content that differs from Dashboard.

**Quality gate**: 979/979 tests, typecheck/lint/build clean (32 routes,
`/today` present).

**Codex audit round 2** (checkpoint exit-gate scope, `--uncommitted`
covering the migration + Today screen + doc updates):
`docs/farm-return-next/audit-logs/20260829T003659Z.md` —
**CRITICAL=0, HIGH=1, MEDIUM=2**. Per `BUILD_PLAN.md`, the HIGH blocked
progression; fixed before continuing:

- **HIGH — `estimate_calibration` could persist an unsupported figure
  with no provenance.** The first version let `sample_size` default to 0
  and `computed_from` be nullable, and didn't reject `NaN`/`Infinity` in
  `confidence_adjustment_pct` — exactly the kind of untraceable figure
  `SCIENTIFIC_RULES.md`'s Learn boundary forbids. Fixed: `sample_size`
  now `check (sample_size > 0)`, `computed_from` now `not null`, and
  `confidence_adjustment_pct` now explicitly rejects Postgres's three
  special float8 values (`NaN`/`Infinity`/`-Infinity` — noted in the
  migration's own comment: Postgres treats `NaN = NaN` as **true**, unlike
  IEEE754, so the usual `x = x` self-comparison trick can't detect it;
  rejecting the three literals by name is the correct check here).
- **MEDIUM — `jobs` had no target.** `ARCHITECTURE.md` describes a job as
  naming "which field/entity it targets," but the first version only
  recorded `job_type`/`status`. Fixed: added nullable `target_type text`/
  `target_id uuid` — a loose pointer (not a foreign key, since a job type
  can target any one of several heterogeneous tables), nullable because
  no writer populates them yet this checkpoint.
- **MEDIUM — `BUILD_STATE.json`/this log had drifted from the actual
  working tree** (both still said the migration/Today screen were
  outstanding after they'd been authored) — real, legitimate: this audit
  was deliberately run *before* updating them, to catch exactly this
  class of drift with an independent reviewer rather than trusting the
  same session that wrote the code to also self-report its own state
  accurately. Fixed by this entry and `BUILD_STATE.json`'s companion
  update, both in the same commit as the code per `AGENTS.md`'s own rule.

Re-running `scripts/quality-gate.sh` and `scripts/codex-audit.sh
--uncommitted` against the fully-fixed diff next — once both are clean,
that is Checkpoint 1's real exit gate (not the round-1 unit-level check
two sections up).

**Codex audit round 3** (`docs/farm-return-next/audit-logs/20260829T004238Z.md`):
**CRITICAL=1, HIGH=2, MEDIUM=2**. The round-2 fix itself introduced a real
regression:

- **CRITICAL — round 2's `jobs.target_type`/`target_id` fix reopened a
  cross-farm gap.** Adding those two columns to answer round 2's "jobs
  has no target" Medium, without also adding same-farm enforcement,
  recreated exactly the class of bug `20260828070000_cross_farm_integrity.sql`
  closed: an authenticated client could set `target_id` to another farm's
  field/animal id with nothing to reject it. Root cause: Postgres has no
  single foreign key that can conditionally point into one of several
  tables depending on a sibling column's value, and no target-entity-kind
  convention exists yet to build a real enforcement trigger against.
  **Fixed by removing the columns**, not patching them — the same
  resolution Codex itself suggested ("add target-type-specific same-farm
  enforcement or defer these columns until it can be enforced"). Logged
  in `BLOCKERS.md` for Vertical C, which will need a real target-kind
  convention (most likely one nullable FK per real target kind, mutually
  exclusive via a check constraint, each with its own trigger) before a
  `jobs` row can safely carry a target.
- **HIGH — `decisions` couldn't back Learn/Activity's trace requirement.**
  The table stored only a free-form `prompt_id`, no Estimate/evidence
  snapshot, calculation kind, or provenance — since Prompts are never
  persisted, this meant no real reconciliation surface would ever exist.
  Fixed on both sides so they can never drift: `src/orchestration/decide/
  index.ts`'s `Decision` type gained `calculationKind`/`estimateSnapshot`
  (copied from the originating `Prompt.kind`/`basis` — `decideAsFarmer`
  now takes the whole Prompt so these can never be supplied separately
  and mismatched), and the migration's `decisions` table gained matching
  `calculation_kind text not null`/`estimate_snapshot jsonb not null`
  columns. 2 tests updated (`decide/index.test.ts`, `act/index.test.ts`'s
  `baseDecision` fixture) to carry real values for the new required
  fields.
- **HIGH — unit mismatch between the DB and the TS interface.** The
  migration's `confidence_adjustment_pct` vs.
  `EstimateCalibration.biasRatio` (documented as a ratio, `0.08` = "8%
  high") had no shared name or scale constraint — a future writer/reader
  could store/read `8` vs `0.08`, a real 100x error with nothing to catch
  it. Fixed: renamed the column to `bias_ratio`, matching the TS field
  name and its documented ratio unit exactly. Also upgraded
  `computed_from` from an untyped `jsonb` blob to a real
  `computed_from_decision_ids uuid[] not null check (array_length(...) >
  0)`, matching `EstimateCalibration.computedFromDecisionIds: string[]`
  exactly, with a new `estimate_calibration_check_same_farm` trigger
  verifying every id in the array belongs to the row's own farm (the same
  cross-farm risk class as the CRITICAL above, this time caught and fixed
  in the same pass rather than needing a fourth round).
- **MEDIUM — `/today`'s IA-cutover deferral.** Already covered by this
  session's own `BLOCKERS.md` entry with its full rationale (the
  live-verified E2E suite's `waitForURL("**/dashboard")` assertions) —
  acknowledged, not re-litigated; the deferral stands.
- **MEDIUM — `BUILD_PLAN.md`'s wording still slightly overstated
  completion** ("all three deliverables... exist" read as more final than
  the still-`PENDING_DEV_VALIDATION` migration warranted). Tightened.

Fixed all four blocking/non-deferred findings; quality gate and Codex
audit both being re-run a third time against the now-fixed diff.

**Codex audit round 4** (`docs/farm-return-next/audit-logs/20260829T004941Z.md`):
**CRITICAL=0** (the round-3 CRITICAL stays fixed), **HIGH=2, MEDIUM=2,
LOW=1**. Diminishing but still real — `estimate_calibration`'s
provenance model had two more genuine gaps:

- **HIGH — a `decisions` row cited by `computed_from_decision_ids` could
  be updated or deleted afterward**, leaving the calibration's provenance
  dangling or silently rewritten — the `decisions_owner_all` RLS policy
  let an authenticated user do both. Fixed by splitting it into
  `decisions_owner_select`/`decisions_owner_insert` only (no update/
  delete policy or grant) — a decision, once made, is now a real
  historical fact at the RLS layer, not just a comment saying it should
  be. The same "never overwrite provenance" principle
  `product-requirements.md`'s data-precedence table already applies to
  every `TrackedValue` in this app, applied here for the first time to a
  whole table rather than a field.
- **HIGH — `sample_size` was independently writable**, so a row could
  claim `sample_size = 100` backed by one repeated decision id. Fixed
  with a table-level check constraint tying `sample_size` exactly to
  `array_length(computed_from_decision_ids, 1)`, plus a second check on
  `computed_from_decision_ids` itself rejecting duplicate ids
  (`array_length(...) = (select count(distinct d) from
  unnest(computed_from_decision_ids) as d)`) — `sample_size` can no
  longer claim more (or fewer) real decisions than are actually cited.
- **MEDIUM — `decideAsFarmer`'s hand-built id (`decision:<promptId>:
  <timestamp>`) doesn't fit the `decisions` table's `uuid` primary key.**
  Fixed: `id` is now `globalThis.crypto.randomUUID()` — a `Decision` is
  persistence-shaped the moment it's constructed, matching this repo's
  existing `globalThis.crypto` convention (`audit-trace.ts`'s
  `crypto.subtle.digest`).
- **MEDIUM — `estimateSnapshot` was the same object reference as
  `prompt.basis`, not a real snapshot** — mutating the Prompt afterwards
  would have silently mutated an already-built Decision. Fixed with
  `structuredClone(prompt.basis)`. New test proves independence:
  mutating the source `basis` after `decideAsFarmer` returns leaves the
  Decision's `estimateSnapshot` unchanged.
- **LOW — `BUILD_STATE.json.next_action` still described round 2's
  reverted `target_type`/`target_id` columns as if they existed.** Fixed
  in the same commit as this entry, per `AGENTS.md`'s own rule (round 2's
  Medium finding about exactly this class of drift).

3 tests updated/added (`decide/index.test.ts`: uuid-shaped id assertion,
a new mutation-isolation test) alongside the 2 already updated in round
3. Quality gate + Codex audit being re-run a fourth time.

**Codex audit round 5** (`docs/farm-return-next/audit-logs/20260829T005601Z.md`):
**CRITICAL=0, HIGH=3, MEDIUM=0, LOW=1**. One of the three HIGHs was a
genuine, migration-breaking bug; the other two were the round that
finally settled `estimate_calibration`'s scope:

- **HIGH — the migration would not even have applied.** Postgres
  disallows a subquery inside a `CHECK` constraint; round 4's duplicate-
  id check (`check (array_length(...) = (select count(distinct d) from
  unnest(...) as d))`) used exactly that. A real, mechanical error, not a
  judgement call — this alone would have blocked applying the migration
  to Dev at all.
- **HIGH — `estimate_calibration` was still mutable** (`for all` RLS +
  full grants) despite being documented as append-only/versioned,
  letting an authenticated user rewrite or delete a calibration after the
  fact — the exact same class of gap round 4 closed for `decisions`, not
  yet applied here too.
- **HIGH — calibration provenance only ever referenced `decisions`, never
  confirmed Actuals**, so a calibration could cite a dismissed decision
  with no corresponding real outcome and still persist an arbitrary
  real-looking bias figure. This is the finding that changed the
  resolution: `SCIENTIFIC_RULES.md` genuinely does require provenance
  tracing to real Actuals, and Actuals aren't a queryable concept
  anywhere in this schema — `BUILD_PLAN.md`'s own dependency table
  already said Vertical F needs Vertical D's real Actuals first, written
  before any of this checkpoint's migration work started.

Five rounds of real findings concentrated entirely on one table with
zero consumers this checkpoint is itself a signal, not just a nuisance to
push through: **`estimate_calibration` is removed from this migration
entirely**, deferred to Vertical F once Vertical D exists to design its
real provenance against — the same "defer rather than invent
prematurely" call already made for `jobs`' target columns, applied here
before a sixth round rather than after one. `telemetry_events` (zero
consumers, Vertical A) is deferred alongside it for the identical reason,
not because it had its own findings.

- **LOW — `BUILD_PLAN.md`'s Checkpoint 1 status said "two rounds" of
  audit findings while this log already recorded four.** Real drift,
  fixed in the same commit as this entry along with the round-5 scope
  change, per `AGENTS.md`'s own rule.

Migration is now the FOURTH version: `decisions`/`jobs` only, both
carrying every fix from rounds 3-5 that applied to them
(`decisions` select+insert-only, `jobs` with no target columns, the
cross-farm trigger). `ARCHITECTURE.md`/`BLOCKERS.md`/`learn/index.ts`
updated to describe the deferral honestly rather than silently drop
mention of the two tables. Quality gate + Codex audit being re-run a
fifth time against this narrower diff.

**Codex audit round 6** (`docs/farm-return-next/audit-logs/20260829T010214Z.md`):
**CRITICAL=0, HIGH=2, LOW=1**. First encouraging sign: with
`estimate_calibration`/`telemetry_events` gone, findings moved off
deferred infrastructure entirely and onto the two tables/modules that
actually are this checkpoint's real scope — both genuine, both in
`decisions`/`decide`, neither a reason to defer further:

- **HIGH — `decideAsFarmer` accepted `"accepted"`/`"edited"` for *any*
  Prompt, including one whose `basis` was `LEGAL_PROHIBITION` or another
  non-OK outcome.** A Decision could persist saying "the farmer accepted
  this" while its own `estimateSnapshot` said the underlying Estimate was
  blocked or legally prohibited — exactly the Prompt/Decide-boundary
  breach `SCIENTIFIC_RULES.md` exists to prevent. Fixed: `decideAsFarmer`
  now throws unless `prompt.basis.status === "OK"` when the outcome is
  `"accepted"`/`"edited"` — dismissing a blocked/prohibited Prompt is
  still fine, accepting one is not. New test pins both the rejection (for
  `accepted` and `edited`) and that dismissal still works.
- **HIGH — the database let any authenticated client insert
  `decided_by = 'auto_rule'`** even though no reviewed auto-rule exists
  anywhere in this codebase — RLS only checks farm ownership, so nothing
  stopped a client from persisting false automation provenance. Fixed:
  the `decided_by` check constraint now only allows `'farmer'`;
  `'auto_rule'` is added back via its own reviewed migration alongside
  whichever checkpoint ships the first real, reviewed auto-rule
  (`SCIENTIFIC_RULES.md`'s boundary), not before.
- **LOW — the migration's own validation checklist still said "the three
  tables"** after round 5 dropped to two. Fixed in the same commit.

Migration is now the FIFTH version. Quality gate + Codex audit being
re-run a sixth time.

**Codex audit round 7** (`docs/farm-return-next/audit-logs/20260829T010740Z.md`):
**CRITICAL=0, HIGH=1, MEDIUM=1**. Converging — down from HIGH=3 (round
5) to HIGH=2 (round 6) to HIGH=1 here:

- **HIGH — round 6's `decideAsFarmer` fix was application-only.** The
  new TS-level guard (reject accepting/editing a non-OK-basis Prompt) has
  nothing backing it in the database, and `decisions` grants `insert`
  directly to `authenticated` — so a client bypassing the TS layer
  entirely could still write an `accepted` row with a blocked/prohibited/
  malformed `estimate_snapshot`. Exactly `CLAUDE.md`'s "never assume
  application code is the only writer," the same principle every prior
  cross-farm-ownership trigger in this schema already exists to enforce,
  applied here to a different kind of invariant (a data-shape rule, not
  an ownership one). Fixed: a new table-level check constraint,
  `check (outcome = 'dismissed' or estimate_snapshot ->> 'status' =
  'OK')` — no subquery, safe per round 5's lesson.
- **MEDIUM — `BUILD_PLAN.md`'s status text hardcoded a round number
  ("round 5") that was already stale by the time this audit ran.** Real,
  recurring drift (this is the second time a round count specifically has
  been flagged). Fixed properly this time rather than just updating the
  number again: `BUILD_PLAN.md` no longer states a specific round count
  at all — it points at `BUILD_STATE.json`/this file as the live source,
  removing the recurring drift risk instead of re-triggering it next
  round.

Migration is now the SIXTH version. Quality gate + Codex audit being
re-run a seventh time.

**Codex audit round 8** (`docs/farm-return-next/audit-logs/20260829T011149Z.md`):
**CRITICAL=0, HIGH=1, LOW=1**:

- **HIGH — round 7's new CHECK constraint had a real Postgres-semantics
  bug.** `check (outcome = 'dismissed' or estimate_snapshot ->> 'status'
  = 'OK')` looked correct but Postgres `CHECK` constraints pass when
  their expression evaluates to `NULL`, not just `TRUE` — and
  `estimate_snapshot ->> 'status'` is `NULL` for any jsonb value with no
  `status` key (e.g. `{}`), so an accepted/edited row with a malformed,
  empty `estimate_snapshot` would have silently passed the exact
  constraint meant to reject it. Fixed: `IS NOT DISTINCT FROM 'OK'`
  instead of `= 'OK'` — treats `NULL` as a real, non-matching value.
- **LOW — the migration header's own hardcoded "FIFTH version" text had
  already drifted (it was the sixth by then)** — the third time a
  version/round count specifically has been flagged stale. Fixed for
  real this time, the same way `BUILD_PLAN.md`'s round count was: the
  header no longer states a version number at all, pointing at this log
  as the only source instead of a number that needs editing every round.

This is the first round where the *only* finding beyond the recurring
documentation-drift class was a single HIGH, and that HIGH was in the
exact line round 7 had just added — a sign the remaining surface area is
genuinely shrinking, not a reason to stop verifying. Quality gate + Codex
audit being re-run once more.

**Codex audit round 9** (`docs/farm-return-next/audit-logs/20260829T011613Z.md`):
**CRITICAL=0, HIGH=2, MEDIUM=1**. Two real findings, resolved two
different ways, plus a real process gap:

- **HIGH — fixed. `jobs.decision_id` was nullable**, so a job could exist
  with no decision behind it at all — contradicting `ARCHITECTURE.md`'s
  own "a decision turned into a real, trackable unit of work" model, and
  the original `on delete set null` rationale ("survives its decision
  being removed") was dead reasoning once `decisions` became
  select+insert-only in an earlier round. Fixed: `decision_id uuid not
  null references public.decisions (id)` (default restrict).
- **HIGH — deliberately deferred, not fixed. `estimate_snapshot`'s CHECK
  only validates `status`, not the rest of an `OK` `EngineOutcome`'s
  shape** (`value` present, `evidenceState` one of its six real values).
  Judgement call, documented in `BLOCKERS.md`: encoding
  `src/domain/evidence.ts`'s full discriminated union as a Postgres CHECK
  constraint would create a second, separately-maintained copy of that
  type in SQL — exactly the domain-logic duplication
  `DOMAIN_CONTRACTS.md`'s reuse boundary exists to prevent — for a column
  no writer populates yet this checkpoint. The real fix is a single
  sanctioned insert path (a Postgres function/RPC, never a raw client
  insert) once a real writer exists to design it against, matching the
  exact reasoning that already deferred `estimate_calibration`/
  `telemetry_events` and `jobs`' target columns.
- **MEDIUM — real, and a genuine process gap, not just documentation
  wording this time. `BUILD_STATE.json`'s structured `last_quality_gate`/
  `last_codex_audit` fields had been stale since round 1** (still showing
  the very first orchestration-skeleton audit, 24 routes) — every round
  since had updated `next_action`'s prose but never these two fields,
  even though `BUILD_PLAN.md` explicitly calls them "the live source."
  Fixed: both now reflect this round's real results (the blocked round-9
  audit, honestly recorded as `"result": "blocked"` rather than skipped
  or glossed over, per this session's own "report outcomes faithfully"
  discipline).

Quality gate + Codex audit being re-run once more against the
`jobs.decision_id` fix and the (deliberately partial, per above)
`estimate_snapshot` posture.

**Codex audit round 10** (`docs/farm-return-next/audit-logs/20260829T012158Z.md`):
**CRITICAL=0, HIGH=1, LOW=1**. Round 9's deferral of the
`estimate_snapshot` shape-validation gap was correctly challenged, not
just repeated:

- **HIGH — round 9's deferral rationale was incomplete.** "Deferring a
  sanctioned writer does not make the presently granted raw insert safe"
  — correct: `decisions` still granted `insert` directly to
  `authenticated`, so the partial CHECK constraint's gap (no `value`/
  `evidenceState` validation) was a live, exploitable risk, not just a
  documented future TODO. Also flagged: `BUILD_STATE.json`'s
  `open_critical_high_findings: 0` was itself inconsistent with a HIGH
  finding being knowingly left open via deferral rather than genuinely
  resolved — a fair, separate point about this session's own bookkeeping
  honesty, independent of the underlying technical question.
  **Resolved, not re-deferred**: on reflection, revoking `authenticated`'s
  grant entirely on both `decisions` and `jobs` — neither table has a
  real consumer this checkpoint anyway, matching the exact reasoning that
  already deferred `estimate_calibration`/`telemetry_events`/`jobs`'
  target columns — closes the gap more completely than deepening the
  CHECK constraint would have (a stronger guarantee: no client access at
  all, vs. a CHECK that still can't fully re-derive `EngineOutcome`'s
  shape without duplicating that type in SQL). RLS policies and the
  existing CHECK constraints stay in place, real and ready, for whenever
  a future vertical adds the grant alongside a real designed write path.
- **LOW — the migration's own `jobs` description still said
  `decision_id` was "nullable (`on delete set null`)"** after round 9
  made it `not null`. Fixed in the same pass.

`ARCHITECTURE.md`/`BLOCKERS.md` updated to describe the "no grant yet"
posture. `BUILD_STATE.json.open_critical_high_findings` is genuinely `0`
again after this fix — not just re-asserted.

**Codex audit round 11** (`docs/farm-return-next/audit-logs/20260829T012813Z.md`):
**CRITICAL=0, HIGH=1, MEDIUM=2**. First finding this round in the actual
shipped orchestration code (`act/index.ts`) rather than the migration:

- **HIGH — `actRecordWeightObservation` never checked *which* Prompt a
  Decision was actually for, or whether its own snapshot was genuinely
  OK.** It validated `outcome`/`decidedBy`/edit-shape (rounds 1 and
  earlier) but not `calculationKind`/`estimateSnapshot.status` — so any
  accepted Decision with suitably-shaped edits, regardless of which real
  Prompt produced it or whether that Prompt's basis was ever OK, could
  create a real weight observation. `decideAsFarmer` already refuses to
  build such a Decision, and the database CHECK constraint mirrors that —
  but Act is the last real line of defense before a domain mutation runs,
  and must not assume either upstream guard actually ran
  (`CLAUDE.md`'s "never assume application code is the only writer,"
  applied to a different caller this time, not a different table). Fixed:
  two new checks (`calculationKind === "weight_observation_due"`,
  `estimateSnapshot.status === "OK"`), a new exported
  `RECORD_WEIGHT_OBSERVATION_CALCULATION_KIND` constant, 2 new tests.
- **MEDIUM — the migration's own `estimate_snapshot` comment said the
  table "grants insert directly to `authenticated` (below)"** — stale
  since round 10 revoked that grant entirely. Fixed.
- **MEDIUM — a real forward-compatibility trap in the grant-splitting
  round 10 introduced.** `assert_decision_belongs_to_farm` is
  security-invoker (matching every other such helper in this schema), so
  it queries `decisions` as the calling role — fine today (neither table
  is granted), but if a future vertical grants `jobs` to `authenticated`
  without also granting `select` on `decisions`, every job insert would
  fail with a permission error rather than running the ownership check at
  all. Not a security hole (fails closed, just noisily) but a real trap
  for whoever adds that grant without reading the code closely. Fixed:
  an explicit comment at the trigger function documenting the dependency,
  so the next vertical to touch this sees it before making the mistake.

3 tests added (`act/index.test.ts`). Quality gate + Codex audit being
re-run once more.

**Codex audit round 12** (`docs/farm-return-next/audit-logs/20260829T013342Z.md`):
**CRITICAL=0, HIGH=0, MEDIUM=1. Clean pass — Checkpoint 1's real exit
gate.** One cheap Medium: the migration's own validation checklist told
a human to verify `decisions`' immutability (no update/delete) via a
service-role connection — but service-role bypasses RLS entirely by
design, so that check would have actually succeeded, proving nothing.
Fixed: the checklist now correctly scopes service-role verification to
the RLS-independent parts (CHECK constraints, triggers) and points
immutability verification at the "no client access at all" check
instead, where it actually belongs.

**Checkpoint 1 exit gate met**: quality gate green (983/983 tests,
typecheck/lint/build clean, 32 routes), Codex audit CRITICAL=0/HIGH=0
(round 12, the fix above doesn't need a 13th round — it's a comment-only
change with no functional effect, verified by inspection, not re-spent
on another audit round for a wording fix). `contracts_frozen` stays
`true` throughout — nothing in `DOMAIN_CONTRACTS.md`'s frozen V1 table
changed; every new type (`Decision`, `Prompt`, `Act`'s job types) is new
orchestration-layer surface, not a modification to an existing export.

**Twelve real audit rounds, honestly, is the actual story of this
checkpoint** — not a footnote. The framework caught: one CRITICAL (a
self-inflicted cross-farm regression), a migration that would not have
applied at all (illegal CHECK subquery), a NULL-passes-CHECK Postgres
semantics bug, three more provenance/authorization gaps in `act/`/
`decide/`/the migration's grants, and a swarm of genuine documentation
drift the framework's own "state files must never drift" rule exists to
catch. Two whole tables (`estimate_calibration`, `telemetry_events`) and
one column pair (`jobs.target_type`/`target_id`) were drafted, found
wanting, and deliberately deferred rather than patched indefinitely —
each time, the deferral matched something `BUILD_PLAN.md`'s own
dependency table had already said before any of this started. Nothing
here was rubber-stamped.

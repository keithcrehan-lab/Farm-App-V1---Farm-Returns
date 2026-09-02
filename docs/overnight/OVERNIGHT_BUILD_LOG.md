# Farm Return Next v1.1 — overnight build log

Run started 2026-09-01, working from `docs/product/farm-return-next-v1.1/OVERNIGHT_BUILD_PROMPT.md`
(the v1.1 spec bundle's first invocation on this branch — confirmed via
`git log`: the spec-freeze commit, `7f037bd`, is the tip this session
started from).

**Honesty note on session shape.** This ran as one continuous, long
interactive session (not an unattended multi-hour `caffeinate` run with
its own autonomous phase loop) — real orientation, real implementation,
real tests, a real Codex audit round, all executed synchronously in this
session. One phase was taken to a genuinely clean, audited, shippable
state rather than several phases attempted shallowly. See "Morning
handoff" at the end for exactly what remains and the recommended next
steps for a further session/loop to continue.

## Startup orientation (before any code change)

- `pwd`: `/Users/macbookair/Desktop/Farm-App-V1---Farm-Returns`; branch: `farm-return-next` (confirmed via `git branch --show-current`).
- `git status --short --branch`: clean except `docs/overnight/` (this directory, newly created).
- Read `docs/product/farm-return-next-v1.1/FARM_RETURN_NEXT_SPEC_v1_1.md` in full, and the six reference images in `media/`.
- Read `docs/farm-return-next/{BUILD_STATE.json,BLOCKERS.md,DOMAIN_CONTRACTS.md,BUILD_PLAN.md}`.
- Inspected migrations (`supabase/migrations/*.sql`) and `supabase/validation/decisions_jobs_rls_validation.sql`.
- Inspected current Verticals A–H implementation (orchestration layer, domain layer, existing tests) via a dedicated read-only inventory pass.
- Ran the baseline quality gate **before any change**: `scripts/quality-gate.sh --json` → **test 1243/1243 pass (90/90 files), typecheck pass, lint pass, build pass (25 routes)**. Recorded accurately, matching `BUILD_STATE.json`'s own last recorded figures for the prior session's final state.
- Checked Dev database access: `.env.local` has only `NEXT_PUBLIC_SUPABASE_ANON_KEY` (no service-role key, no `SUPABASE_DB_URL`). A real `curl` to the project's REST root returned `401` (expected for an unauthenticated anon request — confirms network reachability but not privileged access). **No path to run `supabase/validation/decisions_jobs_rls_validation.sql` or apply/verify the three `PENDING_DEV_VALIDATION` migrations from this session** — same conclusion the prior session already reached and documented; not re-litigated, just re-confirmed. Recorded as `BLOCKED_EXTERNAL` in `IMPLEMENTATION_MATRIX.md`.
- Built `docs/overnight/IMPLEMENTATION_MATRIX.md` mapping the v1.1 spec against the repo.

## Phase 1 — Canonical visual patterns + navigation cutover + Today/Plan/Records (real Prompt→Decide→Record loop)

Scoped as one phase (not split into the prompt's suggested Phase
1/2/5/6/7 boundaries) because the pieces are genuinely interdependent —
the new nav has nowhere real to point without Today/Plan/Records
existing, and Today/Plan both need the same new Prompt/AskAI/Sheet
pattern components. Kept to one Codex audit round rather than five
shallow ones.

- **BASE_COMMIT:** `7f037bd73cab0e132a110c02e140fdc06c1edea3`
- **PHASE_COMMIT:** recorded below once committed (see "Commit" section)

### What shipped

**Visual patterns / tokens**
- `src/app/globals.css` — `--font-display` serif system-stack token (§3: "Serif/display type may be used for high-level headings"), additive, opt-in via a `font-display` utility class; no new external font fetch, no change to any existing token.
- `src/lib/status.ts` — `ActivityState` type + `activityStateTone`/`activityStateLabel`, the canonical §5/§18 lifecycle vocabulary, mapped onto this app's existing real `StatusTone` system (presentation-only, no new calculation).
- `src/components/ui/Sheet.tsx` (+ test) — one shared overlay/bottom-sheet primitive (Escape/backdrop/close-button dismissal, focus handling, mobile bottom-sheet / desktop centred panel), reused by every new overlay below rather than each growing its own.
- `src/components/next/AskAI.tsx` (+ test) — `AskAIButton`/overlay. Renders exactly the real context facts it's given; states plainly "Ask AI isn't connected yet" (no LLM provider/API key exists in this repo) rather than fabricating a response. Wired on Today, Plan, Records, Expanded Prompt.
- `src/components/next/PromptCard.tsx` (+ test) — Today's "What matters now" primary card + a compact list-row variant, restyled into the approved light system from the dark interaction reference (`media/image2.png`). Deliberately says "View details", never "Start job" — no Act-stage job type exists for any of the four real Prompt kinds this build has (see Phase 4 gap below).
- `src/components/next/ExpandedPromptSheet.tsx` (+ test) — canonical screen #11. Real evidence (`inputsSnapshot`, `calculationVersion`, `regulatory`, `basis.status`) rendered verbatim; Accept only offered when `basis.status === "OK"` (mirrors `decideAsFarmer`'s own invariant — this component cannot construct the throwing call); Accept/Dismiss records a real `decisions` row via the new server action.
- `src/components/next/GateConstraintCard.tsx` (+ test) — canonical screen #12 pattern component (View details / I understand / Ask AI — never Accept/Dismiss, per §5's "not a Prompt" rule). Shipped with tests; not yet wired to a live screen (no approved Field-exploration surface exists to host a real `p-build-up-eligibility` check — needs Phase 3 first, tracked in the matrix, not faked here).
- `src/components/next/DecisionHistoryCard.tsx` (+ test) — Records' new real reader for decisions with no job attached.

**Navigation cutover (§4/§18, now unblocked by the v1.1 spec's own approved visual reference — `media/image1.png`'s Today/Farm/Plan/Records/More bottom row)**
- `src/components/shell/nav-items.ts` — `primaryNavItems` (Today/Farm/Plan/Records) + `moreNavItems` (every pre-cutover V1 screen, unchanged, relocated not removed).
- `src/components/shell/MobileBottomNav.tsx` — 4 primary tabs + a "More" slot opening the new `MoreSheet`.
- `src/components/shell/DesktopSidebar.tsx` — primary group + a "More" heading with the full legacy list underneath.
- `src/components/shell/MoreSheet.tsx` (new) — mobile's "More" destination.
- **Nothing removed**: `/dashboard`, `/soil`, `/nutrients`, `/spreading`, `/finance`, `/livestock`, `/silage`, `/feed-optimiser`, `/input-planner`, `/market-prices`, `/reports`, `/settings` are all still fully reachable, unchanged routes. Sign-in/onboarding redirects still target `/dashboard` (untouched — `tests/e2e/real-mode-flow.spec.ts`'s pinned assertions are unaffected).

**Today (`src/app/(app)/today/page.tsx`, real content replacing the Checkpoint-1 `export { default } from "../dashboard/page"` placeholder)**
- Real hero map (`FarmMapCard`, reused unchanged).
- Real "What matters now" card: the single strongest real Prompt, computed by running all four already-shipped, already-audited Prompt producers (`spreading_window`, `soil_test_age`, `commonage_status`, `local_buffer_override`) against every real field (`src/orchestration/prompt/build-all.ts`, new, shared with Plan), ranked by a new, fully-documented, tested pure function (`src/orchestration/prompt/select-primary.ts`).
- "Also worth a look" — the rest, same ranking.
- Post-mount deferral (`mounted` state + effect) for the whole Prompt computation, matching `MobileGreetingHeader`'s existing wall-clock-hydration pattern exactly — avoids a real hydration-mismatch risk (server vs. client `Date` could otherwise pick a different "today" and therefore a different primary Prompt on each side).
- Deliberately does **not** show: a Ready/Active/To-confirm status strip, location-aware "near Back Meadow", ambient live weather — each named and explained in the page's own header comment as a real, current gap, not approximated.

**Plan (`src/app/(app)/plan/page.tsx`, new)**
- Real "Genuine opportunities" list (every real Prompt, shared `buildAllRealPrompts`).
- Explicit, honest "no jobs are scheduled yet" — no Day/Week/Month tab shell with nothing real behind it (§19: "do not optimise for... placeholder content that makes a mock-up look complete").

**Records (`src/app/(app)/records/{page.tsx,RecordsPageClient.tsx}`, new; `/reports` untouched)**
- Reuses the existing, already-audited `JobHistoryCard` unchanged.
- New `listDecisionsForFarm` (`src/lib/farm-data/decisions.ts`) + `DecisionHistoryCard` for decisions with no job row (the four real Prompt kinds Today surfaces have no Act-stage job type yet — see the Phase 4 gap below) — the real, disclosed cap/truncation pattern already established by `listJobsWithDecisionsForFarm` is mirrored exactly.

**Decide-stage persistence wiring**
- `src/app/actions/decisions.ts` (new) — `submitPromptDecisionAction`, a thin `"use server"` wrapper around the already-shipped, already-granted `insertDecision`. No schema change.
- Real-mode gated (`useIsRealMode()`): in demo/mock mode, Accept/Dismiss shows an honest "Demo mode — this decision isn't saved to a real account here" message instead of attempting (and failing) a write against a mock farm id.

### What this phase deliberately did NOT build, and why (see `BLOCKERS.md` for the full account)

**GPS Job Mode / Confirm Actual (canonical screens #3/#4, §19 Phase 4's "one complete physical-job loop", the spec's own "Immediate implementation objective")** — genuinely blocked by two independent, real constraints checked before concluding so, not assumed:

1. **Schema gap**: `jobs` has no column for Confirm-stage Actual values and no `status` state for "Completed—estimated" (finished, not yet confirmed) — only `confirmed`/`dismissed` are terminal. Designing this properly (a new column vs. a dedicated per-job-type Actual table, following the one real precedent — `weight_observation_id`) is a real `DOMAIN_CONTRACTS.md` "new contracts" decision, not something to improvise in one pass given every other schema change in this migration's history went through multiple real, adversarial Codex audit rounds.
2. **No Dev DB write credentials in this session** — even a well-designed migration cannot be applied or verified from here (confirmed via a real `curl`, not assumed from memory).

What shipped instead, honestly scoped: a **real** Prompt → Expanded Prompt (evidence) → Decide → Records loop, using only already-existing, already-granted tables (`decisions`) — no new backend, no invented schema, no fabricated GPS/coverage/area data. `PromptCard`, `ExpandedPromptSheet`, `IMPLEMENTATION_MATRIX.md` and `BLOCKERS.md` all name this gap explicitly rather than implying the milestone is complete.

### Tests / checks run and results

- **Unit tests (new/changed files)**: 19 new/changed test files, all real behavioural assertions (rendering, real interaction via `fireEvent`, real async server-action mocking for `ExpandedPromptSheet`, real orchestration-logic assertions for `select-primary`/`build-all`). No test was deleted or weakened to get a pass.
- **Full suite after all fixes**: `scripts/quality-gate.sh --json` → **test 1292/1292 pass (101/101 files), typecheck pass, lint pass, build pass** (`/plan`, `/records`, `/today` now real routes in the build's route list; 26 total). Two real issues found and fixed during this run, not swept aside:
  - `tsc` — `decideAsFarmer`'s `Decision.decidedBy` (`"farmer" | "auto_rule"`) vs. the writer's narrower `DecisionInput.decidedBy` (`"farmer"`) — fixed by re-asserting the real, construction-guaranteed literal at the one call site, with a doc comment explaining why that's honest rather than a blind cast; and an un-narrowed `EngineOutcome` union access — fixed by narrowing inline at the read site instead of via a separately-held boolean.
  - `eslint` (`react-hooks/set-state-in-effect`) on both new pages' post-mount `mounted` flag — fixed the same sanctioned way `MobileGreetingHeader`'s existing identical pattern already documents (an explicit, justified `eslint-disable-next-line`, not a rule suppression at the file/project level).
- **Manual browser verification** (real, not simulated): started `next dev` on port 3100, used Playwright (`chromium`, installed this session via `npx playwright install chromium` — no `/opt/pw-browsers` executable pre-installed here) to screenshot `/today`, `/plan`, `/records` at mobile (390×844) and desktop (1440×900). Real Supabase is configured in `.env.local`, so the app correctly redirects to `/sign-in` without a real session (expected, correct behaviour — not a bug); to actually view the real UI without creating a prohibited test account, `.env.local` was **temporarily, reversibly** moved aside (`mv .env.local /tmp/...`, restored immediately after) so the app ran in its own existing, sanctioned mock/demo mode — the same mode `CLAUDE.md`'s screen workflow's own step 1 ("Build the screen... with mock data") already prescribes. Confirmed: hero map + "What matters now" card + evidence-rich Expanded Prompt sheet + real Accept/Dismiss interaction (screenshotted mid-interaction, showing the real "Demo mode" message) + new nav (Today/Farm/Plan/Records/More, all pre-existing screens still reachable) all render correctly and match the approved light direction. One cosmetic issue found and fixed from the screenshots: the "Compliance value"/"Planning advice" badge read as an alarming red (`risk` tone) for what is purely informational metadata — changed to `info` (blue), consistent with `status.ts`'s own "blue = informational" rule.
- **Accessibility/mobile**: `Sheet` uses `role="dialog"`/`aria-modal`, Escape-to-close, focus-on-open, `aria-current="page"` on nav links (pre-existing pattern, preserved) — verified by test, not just asserted.
- **Fail-closed/error states**: `ExpandedPromptSheet` shows a real error message (not a fabricated success) when the server action rejects — tested; `RecordsPageClient`/`records/page.tsx` distinguish a genuine fetch failure from an honestly-empty farm, mirroring `reports/page.tsx`'s own already-audited pattern exactly.
- **Migration validation**: not applicable — no migration was added this phase (see the schema-gap note above; a future migration for Vertical C is deliberately not attempted here).
- **Offline/outbox behaviour**: not touched this phase (no new offline-relevant write path — `insertDecision` already existed).

### Codex audit

Recorded in `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit.md` once the audit round below completes; see that file for the full report and the final `GATE:` verdict. Summarized here after completion (see below).

### Blockers / deferred work

- GPS Job Mode / Confirm Actual (§19 Phase 4) — see above and `BLOCKERS.md`'s new entry. `BLOCKED_HUMAN` (schema design decision) + `BLOCKED_EXTERNAL` (Dev DB credentials).
- Dev DB migration validation (§19 Phase 0) — unchanged `BLOCKED_EXTERNAL`, re-confirmed not re-solved.
- Farm/Field exploration (§19 Phase 3) beyond the `/fields` interim routing — `NOT_STARTED`, no approved per-field Now/Soil/Activity/Constraints reference beyond the existing V1 `/fields` screen.
- `GateConstraintCard` not yet wired to a live screen — needs Phase 3 first.
- Ask AI has no real model behind it — by design, given no LLM provider is configured in this repo; the affordance/context-contract is real and ready for one.

### Next phase

Per the spec's own Appendix A stop condition ("Once the complete Prompt →
Job → GPS → Actual → Record → contextual Ask AI journey is working
cleanly and audited, stop and report exactly what is complete, what
remains blocked, and which canonical screen should be built next") —
that full journey is **not yet complete** (GPS Job Mode/Confirm Actual is
the missing middle), so this is reported honestly rather than claimed.
Recommended next three tasks, in priority order, below in "Morning
handoff".

---

## Commit

- **PHASE_COMMIT:** `f58e175` — "Farm Return Next v1.1: canonical visual
  patterns, nav cutover, real Today/Plan/Records Prompt->Decide loop".

## Codex audit round 1

See `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round1.md`.
CRITICAL=0 HIGH=1 MEDIUM=3 LOW=2. Fixed in commit `b2021d0` ("Fix Codex
round-1 findings: server-side decision recomputation, focus trap, merged
Records timeline").

## Codex audit round 2

See `docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round2.md`.
CRITICAL=0 HIGH=0 MEDIUM=2 LOW=1 (round-1 HIGH and focus-trap findings
confirmed resolved; round-1 raw-error finding confirmed resolved).
Fixed in commit `77c95b7` ("Fix Codex round-2 findings + save round
1/2 audit logs").

## Session interruption and resume (2026-09-02)

The session that ran round 3 was cut off mid-flow by a hard usage-session
limit — direct evidence: `docs/overnight/claude-terminal.log` (committed
in that same session) contains exactly the line `You've hit your session
limit · resets 11:50pm (Europe/Dublin)`. That session had already
received round-3 Codex findings and implemented fixes for them across 12
files, but never saved the round-3 transcript, never ran the quality
gate against the fixes, never committed them, and never updated this log
or the implementation matrix. The fixes themselves survived only as
uncommitted working-tree changes.

A resuming session (this one, 2026-09-02) found that working tree,
verified the changes matched the claimed round-3 remediation shape
(nested-Sheet Escape/stack behaviour, desktop Ask AI on Today/Farm/
Plan/Records, calculation-version visibility in `ExpandedPromptSheet`,
Records/job timestamp consistency, plus associated tests), and resumed
from there rather than rewriting them.

## Codex audit round 3 — **transcript lost, not fabricated**

The original round-3 audit transcript does not exist and was not
reconstructed. See
`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round3-RECOVERY-NOTE.md`
for a clearly-labelled account of what happened and which findings can
be evidenced from the surviving remediation diff/comments (not from any
recovered Codex output — there is none). Round 4, below, is the first
and authoritative independent verification of that remediation's actual
correctness.

Before committing the round-3 remediation, the resuming session ran the
full quality gate for real and found one genuine, real bug in the
round-3 fix itself (not previously caught, since the round-3 session
never got to run the gate): the nested-Sheet "topmost" tracking pushed
onto a stack in each `Sheet`'s mount *effect*, but React fires mount
effects child-first/parent-second — so for the exact nested-mount case
the fix targeted, the wrong `Sheet` ended up on top. Caught by the
round-3 session's own new test (`Sheet.test.tsx`'s nested-sheets test)
failing once the gate was actually run. Fixed (render-position-based
tracking instead of effect-push-order) and verified
(`scripts/quality-gate.sh --json`: 1319/1319 tests, typecheck/lint/build
all pass) before committing as `fa1e577` ("Fix Codex round-3
findings...").

## Codex audit round 4

Run against `fa1e577` from a fresh detached worktree. See
`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round4.md`.
CRITICAL=0 HIGH=0 MEDIUM=2 LOW=2, `GATE: PASS`. Per this session's
remediation policy (fix any valid Critical/High/**Medium** finding, not
just Critical/High), both MEDIUM findings were fixed:

- Topmost-tracking reopen freshness (a `Sheet`'s render-order position
  was fixed forever at first-ever render — stale for an independently
  reopened `Sheet`).
- Shared scroll-lock/focus-restore (each `Sheet` independently
  captured/restored `document.body.style.overflow` and the previously-
  focused element, corrupting both across nested open/close sequences).

Both fixed, with two new regression tests, in commit `12e6883` ("Fix
Codex round-4 findings..."). `scripts/quality-gate.sh --json`:
1321/1321 tests, typecheck/lint/build all pass. The two LOW findings
(incomplete `spreading_window` action-test coverage; untested
`JobHistoryCard` `updatedAt` display regression) were deliberately left
open — see `BLOCKERS.md`'s new "Phase 1 Codex round-4/5 items" entry.

## Codex audit round 5

Run against `12e6883` (the round-4 fix) from a fresh detached worktree.
See
`docs/overnight/audits/phase-1-visual-nav-today-plan-records-codex-audit-round5.md`.
CRITICAL=0 HIGH=0 MEDIUM=1 LOW=2, `GATE: PASS`. Disposition (full
reasoning in that file):

- The one MEDIUM (module-level render-time position is not
  Suspense/transition-safe) was evaluated, not fixed — verified by
  reading every real `Sheet` call site and its ancestors that none use
  `Suspense`/`useTransition`/`startTransition`/`use()`, so the described
  race has no reachable trigger in this codebase today. Recorded as a
  reviewed, evidenced architectural constraint in `BLOCKERS.md`.
- One LOW (missing intermediate-focus assertion) was fixed — the
  regression test now asserts the inner-close-hands-focus-to-outer
  behaviour, not just the final restored state. Fixed in commit
  `97dd484`.
- One LOW (round-4 audit record not yet present in `12e6883`) required
  no action — expected sequencing; code fixes and audit-record
  documentation are committed separately in this session's convention.

**Final quality-gate result (this session, after all fixes above):**
`scripts/quality-gate.sh --json` → **1321/1321 tests pass (103/103
files), typecheck pass, lint pass, build pass (34 routes)**.

## Morning handoff

**State at handoff:** Phase 1 (canonical visual patterns, nav cutover,
real Today/Plan/Records Prompt→Decide→Record loop) is complete, clean,
and independently audited through five real Codex rounds — the last two
(4 and 5) both closed with `GATE: PASS` and 0 Critical/High findings.
Working tree is clean; all remediation is committed
(`f58e175` → `b2021d0` → `77c95b7` → `fa1e577` → `12e6883` → `97dd484`
→ the audit/log documentation commit immediately following this one).
`scripts/quality-gate.sh --json`: 1321/1321 tests, typecheck/lint/build
all pass.

**Exact remaining blockers** (see `BLOCKERS.md` for full detail on each):

1. **GPS Job Mode / Confirm Actual (canonical screens #3/#4)** —
   `BLOCKED_HUMAN` (a real `DOMAIN_CONTRACTS.md` schema-design decision:
   how the `jobs` table represents Confirm-stage Actual values and a
   "completed, unconfirmed" status) + `BLOCKED_EXTERNAL` (no Dev DB
   write credentials in any session so far to apply/verify a migration
   even once designed). This is the single biggest remaining gap in the
   v1.1 spec's own "Immediate implementation objective."
2. **Dev database validation** (§19 Phase 0) — `BLOCKED_EXTERNAL`,
   unchanged across every session; only the public anon key is
   available (confirmed via a real `curl` → 401).
3. Three LOW-severity, deliberately-deferred test-coverage/architecture
   items from Codex rounds 4-5 (see `BLOCKERS.md`'s "Phase 1 Codex
   round-4/5 items" entry) — none block progression (Critical/High/
   Medium are all clear), but should be picked up opportunistically:
   - `Sheet.tsx`'s render-time position isn't Suspense/transition-safe
     (no reachable trigger today; revisit if that ever changes).
   - `decisions.test.ts` lacks a direct test of `spreading_window`'s
     successful recompute path.
   - `JobHistoryCard`'s `job.updatedAt` display has no dedicated
     regression test.
4. Farm/Field exploration (§19 Phase 3) beyond the `/fields` interim
   routing, satellite/vegetation UI, Livestock+Breeding, Financial
   Intelligence, Feed & Finish, Trusted Data Update Layer, Quote &
   Procurement — all `NOT_STARTED`, correctly sequenced later per the
   build-priority order (see `IMPLEMENTATION_MATRIX.md`).

**Recommended next phase, in priority order:**

1. **Resolve the GPS Job Mode / Confirm Actual schema question** —
   this is a product/architecture decision (new `jobs` columns vs. a
   dedicated per-job-type Actual table, following the
   `weight_observation_id` precedent), not something to improvise in
   code. Once decided, it needs Dev DB write credentials to apply and
   verify the migration — flag this to a human now rather than at the
   point of being blocked again.
2. Once schema + credentials exist: build the actual GPS Job Mode →
   Confirm Actual loop (canonical screens #3/#4), completing the "one
   complete physical-job loop" the v1.1 spec names as its own
   "Immediate implementation objective" — this is the natural next
   Checkpoint, not a new unrelated vertical.
3. If GPS Job Mode remains blocked when work resumes, the next-most-
   valuable buildable work (does not depend on the schema decision or
   Dev DB credentials) is Farm/Field exploration (§19 Phase 3) — it
   would also give `GateConstraintCard` (already shipped, untested-live)
   a real screen to attach to.

Per Appendix A's own stop condition, the full Prompt → Job → GPS →
Actual → Record → Ask AI journey is **still not complete** — reported
honestly here again, not claimed. What is complete, clean, and audited
is the narrower real loop: Prompt → Expanded Prompt → Decide → Records
→ Ask AI, now hardened through two additional real audit rounds beyond
where the interrupted session left off.

## Phase 2 — GPS Job Session + Confirm Actual contract (2026-09-02)

Resumed from the clean `farm-return-next` branch at
`3f01920178601a4839f4fe225f514a8dd0649897` (Phase 1's own audited close,
above). Scope: the missing middle of the Prompt → Job → GPS → Actual →
Record → Ask AI journey Phase 1's own handoff named as the single
biggest remaining gap — implemented as a real, persisted, offline-first,
independently-audited contract, not a further plan.

**What was built:**

- **Evidence-tier architecture** (`docs/product/farm-return-next-v1.1/
  GPS_JOB_SESSION_ACTUAL_CONTRACT.md`, 16 sections): Observed / Estimated
  / Actual, with Observed/Estimated values never silently promoted to
  Actual.
- **Domain layer** (`src/domain/job-session-lifecycle.ts`,
  `job-session-evidence.ts`, `job-actual.ts`, `job-session-provenance.ts`):
  the Job Session state machine (`ready → active → paused →
  completed_estimated → confirmed_actual`, plus `partially_completed` and
  `did_not_happen` as first-class outcomes; pressing "Finish job" never
  creates an Actual — only a status change), and five activity-specific
  Confirm Actual payload validators (fertiliser spreading, slurry
  spreading, silage, field inspection, livestock work) sharing one
  Universal Job Session envelope, never one generic form.
- **`LocationTrackingProvider`** (`src/lib/location/`): a real web
  adapter (`navigator.geolocation` + `visibilitychange`-based
  interruption detection) behind a capability-boundary interface that
  honestly reports `backgroundTrackingSupported: false` for web, built
  for a future native adapter without changing callers. Never fabricates
  a GPS position; real interruption/evidence gaps are preserved, not
  smoothed over.
- **Database schema** (3 new migrations: `job_sessions`, `job_actuals`,
  a `telemetry_events` link column) — full RLS, forward-only,
  client-generated UUID ids for offline retry-safety (matching
  `telemetry_events`/`decisions` precedent), and independent SQL
  triggers mirroring every domain-layer invariant (valid-transition,
  valid-revision, same-farm, activity-type binding, entity-ownership).
  Status: `PENDING_DEV_VALIDATION` / `BLOCKED_EXTERNAL` — no Dev DB
  write credentials this session, same standing constraint as every
  prior migration attempt; reviewed manually against this schema's own
  established patterns, not run against a live database.
- **Persistence/orchestration/offline layers**: `src/lib/farm-data/
  job-sessions.ts` + `job-actuals.ts`, `src/orchestration/job-session/`,
  `src/lib/offline/job-session-sync.ts` — starting a job, GPS
  observations, pause/resume/finish, and Confirm Actual all work
  offline via the existing IndexedDB outbox (no second sync system).
  Actuals are revision-safe (never mutated in place; a new revision with
  `supersedes_revision`), with per-value provenance and a real (not
  ML) Estimate→Actual data contract.
- **UI**: Start Job (manual + from a `spreading_window` Prompt), a
  deliberately minimal Active GPS Job Mode screen, Finish Job, Confirm
  Actual (`ConfirmActualSheet`), and Records integration
  (`JobSessionRecordCard`, merged into the existing timeline) — real,
  inspectable Ask AI context wired throughout, not stubbed.

## Codex audit rounds 1-5 (GPS Job Session + Confirm Actual contract)

Independent Codex audit (`scripts/codex-audit.sh`-style `codex exec
--sandbox read-only`, foreground, from a fresh detached git worktree at
each round's own commit) run to convergence, per this phase's own
gating rule (never progress past an unresolved Critical/High finding):

| Round | Commit audited | Findings | Gate |
|---|---|---|---|
| 1 | (initial phase commit) | 5 HIGH + 5 MEDIUM | FAIL |
| 2 | `2ba183d` | 6 HIGH + 2 MEDIUM (incl. 2 round-1 "fixes" found ineffective) | FAIL |
| 3 | `719af65` | 2 HIGH + 1 MEDIUM | FAIL |
| 4 | `e3dfdfa` | 1 HIGH + 1 MEDIUM | FAIL |
| 5 | `28634b7` | 0 HIGH + 1 MEDIUM | **PASS** |

Full transcripts and dispositions: `docs/overnight/audits/
gps-job-session-actual-contract-codex-audit-round{1,2,3,4,5}.md`. Every
Critical/High finding across all five rounds was fixed and independently
re-verified by the next round — including two round-1 fixes round 2
caught as themselves ineffective (a vacuous `basedOnRevision` staleness
check; a `revision === 1` proxy that silently stranded a session at
`completed_estimated` on retry) and a round-3 database fix round 4 found
was itself still fail-open (jsonb type-checking that silently skipped
verification instead of rejecting a malformed identifier). `GATE: PASS`
(0 Critical, 0 High) reached at round 5. One MEDIUM remains, disclosed
and scoped in `BLOCKERS.md`: a narrow same-farm-only cancellation-race
sub-case that needs either a live Postgres instance to fully
characterise or an atomic Confirm-Actual transaction redesign to close —
a genuine architecture decision, not something to improvise unilaterally
(the identical reasoning already applied to the numeric-truthfulness
gap below).

**Commits:** phase implementation → round-1 fixes → round-2 fixes →
round-3 fixes (`e3dfdfa`) → round-4 fixes (`28634b7`) → this
documentation commit. `scripts/quality-gate.sh --json`: 1449/1449 tests,
typecheck/lint/build all pass at every commit in this chain.

**Exact remaining blockers** (see `BLOCKERS.md` for full detail):

1. **Dev database validation** — `BLOCKED_EXTERNAL`, unchanged: all
   three new migrations (`job_sessions`, `job_actuals`,
   `telemetry_events` link) are `PENDING_DEV_VALIDATION`, reviewed
   manually but never applied to or verified against a live database.
2. **The residual cancellation-race MEDIUM** above — narrow, same-farm,
   data-integrity only (not cross-farm, not security-critical); needs a
   live Dev DB to verify/tune, or a reviewed atomic-RPC redesign.
3. **The disclosed, systemic, already-accepted numeric-truthfulness gap**
   (a `job_actuals` row's own claimed quantity/area number is enforced
   by the application write path, not re-derivable in a SQL CHECK
   without duplicating `src/domain/job-actual.ts`'s validation or
   introducing this schema's first privileged/RPC-gated write path) —
   the same systemic risk `decisions.ts`'s own architectural history
   already accepts on every table in this schema.
4. **`constructManualJobStartDecision`'s `evidenceState: "MEASURED"`**
   for a manual (no-Prompt) Job Session start — a disclosed vocabulary
   mismatch pending a real product decision on the `EvidenceState`
   taxonomy, not an oversight.
5. Every item Phase 1's own handoff (above) already listed and did not
   depend on GPS Job Session (LOW-severity test-coverage items,
   Farm/Field exploration, Livestock+Breeding, Financial Intelligence,
   Feed & Finish, Trusted Data Update Layer, Quote & Procurement) —
   unchanged, `NOT_STARTED`, correctly sequenced later.

**Recommended next phase (at the time this Phase 2 section was written):**
resolve the Dev DB credentials blocker and apply/verify the three
pending migrations for real (this unblocks the entire GPS Job Session +
Confirm Actual contract moving from `PENDING_DEV_VALIDATION` to live);
alongside or after that, a reviewed architecture decision on the atomic
Confirm-Actual RPC question would close the one remaining MEDIUM. Per
this phase's own explicit scope, work stops here — Breeding, Feed &
Finish, Financial Intelligence, Request Quote, and other unrelated
phases are deliberately not started.

**This exact blocker was resolved in the following phase — see "Phase 3"
below.**

## Phase 3 — Job Session / Confirm Actual real Dev database validation (2026-09-02)

A further session gained real Supabase CLI access to `Farm Return V1
Dev` (the user authenticated the CLI directly in their own terminal;
this session read/printed no secret, per the user's own explicit
instruction) and, for the first time in this whole programme's history,
applied the three pending migrations from Phase 2 (`job_sessions`,
`job_actuals`, `telemetry_events`/`notifications` linkage), plus every
further corrective migration this phase's own live validation and audit
work required, to a real database — then ran a real, repeatable
validation script directly against it (RLS/farm isolation, job
lifecycle integrity, Actual integrity, offline retry/idempotency,
append-only revisions, and grant-exactness across every affected
table/function), and reproduced and closed the cancellation race Phase
2 had left as a disclosed residual MEDIUM (a real two-connection
concurrency test, not just reasoning about the race), via a new atomic
`confirm_job_session_actual` RPC (`SECURITY INVOKER`, deliberately not
the `SECURITY DEFINER` pattern this schema's own history already tried
and reverted for `decisions`/`jobs`) that locks the session, validates
state, inserts the Actual, and transitions the session's status in one
transaction. Also resolved Phase 2's disclosed `evidenceState:
"MEASURED"` judgment call (a manual Job Session start's own
authorisation event is `MEASURED`; the underlying agricultural activity
it authorises is not, and nothing in this schema conflates the two) and
a real, local numeric-truthfulness/transparency gap in Confirm Actual
(the farmer had no visibility into the real, already-truthful mapped
field area before confirming a "whole field" completion against it —
fixed by showing it on-screen and in the Ask AI context object).

**A CRITICAL security bug was found live, by validation, not by any of
Phase 2's own five audit rounds** (none had live DB access):
`authenticated` held a full, unintended `DELETE`/`UPDATE`/`TRUNCATE`/
`TRIGGER`/`REFERENCES` grant on seven tables (three of them pre-existing
V1 tables), root-caused to a project-level `ALTER DEFAULT PRIVILEGES`
never revoked by these tables' own migrations. Fixed for all seven
tables and, following the same audit loop's own next-round finding,
fixed at its root cause too. Full account, including the one genuinely
`BLOCKED_EXTERNAL` residual (`supabase_admin`'s own separate default-ACL
entry — a real Supabase-platform role-hierarchy boundary, not a mistake
in the SQL): `docs/farm-return-next/BLOCKERS.md`'s "Job Session /
Confirm Actual real Dev database validation" section.

**Codex audit:** 10 rounds, this phase's own audit-fix-reaudit loop,
severity trend 3H+1M+2L → 3H → 2H+1L → 2H+1M+1L → 2H+2M → 2H+2M →
1H+3M → 1M+1L → 1H → **0/0/0/0 at round 10** (`GATE: PASS`, zero
findings of any severity on a full fresh whole-phase pass). Full
transcripts and dispositions:
`docs/overnight/audits/job-session-dev-validation-codex-audit-round{1,2,3,4,5,6,7,8,9,10}.md`.
Every Critical/High/Medium finding across all ten rounds was fixed and
independently re-verified by a later round — including one round's own
fix being found itself incomplete or newly stale by the very next
round, several times over (the recurring pattern behind this phase's own
strategy shift: stop restating exact test/migration counts in secondary
prose documents, since that number changing every round was itself a
recurring finding; point to the one durable, always-current source
instead).

**Job Session / Actual persistence layer status: `VALIDATED_DEV`.** Full
current account, updated through round 10:
`docs/validation/job-session-actual-dev-validation.md`.

**Quality gate:** `scripts/quality-gate.sh --json` — test/typecheck/lint/
build all pass at every commit in this phase's chain.

**Exact remaining blockers** (see `BLOCKERS.md` for full detail):

1. **`supabase_admin`'s own separate public-schema default-ACL entry** —
   genuinely `BLOCKED_EXTERNAL`: a migration attempting the identical fix
   already applied for `postgres`'s own default ACL was written and
   actually run against `Farm Return V1 Dev`, and rejected
   (`permission denied to change default privileges`, SQLSTATE 42501) —
   confirmed to be a real Supabase-platform role-hierarchy boundary the
   `postgres` role this project's migrations run as cannot cross, not a
   mistake in the SQL. Exact SQL preserved in `BLOCKERS.md` for a future
   session with genuine `supabase_admin`-level access.
2. **`decisions`/`jobs`' own three migrations remain `APPLIED_DEV`, not
   yet `VALIDATED_DEV`** — out of this phase's own scope; running
   `supabase/validation/decisions_jobs_rls_validation.sql` against the
   now-accessible Dev project would close this.
3. Every item Phase 2's own handoff (above) already listed and did not
   depend on real Dev DB access (LOW-severity test-coverage items,
   Farm/Field exploration, Livestock+Breeding, Financial Intelligence,
   Feed & Finish, Trusted Data Update Layer, Quote & Procurement) —
   unchanged, `NOT_STARTED`, correctly sequenced later.

**Recommended next phase (at the time this Phase 3 section was
written):** per this phase's own explicit stop condition, work stops
here — native iOS/Android background tracking, Breeding & Births, Feed &
Finish, Financial Intelligence, Request Quote, and other unrelated UI
expansion are deliberately not started. The `decisions`/`jobs` RLS
validation (blocker 2 above) is the smallest, most natural next
increment now that real Dev access exists, ahead of any new product
vertical.

**This exact blocker was resolved in the following phase — see "Phase A"
below.**

## Phase A — decisions/jobs real Dev database validation (2026-09-02/03)

A further unattended continuation session ran
`supabase/validation/decisions_jobs_rls_validation.sql` for real against
`Farm Return V1 Dev` via the Supabase CLI for the first time — the exact
increment Phase 3's own recommendation above named. The validator itself
had never actually produced a visible result through this invocation
path: every result line was `raise notice`, which `supabase db query`'s
Management-API execution path does not surface (the first real run
completed with zero errors but returned zero rows). Fixed by converting
to a session-temporary `validation_results` table read back via a real
`select`, exactly mirroring `job_sessions_actuals_validation.sql`'s own
already-correct pattern from Phase 3 above. A missing sequence grant
(found by the very next real run) was fixed the same way.

Also fixed a real coverage gap found along the way: Test 3d had been
silently SKIPping on this project because farm selection picked the
earliest other-owner farm, which happened to have no field, even though
a genuinely eligible Farm B existed — fixed by preferring a real
other-owner farm that already has a field (never fabricating one). The
validator was then extended with new tests covering
`20260829020000_jobs_weight_observation_reference.sql`'s own two CHECK
constraints and its `jobs_check_same_farm` extension (never touched by
any earlier version), plus `20260829010000_decisions_jobs_client_access.sql`'s
own `decisions_estimate_snapshot_ok_shape`/`jobs_decision_id_unique`
invariants (a real Codex-audit HIGH — both were named "confirmed" in
that migration's own checklist despite every existing test using
`outcome: 'dismissed'`, which exempts the shape constraint entirely).

**Live result: 29/29 checks PASS, 0 FAIL, 0 SKIP.** All three
decisions/jobs migrations promoted `APPLIED_DEV` -> `VALIDATED_DEV`.
Full account: `docs/validation/decisions-jobs-dev-validation.md`.

**Codex audit:** 4 rounds, this phase's own audit-fix-reaudit loop,
severity trend 1H+2M → 1H+1M → 1H+1M → **0/0/0/0 at round 4** (`GATE:
PASS`, zero findings of any severity on a full fresh whole-phase pass).
Every finding across all four rounds was a real documentation/
bookkeeping gap — an untested invariant a migration's own comment
claimed was confirmed, an arithmetically wrong check count, a
BUILD_STATE.json round-number labeling drift (repeated twice, each time
narrower), and overclaimed wording about what the RLS-impersonation
technique actually proves (narrowed twice: "two real sessions" →
"simulating two identities" → "complete database-layer RLS/grant
coverage, not real JWT/PostgREST/two connections") — never a code/schema
regression. Full transcripts and dispositions:
`docs/overnight/audits/decisions-jobs-dev-validation-codex-audit-round{1,2,3,4}.md`.

**Quality gate:** `scripts/quality-gate.sh --json` — test/typecheck/lint/
build all pass at every commit in this phase's chain (SQL/docs-only
round; no TypeScript changed).

**Status: every real Dev database migration in this schema is now
`VALIDATED_DEV`.** Both real Dev-validation phases this programme has
run (Job Session / Confirm Actual, Phase 3 above; decisions/jobs, this
phase) are genuinely closed with a clean Codex audit gate.

**Exact remaining blockers** (unchanged from Phase 3 above, see
`BLOCKERS.md` for full detail): `supabase_admin`'s own separate
public-schema default-ACL entry (`BLOCKED_EXTERNAL`); real CDSE
credentials for NDVI computation; an approved visual reference for any
Next screen still without one; the `p-build-up-eligibility.ts`/Today
surfacing decision (product-owner deferred).

**Recommended next phase (at the time this Phase A section was
written):** per the unattended continuation session's own instructions,
native/background GPS readiness (Phase B) — then Ask AI completeness
(Phase C), then Evidence Ledger/provenance UX (Phase D).

## Phase B — native/background GPS readiness (2026-09-03)

The same unattended continuation session proceeded directly into Phase
B per its own instructions ("do NOT stop merely because Phase A
succeeds"). B1 (audit before choosing technology) confirmed live — via
a real filesystem search, not an assumption — that no PWA manifest,
service worker, or native project (Capacitor config, `.xcodeproj`,
Android project) exists anywhere in this repo. The native container/
framework choice itself is documented as `BLOCKED_HUMAN`
(`docs/farm-return-next/NATIVE_GPS_ARCHITECTURE_DECISION.md`) — a
genuine product/business decision (team skillset, App Store review
posture, release-cost tolerance) this session cannot make from repo
evidence alone. That document compares three credible options grounded
in this actual codebase (Capacitor, React Native, web/PWA-only) —
Capacitor is the informational recommendation, though its own packaging
question (a live reachable server vs. a genuine static bundle, since
this app's real write path runs through Next.js Server Actions
throughout `src/orchestration/`/`src/lib/farm-data/`) is disclosed as
real, unresolved investigation rather than a solved detail.

B2 (platform-capability interfaces) added a new `NetworkStateProvider`
(`src/lib/network/`), mirroring `LocationTrackingProvider`'s own honest-
capability-boundary pattern, wired into `ActiveJobSessionView.tsx` to
replace three scattered raw `navigator.onLine` reads with one real,
testable boundary a future native adapter can implement directly. A
`NotificationDeliveryProvider` was deliberately *not* built
speculatively — zero real consumer exists yet, and this codebase's own
established discipline (`estimate_calibration`'s removal, `BLOCKERS.md`'s
repeated findings) treats an unconsumed interface as a defect, not a
harmless placeholder; the architecture document names exactly where it
belongs once a real consumer exists.

B3 (offline Job Session resilience) found and closed two real, disclosed
gaps: `outbox.ts`'s own `clearFarm`/`clearAll` had never been wired to
any sign-out path despite the module's own header comment naming this as
the next step once a real GPS-capture caller existed — fixed with
`flushAndCleanupOutboxOnSignOut` (flush, then `pruneSynced` only,
deliberately never `clearFarm`/`clearAll`, which would destroy a
genuinely unsynced observation); and `outbox.ts`'s own `reclaimStale` had
zero real callers anywhere despite its own doc comment recommending "once
at app startup" — fixed by calling it (then flushing unconditionally
when online) on every real `ActiveJobSessionView` mount.

**Codex audit:** 6 rounds, this phase's own audit-fix-reaudit loop,
severity trend 2 MEDIUM → 2 MEDIUM → 1 MEDIUM → 2 MEDIUM → 1 MEDIUM →
**0/0/0/0 at round 6** (`GATE: PASS`). Every finding across all six
rounds was a real honesty/consistency gap in a screen-facing claim (a
false "Synced" status; "Synced" conflating connectivity with actual sync
completion; a silently-swallowed local-storage failure; a present-tense
banner that could go stale after recovery) or a supporting document (the
architecture decision's own overstated reuse claims, corrected across
three rounds; the GPS contract's own stale "no caller needs to change"
claim) — never a security, cross-farm, or fabricated-value defect. Full
transcripts and dispositions:
`docs/overnight/audits/phase-b-native-gps-readiness-codex-audit-round{1,2,3,4,5,6}.md`.

**Quality gate:** `scripts/quality-gate.sh --json` — test/typecheck/lint/
build all pass at every commit in this phase's chain.

**Status: native/background GPS readiness's framework-independent work
is complete; the container/framework choice itself remains
`BLOCKED_HUMAN`.** Every persistence-layer migration in this schema
remains `VALIDATED_DEV` (unchanged by this phase — no schema/migration
work here).

**Exact remaining blockers** (unchanged from Phase A above, see
`BLOCKERS.md` for full detail): `supabase_admin`'s own separate
public-schema default-ACL entry (`BLOCKED_EXTERNAL`); real CDSE
credentials for NDVI computation; an approved visual reference for any
Next screen still without one; the `p-build-up-eligibility.ts`/Today
surfacing decision (product-owner deferred); the native container/
framework selection itself (`BLOCKED_HUMAN`, this phase's own finding).

**Recommended next phase (at the time this Phase B section was
written):** per the unattended continuation session's own instructions,
contextual Ask AI completeness (Phase C) — then Evidence Ledger/
provenance UX (Phase D).

## Phase C — contextual Ask AI completeness (2026-09-03)

Audited all 8 real `AskAIButton` call sites (Today, Plan, Records,
Fields, Expanded Prompt, Confirm Actual, GPS Job Mode, plus
`GateConstraintCard`'s own prop-driven pattern with no live caller yet).
Found the real structural gap: `AskAIContext.facts` was
`Record<string, string>` with no way to carry provenance at all — every
fact rendered identically whether it was a real scientific evidence
tier, a farmer-confirmed value, or a plain presentational count,
directly short of the product spec's own "Ask AI must distinguish
Observed/Estimated/Farmer Actual/authoritative external data"
requirement.

Fixed by extending `AskAIContext.facts` to accept either a plain string
(unchanged meaning) or a new `AskAIFact` discriminated union (`{value,
evidenceState}` / `{value, farmerActual: true}` / `{value}`) — reusing
`src/domain/evidence.ts`'s own six-value `EvidenceState` vocabulary and
`EVIDENCE_STATE_UI_LABEL` display strings verbatim, never a second,
competing tier taxonomy. Applied where a real, concrete mismatch
existed: `ExpandedPromptSheet.tsx`'s "Evidence" fact previously sent Ask
AI only the raw `basis.status` string ("OK"), silently dropping the
real evidence tier the same screen already shows the farmer as a
visible Pill; `today/page.tsx`'s "Leading prompt" fact had the identical
gap, with the added subtlety that `selectPrimaryPrompt` can rank a
non-OK Prompt highest by design, so both fixes only tag a fact with
`evidenceState` when `basis.status === "OK"`. Deliberately did not build
a `NotificationDeliveryProvider`-style speculative extension for
satellite/`GateConstraintCard` contexts — no real screen consumes either
yet, matching this codebase's established discipline against shipping
unconsumed interfaces.

**Codex audit:** 3 rounds, this phase's own audit-fix-reaudit loop,
severity trend 1 MEDIUM + 1 LOW → 1 LOW → **0/0/0/0 at round 3** (`GATE:
PASS`). Every finding was a real type-safety or test-rigor gap (an
object shape that let a caller set both `evidenceState` and
`farmerActual` at once, silently preferring one; ambiguous test
assertions that could pass without the provenance tag actually
rendering) — never a fabricated evidence claim or a breaking change to
any of the five pre-existing `AskAIContext` callers, explicitly
re-verified unchanged at round 3. Full transcripts and dispositions:
`docs/overnight/audits/phase-c-ask-ai-completeness-codex-audit-round{1,2,3}.md`.

**Quality gate:** `scripts/quality-gate.sh --json` — test/typecheck/lint/
build all pass at every commit in this phase's chain.

**Status: Ask AI's own context contract now genuinely distinguishes
scientific evidence tiers and Farmer Actual status wherever a real
consumer exists.** No new AI/LLM provider is wired in this phase (still
the disclosed, unchanged gap `AskAI.tsx`'s own header comment names) —
the context object a future provider would receive is what improved.

**Exact remaining blockers** (unchanged from Phase B above, see
`BLOCKERS.md` for full detail): `supabase_admin`'s own separate
public-schema default-ACL entry (`BLOCKED_EXTERNAL`); the native
container/framework selection (`BLOCKED_HUMAN`); real CDSE credentials
for NDVI computation; an approved visual reference for any Next screen
still without one; the `p-build-up-eligibility.ts`/Today surfacing
decision (product-owner deferred); a `NotificationDeliveryProvider`
boundary, deliberately deferred until a real consumer exists (this
phase's own finding, matching Phase B's identical reasoning for the
same capability).

**Recommended next phase:** per the unattended continuation session's
own instructions, Evidence Ledger/provenance UX (Phase D).

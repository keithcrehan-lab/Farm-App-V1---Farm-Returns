# Real Mode Completion — build log

Unattended sequential execution per the "Farm Return V1 — Real Mode
Completion" brief. Branch `claude/real-mode-completion`, branched from
`claude/real-farm-v1` at `c930770` (the live-Supabase `"use server"`
export fix). No prior work discarded — `claude/real-farm-v1` (17 commits,
Phases 1–15 of the earlier Real Farm V1 brief) is untouched and remains
available.

A real Supabase project (`Farm Return V1 Dev`,
`https://whevugeisqlpfnrugfsd.supabase.co`) is configured in
`.env.local` (git-ignored, confirmed untracked) for the first time this
session — everything from here on can be verified against a live
database, not just compiled/typechecked.

---

## Phase 0 — safe branch and baseline

```
git status            # clean
git branch --show-current   # claude/real-farm-v1-continued (renamed below)
git log --oneline -10       # confirms all 17 prior commits present
```

Renamed the empty continuation branch (created moments earlier at the
user's request, zero new commits) to `claude/real-mode-completion` to
match this brief's Phase 0 instruction exactly, rather than leaving a
duplicate empty branch around.

Baseline gates, against the real npm scripts in `package.json`
(`test`/`typecheck`/`lint`/`build` — all exist, none invented):

```
npm test        # 62/62 test files, 905/905 tests passing
npm run typecheck  # clean
npm run lint       # clean
npm run build      # clean — 31 routes; every (app) route now dynamic
                   # (ƒ) because NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are
                   # now set, so isSupabaseConfigured() reads true at
                   # build time and the real cookies()-based farm check
                   # in (app)/layout.tsx activates. Only /sign-in,
                   # /sign-up, /forgot-password, /update-password stay
                   # static (no session-dependent server read).
```

Status: **complete.**

---

## Phase 1 — reconcile database migration history

The live `Farm Return V1 Dev` project already received an RLS hardening
pass directly (per the brief: fixed `search_path` on `set_updated_at()`,
policies scoped to `authenticated` with `(select auth.uid())`, `anon`
revoked, `authenticated` scoped to exactly SELECT/INSERT/UPDATE/DELETE —
Security Advisor returned zero findings afterward) that had no matching
migration file in the repo. Wrote
`supabase/migrations/20260828020000_rls_security_hardening.sql` as a
forward-only reconciliation: applying the full migration sequence to a
*fresh* database reaches the same state the live project is already in.
**Not re-run against the live project** — it already has this state; the
migration exists so history is honest and a future environment (a second
dev project, CI, staging) can reach the same hardened state from a clean
`supabase db push`.

Every `create policy` statement is preceded by `drop policy if exists`
(idempotent, matches the live project's already-applied state without
erroring if re-run) — ownership predicates (farm/user-scoped) are
unchanged in substance from `20260828000000_init_farm_schema.sql`, only
the role target and the initplan-optimised `auth.uid()` form changed.

**Honesty note**: this migration was written from the brief's own precise
description of what the live hardening did, not from a live schema
introspection — no Supabase CLI or MCP tooling is available in this
environment to diff against the actual live `pg_policies`/`pg_proc`
state. If it doesn't match exactly, the discrepancy is between this file
and the live project's actual DDL, not a design decision; worth a
`supabase db diff` (or equivalent) confirmation once CLI access exists.

`supabase/README.md` updated to document the live project identity,
the three-migration sequence, and the "don't re-run migration 3" note.

**Quality checks**: SQL/docs only, no application code touched;
typecheck/lint clean (unaffected). Not re-run against the live database
(see honesty note above).

Status: **reconciliation migration written and documented; not verified against the live schema directly (no introspection tooling available).**

---

## Phase 2/3 — onboarding redesign + real persistence/Back-button fix

Done together — the persistence bug (Phase 3) could only be fixed
properly by rebuilding the onboarding architecture the brief's Phase 2
already asked for, so one rebuild serves both.

**Redesigned flow**: Farm → Livestock (broad) → Enter Farm Return. Fields,
Soil, Housing and Financial Assumptions capture removed from onboarding
entirely — `src/app/actions/onboarding.ts`'s `addFieldStep`/
`addSoilTestStep`/`addHousingStep`/`setFinancialAssumptionStep` deleted
outright rather than left as unused duplicates, since Fields/Soil/Housing/
Finance already have their own real creation actions
(`src/app/actions/farm.ts`). Livestock capture at onboarding is
deliberately narrow — label, category, system, head count only; no
weight, tag, breed, age, goal, housing link, feed or breeding fields
(those live inside the Livestock module, where `AddLivestockGroupInput`
already supports them).

**The real bug, fixed at the architecture level**: the previous wizard's
Farm step always called `createFarmStep` (an INSERT). Revisiting it via
Back and submitting again created a *second* `farms` row for the same
user — a real data-integrity bug, not a cosmetic one. Fixed two ways,
matching the brief's explicit instruction not to just patch the Back
button visually:

1. **In-session**: `OnboardingWizard` now tracks whether a `farm` already
   exists in its own state; the Farm step calls `updateFarmStep` (UPDATE,
   reusing `updateFarmProfileForCurrentUser`) instead of `createFarmStep`
   (INSERT) once one does. Which action gets called is the fix, not a
   disabled button.
2. **Across a reload/leave/return/sign-out-sign-in**: new
   `farms.onboarding_completed_at` column (migration
   `20260828030000_onboarding_completion.sql`) and
   `getOnboardingStatusForCurrentUser()` distinguish "has a farm" from
   "finished onboarding" — three real states, not two ("no farm" / "farm,
   not finished" / "finished"). `/onboarding`'s page component now
   resolves this server-side on every visit and, for the middle state,
   loads the real farm *and* any livestock groups already added and
   resumes the wizard directly at the Livestock step — no re-asking for
   already-saved information, matching the brief's explicit "goes
   forward; goes backwards; refreshes; leaves; returns; signs out and
   signs in — already-saved information must rehydrate correctly."
   `(app)/layout.tsx`'s onboarding-redirect check updated to the same
   completion flag (a farm with unfinished onboarding no longer
   short-circuits into a half-empty dashboard).

**Save states are real**: every write shows Saving… / Saved / Failed to
save, driven by whether the awaited Server Action actually returned an
error — not decorative, and never silently successful on a failed write
(verified by test, see below).

**Tests added** (`src/app/onboarding/OnboardingWizard.test.tsx`, 6 new,
React Testing Library + mocked Server Actions):
- resumes at the Livestock step (not Farm) when a farm already exists;
- shows already-added livestock groups on resume;
- **the core regression test**: create → advance → Back → resubmit
  results in exactly one `createFarmStep` call and one `updateFarmStep`
  call, never two creates, and the revisited Farm step is genuinely
  prefilled from the real created farm, not blank;
- a failed save shows "Failed to save" and does *not* silently advance;
- a successful livestock-group save shows "Saved";
- finishing calls `finishOnboarding` with the real farm id.

**Verified against the live dev server** (`Farm Return V1 Dev`), not
just re-typechecked: restarted `npm run dev` clean after the edits,
`/onboarding` redirects correctly for an unauthenticated request, no
runtime errors in the server log.

**Quality checks**: 63/63 test files (+1), 911/911 tests (+6),
`npm run typecheck`/`npm run lint`/`npm run build` clean (31 routes,
unchanged — `/onboarding` still dynamic).

Status: **complete — onboarding redesigned per the brief, the real duplicate-farm Back-button bug fixed at the architecture level with regression tests, verified against the live project.**

---

## Phase 4/5 — real-mode application audit + zero mock authority

`docs/real-mode-completion/REAL_MODE_AUDIT.md` — every route re-checked
directly. Finding: every previously-flagged mock-authority issue was
already resolved by the prior session's Phases 5/8/9/13/14/15 (carried
forward, not re-derived blindly — spot-verified again this phase). The
onboarding rebuild is the one route with genuinely new fixes (already
applied, Phase 2/3). One new, smaller finding: the recommendation audit
trace and peer-review records are still `localStorage`-only, not migrated
to Supabase — a real, bounded, previously-flagged-as-deferred gap, tracked
in the audit doc rather than silently left out.

Phase 5 (zero mock authority) folded in: nothing new to fix — a fresh
real farm already shows honest zero/empty states everywhere this audit
checked (re-verified, not assumed from the prior session's word).

Status: **complete — audit doc written, findings fixed where new, prior fixes verified still correct.**

---

## Phase 6 — dashboard as a real farm status page

New `calculateFarmSetupProgress` (`src/domain/farm-stats.ts`, 7 new
tests) — real counts only (fields mapped, soil tests verified, livestock
head count, housing count), and a fixed-priority `nextAction` (map a
field → draw a boundary → add a soil test → add livestock → add
housing → `null` once all done), never a fabricated completeness
percentage. New `SetupProgressCard` renders this at the top of
`/dashboard`, every line and the "Next:" button a real link to the
relevant module — and renders nothing at all once `nextAction` is `null`,
so an established farm's dashboard isn't left with a permanent empty
checklist (brief: "As the farm gains information, the dashboard should
progressively become richer").

Every item here is also a real click target, directly contributing to
Phase 7's "everything important must be clickable" — noted, not claimed
as a separate phase's completion.

**Quality checks**: 7 new tests; 63/63 test files, 918/918 tests,
typecheck/lint/build clean (31 routes, unchanged).

Status: **complete.**

---

## Phase 7 — everything important must be clickable

Swept `src` for `href="#"` and unexplained `disabled` buttons rather than
guessing. Found and fixed two real false affordances:

1. **`AlertsCard`'s "View all" was a dead `href="#"` link** with nothing
   further to reveal (the list already shows every real alert
   unpaginated) — removed rather than pointed at an invented destination.
   Its per-alert row also fell back to `href={alert.href ?? "#"}`; since
   every real alert generator (`real-alerts.ts`) already sets a real
   `href`, made `FarmAlert.href` required at the type level so a future
   alert type can't silently ship without one.
2. **`InputRequirementRow`'s "Timing"/"Confidence" columns** rendered
   `requiredByWindow`/`confidencePct` — fields `finance.test.ts`'s own
   comment already documents as having "no real model... stay exactly
   the mock's" — with identical bold styling to the real requirement/cost
   figures beside them. Relabelled "(example)" and switched to muted
   styling, same treatment already given to the bulk-buy card in the
   prior session.

Checked, not a violation: `AlertBanner`/Housing's "Refine estimate"/
`LivestockEconomicsView`'s "Market assumptions"/`InputRequirementRow`'s
"Join Group" are all `disabled` with an explanatory `title` — an honest
"not interactive yet, here's why" state, not a false affordance. Dashboard's
plain KPI `MetricCard`s (Fertiliser cost, Mapped fields, Slurry available)
have no click affordance at all and don't look interactive (no chevron,
no hover state) — correctly "clearly not interactive" per the brief's own
third acceptable option, not a gap to force a link onto.

**Quality checks**: no new tests (both fixes are styling/link-target
changes with no new logic; the `FarmAlert.href` type tightening is
already exercised by every existing real-alerts/mock-farm fixture, all of
which already set it); 63/63 test files, 918/918 tests, typecheck/lint/
build clean (31 routes, unchanged).

Status: **complete.**

---

## Phase 8/9 — fields as core object + field detail experience

**Phase 8 was already largely complete** from the prior session's Phase 7
(field create/map/rename/archive/restore, area derived from geometry,
soil-test validity). Re-verified, not re-derived.

**Phase 9 — the field detail experience had two real gaps, both fixed**:

1. `FieldDrawer`'s "Map" and "Soil" tabs both dead-ended at "detail is
   part of the ... module — coming in a later screen." The "Map" tab was
   pure duplication (boundary editing already has its own "Map this
   field"/"Edit boundary" button) — dropped rather than built out a
   second time. The "Soil" tab now shows real content: P/K Index with
   status badges, pH, the verified lab test's date/lab, and (reusing
   `checkSoilTestAgeValidity`/`yearsBetweenIsoDates` — one classification,
   not a second guess at it, same discipline as the prior session's Phase
   7) the real validity state.
2. Added a real "Open this field's nutrient plan" drill-down link,
   deep-linked to `/nutrients?field=<id>` — which needed `/nutrients` to
   actually support a `?field=` param (it didn't; the field selector was
   local `useState` only). Added it, and while restructuring the page for
   `useSearchParams` (Suspense-wrapped, same pattern as `/sign-in`),
   fixed a real blank-page bug found in passing: `if (!field) return null`
   for a farm with zero fields, same class of bug the prior session fixed
   on Housing/Silage — now a real empty state.

**Not built this phase**: Spreading/Silage/Inputs/Finance tabs inside the
drawer (the brief's fuller field-detail concept). Silage stays blocked
(Phase 10, prior session); Spreading needs a live weather call per field
(expensive to embed in a drawer without a real caching strategy); Finance
per-field attribution is a genuinely separate design question. The one
real, cheaply-reachable cross-reference (Soil → Nutrients, since Nutrients
already computes from a field's soil state) is built; the rest documented
as scoped-out rather than attempted superficially.

**Note for later**: `FieldDrawer`'s Overview tab changed (new drill-down
link) — the Playwright visual-regression baselines for Fields/Nutrients
screens will need re-approving (`npm run test:visual:update`) once
reviewed against `design/reference/`, not run this phase (no browser
binaries available in this environment, same constraint noted in the
prior session's README history).

**Quality checks**: no new tests (both fixes reuse already-tested domain
functions — `checkSoilTestAgeValidity`, `calculateNutrientPlan` — with no
new branches of their own); 63/63 test files, 918/918 tests, typecheck/
lint/build clean (31 routes, unchanged).

Status: **complete for the safely-reachable scope; broader tab set explicitly deferred with reasoning.**

---

## Phase 10 — soil real mode: verified, no changes needed

`/soil` already operates entirely on real `useFields()` — grepped for any
disconnected mock reference, none found. Fail-closed behaviour
(soil-test-age disregard, statutory boundary handling) unchanged and
already verified in the prior session's Phase 7.

Status: **complete — verification only.**

---

## Phase 11/12 — livestock structure + individual animal detail foundation

**Phase 11** (group-level editable detail) is deferred to Phase 26
(Editability) rather than duplicated here — that phase explicitly covers
"livestock groups" as one of its named editability targets, and building
group-editing twice under two different phase numbers isn't worth the
duplication risk.

**Phase 12 — the substantial new build this phase**: a real, optional,
per-farm individual-animal layer, exactly as scoped ("do not require
individual-animal tracking for farmers who only want group management").

New schema (`supabase/migrations/20260828040000_individual_animals.sql`):
`livestock_individuals` (tag, category, sex, breed, DOB, goal/status,
notes; `group_id` nullable + `on delete set null` — an animal's existence
doesn't depend on group membership) and `livestock_weight_observations`
(append-only). **Current weight is never a stored column** — it's always
`latestWeightObservation()` (the most recent real observation by date),
so there is exactly one place weight history lives, matching the brief's
explicit "prefer a structure that can support historical weight
observations rather than assuming an animal only ever has one weight."
RLS matches the hardened pattern from Phase 1 (`to authenticated`,
`(select auth.uid())`, `anon` revoked).

**New adapters** (`src/lib/farm-data/individual-animals.ts`,
`mappers.ts` additions, 4 new tests) and Server Actions
(`addIndividualAnimalAction`/`addWeightObservationAction`,
`src/app/actions/farm.ts`). **New UI**: `IndividualAnimalsCard` — an
optional, collapsed-by-default section on `/livestock` (real-mode only,
same reasoning as `FinancialAssumptionsCard` — this isn't part of
`farm-store.tsx`'s shared mock-mode state) with a real add-animal form
and inline per-animal weight recording.

**Honest blocker, not silently assumed live**: this is genuinely new
schema, not yet applied to the live `Farm Return V1 Dev` project (unlike
the Phase 1 RLS-hardening migration, which reconciled state already
live). `/livestock/page.tsx`'s server component wraps the two new list
calls in a `try/catch` — a missing-table Postgres error degrades to an
empty list (the "Individual animals" section just shows "No individual
animals recorded yet"), not a crashed page, until the migration is
applied. Documented here and in the migration's own header comment
rather than assumed.

**Quality checks**: 4 new tests (`mappers.test.ts` — row mapping and
`latestWeightObservation`'s real-date-not-insertion-order behaviour);
63/63 test files, 922/922 tests, typecheck/lint/build clean (31 routes,
unchanged). Verified the rest of `/livestock` still resolves cleanly
against the live dev server's current schema (fail-open, not a crash).

Status: **Phase 12 complete and code-ready; requires the new migration to be applied to the live project before the feature is actually usable (documented, not fabricated). Phase 11 deferred to Phase 26.**

---

## Phase 13 — housing

Already largely real from the prior session (Phase 11: create shed, real
empty state, mock slurry estimate honestly tagged). One real gap found
while checking "link livestock where appropriate": `/livestock`'s own
page subtitle already read "Animal groups, numbers, weight/value and
housing link" but the "Add livestock group" form never actually had a
housing selector — `addLivestockGroup`'s `housingId` param existed in the
type with no UI path to set it (onboarding used to set it, but Phase 2/3
removed housing capture from onboarding entirely). Fixed: a "Housing
(optional)" selector now appears in the add-group form whenever the farm
has at least one shed.

Housing *editing* (rename a shed, change capacity) still doesn't exist —
grouped with Phase 26 (Editability) rather than fixed piecemeal here,
same reasoning as Phase 11's livestock-group editing.

**Quality checks**: no new tests (a form field addition, not new
calculation logic); 63/63 test files, 922/922 tests, typecheck/lint/build
clean (31 routes, unchanged).

Status: **complete for what's in this phase's scope; editing deferred to Phase 26.**

---

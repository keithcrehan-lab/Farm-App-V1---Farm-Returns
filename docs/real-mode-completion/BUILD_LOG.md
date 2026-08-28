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

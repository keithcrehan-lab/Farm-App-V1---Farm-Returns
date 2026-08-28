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

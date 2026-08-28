# AGENTS.md — Farm Return

Tool-agnostic operating rules for any coding agent working in this
repository (Codex, Claude, or otherwise). `CLAUDE.md` carries the same
rules with Claude-Code-specific workflow detail; this file is the
convention-based entry point other tools (this repo's own
`scripts/codex-audit.sh` included) look for. Where the two differ, treat
it as a bug — open `CLAUDE.md`, this file, and
`docs/farm-return-next/BUILD_PLAN.md` and reconcile rather than picking
one.

## What this repository is

Farm Return: a free Irish farm management and financial intelligence
platform. `docs/product-requirements.md` is V1's product source of truth;
`docs/farm-return-next/MASTER_SPEC.md` is Next's. Farm Return V1 is
**frozen** at tag `v1-baseline-2026-08-29` — do not modify anything on
that history; all active work happens on `farm-return-next` and its
descendant branches.

## Non-negotiable rules

- Never place a scientific/financial calculation inside a UI component —
  it lives in a pure, tested `src/domain/` module with a
  `docs/evidence-register.md` source.
- Never invent a production scientific, regulatory, or financial number.
  A calculation with insufficient evidence fails closed
  (`BLOCKED_INSUFFICIENT_EVIDENCE`), it never substitutes a plausible
  guess.
- Never duplicate a `src/domain/` or `src/lib/farm-data/` calculation or
  query in a new layer — call the existing export
  (`docs/farm-return-next/DOMAIN_CONTRACTS.md`).
- Never merge into `main`.
- Never deploy to production or run a migration against a production
  database. `.env.local` targets `Farm Return V1 Dev` only.
- Never force-push or rewrite published history on any shared branch.
- Never make a destructive database change (drop/truncate/irreversible
  data loss) — every migration in this repo is forward-only.
- Never present a fabricated/mock figure to a real signed-in account —
  an honest empty/unavailable state instead
  (`docs/real-mode-completion/BUILD_LOG.md`'s P3/P9 entry is the pattern).
- Never skip an audit because the audit tool is temporarily unavailable —
  retry, don't proceed unaudited
  (`docs/farm-return-next/BUILD_PLAN.md`).

## Quality gate

`scripts/quality-gate.sh` — runs `npm test`, `npm run typecheck`,
`npm run lint`, `npm run build` in sequence, non-zero exit on any failure.
Run it before every commit that isn't a pure documentation change, and
always at a `BUILD_PLAN.md` checkpoint boundary.

## Independent audit

`scripts/codex-audit.sh` — runs the OpenAI Codex CLI (`codex review`)
against a diff as a second, independent reviewer. Any finding labelled
Critical or High (taxonomy: `docs/farm-return-next/BUILD_PLAN.md`) blocks
progression until resolved or explicitly deferred with a documented
reason in `docs/farm-return-next/BLOCKERS.md`.

## Parallel/worktree work

Multiple agents may work this repository concurrently only once
`docs/farm-return-next/BUILD_STATE.json.contracts_frozen` is `true` and
only within the vertical boundaries `docs/farm-return-next/BUILD_PLAN.md`
defines. An agent that needs to change a file outside its assigned
vertical, or the signature of anything in
`docs/farm-return-next/DOMAIN_CONTRACTS.md`'s frozen table, stops and
documents the need in `docs/farm-return-next/BLOCKERS.md` rather than
making the change unilaterally. Use an isolated git worktree per
concurrent agent — never two agents sharing one working tree.

## State and logs

`docs/farm-return-next/BUILD_STATE.json` is the single machine-readable
state file. `docs/farm-return-next/IMPLEMENTATION_LOG.md` is the running
human-readable log. Both are updated in the same commit as the work they
describe — never left to drift.

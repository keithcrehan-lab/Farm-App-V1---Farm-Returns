# AGENTS.md — Farm Return

Shared global authority for Claude and Codex. CLAUDE.md imports this file.
Product/UI-specific principles and screen workflow remain binding in
`.agent/PRODUCT_RULES.md` when that work is in scope. BUILD_PLAN retains
checkpoint/vertical governance; read the relevant sections only.

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
always at a `BUILD_PLAN.md` checkpoint boundary. Exception: inside
`scripts/agent-run`, checkpoint commits use its deterministic changed-path
verification policy (`.agent/README.md`); the full gate runs there for
shared/frozen-contract, config or unbounded changes, or with `--full-tests`.

## Independent audit

`scripts/codex-audit.sh` — runs the OpenAI Codex CLI (`codex exec`)
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

## Context and task boundaries

- UNKNOWN is never zero. Farm identity is bound server-side; never cross farm boundaries.
- Science is deterministic, sourced and versioned. Preserve source/date/version/status and
  original provenance when replacing estimates; never label modelled data as a sensor reading.
- Read CURRENT_TASK and TASK.json; its immutable base defines the complete task delta.
  Manifest expected files are hints, never an audit allow-list. Follow dependencies and
  relevant frozen contracts/evidence across domain boundaries; missing context blocks work.
- Primary audit reviews the complete task, remediation verifies fixes and related regressions,
  and a final task audit is required before closure. Narrow verification cannot close a task.
  A clean primary audit of the complete task delta at the exact closing HEAD is that final audit.
- History is on demand (`docs/farm-return-next/history/`). Read active BLOCKERS and relevant
  contract sections; do not ingest historical state, logs or entire registers by default.
- Campaign B frozen: `b24c266`. Campaign C requires a separately authorised task.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

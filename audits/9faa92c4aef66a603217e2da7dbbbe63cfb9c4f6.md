# Independent audit — release deploy

Range: 6262c4ca824cbe84e7714bdc0d72c92f7ec0f0e5..9faa92c4aef66a603217e2da7dbbbe63cfb9c4f6
Reviewer: separate Claude reviewer (general-purpose agent with no part in writing the change), 2026-11-12. Codex unavailable; alternative approved by the product owner (AGENTS.md).
Method: source review, two rounds (6262c4c..632f9ac, 632f9ac..45c10b8). Trial run of the new pipeline on the work branch at 45c10b8 (workflow_dispatch, deploy skipped): static and all six test parts passed, each in under 2 minutes. 9faa92c only widens the tooling-tests path filter (reviewer's Low finding 1).

## Scope
Faster release pipeline (product owner request): typecheck and lint in a parallel job; app tests split across six machines with vitest --shard, each part checked against the known-failing baseline; node_modules cached on package.json + package-lock.json; route types generated in both jobs; deploy needs both. src/tooling/agent-run.test.ts (agent build tooling, about 23 minutes, already known-failing) excluded from release runs and run in tooling-tests.yml on tooling changes (BLOCKERS CI-SPEED-1). No app code change.

## Findings
- Round 1: 0 Critical/High. Medium: cache key ignored package.json, so npm ci's lockfile check was skipped on a hit (fixed). Low: route types not generated before tests (fixed); no way to refresh the cache (v1 tag added); part balance (watched; one part hit the timeout, cause was agent-run.test.ts).
- Round 2: 0 Critical/High. Fixes verified; --exclude adds to the config excludes; the orphaned baseline entry trips no check; nothing the tooling test covers ships. Low: tooling path filter missed scripts/tests/agent-* (fixed in 9faa92c); tooling workflow shows failing until CI-BASELINE-1 is fixed (expected, not a deploy gate).

## Gates after the change
Deploy still requires typecheck, lint, every app test outside the known-failing list across all six parts, and this audit record.

VERDICT: BLOCKING=0

# Schemes Adviser v1 — Autonomous Execution Policy

This policy governs every phase. It supplements `CAMPAIGN.md`. The product owner does not approve ordinary phase transitions.

## Default

Each phase runs:

BUILD → deterministic verification → primary audit → bounded remediation → strict whole-phase Codex audit → bounded remediation and re-audit → freeze → closure receipt → **next phase starts automatically**.

`./scripts/agent-campaign-run schemes-adviser-v1` runs and resumes this. Local commits are authorised. Push, deploy, merge to `main` and migrations are not.

## Freeze requirement

A phase freezes only with a strict audit of `CRITICAL=0 HIGH=0 MEDIUM=0` over its whole base..HEAD range, phase verification and the full quality gate passing at that SHA, a clean tree and a valid receipt. Low findings are recorded and not repaired, unless an auditor heads one `BLOCKING`, which stops.

Codex is the independent reviewer. Builder completion reports are not evidence.

## Human stops

Do not stop for ordinary engineering defects. Repair and re-audit within the budgets below.

Stop only when the harness raises a judgement or safety gate:

- regulatory interpretation;
- source precedence or conflicting evidence;
- missing external evidence;
- product decision;
- any migration, schema change or destructive data change;
- change to a frozen contract, or scope beyond the phase manifest;
- secrets, credentials or production access;
- push or deploy;
- a Critical finding;
- repeated Critical/High/Medium defect family beyond the budgets.

For schemes specifically, a material requirement that cannot be confidently mapped to authoritative evidence is a STOP, not an assumption. A requirement whose source is clear but which Farm Return cannot evaluate is recorded as `UNSUPPORTED` and does not stop (`CAMPAIGN.md`, "Requirement semantics").

## Repair budgets

Fixed by the runner and manifest, per phase: High ≤ 2 rounds, Medium ≤ 4 rounds, ≤ 2 attempts per defect family. Critical is never repaired automatically.

## Defect-family repair

An audit finding is an example of a defect family, not permission to patch one line. For every repairable High or Medium finding: identify the governing invariant and defect family, search the current phase for siblings, repair the family inside the authorised scope, and add a direct regression plus a class-level regression where practical. Do not broaden into a different family.

If a family survives two correctly scoped repairs, stop. Family identity is invariant plus defect-family name, so a severity change, rename or moved symptom does not reset the budget.

## Build discipline

Before implementing, make the phase contract explicit from the brief: owned versus predecessor semantics; required/missing/null rules; evaluation date and version selection; evidence precedence; units and rounding; data owners; forbidden dependencies. Design the verifier before relying on the implementation, with positive cases and safe negative controls for each important invariant.

Compose frozen predecessors and consume their published outputs. Never re-derive their semantics.

## Resuming after a stop

1. Read `./scripts/agent-campaign-run schemes-adviser-v1 --status` and the audit or report it names.
2. Record the decision first: `./scripts/agent-campaign-run schemes-adviser-v1 --resolve-stop --note "what was decided"`. The tree must be clean. If the phase has no committed work and HEAD is still its base, this restarts the phase from READY. If it has committed work, the budgets are kept and the whole phase is re-audited from its base.
3. Then add any supplied source material as a docs commit under `docs/evidence/schemes/<scheme>/`. Committing before resolving moves HEAD off the base, and the runner then treats the phase as having committed work.
4. Rerun `./scripts/agent-campaign-run schemes-adviser-v1`.

A decision needing new scope, a frozen-contract change or a migration is a separately authorised task, not a stop resolution.

## Write boundary

Every change, including docs and tests, must sit inside the phase `scope_guard` or a listed `allowed_shared_paths` entry. Scope guards name paths that the phase creates and must not exist before it starts. Evidence intake directories are therefore allow-listed rather than guarded, so supplying evidence early cannot block a phase.

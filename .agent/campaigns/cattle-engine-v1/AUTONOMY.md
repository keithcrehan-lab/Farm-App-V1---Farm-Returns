# Cattle Engine v1 — Autonomous Execution Policy

This policy governs autonomous execution of C8–C10. It supplements `CAMPAIGN.md`; frozen predecessor contracts still win on domain semantics.

## Default

Proceed autonomously through build, verification, audit, bounded repair, strict audit, freeze and closure. Do not pause for ordinary implementation choices that are resolved by the phase brief, frozen contracts, authoritative repository evidence or deterministic tests. Local commits are authorised. Push, deploy and migrations are not.

## Human stops

Stop only when the existing harness raises a judgement/safety gate, including: a required frozen-predecessor change; unresolved scientific, veterinary, regulatory, economic-source or product-policy judgement; conflicting authoritative contracts; a Critical finding; repeated High/Medium defect after the bounded repair budget; unsafe/ambiguous repository state; credentials/production access; or push/deploy/migration authority.

## Build discipline

Before production implementation, the builder must make the phase contract explicit from the authorised brief: owned vs predecessor semantics, required/missing/null/empty rules, temporal cutoff, status/evidence precedence, identity, units/precision, dependency ownership and forbidden dependencies. It must design the verifier before relying on the implementation and include positive plus safe negative controls for the important invariants.

For predecessor data: compose the owning engine and consume its published canonical output. Never accept a caller-supplied derived predecessor output as authoritative, never re-derive predecessor semantics, and never bind raw predecessor input merely to satisfy a mutation guard.

Dependency tests use the owner-aware A/B/C model:
- A — current-phase dependency: accepted material mutation changes the authoritative result.
- B — upstream-owned input: rerun the owner; if its published canonical output changes and is consumed, downstream changes; if owner output is unchanged, downstream stays byte-identical.
- C — explicit non-dependency: record `{path, owningPhase, reason}` and prove downstream is unchanged.

## Defect-family repair

An audit finding is an example of a defect family, not permission to patch only one line. For every automatically repairable High or Medium finding, identify the governing invariant and defect family, search the current phase for sibling instances, repair the family within the authorised phase scope, and add both a direct regression and a class/property/metamorphic regression where practical. Do not broaden into a different defect family.

If the same family survives two correctly scoped repairs, stop for human review rather than looping. Family identity is the governing invariant plus explicit defect-family name, so a severity change, renamed finding or moved symptom does not reset the retry budget.

## Gate pyramid

Use focused tests during implementation, the phase verify command at committed milestones, and the full repository quality gate only for freeze qualification. A strict whole-phase audit must end with CRITICAL=0 HIGH=0 MEDIUM=0 before a receipt may be written. At freeze, a full-suite test failure may be classified as `FLAKY_RECOVERED` only when it matches the campaign's explicit known-flake registry and then passes the existing deterministic harness classifier. The initial registry contains only the documented `src/tooling/agent-run.test.ts` → `passes the harness boundary/usage tests (agent-context.test.py)` timeout carrying `TimeoutExpired` from `test_timeout_cleanup_needs_no_process_enumeration`. That one test gets one isolated retry; it must pass; any skipped typecheck/lint/build gates must then pass; the original failure and structured recovery evidence are retained in the phase receipt. Unknown flakes, crashes, unparseable failures, deterministic assertions and failed retries remain failures. No model call is used for this recovery.

## Write boundary

Every product-code change must be inside the manifest phase `scope_guard` or an explicitly listed `allowed_shared_paths` entry. The runner enforces this mechanically. Earlier C0–C7 modules are frozen except the exact additive/shared paths explicitly authorised by the phase manifest.

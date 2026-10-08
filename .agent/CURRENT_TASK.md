# Task: Farm Spatial V2 — polish placeholders and final QA

Task ID: farm-spatial-v2-polish-placeholders-and-final-qa-20261008
Starting HEAD: 823261dacad020e5f5211e61b32d573267d61e6e
Verify command: `npm run typecheck && npm run build`

# Phase 6 — Capability placeholders, continuity, responsive polish and final QA

## Objective

Finish the Farm Spatial V2 experience as a coherent production surface while keeping unfinished engines explicitly unfinished.

## Scope

### Capability shells

Add/refine object-first placeholder shells for:

- Cattle groups;
- Sheep groups;
- Sheds/housing;
- future individual animal detail (tag, age, weight, target weight, group/location) **without fabricated production records**.

Use real group/housing data where it exists. If individual animal records do not exist, describe the planned information architecture only.

### Continuity / polish

- consistent spacing/type scale/action placement;
- purposeful microinteractions;
- lens transitions;
- selected-field/drawer continuity;
- object rail states;
- reduced motion;
- keyboard/touch/focus accessibility;
- desktop 1440×900 and mobile 390×844 inspection;
- no accidental overflow;
- remove residual generic cardification where it violates the approved contract.

### Regression protection

Add or update focused Playwright/component tests for the Farm Spatial V2 flow where the local environment supports them. Preserve existing visual baselines intentionally; do not blindly update unrelated snapshots.

Run the broadest safe quality gate for the final campaign state.

## Acceptance

- Farm Spatial V2 is visually coherent with the approved reference and contract.
- No fake scientific, financial or livestock values appear as real data.
- Existing real Mapbox/data/science architecture is reused.
- Frozen fertiliser vertical remains green.
- Existing unrelated capabilities are not deleted.
- Full relevant test/typecheck/lint/build suite passes.
- Final Codex audit reports no Critical/High findings.

## STOP

Do not update approved reference files to make a mismatch disappear. Do not weaken tests or visual thresholds merely to obtain a green run.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

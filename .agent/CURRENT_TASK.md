# Task: Farm Spatial V2 — real fertiliser field integration

Task ID: farm-spatial-v2-real-fertiliser-field-integration-20261007
Starting HEAD: 869d21724aa4e1bcbf0889586cba48fd6782b1de
Verify command: `npm run typecheck && npm run build`

# Phase 4 — Real fertiliser vertical: field integration

## Objective

Connect the approved field nutrient experience to the already-frozen canonical Fertiliser Vertical. This phase is a presentation/integration task, not a science task.

## Non-negotiable rule

**No nutrient requirement, slurry contribution, remaining requirement, product rate or quantity formula may be recreated in React/UI code.** Consume existing canonical domain/server-action outputs.

## Scope

For a selected field, render the approved sequence:

1. total nutrient requirement;
2. organic/slurry contribution;
3. remaining requirement;
4. product solution where the frozen vertical has a supported solution;
5. evidence/provenance/unknown state.

Use the approved dense N/P/K composition and domain colours rather than metric cards.

The field drawer should lead naturally into a field nutrient plan while preserving an obvious route back to the spatial Farm context.

All provisional/incomplete/unknown states from the frozen vertical must remain visible. Unknown is never zero.

## Required audit

Trace each displayed value back to its canonical export/action/type in code and add/update tests proving the UI adapter does not recompute it.

## Out of scope

- No change to fertiliser domain formulas or constants.
- No new product-science logic.
- No database migrations.
- No price API work beyond consuming an existing approved placeholder/benchmark path.

## Acceptance

- Real engine output reaches the new UI end to end for supported fields.
- Unsupported/incomplete cases stay honest.
- Existing fertiliser vertical tests continue to pass.
- Presentation does not mutate canonical quantities.
- Tests/typecheck/build pass.

## STOP

Any need to modify frozen science/economic contracts is a STOP and requires a separate authorised task.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

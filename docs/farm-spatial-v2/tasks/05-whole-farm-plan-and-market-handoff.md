# Phase 5 — Whole-farm nutrient planner, Plan and Market handoff

## Objective

Complete the first reference engine flow from physical Farm state through whole-farm fertiliser requirement into operational Plan and commercial Market handoff.

## Scope

- Whole-farm nutrient/input planner using the existing canonical farm fertiliser aggregation.
- Approved typography-led/asymmetrical outstanding quantity composition (large primary quantity; subordinate supporting values; no KPI tile grid).
- Field rows showing real contribution/requirement states without recomputation.
- Fertiliser purchase/application plan consuming canonical product quantities.
- Add-to-Plan handoff using the safest existing plan/job architecture available; do not invent persistence if the app does not yet have a canonical one. If only a presentation handoff is currently possible, label it honestly and document the missing persistence contract.
- Market handoff using the existing quote basket/request vertical. Scientific requirement and commercial supplier quote remain separate.
- Preserve requested vs canonical quantities as separate concepts where the existing vertical does.

## Design

Use colour planes, rules and typography rather than card stacks. Market may use cobalt/light-blue domain surfaces. Plan uses restrained forest/neutral confirmation treatment.

## Out of scope

- No new procurement backend.
- No supplier API integration.
- No new pricing science.
- No migrations unless an existing canonical persistence path explicitly requires one; if so STOP for separate authority.

## Acceptance

- Field → whole farm → fertiliser plan → Market works with real frozen vertical output.
- Quote-ready quantities reconcile with canonical aggregation and existing end-to-end tests.
- Plan does not silently claim persistence that does not exist.
- Market cannot alter the scientific requirement.
- Tests/typecheck/build pass.

## STOP

STOP if completing Plan requires a new database contract or migration. Do not create one in this campaign.

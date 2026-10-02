# Task: Fix Nutrient requirement card header badge overflow on mobile

Task ID: fix-nutrient-requirement-card-header-badge-overflow-on-mobile-20261002
Starting HEAD: c6745a6a9a9dd5e908e44c2239426b7804afb0c5
Verify command: `npm run typecheck && npm run build`

## Objective

Fix a pre-existing mobile layout defect recorded in `docs/farm-return-next/IMPLEMENTATION_LOG.md`
("Visual check — per-nutrient P/K Increment 5a and CC-FU-A"): at 390 px the Nutrient requirement
card's header badges (status badge + "Teagasc Green Book (5th Ed., 2020)" source badge) overflow
the card's right edge, in every state. Cause: `CardHeader` (`src/components/ui/Card.tsx`) is a
non-wrapping flex row and the card's badge group is `shrink-0`
(`src/components/farm/NutrientRequirementCard.tsx`).

## Scope

- Fix it in `NutrientRequirementCard.tsx` only, so the badge group wraps under/next to the title
  within the card on narrow viewports (e.g. allow the header row to wrap and the badge group to
  wrap/shrink), keeping the existing design tokens and the desktop appearance unchanged.
- Do not change the shared `CardHeader` / `Card` components (other cards depend on them).
- Check whether any other card that renders a `SourceBadge` in its header
  (`OrganicNutrientsCard.tsx`) has the same overflow; fix it the same local way only if it does.
- Add a component test asserting the header's wrap classes are present (layout itself is checked
  visually afterwards). Minimal IMPLEMENTATION_LOG entry.

## Out of scope

- Any content, wording, data or domain change; other cards; design-system tokens; migrations,
  harness, push/deploy.

## Working method (mandatory)

- Do NOT create temporary or scratch files inside the repository. If a quick check script cannot
  be run, rely on repository tests.

## Acceptance criteria

- At 390 px no header badge extends beyond the card; at desktop widths the header looks as today.
- Existing card tests pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if the fix requires changing a shared UI component or the design
system.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

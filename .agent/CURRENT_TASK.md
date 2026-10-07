# Task: Farm Spatial V2 — spatial Farm shell

Task ID: farm-spatial-v2-spatial-farm-shell-20261007
Starting HEAD: 9746a40eaefa8192ee50b2890d03cc6b22c51a07
Verify command: `npm run typecheck && npm run build`

# Phase 2 — Spatial Farm shell

## Objective

Implement the approved Farm Spatial V2 shell using real production architecture, without yet wiring new nutrient/fertiliser detail calculations.

## Source of truth

- `design/farm-spatial-v2/DESIGN_CONTRACT.md`
- approved interactive reference
- Phase 1 `IMPLEMENTATION_MAP.md`

## Scope

Implement the actual current Farm/home route identified in Phase 1 with:

- dominant real `MapHero` satellite canvas;
- strong readable Farm Return / farm identity hierarchy;
- real farm/field boundaries and honest no-data behaviour;
- persistent object rail for relevant Cattle / Sheep / Sheds capability shells;
- five-lens control: Current, Grass, Nutrients, Soil, Conditions;
- canonical primary navigation: Farm · What Matters · Plan · Market · Finance, using existing routes where they exist and honest placeholders/disabled destinations where they do not;
- responsive desktop and mobile composition based on the approved reference;
- Farm Spatial V2 tokens/geometry, information planes and restrained elevation.

Preserve all existing underlying Today/home producers and domain functionality. If a current capability is no longer visible on Farm by design, do not delete its code or data path; document where it will live or retain a temporary safe access path.

## Visual constraints

- No generic KPI/card grid.
- A container must earn its border.
- No static/prototype aerial image in production.
- Do not make every control green.
- Do not introduce crude animal SVGs; use approved-quality assets or a clean production asset strategy.
- Sheds live in the object rail, not as field markers.

## Data constraints

- Do not show outdoor livestock at a field unless the production model actually persists that location.
- Counts may use real persisted groups/housing data only.
- Capability shells must say unavailable/placeholder when real data is absent.

## Out of scope

- New nutrient calculations.
- Fertiliser product selection changes.
- Livestock schema changes.
- Individual animal engine.
- Migrations.

## Acceptance

- Real Mapbox map remains the dominant surface.
- Desktop and mobile are both usable with no overflow.
- Existing app compiles and existing real-mode flows are not intentionally broken.
- The shell visibly follows the approved asymmetrical, typography-led, low-cardification design.
- Relevant tests/typecheck/build pass.

## STOP

STOP if implementing the shell would require deleting or rewriting domain orchestration simply to make the UI fit.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

# Phase 3 — Field exploration and Farm lenses

## Objective

Implement the approved object-before-form field interaction and contextual lenses on top of the real spatial shell.

## Scope

- Tap/select a real field → strengthen selected boundary and visually recede neighbours without hiding them.
- Keep spatial context while a contextual field drawer rises from the map.
- Drawer identity: real field name/area and only trustworthy current data.
- Implement lens state and honest lens-specific overlays for Current / Grass / Nutrients / Soil / Conditions using existing data sources from the Phase 1 implementation map.
- Nutrients lens may expose field soil indices and available canonical nutrient summary data, but must not invent missing calculations.
- Soil/conditions/grass lenses show only data actually available; honest empty/unavailable states are preferable to mocks.
- Preserve responsive behaviour and reduced-motion accessibility.

## Interaction rules

- Motion explains selection/state change; target 140–220ms for ordinary transitions and ~220–350ms for drawer movement.
- No unrelated full-screen modal if context can remain attached to the selected field.
- Keep action placement attached to the object/field.

## Out of scope

- Do not rebuild fertiliser science.
- Do not add livestock location persistence.
- Do not add migrations.
- Do not fabricate field data.

## Acceptance

- Selecting/deselecting fields is deterministic and keyboard/touch accessible.
- Real mapped fields are the source of spatial state.
- Each lens has a distinct functional colour identity while retaining the same product grammar.
- Nutrients can lead into the existing nutrient/fertiliser vertical but new deep screens are Phase 4.
- Tests/typecheck/build pass.

## STOP

STOP if a lens needs a value that has no real source. Render an honest unavailable state rather than deriving it ad hoc in the UI.

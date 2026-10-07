# Task: Farm Spatial V2 — design authority and implementation map

Task ID: farm-spatial-v2-design-authority-and-implementation-map-20261006
Starting HEAD: 9da6e44705061a37bfad23d7c4299b096e7535d2
Verify command: `npm run typecheck && npm run build`

# Phase 1 — Farm Spatial V2 design authority and implementation map

## Objective

Prepare the repository for the approved Farm Spatial V2 implementation without changing the current user-facing home/Farm screen.

## Required reading

- `design/farm-spatial-v2/DESIGN_CONTRACT.md`
- `design/reference/farm-spatial-v2/approved/README.md`
- approved interactive HTML reference
- existing `design/design-system.md`
- `AGENTS.md`, `CLAUDE.md`, product requirements and relevant Farm/Fertiliser contracts

## Scope

1. Verify the approved-reference checksums and treat the reference directory as immutable.
2. Audit the actual current home/Farm route and its dependencies.
3. Audit `MapHero`, farm store selectors, current navigation, livestock/housing data and existing fertiliser vertical entry points.
4. Write `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` mapping every approved UI element to its real production source, or explicitly to `PLACEHOLDER / NOT IMPLEMENTED`.
5. Update `design/design-system.md` to make the Farm Spatial V2 contract authoritative for migrated Farm/Fertiliser surfaces when legacy guidance conflicts.
6. Add **additive** Farm Spatial V2 design tokens to `src/app/globals.css`, preferably with a distinct `--fr-v2-*` namespace. Do not globally change legacy token values in this phase.
7. Identify exactly which existing Today/home capabilities must be preserved while presentation is replaced. Nothing should be silently deleted.

## Required implementation map rows

At minimum map:

- real satellite map / field polygons;
- field selection and camera behaviour;
- farm identity;
- weather/conditions;
- livestock groups and whether real spatial assignment exists;
- housing/shed capacity;
- five lenses;
- field N/P/K requirement;
- organic/slurry contribution;
- remaining requirement;
- product solution;
- whole-farm fertiliser aggregation;
- Plan handoff;
- Market/quote basket handoff;
- What Matters/GPS/current Today capabilities that must survive the redesign;
- future individual-animal records.

## Out of scope

- No visible home/Farm redesign yet.
- No domain/science formula changes.
- No database migrations.
- No schema changes.
- No fake production data.
- Do not modify the approved reference files.

## Acceptance

- Current app behaviour/render is unchanged.
- Implementation map is specific enough that later phases do not need to guess a data source.
- Conflicts between legacy card-heavy guidance and Farm Spatial V2 are explicitly resolved in documentation.
- New colour/geometry tokens are additive and unused by legacy screens unless already semantically identical.
- All required repository checks pass.

## STOP

STOP rather than guessing if any approved UI value has no trustworthy source and cannot safely be a labelled placeholder.

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

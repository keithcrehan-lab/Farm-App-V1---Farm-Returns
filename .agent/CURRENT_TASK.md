# Task: Farm Spatial V2 — spatial shell visual refinement

Task ID: farm-spatial-v2-spatial-shell-visual-refinement-20261007
Starting HEAD: a3dd0e9dfb8b867c88f673b777bd2297135ee1c1
Verify command: `npm run typecheck && npm run build`

## Objective

Refine the completed Farm Spatial V2 shell so that the real `/today` Farm experience visually matches the approved Farm Return design direction much more closely.

This is **Phase 02B — Spatial Shell Visual Refinement**.

The underlying Phase 02 architecture is approved. Do not redesign the information architecture or add Phase 03 functionality.

The goal is to make the map feel like the farm operating surface rather than a conventional SaaS application wrapped around a map.

## Design authority

Use these as the visual source of truth:

- `design/farm-spatial-v2/DESIGN_CONTRACT.md`
- `design/reference/farm-spatial-v2/approved/desktop-01-farm-default.png`
- `design/reference/farm-spatial-v2/approved/desktop-02-field-drawer.png`
- `design/reference/farm-spatial-v2/approved/farm_return_design_system_refined.html`
- `docs/farm-spatial-v2/IMPLEMENTATION_MAP.md`

The approved reference pack has already passed SHA-256 integrity verification.

Do not copy mock values from the reference into production.

## Product state to preserve

The current `/today` implementation already has the correct high-level architecture:

- real Mapbox satellite farm map
- real field boundaries
- Farm identity
- five lenses:
  - Current
  - Grass
  - Nutrients
  - Soil
  - Conditions
- right-side object rail:
  - Cattle
  - Sheep
  - Sheds
- primary navigation:
  - Farm
  - What Matters
  - Plan
  - Market
  - Finance
- honest unavailable states
- real weather / station freshness
- real legal spreading-calendar status
- existing Today capability preservation contract from `IMPLEMENTATION_MAP.md`

Preserve all of this behaviour.

## Visual problem

The Phase 02 shell is structurally correct but visually too close to a generic SaaS/dashboard composition.

Specific problems to correct:

1. The desktop left navigation is too visually dominant.
2. The permanently expanded legacy "More" navigation creates a long admin-style sidebar.
3. The weather / legal-status strip is too much like a large floating rounded card.
4. The five-lens selector is too much like a large segmented SaaS control.
5. The active lens uses an oversized filled button.
6. Lens explanatory content at the lower-left appears as multiple stacked dark cards/chips.
7. The satellite imagery is globally darkened too heavily.
8. Field identity is weak; polygons read more strongly than field names/numbers.
9. The Cattle / Sheep / Sheds rail is conceptually correct but too sparse and visually detached.
10. There is too much rounded UI chrome competing with the farm map.

## Required refinement

### 1. Make the map visually dominant

Reduce visual chrome around the farm canvas.

The aerial imagery should remain clearly visible and feel like the primary working surface.

Reduce global darkening of the satellite imagery.

Use local contrast behind text where necessary instead of applying a heavy veil across the whole map.

Do not compromise field-boundary visibility.

### 2. Refine desktop navigation

Keep these five primary destinations visibly available:

- Farm
- What Matters
- Plan
- Market
- Finance

Do not permanently show the full legacy navigation list beneath them.

Move existing secondary destinations behind one compact **More** affordance using existing navigation infrastructure where practical.

Nothing currently reachable may be silently removed.

Fields, Supports, Records, Dashboard, Soil, Livestock, Silage & Fields, Fertiliser Plan and other legacy destinations must remain safely reachable.

Reduce sidebar visual weight and width where practical without introducing layout regressions.

The sidebar should support the spatial canvas rather than dominate it.

### 3. Refine the weather / status instrumentation

Current weather, weather-station/freshness information, chemical-fertiliser calendar state and slurry calendar state are real and must remain visible.

Restyle this from a large rounded floating pill into a compact precision/instrumentation treatment.

Prefer:

- alignment
- typography
- small separators/rules
- restrained background treatment
- minimal radius

Avoid a large floating card appearance.

Preserve all existing freshness and unavailable behaviour.

### 4. Flatten the five-lens navigation

Preserve:

- Current
- Grass
- Nutrients
- Soil
- Conditions

Switching lenses must continue to preserve camera orientation.

Restyle the control so it feels architectural rather than like a SaaS segmented control.

Use:

- a thin structural band or rule
- strong typography
- restrained dividers
- lens colour as an underline/rule/accent
- minimal fill

Do not use a large filled rounded rectangle for the active lens.

Preserve the existing lens colour semantics:

- Grass → teal
- Nutrients → ochre
- Soil → clay
- Conditions → blue
- Current → neutral/Farm Return

### 5. Refine the lower-left lens information

Replace the current stack of dark pill/card-like elements with one compact editorial information treatment.

Use hierarchy such as:

- lens heading / key concepts
- one concise supporting line
- optional secondary factual line where real data exists
- simple action/link underneath

Avoid multiple stacked bordered or rounded blocks.

Examples of information that must remain honest:

Current:
- field use
- livestock
- recent/planned work
- livestock field locations not recorded

Grass:
- cover
- growth
- readiness
- grass measurements not yet available

Nutrients:
- requirement
- organic nutrients
- fertiliser
- field nutrient map detail coming later
- real links to nutrient plans

Soil:
- pH
- P/K index
- soil type
- test age
- map values coming later

Conditions:
- rainfall
- temperature
- wind
- spreading calendar
- real chemical/slurry calendar status
- SMD / ground workability unavailable

Never fabricate data to improve the composition.

### 6. Strengthen field identity

Mapped fields should feel recognisably like specific fields on this farm.

Improve field-name / field-number visibility where the existing `MapHero` capabilities allow it.

Do not invent field-level priority colours.

Do not alter scientific meaning.

Do not fabricate livestock field positions.

Field labels must remain legible without visually overwhelming the map.

### 7. Refine the object rail

Keep Cattle / Sheep / Sheds outside the map.

Preserve current real counts and truthful unsupported states.

Improve:

- density
- alignment
- typography
- vertical rhythm
- visual relationship to the map

Reduce excessive empty space.

Use the Farm Spatial V2 palette and restrained rules rather than card containers.

Do not create crude SVG animal illustrations.

If no approved production animal/shed icon asset exists, use a restrained typographic treatment rather than inventing a poor-quality silhouette.

Sheep must remain explicitly "Not yet supported".

### 8. Farm identity

Preserve the strong editorial identity already established:

- FARM RETURN · active lens kicker
- serif farm name
- mapped-field / area summary
- greeting

Do not revert this to generic dashboard typography.

Ensure sensible line wrapping for the farm name on desktop.

### 9. Anti-cardification rules

Follow these strictly:

- A container must earn its border.
- Use geometry, alignment, whitespace and rules before containers.
- Prefer flat planes and bands to floating cards.
- Avoid unnecessary rounded rectangles.
- Pills only for real segmented/status controls.
- Data-screen radii should remain restrained.
- Do not introduce generic shadcn/SaaS card grids.
- Interaction should replace decoration.

## Behaviour that must not regress

Preserve all existing Phase 02 functionality and Today capabilities, including:

- real Mapbox map
- field polygons
- field tap behaviour
- map camera behaviour
- user location
- settings access
- weather
- spreading legal status
- GPS candidate behaviour
- nearby-field behaviour
- What Matters capability/access path
- opportunity/evidence access paths
- Prompt actions
- Ask AI access
- mobile/tablet access paths
- demo/real-mode gating
- Plan/Market/Finance routes
- all secondary navigation destinations

## Explicitly out of scope

Do NOT:

- add Phase 03 field-drawer functionality
- implement new Grass science
- implement new nutrient calculations
- implement new Soil calculations
- implement SMD
- implement trafficability/workability science
- add livestock field-location persistence
- add sheep support
- add movement models
- change fertiliser science
- change slurry science
- change economic calculations
- change regulatory logic
- change database schema
- add migrations
- change canonical domain contracts
- duplicate calculations in React
- introduce mock production values
- redesign routes or information architecture
- push or deploy

## Visual verification requirement

Before declaring the task complete:

1. Render the real `/today` screen at desktop size approximately 1440×900.
2. Compare it directly with:
   `design/reference/farm-spatial-v2/approved/desktop-01-farm-default.png`
3. Inspect Current, Grass, Nutrients, Soil and Conditions.
4. Correct obvious visual drift before completion.
5. Verify the map remains dominant.
6. Verify there is no large card-grid or generic SaaS treatment.
7. Verify every unavailable state remains truthful.
8. Verify all secondary destinations remain reachable through More.
9. Check a mobile viewport approximately 390×844 for regressions.

Do not modify the approved reference files.

## Tests

Add or update focused presentation/navigation tests where they protect meaningful behaviour.

Run the task-required targeted tests.

Then pass the repository verification / quality gates required by the agent harness.

## Completion report

Report:

- files changed
- major visual corrections made
- how legacy navigation remains reachable
- visual comparison performed
- desktop result
- mobile result
- tests and exact results
- confirmation that no domain/science/regulatory/schema logic changed

## Scope

As stated in the task brief above; nothing beyond it.

## Out of scope

- unrelated Farm Return features;
- harness/runner changes unless explicitly named by the task;
- migrations unless explicitly authorised;
- pushes/deployments;
- secrets;
- external research unless explicitly allowed.

## Acceptance criteria

- The outcome stated in the task brief is delivered.
- The verify command passes.

## STOP conditions

Stop with:

BUILD_RESULT: BLOCKED <reason>

if:

- task requires unsupported scientific interpretation;
- task requires external evidence not already available;
- task requires a migration without explicit authorisation;
- task requires frozen-contract changes not explicitly authorised;
- task scope materially expands;
- acceptance criteria contradict existing code/contracts;
- required files/context are unavailable.

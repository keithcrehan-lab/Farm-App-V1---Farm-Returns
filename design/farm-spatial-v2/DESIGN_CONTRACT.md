# Farm Spatial V2 — approved design contract

Status: **approved implementation authority** for the Farm / home spatial experience.

This contract is intentionally narrower than the legacy global design system. It supersedes conflicting legacy card/grid guidance **only for Farm Spatial V2 surfaces and the fertiliser vertical screens migrated into this experience**. Do not globally restyle unrelated legacy screens as part of this campaign.

## Product idea

**The farm itself is the interface.**

Farm answers: **What is happening on my farm?**

The canonical loop is:

**Observe → Understand → Value → Prioritise → Explain → Act → Measure → Learn.**

The primary navigation remains:

**Farm · What Matters · Plan · Market · Finance**

Farm is physical/agronomic truth. What Matters is prioritised economic recommendation. Plan is farmer commitment. Market is transaction. Finance is financial consequence.

## Interaction principle

**Object before form.**

Tap/select the thing first, then act on it. Examples:

- select Field 4 → inspect nutrients → open nutrient plan;
- select livestock group → move → choose destination;
- select Sheds → inspect capacity / move livestock there.

Ask the farmer only for information Farm Return cannot already know.

## Spatial hierarchy

### Map

The map is the dominant canvas and must use the existing real Mapbox implementation and persisted field polygons. Never substitute an illustrative map or static aerial image in production.

The map contains:

- real fields and boundaries;
- field names/numbers;
- outdoor livestock groups **only when a real persisted location exists**;
- contextual lens information;
- active spatial state.

Sheds are **not map markers** in this approved design. They live in the object rail.

### Object rail

The persistent rail contains only relevant farm objects, currently:

- Cattle
- Sheep
- Sheds

Use recognisable, consistent agricultural silhouettes. Do not use crude hand-drawn SVG approximations or generic emoji/icon substitutions.

Livestock groups are cohorts, not one icon per animal.

## Five lenses

- **Current** — live field use, livestock, recent/planned work.
- **Grass** — cover, growth, readiness.
- **Nutrients** — N/P/K requirement, organic contribution, remaining requirement, fertiliser plan, slurry quantity/timing.
- **Soil** — pH, P index, K index, soil type, test age.
- **Conditions** — rainfall, SMD, temperature, wind, workability/spreading suitability.

Switching lens changes contextual information while preserving spatial orientation.

## Visual principles

### 1. A container must earn its border

Do not wrap every metric, section, explanation or action in a rounded card.

Use cards/containers only for genuinely discrete objects. Prefer:

- alignment;
- whitespace;
- horizontal and vertical rules;
- typography;
- column structure;
- colour planes/bands;
- contextual drawers.

### 2. Canvas, not card grid

Each screen has one dominant surface. Content sits directly on that surface whenever possible.

Avoid generic SaaS composition: equal rounded tiles, repeated shadows, symmetrical component grids and default shadcn-like styling.

### 3. Typography creates hierarchy

Operational information uses a clean sans. Display/editorial type may be used for major identity or large values only.

Large quantities are allowed to dominate the composition. Units are quieter. Use tabular numerals where alignment matters.

Prefer sentence case.

### 4. Deliberate asymmetry

Do not default to 50/50 splits, three equal metric cards or equal-width button pairs. Let the primary value/action occupy more visual space than secondary information.

### 5. Colour carries domain meaning

Brand green is not the default decoration for everything.

Approved functional palette:

- Forest `#173F2D` — Farm Return brand, confirmed/commit actions.
- Graphite `#171B18` — primary structure/text.
- Cobalt `#356C9F` — conditions, weather, information, N.
- Harvest yellow `#D19A2A` — nutrients/fertiliser, P, attention.
- Teal `#337B74` — grass/organic nutrients/slurry.
- Plum `#79526F` — livestock, K.
- Clay `#AA644C` — soil/housing/land condition.

Use light tints of the domain colour as whole surfaces/planes where appropriate, not generic cream everywhere.

### 6. Geometry

Use a 4px spacing grid.

Typical geometry:

- map/lens control: compact radius ~6–10px;
- interactive rows: ~6–8px or no visible container;
- data planes: often square/flat, 0–6px;
- contextual bottom drawer: ~18–24px top radius;
- pills only for true segmented controls or compact statuses.

Do not use 16–20px rounded cards as a universal default on these surfaces.

### 7. Elevation

Use almost no shadows inside data screens. Prefer surface contrast and rules. Map overlays/drawers may use restrained elevation to remain legible over photography.

### 8. Motion explains state change

Motion is functional, not decorative.

Examples:

- field boundary strengthens on selection;
- neighbouring fields recede slightly;
- lens context crossfades without losing map orientation;
- contextual drawer rises from the map;
- eligible livestock destinations highlight during move;
- Add to Plan visibly acknowledges the handoff;
- confirmed application changes remaining nutrient values in place.

Typical UI transitions: 140–220ms. Drawers/sheets: 220–350ms. Respect `prefers-reduced-motion`.

## Nutrient/fertiliser information architecture

The approved first engine integration is:

**Farm map → Nutrients lens → field → field nutrient plan → whole-farm nutrient plan → fertiliser plan → Plan / Market.**

Always distinguish:

1. Requirement
2. Organic contribution
3. Remaining requirement
4. Product solution
5. Whole-farm aggregation
6. Commercial requirement

Never calculate these values in React/UI code. The UI consumes canonical domain outputs.

### Field nutrient composition

Prefer a dense aligned N/P/K table over three independent cards.

N, P and K retain consistent colour identity:

- N → cobalt
- P → harvest yellow
- K → plum

Slurry/organic contribution uses teal.

### Whole-farm planner

The primary outstanding quantity may dominate the composition (for example a large `4.8 t`) with secondary values visibly subordinate. Do not convert these into KPI tiles.

### Market

Scientific requirement and commercial transaction remain separate. A supplier quote can supersede an indicative price; it cannot alter the scientific requirement silently.

## Data truth / placeholders

Every displayed value must be one of:

- real observed/persisted data;
- deterministic canonical engine output;
- explicitly marked estimate/assumption;
- clearly labelled placeholder capability shell.

Never present design placeholder values as real farm data.

Individual cattle data (tag, age, weight, target weight) is a future capability unless a real domain contract already exists. Placeholder UI may describe the intended fields but must not invent production records.

## Reference

The canonical interactive reference is:

`design/reference/farm-spatial-v2/approved/farm_return_design_system_refined.html`

It is a **visual/interaction reference, not production code**. Production must use existing React/Next.js/Mapbox/domain architecture rather than copying the prototype's static imagery or mock values.

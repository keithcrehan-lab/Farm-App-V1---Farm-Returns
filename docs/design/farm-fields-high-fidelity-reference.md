# Farm Return — Farm + Fields High-Fidelity Reference

Status: APPROVED FOR IMPLEMENTATION
Approved: 2026-10-27
Branch base: 0fdb936

This document records the high-fidelity Farm + Fields direction approved by the product owner. It is the visual and interaction source of truth for the Farm/Fields redesign phase. It combines the established Farm Return Nutrients visual language with the object-first interaction principles already approved for Cattle.

## Core principle

The farm itself is the interface.

Primary flow:

Farm -> physical object -> current state -> action -> evidence/history

The farmer should not feel that they are opening a generic dashboard. They should feel that they are looking at their farm, selecting a real field, bringing that field forward, and then working with it in context.

## Visual source of truth

The strongest existing visual reference inside the product is the Farm Return Nutrients/map treatment:
- real Mapbox satellite imagery
- very low chrome
- expressive serif object identity
- clean sans UI copy
- mono/technical measurement treatment
- near-black/deep-forest contextual surfaces
- warm cream/off-white supporting surfaces
- thin straw/gold selection/accent rule
- restrained agricultural colors when they carry meaning
- subtle topographic/field texture only where it feels environmental
- premium, editorial, asymmetric hierarchy
- no generic SaaS card grid
- no glassmorphism-as-decoration
- no loud gradients
- no arbitrary KPI strip
- no decorative 3D illustration
- no fake aerial imagery

Use the existing Farm Spatial V2/Nutrients tokens/components where practical instead of inventing a parallel style system.

## Global shell direction for this phase

Primary desktop navigation becomes:

Farm
Plan
Cattle
Housing
Finance
Records
More

What Matters is not a first-level destination. Preserve its route/functionality for now; the actual merge into Plan belongs to the later Plan redesign. It may remain accessible through More or another non-destructive transitional route.

Housing and Finance are now first-level.

When an object workspace is active, the global shell should visually recede rather than disappear.

Do not redesign every module in this phase. Only update shell/nav as required for the approved primary hierarchy and Farm/Fields experience.

## Farm opening state

Farm (/today) remains the default map-led home.

Desktop:
- real satellite map dominates the screen
- lightweight farm identity in top-left over the map
- farm identity should feel editorial, not like a dashboard header
- example hierarchy:
  FARM RETURN · CURRENT
  [Farm name in large serif]
  10 fields mapped · 13.7 ha
  quiet greeting/context
- compact utilities top-right
- bottom-center lens switcher
- field/object detail appears contextually rather than via a card grid

Do not put the old What Matters/notification/dashboard material back on top of the map. Useful content should be progressively disclosed or moved to its later Plan home.

## Farm lenses

Simplified whole-farm lenses:

Current
Grass
Nutrients
Conditions

Soil is absorbed into Nutrients.

Changing lens does NOT navigate away. The geography stays fixed. The meaning/status annotation of the fields changes.

The map should feel like the same real farm seen through a different analytical lens.

## Desktop Map + List

Desktop supports both map and list simultaneously:
- map is dominant
- a quiet field list can sit beside it or be opened as a companion view
- the list must not visually compete with the farm
- selecting a field from the list and selecting it on the map are the same state
- mobile uses a Map / List toggle instead of a permanent split

## Field selection — signature interaction

This is the defining interaction.

Tap/click a real field polygon:
1. field boundary becomes the active selection with restrained gold/straw emphasis
2. other fields remain visible but recede slightly when helpful
3. camera may move naturally to frame the selected field
4. selected field identity/state appears attached to the spatial context
5. field contextual panel uses deep forest surface + thin straw/gold rule
6. one clear contextual action is brought forward
7. deeper data/actions remain one interaction away

The interaction must feel like the field comes forward from the landscape, not like a generic card opened.

Whole polygon should be interactive. No tiny "View" target is required to select it.

Motion should be native/interruptible, subtle, fast, and disabled/reduced under prefers-reduced-motion.

## Selected field contextual panel

Initial selected-field panel should communicate only the most useful state.

Required content when supported:
- field name
- mapped area
- current use
- livestock/group context if genuinely known
- planned use and date if known
- immediate nutrient state if known
- hard legal gate/problem if relevant
- next planned work if known

Do not force all of these into equal KPI tiles.

Preferred hierarchy:
- large serif field name
- technical area/current-use line
- one editorial current-state sentence
- quiet next/planned context
- one primary contextual action
- secondary links/actions below

Example conceptual composition:

CURRENT FIELD
Back Avenue Road Field
3.4 ha · Grazing

[dominant current fact]
"Weanlings are associated with this field."

NEXT
Planned use       Silage · 15 May
Nutrient state    59 kg N/ha remaining
Legal gate        Check required

[primary contextual action]
Move cattle here

Open field workspace ->
Record work | Nutrients

Unknown must never be converted to zero/clear.

## Dynamic primary action

The primary selected-field action should be dynamic only when the app has enough evidence to make the context genuinely useful.

Examples:
- Move cattle here
- Record grazing
- Record silage cut
- Open nutrient plan
- Take soil sample

If evidence is insufficient, use a neutral "Open field" or equivalent rather than guessing.

## Field workspace

For deeper work, selecting Open field / a deeper workflow transitions into the full field workspace.

The map remains visually present as the hero at the top. Do NOT turn the field workspace into a dashboard.

The field workspace has only:

Overview
Nutrients
History

### Overview
Contains current field state and operational context:
- current use
- planned use
- livestock association where known
- conditions/current context
- recent activity
- planned work
- silage/grass state where genuinely supported
- field notes where supported
- contextual actions

Activity is part of Overview, not its own top-level chapter.

### Nutrients
Combines nutrient planning and soil evidence.

Soil is evidence underneath nutrient state, not a competing top-level field experience.

Decision-first structure:
- N remaining / requirement
- P index
- K index
- slurry allocation
- what should I apply?
- legal gate
- economics
- Why?
- evidence/source

The legal detail is a HARD GATE. An agronomically sensible option must not appear executable when statutory rules block it.

Blocked actions should remain visible as Blocked with an easy explanation; do not silently hide them.

Economic impact should sit alongside agronomy where it helps the decision.

### History
Chronological evidence ledger for this field.
Searchable/filterable if useful.
Field use changes must appear as dated events.

## Current vs planned use

Farm Return must support both:
- Current use
- Planned use

Changing field use is not a silent property overwrite. It is a dated event.

Example:
Current: Grazing
Next: Silage · planned 15 May

This preserves historical truth and feeds Plan.

## Field actions

Supported interaction model should anticipate:

Move cattle here
Record grazing
Spread slurry
Apply fertiliser
Cut silage
Take soil sample
Record work
View history

Both directions should be possible where logical:
- Field -> Move cattle here -> choose group
- Cattle group -> Move group -> choose field

Both should produce the same underlying truthful record.

Generic Record work exists for activities without a dedicated workflow.

## Mapping and field management

Mapping is critical and must be easy without contaminating normal day-to-day interaction.

Normal mode:
- subtle Add field entry exists

Manage Fields mode:
- Add field
- Edit boundary
- Split
- Merge
- Archive
- Change use

Structural changes belong in an explicit management mode so a normal field tap never accidentally edits the boundary.

Architecture must anticipate all three mapping sources:
1. draw boundary on satellite map
2. walk/drive boundary with phone GPS
3. import an existing digital/official boundary

Only implement what the current product genuinely supports in this phase. Do not invent unsupported import/GPS capture capability.

When drawing/editing a boundary, show live calculated area before Save.

## Multi-field work

Explicit "Select multiple fields" mode is approved.

Normal taps never accumulate hidden selection.

In multi-select mode, farmer can select a group of real fields and then perform supported bulk workflows such as:
- plan fertiliser
- plan slurry
- change planned use

Only wire bulk actions that are already safe/supported. Unsupported future actions may be labelled Not available yet rather than fabricated.

## GPS/context awareness

GPS/context awareness remains opt-in/confirmatory.

Example:
"Looks like you're near Back Avenue Road"
Open
Not now

Nothing begins automatically.

Future contextual suggestions can include:
- Open field
- Record grazing
- Start/record spreading
- other supported work

The UI should feel intelligent without pretending certainty.

## Mobile

Desktop-first design, but every pattern must have a coherent mobile translation.

Phone is a primary recording device in-field.

On mobile:
- map remains prominent
- selected field uses bottom-sheet style progression
- Map / List toggle
- compact identity state -> working panel -> full field workspace
- actions should be one-handed where practical
- 44px+ touch targets
- no horizontal page overflow
- no overlap with bottom navigation

## Empty/unknown/future states

Unknown != zero.
Unavailable != zero.
Missing evidence != clear.

Decision-critical unknowns should be explicit.
Low-value missing data can be quiet/omitted.

Future capabilities can appear as "Not available yet" when that helps orientation, but do not fill screens with disabled controls.

When an entire area has no data, focus on one meaningful setup action.

## High-fidelity bar

The approved concept was explicitly accepted because it did NOT look like a generic AI dashboard.

The final implementation must preserve:
- real satellite imagery as the dominant texture
- editorial hierarchy
- asymmetric layout
- strong typography
- very few visible containers
- dark contextual field panel
- thin gold rule
- careful negative space
- field-object interaction rather than cards
- progressive disclosure
- one hero interaction
- restrained, meaningful motion

If the result looks like:
- four equal KPI cards
- a generic admin dashboard
- a set of rounded cards on cream
- a fake illustrated map
- a standard SaaS sidebar + dashboard
then it has failed the approved direction.

## Existing production behavior to preserve

Preserve real:
- Mapbox polygons
- map selection
- camera/fly-to logic
- field deep-linking
- boundary-first field creation
- polygon-derived area
- real field store data
- real nutrient plan data
- soil sample workflows
- legal/status truth
- GPS-proximity logic
- prompt/evidence provenance
- real-mode/demo-mode isolation
- current field route behavior unless intentionally migrated with tests

Do not modify frozen domain engines merely for presentation.

## Implementation process

This is Tier 2 UI/integration work.

No Codex campaign.

Use targeted tests + typecheck + lint + build, then browser QA.

Implementation should stop at READY_FOR_FARM_FIELDS_VISUAL_REVIEW.
Do not push, merge, tag or begin Nutrient/Fertiliser redesign automatically after this phase.

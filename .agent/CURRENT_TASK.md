# Task: Farm Home — visual refresh v1

Task ID: farm-home-visual-refresh-v1-20261008
Starting HEAD: b5389a975493860aade23202704a8387ef3fd818
Verify command: `npm run typecheck && npm run build`

# Farm Home Visual Refresh v1

## Objective

Implement the approved visual refresh of the Farm landing screen.

This is a PRESENTATION-ONLY task.

The existing Mapbox map, real field boundaries, field selection, lens logic,
data sources, domain logic and navigation behaviour are already approved and
must not be reimplemented.

The map is the interface.

## Design intent

The current screen works functionally but the surrounding shell feels too
flat, green-and-white, and dashboard-like.

The revised design should feel:

- modern;
- distinctive;
- calm;
- premium;
- spatial;
- information-rich without feeling crowded.

Reference direction:

Swiss information design × agricultural mapping × editorial typography ×
precision instrumentation.

Use the existing approved Farm Spatial visual language, but improve the shell,
proportions and supporting UI around the map.

## Immutable behaviour

DO NOT alter:

- MapHero Mapbox implementation;
- persisted field polygons;
- centroids;
- selected-field behaviour;
- map fit/fly-to logic;
- field highlighting/dimming;
- field labels/data semantics;
- Current / Grass / Nutrients / Soil / Conditions logic;
- real farm data;
- nutrient/science calculations;
- Today capability behaviour;
- domain calculations;
- routing behaviour.

No new mock production data.

UNKNOWN must never become zero.

## 1. Map proportions

The map must become the dominant visual canvas.

Current problem:
the map feels placed inside a large white application page rather than being
the primary Farm workspace.

Change the shell so:

- map occupies substantially more of the available viewport;
- unnecessary white gutters around the map are removed/reduced;
- map visually owns the central workspace;
- proportions feel intentional at normal desktop widths;
- map is not stretched, cropped incorrectly or behaviourally altered;
- map may use a restrained radius, but must not look like a generic SaaS card.

Do not recreate the map from a screenshot.

Use the real MapHero.

## 2. Left navigation

Keep the canonical primary navigation:

Farm
What Matters
Plan
Market
Finance

Keep More for secondary navigation.

Refine presentation:

- navigation should visually recede behind the Farm workspace;
- deep forest/graphite rather than bright green;
- lower-contrast inactive items;
- selected Farm state remains obvious without a large bright block;
- fewer decorative boundaries;
- restrained spacing and icons;
- preserve existing navigation functionality.

The sidebar must not compete with the map.

## 3. Remove current large conditions strip

Remove the current prominent horizontal strip containing approximately:

temperature
station
stale
chemical fertiliser closed period
slurry closed period

Do not remove the underlying information.

The current treatment gives secondary information too much visual priority.

## 4. New compact conditions control

Replace the large strip with a compact top-right control over/adjacent to the
map.

Default compact state should communicate approximately:

12.9° · Athenry
2 restrictions
[conditions/settings icon]

Use the actual existing temperature/station/status data, not hard-coded values.

Requirements:

- temperature + station are immediately visible;
- stale/fresh state remains represented honestly;
- regulatory status remains available;
- compact control must not dominate the map;
- controls must remain legible against aerial imagery;
- use restrained depth/material treatment, not a giant black bar.

"2 restrictions" means the UI derives the number from the real available
restriction/status entries; do not hard-code 2.

If the data cannot support a count, use an honest alternative rather than
inventing one.

## 5. Conditions popover / disclosure

Interaction with the restrictions/status control should reveal the detailed
statuses currently exposed in the old strip, such as:

- Chemical fertiliser — Closed period
- Slurry — Closed period
- weather/station freshness such as Stale

Use only real existing state.

A lightweight popover/disclosure is preferred.

It should:

- appear near the compact control;
- close predictably;
- be keyboard accessible;
- not obstruct large portions of the map;
- preserve the distinction between regulatory status and weather freshness.

Do not invent suitability recommendations.

## 6. Farm identity

Retain:

- Farm Return / current lens context;
- KC identity;
- mapped field count;
- farm area;
- greeting where currently supported.

Refine spacing/typographic hierarchy so it sits naturally on the map rather
than feeling like dashboard copy.

Serif may remain for the major KC display moment.

Operational metadata remains sans-serif.

## 7. On the Farm rail

Keep:

Cattle
Sheep
Sheds

and the current real data semantics.

Improve the visual integration with the map:

- narrower and calmer;
- less like a separate white admin sidebar;
- softer boundary treatment;
- use warm neutral/off-white rather than stark white where appropriate;
- preserve legibility;
- no shed markers on the map;
- no fabricated livestock location;
- provenance/estimated labels from Phase 06 must remain intact.

The rail may collapse/recede if an existing safe interaction pattern supports
it, but do not add complexity merely for decoration.

## 8. Lens navigation

Keep:

Current
Grass
Nutrients
Soil
Conditions

Do not change the underlying behaviour.

Improve presentation so it feels like a map mode switcher rather than a
full-width generic tab component.

Target:

- visually lighter;
- compact;
- clearly selected state;
- lens-specific accent can remain subtle;
- map remains visible and dominant.

Do not sacrifice discoverability merely to make it small.

## 9. Colour direction

Move away from flat green + pure white.

Preferred palette direction:

- deep forest / graphite for structural navigation;
- warm stone / parchment neutrals for light surfaces;
- aerial imagery provides much of the visual richness;
- green represents Farm Return rather than colouring every surface;
- existing contextual colours remain:
  - nutrients / ochre
  - organic / teal
  - soil / clay
  - livestock / plum
  - conditions / blue

No gradient-heavy generic SaaS styling.

No excessive glassmorphism.

Depth must be restrained.

## 10. Borders and geometry

Apply:

"Structure should be felt, not seen."

Reduce unnecessary borders and separators.

Use:

- alignment;
- spacing;
- typography;
- tonal surface changes;
- restrained shadows where genuinely useful.

A container must earn its border.

Avoid cardification.

## 11. Responsive behaviour

Verify desktop and narrower layouts.

No:

- clipped conditions controls;
- lens navigation overflow;
- rail obscuring critical map controls;
- accidental horizontal page scroll;
- inaccessible actions.

Map remains the dominant workspace at supported sizes.

## 12. Accessibility

Interactive compact conditions control and disclosure must support:

- keyboard interaction;
- visible focus;
- useful accessible labels;
- appropriate button semantics.

Do not encode status using colour alone.

## Testing

Update/add targeted tests for:

- compact conditions control renders from real existing status data;
- old large strip is no longer present;
- restriction/status disclosure works;
- unknown/missing state is honest;
- Farm object rail semantics remain intact;
- lens selection still works;
- selected field flow remains intact;
- navigation behaviour remains intact.

Run appropriate:

- Farm Spatial shell tests;
- Today route tests;
- object rail tests;
- affected component tests;
- typecheck;
- lint;
- production build.

Do not alter domain science merely to satisfy UI tests.

## Visual acceptance

The implementation should match this approved visual intent:

- map-first;
- greatly reduced white framing;
- subdued navigation;
- integrated farm rail;
- compact top-right weather/conditions cluster;
- no large central status strip;
- premium, calm, modern spatial-product feel.

Do not redesign the actual map.

## Completion

Return:

1. starting SHA;
2. ending SHA;
3. files changed;
4. summary of visual changes;
5. confirmation MapHero/domain behaviour was preserved;
6. tests/typecheck/lint/build;
7. Codex audit counts;
8. any deferred visual issues;
9. confirmation no push/deploy/database change occurred.

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

## Required tests

- Targeted tests for the changed behaviour.
- The verify command.

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

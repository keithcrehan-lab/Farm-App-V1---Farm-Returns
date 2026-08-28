# Farm Return Next — UX design

Governed by `CLAUDE.md`'s design-system rules, unchanged: reproduce the
approved references closely, reuse `src/components`, no stock-framework
look, mobile + desktop both reviewed before a screen is "done." Next does
not introduce a second design language — it reorganises V1's already-
approved screens under a new information architecture and adds the screens
`MASTER_SPEC.md`'s product surface names that don't exist yet.

## Information architecture

Five top-level destinations replace V1's flat sidebar
(Dashboard/Fields/Soil/Livestock/.../Settings — still there, but nested
under these):

- **Today** — new. The daily entry point. Surfaces open Prompts (Activity
  engine output), what's due, weather/season windows currently open,
  outstanding Confirms. Replaces Dashboard as the default landing screen;
  Dashboard's existing content (KPI row, Farm at a Glance, Input Summary,
  Market Watch) becomes Today's "farm overview" section, reused wholesale
  — not rebuilt.
- **Farm** — the connected farm model. V1's Fields, Soil, Livestock,
  Housing screens, unchanged, grouped under one destination. Fragmented
  land blocks (multiple non-contiguous parcels under one holding) are a
  `FieldMap` extension — `ARCHITECTURE.md`'s reuse boundary applies:
  `FieldMap`'s existing polygon rendering (P7,
  `docs/real-mode-completion/BUILD_LOG.md`) is extended to render N
  disjoint blocks per farm, not rebuilt.
- **Plan** — V1's Nutrients, Spreading, Silage, Feed Optimiser, Finance,
  Input Planner screens, unchanged, grouped under one destination.
- **Records** — V1's Reports screen, extended with the new job/Confirm/
  Actual history (`ARCHITECTURE.md`'s `jobs` table).
- **Activity** — new. The Decide surface: every open Prompt, with its full
  trace (per `SCIENTIFIC_RULES.md`) and accept/edit/dismiss actions.

Settings and Market Prices remain accessible but not part of the five
primary tabs, same tier V1 gives them today.

## GPS job mode

A sixth, non-tab surface — entered from a Today/Activity Prompt or an
Act-stage job, not from the tab bar. Full-screen, minimal chrome, large
touch targets (farmyard/field use, gloved hands, bright sunlight),
offline-tolerant (`ARCHITECTURE.md`'s local-queue pattern). Ends in a
single clear Confirm action. Exact screen layout is a `BUILD_PLAN.md`
checkpoint deliverable — build against a reference mock the same way every
V1 screen was built against `design/reference/`, not invented ad hoc; no
reference exists yet for this screen (`BLOCKERS.md`).

## Desktop composition

"One product, two compositions" applies unchanged: Today/Activity adopt a
multi-column desktop layout (a Prompt list beside its detail/trace, not a
mobile single-column list stretched wide) the same way V1's Dashboard/
Finance pages already do. GPS job mode is phone-only by design — a desktop
user doesn't need it and isn't shown it.

## Component reuse

Every new screen composes existing primitives from `src/components/ui`
(`Card`, `Pill`, `StatusBadge`, `MetricCard`, `IconChip`, `ScoreRing`, ...)
and the existing farm/finance card components before any new primitive is
proposed. A Prompt card, for instance, is a `Card` + `StatusBadge` +
accept/dismiss actions — not a new visual system.

## Design references

No approved reference images exist yet for Today/Activity/GPS job mode
(`design/reference/` covers only V1's existing screens). The first
`BUILD_PLAN.md` checkpoint that touches a new screen produces (or is
handed) a reference before pixel-level implementation begins, per
`CLAUDE.md`'s screen workflow — this file records the IA and reuse rules,
not final layouts.

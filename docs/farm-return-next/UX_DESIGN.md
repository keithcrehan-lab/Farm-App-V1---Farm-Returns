# Farm Return Next — UX design

Governed by `CLAUDE.md`'s design-system rules, unchanged: reproduce the
approved references closely, reuse `src/components`, no stock-framework
look, mobile + desktop both reviewed before a screen is "done." Next does
not introduce a second design language — it reorganises V1's already-
approved screens under a new information architecture and adds the screens
`MASTER_SPEC.md`'s product surface names that don't exist yet.

## Information architecture

**Locked** (product-owner decision, 2026-09-01 — supersedes the prior
five-tab Today/Farm/Plan/Records/Activity IA this section originally
described; that history is kept in git, not restated here). Do not
reopen this decision unless implementation reveals a material technical
problem.

`Today | Farm | + | Plan | Records` — five slots, replacing V1's flat
sidebar (Dashboard/Fields/Soil/Livestock/.../Settings — still there, but
nested under these). The centre `+` is the universal Start/Record
action, not a conventional destination — there is deliberately no
separate "Activity" tab; the Prompt/Decide surface a separate Activity
tab previously described now lives inside Today.

- **Today** — *"What matters on my farm right now?"* Prompts, windows,
  decisions, confirmations and exceptions. Replaces Dashboard as the
  default landing screen; Dashboard's existing content (KPI row, Farm at
  a Glance, Input Summary, Market Watch) becomes Today's "farm overview"
  section, reused wholesale — not rebuilt.
- **Farm** — map-first, persistent farm world/state. V1's Fields, Soil,
  Livestock, Housing screens, unchanged, grouped under one destination.
  Fragmented land blocks (multiple non-contiguous parcels under one
  holding) are a `FieldMap` extension — `ARCHITECTURE.md`'s reuse
  boundary applies: `FieldMap`'s existing polygon rendering (P7,
  `docs/real-mode-completion/BUILD_LOG.md`) is extended to render N
  disjoint blocks per farm, not rebuilt.
- **+ (centre)** — Start Job / Record Activity and other high-frequency
  capture actions. Not a screen with persistent content of its own — an
  action surface, entered from the tab bar or from a Today/Farm Prompt.
  Full-screen GPS job mode (below) is what `+` opens for a job requiring
  it.
- **Plan** — a real stage progression (Suggested → Planned → Window
  Approaching → Ready), not a flat list. V1's Nutrients, Spreading,
  Silage, Feed Optimiser, Finance, Input Planner screens, unchanged,
  grouped under one destination, now read through that progression.
- **Records** — completed jobs, Actuals, evidence and historical records.
  V1's Reports screen, extended with the new job/Confirm/Actual history
  (`ARCHITECTURE.md`'s `jobs` table). Buildable against the *existing*
  approved visual system now (`BUILD_PLAN.md`'s Vertical D) — this is an
  extension of an already-approved V1 screen, not a new one needing its
  own reference image.

Settings and Market Prices remain accessible but not part of the five
primary tabs, same tier V1 gives them today.

**Visual implementation status**: this IA/naming decision is locked and
final. Its final *visual* implementation (exact layout, styling, and any
screen this IA introduces that has no existing V1 equivalent — Today's
Prompt-surfacing view, in particular) remains pending an approved design
reference, per `CLAUDE.md`'s screen workflow — do not invent final
styling ahead of one. Records/Actual-history UI is the one exception:
build it against the existing visual system now (see above).

## GPS job mode

A non-tab, full-screen surface entered via the centre `+` action (or
directly from a Today/Farm Prompt or an Act-stage job) — not from the tab
bar itself. Minimal chrome, large touch targets (farmyard/field use,
gloved hands, bright sunlight), offline-tolerant
(`ARCHITECTURE.md`'s IndexedDB outbox — canonical client-side store,
service-worker Background Sync optional/best-effort only, never
required for correctness). Ends in a single clear Confirm action. Exact
screen layout is a `BUILD_PLAN.md` checkpoint deliverable — build against
a reference mock the same way every V1 screen was built against
`design/reference/`, not invented ad hoc; no reference exists yet for
this screen (`BLOCKERS.md`).

## Desktop composition

"One product, two compositions" applies unchanged: Today adopts a
multi-column desktop layout (a Prompt list beside its detail/trace, not a
mobile single-column list stretched wide) the same way V1's Dashboard/
Finance pages already do. GPS job mode is phone-only by design — a desktop
user doesn't need it and isn't shown it. The centre `+` action has no
desktop equivalent as a tab-bar item (desktop has no bottom tab bar) —
its Start Job/Record Activity actions surface through Today's own layout
on desktop, exact placement TBD at the checkpoint that builds it.

## Component reuse

Every new screen composes existing primitives from `src/components/ui`
(`Card`, `Pill`, `StatusBadge`, `MetricCard`, `IconChip`, `ScoreRing`, ...)
and the existing farm/finance card components before any new primitive is
proposed. A Prompt card, for instance, is a `Card` + `StatusBadge` +
accept/dismiss actions — not a new visual system.

## Design references

No approved reference images exist yet for Today/GPS job mode
(`design/reference/` covers only V1's existing screens; the locked IA
has no separate Activity screen needing its own reference — Records is
an extension of an already-approved V1 screen, see above). The first
`BUILD_PLAN.md` checkpoint that touches a new screen produces (or is
handed) a reference before pixel-level implementation begins, per
`CLAUDE.md`'s screen workflow — this file records the IA and reuse rules,
not final layouts.

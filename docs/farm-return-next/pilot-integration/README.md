# Pilot Integration (`pilot-integration-v1`)

Permanent programme context. Current status lives in `STATE.md`. Durable decisions live in `DECISIONS.md`.
Future tasks should normally need only these three files plus the code for their phase.

## Objective

Connect the functionality Farm Return already has to real signed-in farmer data, and produce a coherent pilot
product. In particular, the frozen cattle experience (C0–C10, `cattle-engine-v1`, closed with C10 frozen at
`510f003`) is connected to the real Supabase livestock records instead of the demonstration herd:

```
REAL SUPABASE DATA → production cattle adapter → frozen C1–C9 engines → C10 presentation → screen
C10 farmer action → authorised application write → real persistence → re-evaluation → refreshed view   (P2+)
```

There is one production cattle model: the existing `livestock_*` tables. The frozen cattle model is an
evaluation view built from those tables on each request. There is never a second store.

## Phases

| Phase | Scope |
|---|---|
| P0 | Source-of-truth integration contract (this file, `DECISIONS.md`) |
| P1 | Real cattle reads: signed-in `/cattle` reads real groups, animals and weights through the adapter. Read-only. |
| P2 | Real cattle writes: Record Weight persists first; other writes only where persistence ownership is already legitimate |
| P3 | One cattle product: remove the practical duplication between `/livestock` and `/cattle`, keeping one persistence model |
| P4 | Pilot completion: real What Matters, navigation cleanup, signed-in end-to-end pilot acceptance |

## Frozen boundaries

- `src/domain/cattle/**` (C0–C9 engines and the C10 presentation builders) and `src/domain/plan/**`,
  `src/domain/animal-plan/**` are frozen. They are called through their public exports and never edited.
  If one genuinely must change, STOP for explicit approval: that is separate high-assurance work.
- `src/server/cattle-demo/**` stays demonstration-only. Real-mode code never imports it.
- C10 application files (`src/app/(app)/cattle/**`, `src/components/cattle/**`) are the integration surface. They
  may change where integration evidence requires it (see `DECISIONS.md` D7), without changing engine semantics.
- Existing Supabase schema and repositories are reused. The schema is not reshaped to look like the cattle model.
- Migrations only in P2 or a separately approved persistence task, forward-only, never against production.
- No push, no merge to `main`, no deploy.

## Key architecture

| Layer | Location | Knows about |
|---|---|---|
| Farm-scoped source reader | `src/lib/farm-data/cattle-source.ts` (P1, new, `server-only`) | Supabase rows only |
| Pure translation | `src/server/cattle-real/real-records.ts` (P1, new) | rows → canonical C1 assertions, C4 weight records, directory labels |
| Real evaluation service | `src/server/cattle-real/real-service.ts` (P1, new, `server-only`) | frozen engine exports, `CattleOutputs` |
| Routes | `src/app/(app)/cattle/**` | mode switch, farm resolution, `notFound` |
| Screens | `src/components/cattle/**` | view-models only, never raw tables |

Frozen engines never see Supabase. C10 components never query livestock tables. The adapter owns all translation.

## Authenticated versus demo mode (binding rule)

**Authenticated farm:** the real farm, real groups, real animals and real recorded weights. Anything that Farm
Return does not hold (health records, goals, programmes, obligations, performance targets, mart prices, costs,
housing per animal, lifecycle status) is shown as unavailable or not recorded. It is never filled in.

**Demo:** the synthetic fixture herd, synthetic catalogue, fixture market and cost information. It is clearly
demo-labelled and available only when Supabase is not configured (`isCattleDemoMode()`).

**Authenticated production must never fall back to demo cattle, demo mart prices, demo costs or synthetic
targets, programmes or obligations.** If production lacks mart or cost evidence, that C10 capability is shown
as unavailable. It never borrows fixture data. A signed-in user with no farm, or a read failure, gets an
explicit unavailable state, never the demonstration herd.

## Quality model (Tier 2)

**During development:** targeted tests, relevant integration tests, typecheck as needed.

**At phase completion:** the affected module suites, typecheck, lint, build where relevant, and browser or
manual journey verification.

**Full application quality gate (`scripts/quality-gate.sh`):** only in these cases:
- after the first real write path is complete (P2);
- at final pilot acceptance (P4);
- when a change has broad cross-domain impact.

It is not run after every small repair.

**Independent audit:** there is no default Codex audit for Tier-2 integration or UI work. Targeted independent
review is used only where risk warrants it, and Codex only when explicitly authorised. If frozen Tier-1 domain,
scientific, legal or economic semantics must change: STOP, because that requires separate high-assurance
authorisation.

## Stop conditions

- A frozen C0–C10 contract or engine semantic would have to change → `STOPPED_FROZEN_CONTRACT_GAP`.
- Persistence ownership of a concept is ambiguous → `STOPPED_DATA_OWNERSHIP_DECISION`.
- A real-mode path would need fixture data to work → show unavailable instead, or stop.
- A schema change outside P2 or an approved persistence task.
- Any cross-farm read or write path.

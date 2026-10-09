# Task: Plan Phase 0 - Kernel

Task ID: plan-phase-0-kernel-20261009
Starting HEAD: 8e3f4f97d3f2357766da9a98575d5faf3395aed0
Verify command: `npx vitest run src/domain/plan && npm run typecheck && npm run lint`

# Plan Phase 0 — Kernel

Campaign: Plan Operating System v1 (`.agent/campaigns/plan-operating-system-v1/CAMPAIGN.md`).
Phase: 0 of the campaign roadmap. Read the campaign contract, then apply
`.agent/skills/plan-domain.md` (build) and `.agent/skills/targeted-audit.md` (audit/repair).
Do NOT load the Plan interaction skill or the evidence-economics skill;
Phase 0 does not cross into those areas.

## Objective

Build the smallest pure, tested Plan domain kernel required to support the later
Farm Return operating-system layers.

The kernel establishes clean domain contracts and deterministic behaviour for:

- goals / outcomes;
- programmes, only where necessary for the kernel;
- jobs / work items;
- dynamic target scope;
- lifecycle / status;
- readiness;
- dependencies and blockers;
- recommended working windows;
- progress;
- completion contracts;
- farmer working order;
- system priority as a separate concept;
- defer / snooze / override state;
- canonical action routes;
- auditable domain transitions;
- auditable scope changes;
- deterministic re-evaluation.

## Fundamental architectural invariant

Plan owns intent, orchestration and work state. Canonical Farm Return domain systems
own physical and factual reality. Plan must NOT become a second source of truth.

Do not duplicate into Plan: cattle weights, animal facts, field facts, soil facts,
crop-input calculations, crop-input/spreading application records, feed stock reality,
sale records, supplier quotes, or any other canonical farm-domain fact.

Data-linked progress and completion must be derivable from canonical evidence supplied
to the kernel as input. If canonical data is updated elsewhere in Farm Return, Plan must
be able to re-evaluate from that reality without duplicate entry.

Before designing new types, inspect existing `src/domain/` modules that already touch
work/jobs/audit (e.g. `job-session-*`, `job-actual`, `audit-trace*`) and
`docs/farm-return-next/DOMAIN_CONTRACTS.md`. Reuse or reference existing exports rather
than duplicating them; do not change any frozen contract signature. If the kernel genuinely
needs a frozen-contract change, STOP and record it in `docs/farm-return-next/BLOCKERS.md`.

## Dynamic scope

Support jobs whose target scope follows current farm reality (e.g. later, animal groups
whose membership changes). Scope changes must be deterministic, explainable and auditable.
A changed scope may complete an existing job while independently producing follow-on work
if the new real-world state requires it. Do not build specific cattle behaviour; a tiny
generic test fixture is acceptable to prove the kernel.

## Completion contracts

Preserve the distinction between:

1. data-completion jobs;
2. operational-record jobs;
3. decision jobs;
4. manual tasks.

Do not invent numeric progress where the domain does not naturally support it.
Manual override of a data-linked job must not erase the fact that required canonical data
is still missing.

## Status / readiness / priority / order

Keep these separate and never collapse them into one field:

- status = lifecycle;
- readiness = whether work can currently be acted on (blocked dependencies must never
  yield Ready);
- system priority = Farm Return's internal importance;
- farmer working order = the farmer's chosen execution order. System priority changes must
  not silently reorder farmer-selected order.

System priority hierarchy (types/ordering only; no scoring values):

1. legal / compliance / welfare hard obligations;
2. avoid material loss;
3. maximise expected net return;
4. high-value information gathering.

Do not build detailed economics.

## Timing

Prefer recommended windows over arbitrary due dates. Hard deadlines represent only genuine
fixed deadlines and must be typed distinctly so a recommended window cannot masquerade as
a legal deadline. Do not invent any regulatory dates or scientific values.

## Action routes

Provide a typed/canonical route from a Plan job to the correct Farm Return workflow
(target/context pre-selected). Do not build those workflows.

## Auditability

Important state changes are representable as lightweight, composable audit events, where
relevant: creation source, status transition, readiness transition, scope change,
dependency change, progress change, completion, farmer override, defer/snooze, ordering
change.

## Implementation style

- Place the kernel under `src/domain/plan/` as small composable TypeScript modules with
  colocated focused Vitest tests.
- Pure deterministic functions; explicit types; discriminated unions where useful.
- No AI/model calls for deterministic Plan state.
- No duplicated calculations; UNKNOWN never represented as zero.
- Preserve all existing Farm Return behaviour; do not modify existing modules except where a
  purely additive export is genuinely required.
- Register the new contracts in `docs/farm-return-next/DOMAIN_CONTRACTS.md` (non-frozen) and
  update `docs/farm-return-next/BUILD_STATE.json` / `IMPLEMENTATION_LOG.md` per AGENTS.md.

## Scope

Pure domain kernel modules and tests under `src/domain/plan/`, plus the documentation /
state updates listed above. Nothing else.

## Out of scope

Do NOT build or touch:

- any Plan presentation layer, operational queue view, drag-and-drop interaction;
- Weigh Group 1 workflow; livestock data-entry integration;
- crop-input integration; Adviser integration;
- cattle outcome planning; feed demand; feed inventory allocation;
- material-change thresholds; market-price monitoring;
- procurement; supplier RFQs; Strategic Calendar;
- migrations; new database schema; persistence;
- new scientific, regulatory, economic or financial calculations or values;
- external research; deployment; push; merge to main;
- agent tooling under `scripts/` or `.agent/`;
- Phase 1 or any later campaign phase.

## Acceptance criteria

- `src/domain/plan/` exports typed contracts for every concept listed in the Objective.
- Status, readiness, system priority and farmer order are distinct types/fields, and tests
  prove changing one does not change another.
- Readiness derivation is deterministic; tests prove unmet dependencies/blockers never yield
  Ready and a shared blocker can affect multiple jobs.
- The four completion contract kinds are a discriminated union; data-linked progress and
  completion are derived only from canonical evidence passed in; tests prove automatic
  completion without a farmer checkbox, and that unknown evidence is not treated as zero.
- Dynamic scope re-evaluation is deterministic and emits scope-change audit events; a test
  proves a scope change can complete a job and separately yield follow-on work.
- Recommended windows and hard deadlines are distinct types.
- Farmer working order survives system-priority changes (tested).
- Defer/snooze/override state is representable, audited, and a manual override of a
  data-linked job preserves the record that canonical data is missing (tested).
- Action routes are typed and canonical; no workflows are built.
- Audit events cover the transitions listed under Auditability.
- Re-evaluation is a pure function: identical inputs produce identical outputs (tested).
- No product behaviour outside `src/domain/plan/` changes; no migration, schema or values
  are introduced.
- Verify command passes.

## Required tests

- Focused Vitest suites colocated in `src/domain/plan/` covering every acceptance item.
- `npx vitest run src/domain/plan && npm run typecheck && npm run lint`.

## STOP conditions

Stop with:

BUILD_RESULT: BLOCKED <reason>

if the kernel requires a frozen-contract change, a migration/schema change, an invented
scientific/regulatory/financial value, external evidence, or scope materially expands.

Phase 0 must STOP when complete. Do not start Phase 1, Weigh Group 1, or any other phase.

# Plan Operating System v1 — Campaign Contract

## Purpose

Build Plan as Farm Return's orchestration layer over canonical farm reality, domain intelligence, farmer decisions, execution and feedback.

Plan is not a second source of truth and is not a generic task manager. It stores intent, orchestration state and work context while canonical domain systems store reality.

Core loop:

Farm reality -> intelligence -> options/recommendation -> farmer decision -> Plan -> execution -> canonical data update -> re-evaluation.

## Campaign rules

- Work phase-by-phase. Never start the next phase automatically.
- Every phase has an immutable task boundary, explicit starting SHA, acceptance criteria, verify command and stop conditions.
- Use the existing agent harness. Do not create a parallel runner.
- Normal loop: build -> deterministic verification -> targeted audit -> targeted C/H repair if required -> appropriate final verification -> freeze -> human review.
- Medium/Low findings are recorded and do not trigger automatic repair unless explicitly authorised.
- Do not broaden an audit merely because a narrow defect was found. Follow the plausible blast radius. Escalate only when evidence indicates a shared architectural, scientific, regulatory, financial, security or canonical-data invariant may be affected.
- No push, merge to main, deploy or production migration unless explicitly authorised by the human operator.
- Unknown is never represented as zero.
- Do not invent scientific, regulatory, market or financial values.
- Monetisation must never influence recommendation ranking or strategy generation.

## Locked Plan product model

### Two planning surfaces

1. Operational Plan / To-do: what needs doing now, what is ready, what is waiting and what changed.
2. Strategic Calendar / Future: longer-horizon planning using the same underlying goals, programmes, jobs, windows, dependencies and context.

The Calendar is architecturally in scope but is implemented only after the operational Plan data model is proven.

### Job creation

Hybrid sources:
- Farm Return-generated routine, seasonal, data-gap and programme work.
- Adviser-approved meaningful recommendations added to Plan.
- Farmer-created manual work.

### Completion

- Data-linked jobs derive progress and completion from canonical domain records.
- Manual jobs may be manually completed.
- Do not require a second checkbox when canonical data proves completion.
- Completion should be positively but quietly confirmed.

### Dynamic scope

Jobs follow current farm reality. Scope changes may complete an existing job and may create a separate follow-on job when the changed physical reality creates a material new information requirement.

Required or decision-useful missing information may create work. Merely available optional fields do not.

Obsolete active work leaves the active queue but remains auditable in history.

### Ordering

System priority and farmer working order are separate.
- System priority is derived from hard obligations, material-loss avoidance, expected net return and high-value information.
- Farmer may drag/drop reorder normal work.
- Dynamic priority changes do not silently reorder farmer-selected order; they change state/visual emphasis instead.
- Verified critical legal/welfare/hard-constraint events may visibly override normal ordering; the farmer may still move them after warning where legally/operationally appropriate.

### Readiness and timing

Status and readiness are separate concepts.
Use dynamic recommended windows where possible. Fixed dates are reserved for genuine hard deadlines.
Dependencies are first-class and can keep work visible but waiting until prerequisites are satisfied.
Farmers may defer/snooze work while Farm Return continues monitoring for material change.

### Actionability

Every actionable job has one clear primary action and routes directly into the correct pre-scoped canonical workflow.
Partial progress is visible and Continue resumes remaining work.

### Outcomes

Related work may be grouped around outcomes/goals.
Farm Return should derive and suggest useful outcomes/strategies from data where possible rather than forcing the farmer to calculate targets.
The farmer may choose among credible strategies and override assumptions where appropriate.

## Economic rules

Economic value primarily drives internal ranking and strategy comparison; it is not a mandatory default display on every job.

For operational recommendations, optimise incremental expected net margin subject to biological, legal, operational and risk constraints.

For outcome planning, present credible strategies such as lower-input, recommended risk-adjusted return and higher-output where evidence supports them.

Existing farm-produced stock is not free. Distinguish historical production cost, current stock/asset value and forward decision/opportunity cost.

Procurement is downstream of a proven need. Supplier commission must never influence the recommendation engine.
Accepted real quotes replace indicative assumptions as the source of truth for that plan and trigger recalculation.

## Material change

Continuously recompute when relevant inputs change, but notify on decision impact rather than raw market movement.
Use internal watch/review states. Thresholds are not hard-coded by this campaign contract; they require evidence and explicit phase implementation.

## Auditability

For meaningful recommendations, changes, overrides and source-of-truth replacements preserve enough information to reproduce and explain:
- input values and provenance,
- timestamps,
- rules/model version,
- assumptions and unknowns,
- decision/recommendation reason,
- farmer override or chosen strategy,
- scope changes and resulting job transitions.

## Roadmap

Phase 0 — Plan Kernel
Define pure tested domain contracts for goals, jobs, target scopes, lifecycle, readiness, dependencies, windows, progress/completion contracts, farmer order, overrides, action routes and audit events. No broad UI build.

Phase 1 — Weigh Group 1 golden path
Prove canonical-data-driven partial progress and automatic completion through the real livestock workflow.

Phase 2 — Fertiliser golden path
Prove Plan orchestration over an existing scientific/regulatory vertical without duplicating fertiliser truth.

Phase 3 — Operational Plan v1
Build the farmer-facing queue: Do next / flexible / later / waiting, direct actions, progress, drag/drop farmer order, subtle dynamic-priority communication and grouped blockers.

Phase 4 — Cattle Outcome Planning v1
Narrow first outcome: e.g. sell a defined cattle group in a target period. Generate evidence-based strategy options, expected performance, costs, return and required execution work.

Phase 5 — Feed demand and inventory
Convert chosen animal outcomes into feed demand; allocate existing stock; identify shortages; re-evaluate strategy before procurement.

Phase 6 — Material Change Engine
Version/monitor important assumptions and generate plan review only when the decision materially changes.

Phase 7 — Procurement
Generate pre-scoped requirements, request/compare quotes on total economic impact, replace assumptions with accepted confirmed prices, and feed results back into Plan.

Phase 8 — Strategic Calendar
Expose goals/programmes/jobs/windows, weather/conditions, regulation and relevant events as a longer-horizon planning view over the same planning model.

## Campaign closure discipline

Each phase must return a compact close-out containing:
- starting SHA,
- ending SHA,
- changed contracts/files,
- tests added and run,
- verification result,
- audit result and findings,
- defects fixed,
- known limitations,
- acceptance criteria PASS/FAIL,
- exact manual checks for the farmer-facing app.

Then STOP for human review.

# Skill — Plan Domain

Use this skill whenever a task creates, changes or audits Plan domain behaviour.

## Core invariant

Plan orchestrates intent and work. Canonical domain systems own reality.

Never duplicate livestock measurements, field facts, nutrient records, actual applications, feed stock facts, sale facts, supplier quotes or other domain truth merely to make Plan convenient.

## Required concepts

A Plan implementation should model only the concepts needed by the current phase, but preserve the separation between:
- goal/outcome,
- programme,
- job/work item,
- target scope,
- lifecycle/status,
- readiness,
- recommended window,
- dependency/blocker,
- progress/completion contract,
- farmer working order,
- system priority,
- action route,
- override/defer/snooze state,
- audit/provenance events.

Do not collapse status, readiness and priority into one field.

## Job identity and deduplication

Where multiple reasons produce the same real work, prefer one active work item with multiple supporting reasons rather than duplicate jobs.

Conceptually deduplicate by action + target + relevant window, while respecting domain-specific identity rules discovered in implementation.

## Dynamic target scope

Target scope follows canonical farm reality where the task is inherently dynamic.
- Re-evaluate membership when animals/fields/resources change.
- Explain material scope transitions in the audit trail.
- Do not silently preserve stale members solely to maintain a historical progress denominator.
- A scope change may complete one job while independently creating follow-on work required by the new reality.

## Completion contracts

Use one of four conceptual forms:
1. data-completion — canonical data proves completion;
2. operational-record — canonical activity record proves completion;
3. decision — saved decision proves completion;
4. manual — farmer explicitly completes work that has no reliable digital evidence.

Progress must be domain meaningful. Do not invent percentages when the domain does not support them.

For data-linked work:
- compute progress from canonical records;
- if canonical data is recorded elsewhere, Plan updates automatically;
- entering through Plan must write to the canonical workflow, not a Plan-owned copy;
- automatic completion must not require a duplicate farmer checkbox.

Manual override of a data-linked job may be allowed only if the product contract permits it. Preserve warning/consequence and audit evidence.

## Readiness and dependencies

A job may be Planned and Waiting simultaneously.
Readiness can include Ready, Needs attention, Upcoming, Waiting for weather, Waiting for legal window, Waiting for input and Waiting for dependency, or a narrower typed equivalent justified by the phase.

Shared blockers should be represented once when practical and may affect many jobs.

## Priority and farmer order

Keep two layers:
- system priority: safety/legal/welfare hard obligations -> avoid material loss -> expected net return -> value of information;
- farmer order: explicit working sequence selected by the farmer.

Normal system-priority changes must not silently destroy farmer ordering.

## Timing

Prefer recommended windows over arbitrary due dates.
Use hard deadlines only for genuine fixed dates.
Farmer availability/preferences may constrain suggestions but are not hard farm facts unless explicitly confirmed.

## Action routes

An actionable work item must route to the shortest correct canonical workflow with relevant target/context preselected.
Examples:
- weigh group -> livestock/group/weights;
- soil sample -> field/soil;
- record slurry -> field/nutrients/activity;
- confirm nutrient plan -> nutrient plan workflow.

## Event-driven re-evaluation

Prefer canonical update -> domain event or deterministic re-evaluation -> affected Plan jobs update.
Do not introduce AI calls for deterministic progress/completion logic.

## Trust

Never present inferred preferences or uncertain facts as confirmed reality.
Important changes, overrides and scope transitions must be explainable.
Known data is not requested again simply because a user entered through a different surface.

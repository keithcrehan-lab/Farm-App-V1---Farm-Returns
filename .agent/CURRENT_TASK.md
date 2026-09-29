# Task: CC-B1 — adjudicate Campaign C slurry science conflicts

Starting HEAD: 0a92745d4832ea4e978f9e3a997b87a66442224e

## Goal

Perform the scientific adjudication required to advance Campaign C.

This task is evidence review and rule-freeze work only.

Do NOT modify production nutrient calculations, recommendation logic, UI, database schema,
migrations, What Matters ranking, Campaign B regulatory behaviour or deployment state.

Campaign C remains DRAFT unless every required scientific decision in scope is supported
strongly enough to freeze.

## Scope

Adjudicate the currently open Campaign C science questions using repository evidence only.

Primary questions:

1. CONF-01 — spring LESS phosphorus value
   Determine whether the correct cattle-slurry spring LESS P availability value for the
   relevant standard slurry case is 0.5 or 0.6 kg P/m³, and explain the apparent conflict.

2. CONF-02 — 90 kg K/ha limit
   Determine exactly whether the referenced 90 kg K/ha spring/closing limit applies to
   slurry K for first-cut silage, including the conditions and scope of that limit.

3. CONF-03 — low-index organic P/K treatment
   Determine the relationship between:
   - P availability factor of 50% for Index 1/2;
   - K availability factor of 90% for Index 1/2;
   - any organic-manure share-of-requirement limits or caps.
   Establish whether these rules are cumulative, alternative, context-specific, or cannot
   yet be reconciled.

4. CONF-04 — timing interpretation
   Resolve the existing Campaign C timing conflict only if repository evidence is sufficient.

5. GAP-01 — deterministic slurry application-rate rule
   Determine whether the evidence supports a deterministic rule for selecting slurry rate
   from crop P/K requirement.
   Do not invent an optimisation rule.
   If "largest rate not exceeding P/K requirement" is only a system inference rather than a
   documented agronomic rule, keep GAP-01 open.

Review GAP-02 through GAP-08 only to determine whether existing repository evidence already
closes them. Do not broaden research merely to force closure.

## Evidence boundary

Use repository evidence only.

Relevant material includes:

- docs/farm-return-next/campaign-c/
- docs/scientific-engine/v3/reference_greenbook_2020/
- docs/scientific-engine/v3/advisory_teagasc/
- docs/evidence-register.md
- docs/farm-return-next/SCIENTIFIC_RULES.md
- docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md
- docs/farm-return-next/BLOCKERS.md
- docs/farm-return-next/BUILD_STATE.json
- docs/farm-return-next/IMPLEMENTATION_LOG.md

Do not use WebFetch or WebSearch.

Do not claim fresh retrieval or verification of external source documents.

Distinguish clearly between:

- locally traceable primary-source extraction;
- repository quotations/notes;
- system inference;
- unresolved external-source verification.

## Evidence hierarchy

Prefer, in order where available:

1. directly traceable Teagasc / DAFM primary material represented in the repository;
2. Irish peer-reviewed research;
3. other authoritative agricultural research;
4. secondary advisory material;
5. existing Farm Return inference.

A lower-tier source must not silently override stronger evidence.

## Required method

For every CONF/GAP reviewed:

1. identify the exact proposition being adjudicated;
2. list supporting evidence;
3. list conflicting evidence;
4. identify source provenance and strength;
5. distinguish factual source statement from Farm Return interpretation;
6. classify outcome as exactly one of:
   - RESOLVED
   - RESOLVED_WITH_SCOPE
   - UNRESOLVED_CONFLICT
   - INSUFFICIENT_EVIDENCE
   - OUT_OF_SCOPE
7. state the exact rule text that would be frozen if resolved;
8. state what production behaviour would eventually be affected;
9. do not implement that behaviour in this task.

## Scientific conservatism

Do not force closure.

If authoritative evidence is ambiguous, contradictory or incomplete, preserve the conflict.

Unknown must remain unknown.

Do not turn:
- advisory wording;
- implementation precedent;
- existing production behaviour;
- arithmetic convenience;
- prior Farm Return assumptions

into scientific authority.

## CC-B2 / CC-B4A

CC-B2 and CC-B4A are implementation corrections already closed.

Do not reopen them.

The active nutrient engine is nutrient_engine_v1.2.0.

Their implementation status must not be treated as evidence that unresolved Campaign C
science is scientifically approved.

Independent per-nutrient P/K architecture is NOT implemented and is outside this task.

## Required outputs

Update the Campaign C evidence package as necessary, including only files genuinely needed,
for example:

- docs/farm-return-next/campaign-c/CONFLICTS.md
- docs/farm-return-next/campaign-c/SCIENCE_FREEZE.md
- docs/farm-return-next/campaign-c/SOURCES_AND_CLAIMS.md
- docs/farm-return-next/campaign-c/REFERENCE_CASES.md
- docs/farm-return-next/campaign-c/LIFECYCLE.md
- docs/farm-return-next/campaign-c/README.md
- docs/farm-return-next/BLOCKERS.md
- docs/farm-return-next/BUILD_STATE.json
- docs/farm-return-next/IMPLEMENTATION_LOG.md

Do not edit production TypeScript unless required solely to keep a documentation consistency
test compiling. If production logic appears to require change, record it for a later task.

## Reference cases

Only update Campaign C reference cases when a scientific rule is genuinely resolved.

Every changed reference case must identify:

- source/rule basis;
- resolved rule identifier;
- calculation inputs;
- expected output;
- version/status;
- whether it is normative or illustrative.

Do not convert unresolved candidate values into normative expected outputs.

## Approval gate

Campaign C may move beyond DRAFT only if all core scientific blockers required for production
recommendation logic are resolved with sufficient evidence.

Do not mark Campaign C APPROVED merely because some conflicts are resolved.

If any core blocker remains unresolved, keep:

Campaign C = DRAFT

and state exactly what evidence is still required.

## CC-B1 status

CC-B1 may only be marked RESOLVED if the scientific review itself is complete and the remaining
Campaign C state is accurately classified.

If unresolved authoritative evidence remains necessary, CC-B1 may remain OPEN/BLOCKED with a
precise evidence request.

## Prohibited work

Do not:

- implement new slurry rate-selection logic;
- change nutrient_engine_v1.2.0 calculations;
- change slurry nutrient values in production;
- change What Matters ranking;
- modify Campaign B regulatory gates;
- change NAP/statutory calculations;
- add database migrations;
- change UI;
- redesign P/K evidence architecture;
- modify the optimised agent harness;
- push;
- deploy;
- use unsupported assumptions to resolve conflicts.

## STOP conditions

Return:

BUILD_RESULT: BLOCKED <reason>

if:

1. a core conflict cannot be resolved from repository evidence;
2. fresh primary-source retrieval is required;
3. the locally stored evidence has contradictory authoritative statements that cannot be reconciled;
4. resolving a question requires inventing an agronomic rule;
5. scientific resolution would require production implementation in this same task;
6. provenance is insufficient to support a freeze;
7. scope would expand materially beyond Campaign C slurry science adjudication.

A BLOCKED outcome is valid and preferred over unsupported certainty.

## Validation

Run repository documentation/reference-case tests relevant to Campaign C.

Run:

npm run typecheck

Run:

npm run build

Do not run broad application tests unless needed by changed executable files.

## Build result

If the evidence genuinely resolves the scoped review:

BUILD_RESULT: DONE

Summarise:

- each CONF/GAP classification;
- evidence used;
- exact frozen rule text for resolved items;
- unresolved evidence gaps;
- files changed;
- tests run;
- whether Campaign C remains DRAFT;
- whether CC-B1 is resolved or still open;
- confirmation that no production code changed.

If evidence is insufficient:

BUILD_RESULT: BLOCKED <reason>

Still update the scientific record where appropriate so the unresolved question is explicit,
auditable and narrower than before.

## Audit flow

After a successful build or evidence-review checkpoint:

./scripts/agent-audit --primary

For Critical/High findings only:

./scripts/agent-fix

Then narrow remediation:

./scripts/agent-audit --remediation <finding-id>

Finally:

./scripts/agent-audit --final

Do not run baseline-wide historical audits.

Verify command: `npm run typecheck && npm run build`

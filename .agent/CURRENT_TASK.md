# Task: Campaign C — verify and ingest stored Teagasc evidence

Starting HEAD: 0c58a8cfb182ff6231cde65443c98bb297423f34

## Goal

Verify and ingest the newly stored authoritative Teagasc evidence for Campaign C.

This is an EVIDENCE INGESTION task.

Do not change production scientific calculations.

Do not implement newly verified rules yet.

The purpose is to move claims from AI_REVIEW_ONLY to REPOSITORY_VERIFIED where, and only where,
the frozen local source evidence actually supports them.

## Stored source package

Use:

docs/scientific-engine/v3/external_teagasc_2026-09-29/

The package contains frozen HTML snapshots plus SOURCE_MANIFEST.md and SHA-256 fingerprints.

Do not use WebFetch or WebSearch.

Do not trust the previous AI adjudication merely because it exists.

Verify each claim directly against the stored source snapshots.

## Required adjudications

### 1. Low-index organic-share caps

Check the stored Organic Manures source.

Determine whether it directly supports:

- P Index 1/2: organic fertiliser should supply only 50% of crop P requirement;
- K Index 1/2: organic fertiliser should supply only 75% of crop K requirement.

Keep separate from:

- slurry P availability × 0.50;
- slurry K availability × 0.90.

If directly supported:

classify the share-cap claims REPOSITORY_VERIFIED / SOURCE_DIRECT.

Do not implement them in production in this task.

### 2. 90 kg K/ha spring guidance

Check the stored first-cut source.

Verify whether it directly states that:

- luxury K uptake can occur above 90 kg K/ha;
- where more than 90 kg/ha is advised, only 90 kg should be applied in spring;
- the remainder should go to aftermath or late autumn.

If directly supported, record those statements as REPOSITORY_VERIFIED / SOURCE_DIRECT.

Keep the Farm Return interpretation separate:

- nutrient content/credit is not automatically truncated to 90;
- treating this as an application constraint within Farm Return remains a derived implementation decision unless directly supported.

Classify that Farm Return reconciliation honestly as SOURCE_DERIVED or AI_PROVISIONAL as warranted.

Do not change production behaviour.

### 3. February–April timing evidence

Check the stored Getting the Most from your Slurry source.

Verify the actual wording around February to April.

If directly supported:

record "February to April" as REPOSITORY_VERIFIED / SOURCE_DIRECT.

Do not overstate this as proof of an exact date-time boundary if the source does not say that.

The existing Campaign C v1 February–April class may remain RESOLVED_WITH_SCOPE, with the distinction
between source wording and Farm Return's exact implementation boundary explicit.

Do not change production timing code.

### 4. Yield scaling

Check the stored silage-yield-scaling source.

Verify whether it explicitly supports:

25 kg N/ha
4 kg P/ha
25 kg K/ha

per tonne DM change in the stated first-cut silage context.

If supported, classify these figures REPOSITORY_VERIFIED / SOURCE_DIRECT.

Record the exact source scope and any stated reference yield/context.

Do not broaden beyond the source's supported crop/yield context.

Do not alter production calculations in this task.

### 5. Rate-selection principle

Check the stored rate-selection source plus any already stored authoritative repository evidence.

Verify the direct principles, such as:

- assess slurry nutrient content;
- application rate should match applicable crop nutrient requirement/allowance;
- account for slurry nutrients in subsequent chemical fertiliser planning.

Do NOT claim that the source directly specifies:

min(P-limited rate, K-limited rate)

unless the actual stored source says so.

`AI_PROVISIONAL_RATE_SELECTOR_V1` must remain AI_PROVISIONAL if the exact deterministic selector is
not directly documented.

## Required evidence trail

For every claim reviewed record:

- claim ID;
- source ID;
- local source path;
- source organisation;
- source title;
- retrieval date;
- SHA-256 fingerprint;
- exact evidence location or robust locator/search phrase;
- concise source-supported proposition;
- evidence classification;
- implementation status;
- limitations.

Use classifications exactly:

SOURCE_DIRECT
SOURCE_DERIVED
AI_PROVISIONAL

Use evidence state:

REPOSITORY_VERIFIED
AI_REVIEW_ONLY

Only upgrade a claim to REPOSITORY_VERIFIED after direct inspection of the stored source.

## Documentation updates

Update only what is needed, expected among:

- docs/evidence-register.md
- docs/farm-return-next/campaign-c/SOURCES_AND_CLAIMS.md
- docs/farm-return-next/campaign-c/AI_ADJUDICATION_2026-09-29.md
- docs/farm-return-next/campaign-c/CONFLICTS.md
- docs/farm-return-next/campaign-c/SCIENCE_FREEZE.md
- docs/farm-return-next/campaign-c/README.md
- docs/farm-return-next/BLOCKERS.md
- docs/farm-return-next/BUILD_STATE.json
- docs/farm-return-next/IMPLEMENTATION_LOG.md

Update the Campaign C documentation consistency test only if necessary to enforce truthful evidence
classification.

Do not change reference-case numerical outputs solely because evidence has been ingested.

## Campaign state

Campaign C remains:

AI_SCIENTIFIC_ADJUDICATION
EXPERT_VALIDATION_PENDING
DRAFT

Production implementation remains evidence-gated.

This task does not constitute expert validation.

## Implementation status

For newly verified rules set implementation status appropriately, for example:

READY_FOR_IMPLEMENTATION_REVIEW

or the repository's equivalent.

Do not set IMPLEMENTED unless the behaviour was already independently present in production before
this task.

Where behaviour is already present, distinguish:

ALREADY_IMPLEMENTED
from
NEWLY_IMPLEMENTED

No new production behaviour is authorised here.

## Prohibited

Do not modify:

- production nutrient calculations;
- nutrient_engine_v1.2.0;
- What Matters ranking/economics;
- Campaign B regulatory rules;
- database schema;
- migrations;
- UI;
- independent P/K architecture;
- agent harness;
- deployment state.

Do not push.

Do not use external web access.

## Tests

Run Campaign C documentation/reference-case consistency tests.

Run:

npm run typecheck

Run:

npm run build

Because this should be documentation/evidence only, do not run the full application suite unless executable
code or tests materially require it.

## Completion criteria

Complete when:

1. all five stored sources have been directly inspected;
2. their SHA fingerprints are recorded;
3. source-direct claims are correctly mapped;
4. unsupported AI interpretations remain AI_PROVISIONAL;
5. AI-review-only claims are upgraded only where evidence truly supports them;
6. exact February boundary is not overstated;
7. exact deterministic rate selector is not falsely attributed to Teagasc;
8. no production code changes;
9. no engine version change;
10. Campaign C remains DRAFT;
11. expert validation remains pending;
12. relevant tests/typecheck/build pass.

If successful:

BUILD_RESULT: DONE

Report a concise table:

claim
previous state
new state
evidence class
source
implementation readiness

If stored evidence contradicts the previous AI adjudication:

do not force agreement.

Record the contradiction and return:

BUILD_RESULT: BLOCKED <reason>

Verify command: `npm run typecheck && npm run build`

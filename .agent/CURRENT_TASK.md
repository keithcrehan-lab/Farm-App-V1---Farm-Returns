# Task: Campaign C — slurry recommendation science freeze and evidence lifecycle

Starting HEAD: 29f787a8b9bc1a30613dc621e221ad79651c315f

## Goal

Establish and freeze the scientific, agronomic, evidential and versioning basis for
Farm Return's first slurry recommendation engine before any production recommendation
logic is implemented.

This task is:

- RESEARCH;
- DOMAIN SPECIFICATION;
- EVIDENCE MAPPING;
- RULE-LIFECYCLE DESIGN;
- REFERENCE-CASE DEFINITION.

Do not build the production slurry recommendation engine yet.

Campaign B is frozen.

Do not alter Campaign B regulatory behaviour.

The output must establish:

- which scenarios Campaign C v1 supports;
- which scenarios are excluded;
- which agronomic nutrient values may be used;
- how those values depend on slurry dry matter, method and timing;
- how soil P/K indices affect recommendations;
- how previous nutrient inputs are accounted for;
- what evidence is authoritative;
- where evidence conflicts remain unresolved;
- what outputs must return UNKNOWN / EVIDENCE_CONFLICT / OUT_OF_SCOPE;
- frozen reference cases for future implementation;
- how Farm Return stores and versions scientific evidence;
- how scientific and regulatory rules are updated over time;
- how temporary regulatory overrides are represented;
- how historical recommendations remain reproducible.

The science must be independently reviewable without trusting Farm Return.

---

# 1. Core scientific principles

Preserve the existing Farm Return separation between:

1. agronomic/scientific nutrient accounting;
2. regulatory/statutory accounting;
3. physical/economic accounting.

Do not merge these ledgers.

Campaign B regulatory rules are frozen.

A statutory/deemed value is not automatically an agronomic recommendation value.

A physical tank quantity is not automatically regulatory neat slurry.

A regulatory quantity is not automatically agronomic nutrient composition.

No unknown may silently become zero.

No unsupported interpolation or extrapolation.

No scientific rule may be used outside its evidenced applicability boundary.

Science before AI.

Deterministic domain logic must produce numeric outputs.

AI may explain or summarise those outputs but must not invent scientific numbers.

---

# 2. Mandatory repository trace

Before researching or drafting new rules, inspect only the relevant scoped material required
for this task, using the new token-efficient harness.

Trace:

- `docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md`;
- relevant evidence/source registers;
- slurry-science domain modules;
- nutrient-plan code;
- statutory manure-value code where its boundary matters;
- Campaign B slurry regulatory interfaces;
- current slurry-direct economics logic;
- existing application-method/timing types;
- soil P/K index logic;
- recorded slurry dry-matter/composition evidence;
- existing agronomic slurry nutrient values;
- Campaign C placeholders/TODOs;
- tests currently encoding slurry-science assumptions.

Produce an internal trace of what already exists before adding new rules.

Do not trust old comments, historical constants or implementation-log history without tracing
their current evidence.

Do not read unrelated large historical documents wholesale merely because they exist.

---

# 3. Authoritative research hierarchy

Use current authoritative Irish evidence first.

Prioritise:

1. Teagasc technical publications and nutrient-management guidance;
2. Department of Agriculture / official Irish material where scientifically or
   regulatorily relevant;
3. peer-reviewed Irish research;
4. recognised peer-reviewed international evidence only where Irish evidence is
   genuinely absent and applicability can be justified.

Do not use commercial fertiliser marketing material as scientific authority.

Do not treat legislation as agronomic evidence unless the rule being established is
specifically regulatory.

For every material numeric transformation record:

- source;
- organisation;
- publication/version/date;
- exact page/table/section/result used;
- applicability;
- units;
- denominator;
- assumptions;
- limitations;
- whether measured, experimentally derived, estimated, statutory, policy-derived or inferred.

---

# 4. Campaign C v1 supported scenario

Attempt to freeze a deliberately narrow first supported case.

The intended starting scope is:

- cattle slurry;
- Irish grassland;
- first-cut silage;
- perennial ryegrass-dominant sward;
- spring application;
- LESS application where supported by evidence;
- mineral soils;
- valid soil P and K indices;
- known relevant previous nutrient inputs;
- known slurry evidence sufficient to calculate agronomic available nutrients.

Verify each boundary rather than assuming it.

If evidence demonstrates that one of these boundaries is scientifically inappropriate,
document it and STOP before changing the intended v1 scope.

Explicitly assess whether v1 should exclude:

- pig slurry;
- poultry manure;
- FYM;
- digestate;
- tillage;
- grazing optimisation;
- multispecies swards;
- clover-rich swards;
- red clover;
- peat/high-organic agronomic recommendations;
- autumn slurry;
- unsupported splashplate timings;
- fields with unknown P/K;
- fields with unknown prior nutrient inputs;
- fields with unresolved environmental/operational exclusions.

Do not broaden v1 merely because a number can be found somewhere in the literature.

---

# 5. Slurry nutrient-value matrix

Establish the agronomic crop-available N/P/K values Farm Return may use for the supported
v1 scenario.

Trace evidence for:

- dry-matter basis;
- application method;
- application timing;
- N availability;
- P availability;
- K availability;
- nutrient denominator;
- whether values refer to physical cubic metres, neat slurry quantity or another basis.

Do not conflate statutory Table values with agronomic available nutrient values.

If Farm Return already contains values, independently verify them.

For dry matter:

- identify exact evidenced DM points/categories;
- do not interpolate unless authoritative evidence explicitly supports interpolation;
- define behaviour when DM is unknown;
- define behaviour between evidenced categories;
- define behaviour outside supported range.

Use or extend the existing evidence classes where appropriate:

- MEASURED_LAB;
- MEASURED_DM_DERIVED;
- STANDARD_TEAGASC_ESTIMATE;
- STATUTORY_DEEMED;
- FARMER_DECLARED;
- SYSTEM_INFERRED;
- MISSING.

Agronomic recommendation logic must never silently consume STATUTORY_DEEMED values as
scientific measurements.

---

# 6. Method and timing matrix

Establish which application-method/timing combinations have defensible agronomic values.

At minimum investigate:

- LESS spring;
- LESS summer where relevant;
- splashplate spring;
- splashplate outside spring;
- late-summer timing;
- incorporation assumptions if present in current code.

For every combination classify:

- SUPPORTED;
- SUPPORTED_WITH_LIMITATIONS;
- EVIDENCE_CONFLICT;
- OUT_OF_SCOPE;
- UNKNOWN.

Do not generate future recommendations merely because an economics module currently has
a numeric factor.

---

# 7. Soil P and K requirement matrix

Establish authoritative first-cut silage P and K requirement values by soil index for the
supported production target.

Trace:

- production/yield basis;
- P Index 1–4;
- K Index 1–4;
- whether requirement changes with yield;
- whether index-specific availability adjustments apply to slurry nutrient supply;
- treatment of low-P / low-K soils;
- distinction between crop requirement and nutrient availability.

Keep separate:

1. crop nutrient requirement;
2. slurry nutrient supply;
3. remaining mineral-fertiliser requirement.

Do not allow nutrient oversupply to disappear in arithmetic.

If slurry selected for N creates excess P or K, expose that as a real outcome.

---

# 8. Existing evidence conflicts

Identify every material conflict between authoritative sources.

Do not choose one silently.

For each conflict record:

- Source A;
- Source B;
- exact conflicting values/claims;
- units;
- DM assumptions;
- yield assumptions;
- timing;
- method;
- crop target;
- publication age;
- whether the difference can be reconciled;
- whether expert review is required.

If authoritative evidence cannot be reconciled for a material production rule, return:

`EVIDENCE_CONFLICT`

and block production implementation of that rule.

---

# 9. Prior nutrient inputs

Define how Campaign C should treat previous nutrient applications.

Trace existing data structures for:

- previous slurry;
- chemical fertiliser;
- manure;
- other organic inputs;
- application date;
- method;
- quantity;
- nutrient composition.

Specify which previous inputs can be credited confidently.

Unknown prior inputs must not become zero.

If historical data cannot support a scientifically defensible remaining-requirement
calculation, define the required UNKNOWN state.

---

# 10. Rate versus total-volume boundary

Keep these concepts separate.

## RATE

Agronomic recommended slurry application rate, e.g. m³/ha.

## TOTAL VOLUME

Rate × defensible spreadable area.

Campaign B provides canonical spreadable-area evidence.

Campaign C must establish RATE science independently first.

Unknown spreadable area may block TOTAL VOLUME without automatically blocking an otherwise
scientifically valid per-hectare RATE.

Do not implement either production calculation in this task.

---

# 11. Recommendation status taxonomy

Freeze the statuses required by the future engine.

At minimum assess:

- RECOMMENDED;
- ELIGIBLE_NOT_SELECTED;
- NOT_RECOMMENDED_AGRONOMIC;
- LEGALLY_BLOCKED;
- NOT_ACTIONABLE_NOW;
- UNKNOWN_REQUIRED_DATA;
- EVIDENCE_CONFLICT;
- OUT_OF_SCOPE;
- EXPERT_REVIEW_REQUIRED.

Define exactly when each applies.

Do not collapse scientifically meaningful states into one generic "blocked".

---

# 12. Scientific uncertainty

Distinguish:

- computational exactness;
- measurement uncertainty;
- experimental variability;
- model assumptions;
- policy assumptions.

A calculation can be mathematically exact while the underlying scientific estimate remains
uncertain.

Specify what uncertainty Farm Return should disclose for major nutrient-value rules.

Do not fabricate confidence intervals where the source does not provide them.

---

# 13. Frozen reference cases

Create a versioned reference-case suite that future production implementation must reproduce.

At minimum include:

1. supported first-cut silage field, valid P/K, supported DM, spring LESS;
2. P Index 1;
3. P Index 4;
4. K Index 1;
5. K Index 4;
6. known previous slurry;
7. known previous mineral fertiliser;
8. unknown previous nutrient input;
9. unknown slurry DM;
10. unsupported DM;
11. unsupported method;
12. unsupported timing;
13. evidence conflict;
14. peat/high-organic out-of-scope;
15. unknown spreadable area where RATE remains scientific but TOTAL VOLUME cannot be calculated;
16. explicit zero remaining nutrient requirement;
17. slurry supplying more P or K than required;
18. multiple fields with different P/K indices.

For every case specify:

- inputs;
- evidence provenance;
- expected intermediate nutrient values;
- expected status;
- expected RATE if determinable;
- expected TOTAL VOLUME if determinable;
- reason when blocked;
- exact rounding rules where applicable;
- scientific rule-set version.

These cases become the acceptance standard for later implementation.

Do not write the production recommendation engine during this task.

---

# 14. Evidence & Rule Lifecycle

Campaign C must define the permanent lifecycle by which Farm Return stores, versions,
supersedes and audits scientific and regulatory evidence.

Farm Return must never treat scientific or regulatory guidance as an unversioned
"current truth".

Every material production rule must be traceable through:

SOURCE DOCUMENT
→ EVIDENCE CLAIM
→ APPROVED RULE
→ VERSIONED RULE SET
→ REFERENCE CASE
→ ENGINE VERSION
→ RECOMMENDATION / DECISION RECORD

Historical recommendations must remain reproducible using the exact evidence, rules and
engine version applicable when they were generated.

Future guidance changes create new versions rather than mutating historical versions.

---

# 15. Immutable evidence-source record

Define a canonical evidence-source model supporting:

- Teagasc publications;
- DAFM publications;
- legislation;
- statutory instruments;
- Nitrates Action Programme documents;
- temporary Government notices;
- peer-reviewed research;
- approved international evidence where justified.

At minimum model:

- source ID;
- issuing organisation;
- title;
- publication/version;
- publication date;
- source type;
- jurisdiction;
- canonical URL;
- retrieval date;
- document/file hash or immutable fingerprint;
- supersedes relationship;
- superseded-by relationship;
- archive/licence status;
- review status;
- last reviewed date;
- next review due;
- authoritative/non-authoritative classification.

Do not rely on URL alone.

If the content at a URL changes later, Farm Return must still know which exact evidence
version was originally reviewed.

Where legally/licensing-wise permitted, define how source snapshots should be archived.

Where archiving is not permitted, retain enough metadata and fingerprinting to identify the
reviewed version.

---

# 16. Evidence-claim layer

A source document is not itself a scientific rule.

Define a canonical evidence-claim model representing the exact evidence fragment behind
a rule.

Where applicable record:

- claim ID;
- source ID;
- page;
- table;
- row;
- figure;
- section;
- clause;
- claim/interpretation;
- units;
- denominator;
- crop/species applicability;
- slurry/manure type;
- dry-matter applicability;
- timing applicability;
- method applicability;
- soil applicability;
- jurisdiction/geographic applicability;
- evidence classification;
- assumptions;
- limitations;
- uncertainty;
- conflicting evidence;
- review status.

Every important number should be challengeable by an independent agronomist without reading
application code.

---

# 17. Versioned scientific rule sets

Define a canonical scientific rule-set model.

At minimum:

- rule-set ID;
- domain;
- jurisdiction;
- semantic version or equivalent;
- effective-from;
- effective-to where superseded;
- status:
  - DRAFT;
  - APPROVED;
  - ACTIVE;
  - RETIRED;
  - SUPERSEDED;
- evidence-source IDs;
- evidence-claim IDs;
- calculation/version metadata;
- approval/reviewer metadata;
- change reason;
- supersedes relationship;
- superseded-by relationship.

Conceptual example:

`slurry-agronomy-ie-2026-v1`

Do not create one permanent mutable "Farm Return slurry value".

---

# 18. Version immutability

Once a rule-set version has produced a farmer-facing recommendation or persisted decision,
its values must not be modified in place.

If guidance changes:

DO NOT mutate:

`slurry-agronomy-ie-2026-v1`

Instead create:

`slurry-agronomy-ie-2028-v2`

with documented:

- new evidence;
- effective date;
- changed rules;
- unchanged rules where useful;
- reason;
- reference-case impact.

Historical records continue referencing the original version.

---

# 19. Scientific, regulatory and economic versions remain separate

A future recommendation should be capable of retaining independently:

- scientific rule-set version;
- regulatory rule-set version;
- economic rule-set/version;
- engine/calculation version.

Do not replace these with one generic "rules version".

---

# 20. Permanent regulatory updates

Define how permanent regulatory changes are versioned.

Conceptual example:

`nitrates-ie-2026-v1`
effective through a defined date

followed by:

`nitrates-ie-2028-v2`
effective from its legally valid activation date.

Historic recommendations remain reproducible under previous regulatory versions.

Campaign B behaviour itself must not be changed during this task.

---

# 21. Temporary regulatory overrides

Define a separate time-bounded override model for:

- slurry deadline extensions;
- exceptional-weather measures;
- temporary derogations;
- emergency Government measures;
- region-specific restrictions.

At minimum model:

- override ID;
- affected base rule;
- jurisdiction;
- geographic scope if applicable;
- valid-from;
- valid-to;
- modified/replacement rule;
- reason;
- source;
- publication date;
- status;
- revocation state;
- precedence where multiple overrides exist.

Resolution should conceptually be:

BASE RULE
+
VALID TEMPORARY OVERRIDE
=
APPLICABLE RULE

When an override expires, the permanent base rule remains intact.

Never represent a one-year slurry deadline extension by permanently editing the base rule.

---

# 22. Historical recommendation provenance

Define the provenance future Campaign C recommendations must persist.

At minimum plan for:

- recommendation/decision ID;
- generated timestamp;
- relevant activity/planning date;
- calculation engine version;
- scientific rule-set ID;
- regulatory rule-set ID;
- economic rule-set/version where applicable;
- evidence/source fingerprint;
- material input provenance;
- integrity fingerprint/hash where existing architecture supports it.

Opening an old recommendation years later must show the original recommendation.

Do not silently recalculate history under modern rules.

Farm Return may separately indicate that newer guidance exists.

---

# 23. Guidance update workflow

New authoritative guidance must never automatically alter production recommendations.

Define this lifecycle:

NEW SOURCE DETECTED / RECEIVED
→ SOURCE REGISTERED
→ FINGERPRINT/VERSION COMPARED
→ EVIDENCE REVIEW
→ MATERIAL CHANGES IDENTIFIED
→ NEW EVIDENCE CLAIMS
→ NEW RULE-SET VERSION
→ REFERENCE-CASE DIFFERENTIAL
→ SCIENTIFIC REVIEW
→ SOFTWARE/AUDIT REVIEW
→ EXPLICIT ACTIVATION
→ PRODUCTION USE

Automated monitoring may detect changes.

It must not activate scientific or regulatory rules without review.

---

# 24. Rule-set change record

Define a change-record model capable of answering:

"Why did this rule change?"

Capture where applicable:

- previous rule-set version;
- new rule-set version;
- changed rules;
- previous value;
- new value;
- unchanged rules where useful;
- change reason;
- supporting evidence;
- effective date;
- scientific impact;
- affected reference cases;
- approval/reviewer state.

Do not rely only on Git history for this explanation.

---

# 25. Version-aware differential reference testing

When a new rule-set version is introduced:

1. retain old reference expectations;
2. run the same relevant cases under the new rule set;
3. produce deterministic before/after differences;
4. identify the rule change causing each material difference.

Conceptually:

Case C-001

2026 rule set:
rate = X

2028 rule set:
rate = Y

Reason:
specific evidence-backed coefficient changed.

Do not delete historical reference cases.

---

# 26. Effective-date resolution

Define explicitly which date governs each rule type.

Assess separately:

- recommendation generation date;
- planned application date;
- actual activity date;
- regulatory assessment date;
- evidence/rule effective date.

Different rule types may use different dates.

Do not use implicit `Date.now()` inside scientific calculations.

Relevant dates must be explicit inputs and testable.

---

# 27. Future-dated rules

Support publication before legal/scientific activation.

Publication date may differ from effective-from date.

The architecture must support:

- currently active version;
- future approved version;
- future activation date;
- pre-activation testing;
- scheduled transition.

Do not apply a future rule merely because it has been published.

---

# 28. Retrospective Farm Return corrections

Distinguish:

A. authoritative guidance genuinely changed;

from:

B. Farm Return implemented unchanged guidance incorrectly.

If Farm Return discovers an implementation error, record:

- affected engine/rule version;
- authoritative source that did not change;
- defect;
- corrected implementation;
- potentially affected historical recommendations;
- remediation/notification implications where relevant.

Do not falsely represent a software defect as a scientific guidance update.

---

# 29. Evidence conflict lifecycle

Where authoritative sources conflict:

- preserve both;
- identify exact conflict;
- do not silently choose;
- classify affected rule as EVIDENCE_CONFLICT where material;
- require scientific review;
- do not assume newer automatically supersedes older unless that relationship is established.

---

# 30. Evidence maintenance metadata

Define maintenance metadata such as:

- last reviewed;
- next review due;
- review frequency;
- responsible domain;
- source URL;
- current fingerprint;
- known current version;
- last-change-detected date.

Recommend practical review approaches for:

- legislation/regulatory notices;
- Teagasc formal guidance;
- peer-reviewed literature;
- economic/market data.

Do not build a large monitoring platform in this task.

Define the contract only.

---

# 31. Source-change detection

Define future support for detecting changes via:

- document hash;
- publication/version metadata;
- URL monitoring;
- official release/feed mechanisms where available;
- manual review.

A detected source change creates a REVIEW EVENT.

It must not directly mutate active rules.

---

# 32. Evidence archive

Define how authoritative source material should be retained.

Where storage is permitted:

- archive original file;
- retain immutable hash;
- retrieval timestamp;
- original source URL;
- never overwrite older archived versions.

Where storage is not permitted:

- retain source metadata;
- fingerprint;
- exact citation/locator;
- retrieval date;
- enough identifying information to establish which source version was reviewed.

Do not create an unlicensed document mirror.

---

# 33. Database / code boundary

Assess the correct boundary between:

- evidence-source metadata;
- evidence claims;
- versioned numeric rule tables;
- deterministic TypeScript algorithms;
- database/configuration-driven rule data;
- temporary overrides.

Do not assume every scientific number should be hard-coded as a TypeScript constant.

Do not assume every rule belongs in the database either.

The future engine must remain deterministic, type-safe and testable while allowing safe
guideline updates.

No database migrations are authorised during this science-freeze task unless separately
reviewed and explicitly authorised.

---

# 34. Fail-closed behaviour

If the future resolver cannot establish:

- correct jurisdiction;
- applicable date;
- active rule version;
- required evidence;
- conflict-free rule;
- valid override precedence;

then return typed:

- UNKNOWN_REQUIRED_DATA;
- EVIDENCE_CONFLICT;
- OUT_OF_SCOPE;
- EXPERT_REVIEW_REQUIRED;

as appropriate.

Do not silently fall back to the newest known value.

Do not silently use an expired rule because no replacement can be resolved.

---

# 35. Peer-review package

Create/update a dedicated Campaign C science package under the existing appropriate
Farm Return documentation structure.

It must be suitable for review by:

- a Teagasc adviser/agronomist;
- an agricultural scientist;
- an independent software auditor.

Include:

- supported scope;
- exclusions;
- evidence hierarchy;
- source register;
- evidence claims;
- scientific nutrient matrix;
- P/K matrix;
- method/timing matrix;
- prior-input rules;
- applicability boundaries;
- uncertainty;
- unresolved conflicts;
- versioned reference cases;
- evidence/rule lifecycle;
- update/supersession workflow;
- temporary override model;
- implementation prohibitions.

A reviewer must be able to challenge every important number without reading application code.

---

# 36. Documentation architecture

Propose a clean, domain-scoped source-of-truth structure.

Do not recreate enormous routine context documents that undermine the newly optimised harness.

Prefer small indexed documents.

A conceptual pattern may resemble:

docs/
  evidence/
    sources/
    claims/

  rules/
    slurry-agronomy/
      2026-v1/
        RULESET.md
        SOURCE_MAP.md
        REFERENCE_CASES.md
        CHANGELOG.md

    regulation/
      nitrates-ie/
        versions/
        overrides/

  reviews/
    campaign-c/
      SCIENCE_FREEZE.md
      CONFLICTS.md
      PEER_REVIEW_PACK.md

Do not adopt this exact structure blindly.

Inspect existing repository organisation first and extend it without unnecessary duplication.

---

# 37. Existing production-code risk audit

Identify existing production code that appears to use Campaign C science before this freeze.

Do not silently rewrite it during this task.

Classify each instance:

- SAFE_EXISTING;
- NOT_CURRENTLY_USER_FACING;
- REQUIRES_CAMPAIGN_C_REPLACEMENT;
- UNSAFE_CURRENT_PRODUCTION_USE.

If unsupported Campaign C recommendations are actively being presented to real farmers,
STOP and document that as a priority issue.

---

# 38. STOP conditions

STOP for human review if:

1. authoritative sources materially conflict on a core v1 rule;
2. first-cut P/K requirements cannot be reconciled;
3. nutrient denominator is ambiguous;
4. DM interpolation would be required without evidence;
5. current code inseparably mixes statutory and agronomic values;
6. intended v1 scope is scientifically indefensible;
7. production is actively showing unsupported Campaign C recommendations;
8. a numeric rule requires an invented assumption;
9. the evidence/rule lifecycle cannot preserve historical reproducibility;
10. temporary overrides cannot be represented without mutating Campaign B base rules.

Do not resolve STOP conditions by choosing convenient assumptions.

---

# 39. Documentation/state

Update only the task-scoped state and documentation required by the current optimised harness.

Preserve archived historical records.

Record clearly:

- Campaign B remains frozen;
- Campaign C base is `29f787a8b9bc1a30613dc621e221ad79651c315f`;
- Campaign C science-freeze status;
- supported v1 scope;
- excluded scenarios;
- unresolved conflicts;
- reference-case status;
- evidence/rule lifecycle status;
- whether future production implementation is authorised.

Do NOT mark Campaign C implementation-ready while a core rule remains EVIDENCE_CONFLICT.

---

# 40. Scope exclusions

Do NOT:

- implement the production slurry-rate engine;
- implement whole-farm optimiser;
- alter What Matters ranking;
- recommend production fields;
- implement reallocation;
- alter Campaign B regulatory behaviour;
- apply database migrations;
- push;
- deploy;
- touch main;
- invent missing scientific assumptions;
- automatically activate newly detected guidance;
- replace historical rule versions.

This task freezes the scientific contract that later implementation must obey.

---

# 41. Verification

Run focused documentation/domain consistency checks and existing science/evidence tests
affected by this task while working.

Do not repeatedly run the full product suite during research iterations.

At completion, follow the optimised harness sequence.

Run the required deterministic quality gate once at the appropriate final boundary.

Audit this task against its immutable base SHA.

Use:

- primary task audit;
- narrow remediation verification for specific findings;
- one final complete task audit.

Do not use a V1-baseline-wide audit for routine Campaign C closure.

---

# 42. Required Campaign C output

Report:

1. supported Campaign C v1 scenario;
2. excluded scenarios;
3. authoritative source register;
4. exact evidence claims/locators;
5. slurry N/P/K nutrient matrix;
6. DM applicability rules;
7. method/timing matrix;
8. soil P/K requirement matrix;
9. prior nutrient-input treatment;
10. uncertainty treatment;
11. evidence conflicts;
12. recommendation-status taxonomy;
13. frozen reference cases;
14. evidence-source schema;
15. evidence-claim schema;
16. scientific rule-set schema;
17. regulatory rule-set schema;
18. temporary regulatory-override schema;
19. recommendation provenance/version schema;
20. guidance-update workflow;
21. Farm Return implementation-correction workflow;
22. reference-case versioning strategy;
23. effective-date resolution rules;
24. source-change detection strategy;
25. evidence archival strategy;
26. evidence review cadence;
27. proposed documentation structure;
28. existing architecture already satisfying these requirements;
29. gaps requiring later implementation;
30. existing production-code risk assessment;
31. whether Campaign C production implementation may safely begin.

Do not start implementation automatically after this science freeze.

---

# Completion criteria

Only report DONE when:

- evidence is authoritative, sourced and traceable;
- exact evidence locations are recorded for material numbers;
- supported v1 scope is explicit;
- exclusions are explicit;
- unresolved conflicts are explicit;
- reference cases are complete;
- rule versions and effective-date semantics are defined;
- temporary regulatory overrides are defined;
- historical reproducibility is preserved;
- source-update workflow is defined;
- no production recommendation engine has been implemented;
- Campaign B behaviour remains unchanged;
- no unsupported assumptions were invented;
- required focused verification passes;
- the final task-level audit has no unresolved Critical or High findings.

Do not begin Campaign C production implementation automatically.

Verify command: `npm run typecheck && npm run build`
# Farm Return Schemes — Architecture V1

Status: architecture foundation for the Schemes module. This document records the product and trust-boundary decisions agreed before loading the next set of scheme rules.

## 1. North-star

Schemes is a personalised decision-support layer, not a grant directory.

Farm Return should use the farm data it already owns to answer:

- Which schemes are relevant to this farm?
- What can Farm Return already prove?
- What information is still missing?
- What is the likely eligibility state?
- What is the indicative value where the rules support a calculation?
- What needs to happen next, and by when?

The runtime product must not depend on fetching public web pages. Official scheme material is researched, verified, versioned and stored in the Farm Return database. New official releases create new versions rather than silently rewriting history.

## 2. Locked ownership rule

Every fact has one canonical owner.

- Farm/Profile owns farmer and holding facts.
- Fields owns field geometry, area, land use and other canonical field facts.
- Cattle owns cattle identity, groups, weights, movements, health and other cattle facts.
- Schemes owns only scheme-specific facts such as participation/reference numbers or scheme choices.
- Sheep is reserved as a future owner in the schema, but no Sheep module is built in this phase.

Schemes consumes canonical data. It never creates a parallel cattle, field or farm record merely because a scheme needs the same fact.

If two modules claim the same stable data key, the Schemes data snapshot reports a system review state rather than choosing silently.

## 3. Readiness is not eligibility

Each scheme version has a set of applicable required data points.

Readiness is calculated over unique applicable data points, not rule count. A fact used by several rules is asked for once and counts once.

Example:

- 40 applicable data points
- 30 usable
- readiness = 75%
- 10 unresolved

100% readiness means only that all applicable required data is usable. It never means the farmer is eligible.

A zero-item denominator is not shown as 100%; readiness is unavailable until applicable requirements are loaded/proven.

States:

- KNOWN
- MISSING
- CONFLICTING
- INVALID
- UNSUPPORTED
- REVIEW_REQUIRED
- NOT_APPLICABLE

UI buckets:

- Already known
- Needs you
- Needs review

A missing integration/adapter is a system gap, never disguised as farmer-missing data.

## 4. Missing-data routing

A requirement records the canonical data key and owner.

A resolved missing-data item may include:

- exact owner route
- exact focus target/query/hash
- exact Schemes return location

The return location preserves scheme id, version and requirement id. Destination screens can return the farmer to the exact checklist item after a successful save.

Scheme-specific facts may be completed directly in Schemes. Canonical farm/field/cattle facts must be completed in their owner screen.

## 5. Database repository

The repository is local and versioned:

- scheme_catalogue
- scheme_versions
- scheme_sources
- scheme_rules
- scheme_rule_inputs

Rules are machine-readable. Every rule points to a source belonging to the same scheme version.

Scheme versions store dates, not stale labels such as "upcoming" or "open". Runtime code derives programme state and entry-window state from effective/application dates.

Source metadata supports:

- authority tier
- publisher/title/url
- publication date
- retrieval/verification dates
- SHA-256 content fingerprint
- archived source location

No scheme rules are seeded by the architecture migration. Loading the selected source-pinned scheme catalogue is the next content phase.

## 6. Per-farm scheme workflow

Farm-specific state is separate from the master repository.

farm_scheme_cases tracks workflow status:

DISCOVERED -> ASSESSING -> INFORMATION_MISSING -> APPLICATION_READY -> SUBMITTED_EXTERNALLY -> OUTCOME_RECORDED -> PAYMENT_EXPECTED -> PAYMENT_RECEIVED -> CLOSED

Submission itself remains external in V1.

Scheme-owned facts and evidence are append-only provenance records. Corrections supersede earlier assertions rather than overwriting history.

Eligibility/payment results remain derived from current canonical data + the pinned scheme version. Storage must not turn a stale assessment into truth.

## 7. Adviser architecture

The farmer remains the farm owner.

The schema reserves owner-controlled adviser grants and information requests, but this phase does not widen RLS on canonical farm tables and does not build the adviser dashboard.

That is deliberate: adding an adviser relationship row is not enough to make cross-farm reads safe. The later adviser phase must explicitly wire and audit every authorised read/write boundary.

## 8. Planning integration

Schemes does not create a second task system.

Scheme rules may produce SchemeWorkCandidate objects carrying:

- scheme/version/rule origin
- canonical subject
- reasons
- Plan priority
- recommended window
- sourced hard deadline when uniquely proven
- completion contract
- canonical workflow route where available

The shared Plan kernel owns task lifecycle, reminders, completion, deferral and farmer order.

A recommended window is not a hard deadline. A hard deadline requires the exact versioned source authority and content fingerprint.

## 9. Cattle and Sheep sequencing

Build order:

1. Stabilise the cattle facts Schemes consumes.
2. Build Schemes on top of canonical Farm/Fields/Cattle data.
3. Keep Schemes species-neutral.
4. Build Sheep later using the shared livestock foundation.

Sheep is not a dependency for the Schemes build. Missing Sheep capability is an unsupported/system state, not a prompt asking a cattle farmer to provide sheep data.

## 10. Next content phase

After this architecture is validated, load the selected schemes into the local repository.

For each scheme/version:

1. archive/fingerprint authoritative official source material;
2. create the scheme version;
3. encode deterministic rules;
4. register each canonical data input and owner;
5. implement any scheme-specific operator/payment calculator;
6. build test fixtures from official examples;
7. run source/version/rule audits;
8. only then enable the version in the farmer-facing Schemes feed.

AI may explain deterministic results in plain English. AI memory is never a scheme rule source.

# Scheme Implementation Standard

Status: binding on every Schemes Adviser v1 phase from S1. It applies `.agent/campaigns/schemes-adviser-v1/CAMPAIGN.md` and `docs/product/schemes/SCHEMES_ARCHITECTURE_V1.md`; where it adds detail, it must stay consistent with both. The typed contracts and fail-closed validators are in `src/domain/schemes/standard/`.

It contains no real scheme rule, threshold, date or rate.

## 1. Requirement Register contract

The register is the whole set of rules for one scheme version. A rule that is not in the register does not exist for the engine. A missing row is a stop, not an added rule.

Each row is one **atomic** requirement. If two conditions can pass or fail independently, or have different sources, they are two rows.

| Field | Meaning | Validator rule |
|---|---|---|
| `id` | Stable id; never reused | Unique in the register, ignoring case |
| `pin` | Scheme and version: `schemeKey`, `schemeYear`, `rulesVersion` | Must equal the register's pin |
| `kind` | One of the kinds below | Closed set |
| `source.sourceId`, `source.sourceVersion` | Source id and edition | Must resolve in the same version's source pack, at that edition |
| `source.locator` | Section, page, table or clause | Required |
| `source.wordingReference` | Reference to the exact wording in the archived source | Required |
| `applicability` | To whom or to what the row applies | Required |
| `dataKeys` | Each `key` and `owner` the row reads | Required array; empty only if the row reads no fact |
| `status` | Implementation status, below | Closed set |
| `reason` | Why it is unsupported or not applicable | See status table |
| `engineRuleRef` | The stored `rule_key` evaluating the row | See status table |
| `testRef` | The test proving the row | See status table |

**Kinds:** `eligibility_condition`, `obligation`, `deadline`, `payment_rule`, `cap`, `exception`, `exclusion`, `reduction`, `penalty`, `evidence_requirement`.

**Implementation status:**

| Status | Meaning | `reason` | `engineRuleRef`, `testRef` |
|---|---|---|---|
| `IMPLEMENTED` | An engine rule evaluates it and a test proves it | Must be null | Both required |
| `UNSUPPORTED` | The source is clear, but Farm Return cannot evaluate it. The engine returns an unresolved state, never a pass | Required | Optional |
| `NOT_APPLICABLE` | The requirement does not apply to this version or scope in Farm Return | Required | Must be null |
| `IMPLEMENTABLE` | **P1 only.** The source is clear and the row can be evaluated, but its engine rule is not built yet | Must be null | Must be null |

`IMPLEMENTED`, `UNSUPPORTED` and `NOT_APPLICABLE` are the final statuses. `IMPLEMENTABLE` exists because a P1 phase freezes its register before P2 builds anything, and marking an unbuilt row `IMPLEMENTED` would be false. It makes no claim about behaviour and cannot be seeded.

**Coverage.** A P1 directory is frozen, so its rows are not edited. The P2 phase publishes one `RequirementCoverageEntry` per row, giving its final status, and `validateRegisterCoverage` checks them:

- a row with no entry fails, and an entry for a row the register does not hold fails;
- `IMPLEMENTABLE` may become `IMPLEMENTED` or `UNSUPPORTED`;
- `IMPLEMENTED`, `UNSUPPORTED` and `NOT_APPLICABLE` stay as they are. Changing one needs a new register version;
- an `IMPLEMENTED` row can read only registered data keys.

**Unsupported or stop.** Per `CAMPAIGN.md`, "Requirement semantics": a clear source that Farm Return cannot evaluate is `UNSUPPORTED`. An absent, incomplete, ambiguous or conflicting source means Farm Return cannot establish what the requirement says, and the phase stops with the matching gate token. A row is never used to record a guess.

**Citing sources.** Every row cites a source, including `UNSUPPORTED` and `NOT_APPLICABLE` rows. A row can cite only a source pinned to its own scheme version, and never a tier 4 source.

**Hard deadlines.** A `deadline` row is a hard deadline only if its source states the exact date for this version. A recommended window is never a hard deadline (SCH-INV-011).

## 2. Source-pack contract

A source pack records every source for one scheme version.

| Field | Rule |
|---|---|
| `sourceId`, `sourceVersion` | Stable id, unique in the pack, and the edition of the document |
| `pin` | The scheme version it is pinned to; must equal the pack's pin |
| `authorityTier` | Hierarchy tier 1–4 from `CAMPAIGN.md` |
| `storedAuthorityTier` | The value stored in `scheme_sources.authority_tier`; must be permitted for the tier (below) |
| `publisher`, `title` | Required |
| `url` | Required http or https URL |
| `publicationDate` | A real date. Null only with `publicationDateAbsentReason`; an undated source stays visibly undated |
| `retrievalDate` | A real date, on or after publication |
| `reviewRecord` | A record, or an explicit null. A record gives `reviewer`, `reviewedOn` (on or after retrieval), `scope` and `recordLocation` |
| `contentFingerprintSha256` | Required: 64 lowercase hex characters, the SHA-256 of the archived bytes |
| `archivedLocation` | Required relative path that stays inside the archive |
| `governsSchemeYear` | Required; must equal the pack's scheme year |
| `contentScope` | `WHOLE_DOCUMENT`, or `EXTRACT` where the archive holds only part of the source |

| Tier | Material | Permitted `storedAuthorityTier` |
|---|---|---|
| 1 | EU and Irish legislation; official scheme terms and conditions for the exact year | `statute`, `eu_official`, `dafm_official` |
| 2 | DAFM official publications, circulars and service pages for that year | `dafm_official` |
| 3 | Delivery-body material named by DAFM | `authoritative_secondary` |
| 4 | Teagasc and other advisory material: explanation and worked examples only | `teagasc_technical`, `authoritative_secondary` |

Model memory, unsourced summaries, press coverage and other-year documents are not sources. Where two sources disagree, or a lower tier appears to extend a higher one, the phase stops for a precedence decision. The builder does not choose.

Each P1 phase also has a test that hashes each archived file and compares it with the pinned fingerprint, following `src/domain/schemes/scep-2026-source-integrity.test.ts`. The validators check a fingerprint's form; only that test proves it matches the bytes.

**What a completeness claim requires.** A claim says the pack holds every source needed to state the version's requirements. The pack states `completeness` explicitly, as `NOT_CLAIMED` with a reason or as `CLAIMED`. A `CLAIMED` pack needs all of:

1. a review record with scope `WHOLE_DOCUMENT_AGAINST_REGISTER`, saying who reviewed, when, and where the record is held in the repository;
2. named covered sources, each resolving in the pack, with the review dated on or after their retrieval;
3. at least one tier 1 or 2 source, and every tier 1 or 2 source in the pack covered;
4. for each covered `EXTRACT`, its own whole-document review record. An extract alone proves only the facts it lists, and the person reviewing must have held the whole document.

An agent that holds only an extract cannot produce that record. A phase that cannot meet these conditions stops; it does not lower the claim.

## 3. Data ownership

Consistent with `SCHEMES_ARCHITECTURE_V1.md` §2–§4.

| Owner | Owns |
|---|---|
| `farm_profile` | Farmer and holding facts |
| `fields` | Field geometry, area, land use and other canonical field facts |
| `livestock`, `cattle` | Livestock totals; cattle identity, groups, weights, movements, health and other cattle facts |
| `schemes` | Only scheme-specific facts, such as participation, reference numbers and scheme choices |
| `sheep` | Reserved. Missing Sheep capability is an unsupported system state, never a question to a cattle farmer |

- **One owner.** Every data key has one owner, recorded in `src/domain/schemes/data-keys.ts`. A row's stated owner must match it. Keys beginning `schemes.` belong to `schemes`, and no other key does.
- **Scheme-owned facts rule.** Schemes never creates a parallel farm, field or cattle record because a scheme needs the same fact. A farmer is never asked for a fact that can be read safely from its owner (SCH-INV-003). Canonical facts are completed on the owner's screen; only scheme-specific facts may be completed in Schemes.
- **Proposed keys.** A P1 row may name a key not yet registered. P1 phases cannot edit the registry, so this is a proposal. It must be registered before the row can be `IMPLEMENTED`, and the seed validator rejects unregistered rule inputs.
- **Conflict handling.** Two rows giving one key different owners fail validation. If two modules claim one key at runtime, the data snapshot reports `REVIEW_REQUIRED` rather than choosing. Disagreeing records are `CONFLICTING`. Neither case is resolved silently.
- **System gaps.** A missing adapter is `UNSUPPORTED` and owned by the system, and is never shown as farmer-missing data (SCH-INV-004).
- **Readiness.** Readiness counts unique applicable data points, not rules. An empty denominator is unavailable, not 100%. 100% readiness never means eligible (SCH-INV-005).

## 4. Value taxonomy

Typed in `src/domain/schemes/standard/value-taxonomy.ts`.

**Types.** These are not comparable with one another.

| Type | Meaning |
|---|---|
| `RECURRING_ANNUAL_SUPPORT` | Paid for a scheme year and potentially repeated |
| `CAPITAL_GRANT` | Support towards an investment |
| `ONE_OFF_PAYMENT` | A single payment that is neither of the above |
| `OTHER_INCOMPARABLE` | Anything else; never summed, even with itself |

**Classes**, weakest first:

| Class | Meaning | Evidence it needs |
|---|---|---|
| `MAXIMUM` | The most the sourced rule permits; not an expectation for this farm | A pinned source stating the rate, cap or formula for this version |
| `CURRENT` | The sourced calculation applied to this farm's present facts | The above, and every fact read is `KNOWN` |
| `CONFIRMED` | What the paying authority has determined for this farm and version | The authority's own determination, held as evidence. Farm Return's calculation alone is never enough |

`strongestPermittedSchemeValueClass` returns the strongest class the evidence permits, or null when the value is unresolved. A figure is never promoted past it (SCH-INV-006). A final rate (`rateStatus` in `src/domain/schemes/payment.ts`) describes the rate and not the farm's payment, so it does not make a value `CONFIRMED`.

**Rules:**

- Incomparable types are never summed into one figure. `schemeValuesMaySum` allows a sum only for the same type, class, scheme year and currency.
- Classes are never summed together.
- An unresolved value is not zero. It is excluded from any total with a visible count, and a total is not presented as complete while one is unresolved.
- A value with no registered calculator is `UNSUPPORTED` (`calculateSchemePayment`). There is no generic arithmetic fallback.
- Formulas live in `src/domain/`, and the UI renders their output (SCH-INV-007).
- Two values being summable says nothing about whether the schemes exclude each other. Only the registers can state that.

## 5. Eligibility states

There is one vocabulary, and this standard adds no value to it. `src/domain/schemes/standard/states.ts` enumerates these states and publishes their precedence, and `states.test.ts` checks that precedence against the engine. A later phase uses these states; a scheme-specific view state, such as `Scep2026State`, is a presentation of them and not a replacement.

**Data point state (`SchemeDataState`) and rule state (`SchemeRuleEvaluationState`)**

Strongest first. When a rule reads several inputs, the strongest state among them decides the result:

| Rank | Data state | Rule state | Meaning | Who resolves it |
|---|---|---|---|---|
| 1 | `CONFLICTING` | `EVIDENCE_CONFLICT` | Canonical records disagree | Review |
| 2 | `INVALID` | `INVALID_EVIDENCE` | A record exists but cannot be used | Review |
| 3 | `REVIEW_REQUIRED` | `REVIEW_REQUIRED` | A person or system must check it first | Review |
| 4 | `UNSUPPORTED` | `UNSUPPORTED` | Farm Return cannot obtain or evaluate it | System; never the farmer |
| 5 | `MISSING` | `UNKNOWN` | The owner holds no value yet | The owner workflow |
| 6 | `NOT_APPLICABLE` | `NOT_APPLICABLE` | Excluded from the denominator | Nobody |
| — | `KNOWN` | `PASS` or `FAIL` | Only when every input is `KNOWN` does the operator run | — |

Why this order: a contradiction or bad record must not be hidden behind a request for more data, and a system gap must not be presented as something the farmer can fix.

These stay distinct all the way to the farmer. None is a pass, a fail or a zero (SCH-INV-001). An `UNSUPPORTED` register row evaluates to `UNSUPPORTED`. `dominantUnresolvedRuleState` gives the strongest reason for an unresolved assessment, for explanation only; it never changes the eligibility state.

**Scheme eligibility state (`SchemeEligibilityState`)**

`deriveSchemeEligibility` checks in this order, and the first match wins:

| Order | State | When |
|---|---|---|
| 1 | `EXISTING_PARTICIPANT` | The farm is an existing participant |
| 2 | `NOT_RELEVANT` | Every applicable relevance rule failed |
| 3 | `MORE_INFORMATION_REQUIRED` | Relevance is unresolved and no relevance rule passed |
| 4 | `PROBABLY_NOT_ELIGIBLE` | A hard-gate eligibility, exclusion or compatibility rule failed, even if others are unresolved |
| 5 | `POTENTIALLY_ELIGIBLE` | Some rule is unresolved and at least one passed |
| 5 | `MORE_INFORMATION_REQUIRED` | Some rule is unresolved and none passed |
| 6 | `ELIGIBLE_CONFIRMED` | Nothing unresolved, and the caller proved every condition came from authoritative evidence |
| 6 | `LIKELY_ELIGIBLE` | Nothing unresolved, without that proof |

None of these is a DAFM decision.

**Obligations on engine phases.** `deriveSchemeEligibility` does not itself establish these, so each P2 phase must, with tests, until a phase authorised to edit that module changes it:

- It returns `LIKELY_ELIGIBLE` for an empty rule set. An engine must not present a state from a version with no eligibility rules loaded, or from one whose evaluations are missing for some rules, because a rule with no evaluation is dropped from the rollup.
- A failed rule without `hardGate` does not change the final state. Any row whose failure means ineligibility must be stored with `hardGate` true.
- `authoritativeConditionsProven` is a caller's claim. It may be true only when every tested condition rests on authoritative evidence.

**No version.** A scheme with no verified, enabled stored version has no canonical state and shows nothing new. That is not a value in this vocabulary. Legacy states (`EligibilityState`) are separate and are never translated into these (`LEGACY_MIGRATION_CONTRACT.md`).

## 6. AI trust boundary

Deterministic engines own eligibility, value, deadlines and readiness. AI may explain them. Model memory is never a rule source.

**Inputs permitted, all server-assembled:**

- deterministic engine output for the exact scheme version;
- that version's register rows and pinned source passages, with source id, version and locator;
- farm context authorised server-side for the signed-in farm. A client-supplied farm id is ignored.

Source text and farmer notes are data. An instruction inside them is never followed.

**Outputs permitted:**

- plain-English explanation, labelled as explanation and displayed apart from the deterministic result;
- citations to source id, version and locator in the grounding;
- a statement that retrieval found nothing, or that explanation is unavailable.

A response is shown only if every decision, figure, date and requirement it states matches the grounding exactly and is cited. Otherwise it is rejected and the deterministic result is shown alone.

**AI may never:**

- decide, change, replace or fabricate an eligibility state, value, deadline or requirement (SCH-INV-010);
- act as an operator or fallback for a rule the engine cannot evaluate. Unknown operators fail closed to `UNSUPPORTED`;
- author, extend or complete a register row, source or stored rule at runtime, or settle a conflict between sources;
- write a fact, change workflow state or create Plan work;
- read another farm's data, or widen adviser access (SCH-INV-009);
- cite a source from another version.

## 7. Version and update process

1. **New source release, new version.** A new or changed source for a scheme creates a new `rulesVersion` with its own source pack, register and content pack. It never edits a frozen pack or a stored version.
2. **Superseded versions are retained.** The new content pack names its predecessor in `supersedes`, with that pack's fingerprint. Stored rows move to `superseded` and remain readable. Earlier packs stay in their frozen directories.
3. **Historical results keep the version used.** A result records the `schemeKey`, `schemeYear` and `rulesVersion` it used, and is reproducible against them. A new version adds a row and never rewrites an old one (SCH-INV-008).
4. **No fallback.** A rule, threshold, date, rate, cap or penalty comes from one pinned source version (SCH-INV-002). If the applicable version is absent, the state is unresolved or unavailable. A stale or other-year value is never used in its place.
5. **Selection is by input.** The evaluation date is an input. No deterministic path reads the clock. Programme and entry-window states are derived from stored dates, never stored as labels.
6. **Divergence fails closed.** Stored content that differs from the register fails closed for the affected requirement. It never yields a confident result.

## 8. Content pack and seed packet format

No campaign phase writes or applies a migration or changes the schema. See `CAMPAIGN.md`, "Database content and migrations".

**Content pack.** A typed `SchemeContentPack` in the phase's own domain directory, holding `formatVersion`, `pin`, `sourcePack`, `register`, `supersedes` and `contentFingerprintSha256`.

- It is a reviewed input and test fixture. **Runtime code reads scheme content from the database only and never falls back to a content pack.**
- Every part pins the same version, and it must carry a completeness claim. A pack without one cannot freeze a register.
- The fingerprint is computed by `computeSchemeContentPackFingerprint`, using the canonical form from `src/domain/assessment-integrity.ts`, over everything except the fingerprint field. Reordering object keys does not change it; changing any value or the order of rows does. Removing a row or altering a source fingerprint therefore fails validation.
- `validateSchemeContentPack` takes a real SHA-256 by injection, so the module stays pure. A stub hash is reported as unverifiable.
- The phase's test pins the fingerprint as a literal.

**Seed packet.** `SEED_PACKET.md` in the P2 phase's documentation directory: prose, then **exactly one** fenced `json` block holding a `SchemeSeedPacket`, which `parseSeedPacketDocument` reads and a test validates.

| Field | Content |
|---|---|
| `formatVersion`, `pin` | Format, and the version it loads |
| `contentPackFingerprintSha256` | The frozen content pack it was built from |
| `definition` | The exact rows, as a `StoredSchemeDefinition`: `version` supplies `scheme_catalogue` and `scheme_versions`; then `sources` for `scheme_sources` and `rules` with `inputs` for `scheme_rules` and `scheme_rule_inputs` |
| `coverage` | One final-status entry per register row |
| `priorStoredVersion` | Null, or the stored version replaced, with its listed differences; it must be a different `rulesVersion` |
| `packetFingerprintSha256` | From `computeSchemeSeedPacketFingerprint` |

`validateSchemeSeedPacket` fails closed unless:

- the content pack is itself valid and is the one named;
- the rows pass `validateStoredSchemeDefinition`, and every row belongs to this version;
- source rows match the pack's sources exactly, in both directions;
- **the version is `draft`, with `v1Enabled` false and `verifiedAt` null.** Loaded content stays invisible, and suppresses no legacy result, until the post-load audit has passed and that audit's own authorised step publishes it;
- every stored rule traces to a register row through `engineRuleRef`, cites that row's source, and reads the same facts;
- every register row has a final status.

Audited and frozen here means **ready for seeding**, not LIVE. S11P2 consolidates the packets, and loading them is a separately authorised task after the campaign.

**Stored kinds.** `scheme_rules.rule_type` has no value for every kind and cannot gain one without a migration. Usually:

| Kind | `rule_type` |
|---|---|
| `eligibility_condition` | `eligibility` |
| `exception` | `eligibility` or `exclusion`, whichever the source's effect requires |
| `exclusion` | `exclusion` or `compatibility` |
| `obligation` | `action_obligation` |
| `evidence_requirement` | `evidence_obligation` |
| `deadline` | `deadline` |
| `payment_rule`, `reduction`, `penalty` | `payment` |
| `cap` | `cap` |

The register row keeps the exact kind. A requirement that cannot be stored faithfully stops for migration approval; it is not forced into a near match.

## 9. Phase checklist

**Every phase:** contract derived before implementation; positive and negative controls for each invariant; `SYNTH-*` fixtures wherever a test does not depend on a real rule; no clock read in a deterministic path; canonical owners consumed and not copied; one appended `DOMAIN_CONTRACTS.md` section; a gate token only when genuinely stopping.

**P1 — source pack and register**

- [ ] Sources are read only from `docs/evidence/schemes/<scheme>/`. Nothing is fetched from the web.
- [ ] `SOURCE_PACK.md` follows §2, and says what each source does and does not prove.
- [ ] Every archived file is hashed by a test against its pinned fingerprint.
- [ ] The completeness claim meets §2, or the phase has stopped.
- [ ] `REQUIREMENT_REGISTER.md` has one atomic row for each eligibility condition, obligation, deadline, payment rule, cap, exception, exclusion, reduction, penalty and evidence requirement.
- [ ] Every row has a locator, and is `IMPLEMENTABLE`, `IMPLEMENTED`, `UNSUPPORTED` with a reason, or `NOT_APPLICABLE` with a reason.
- [ ] Ambiguous or conflicting wording has stopped the phase; it has not been interpreted.
- [ ] Legacy values or existing code, where they exist, are reconciled to rows and never treated as evidence.
- [ ] The typed content pack passes `validateSchemeContentPack`, and its fingerprint is pinned in a test.
- [ ] Negative controls: removing a row and altering a source fingerprint each fail.
- [ ] Version isolation is tested against another scheme's and another year's content.
- [ ] Sources are registered in `docs/evidence-register.md`.

**P2 — deterministic implementation**

- [ ] Only the frozen register is implemented. A rule missing from it is a stop.
- [ ] Every row has a coverage entry: an engine rule and test, or a visible unresolved state.
- [ ] Each threshold and date is tested at the boundary and on each side, with values from the pinned source.
- [ ] Payment is tested per tier, cap and reduction, and classed under §4. Unresolved is never zero.
- [ ] `UNKNOWN`, missing, `EVIDENCE_CONFLICT` and `UNSUPPORTED` each yield a distinct unresolved result.
- [ ] The obligations in §5 are met, with tests.
- [ ] Canonical facts are read from their owners, and the farmer is not asked again.
- [ ] Frozen predecessors are composed through their published outputs, not re-derived.
- [ ] With no stored version the farmer sees no canonical result, and runtime never falls back to the content pack.
- [ ] Stored content differing from the register fails closed.
- [ ] Page and components render engine output and contain no formula.
- [ ] A version-isolation test and a register-coverage test exist.
- [ ] Where the scheme has a legacy version, cutover follows `LEGACY_MIGRATION_CONTRACT.md` §4, with its tests.
- [ ] `SEED_PACKET.md` follows §8 and passes `validateSchemeSeedPacket`.
- [ ] No migration or schema change has been made. A phase that truly needs one stops.

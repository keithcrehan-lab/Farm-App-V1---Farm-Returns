# Evidence and rule lifecycle — contract (Campaign C)

This file defines the contract only. Nothing here is implemented, and no migration
is authorised. It applies to scientific, regulatory and economic rules.
Campaign B's regulatory behaviour is unchanged. Its rules become base versions under
this model without being edited.

## 1. Chain

```
SOURCE DOCUMENT → EVIDENCE CLAIM → APPROVED RULE → VERSIONED RULE SET
  → REFERENCE CASE → ENGINE VERSION → RECOMMENDATION / DECISION RECORD
```

Every link is an immutable, identified record. Nothing is "current truth" without a
version, and a later version never edits an earlier one.

## 2. Evidence source record (immutable per `sourceVersionId`)

```ts
interface EvidenceSourceVersion {
  sourceId: string;            // stable across versions, e.g. "SRC-OM-PAGE"
  sourceVersionId: string;     // e.g. "SRC-OM-PAGE@2026-09-28#cafa1bd5"
  issuingOrganisation: string;
  title: string;
  publicationVersion?: string; // "5th Ed.", "Updated 1st April 2023"
  publicationDate?: string;    // undefined, never guessed, when undated
  sourceType: "TEAGASC_PUBLICATION" | "DAFM_PUBLICATION" | "LEGISLATION" | "STATUTORY_INSTRUMENT"
    | "NITRATES_ACTION_PROGRAMME" | "TEMPORARY_GOVERNMENT_NOTICE" | "PEER_REVIEWED" | "INTERNATIONAL_APPROVED";
  jurisdiction: "IE" | string;
  canonicalUrl?: string;
  retrievedAt: string;         // ISO timestamp
  fingerprint: { algorithm: "SHA-256"; digest: string; byteLength: number; scope: "FILE" | "HTML_PAGE" };
  contentLocatorNote?: string; // e.g. "PDF page = printed page + 2"
  supersedesSourceVersionId?: string;
  supersededBySourceVersionId?: string; // set only by a later, reviewed record, never by editing
  archive: { status: "ARCHIVED" | "NOT_PERMITTED" | "NOT_REVIEWED"; archiveRef?: string; licenceNote?: string };
  reviewStatus: "REGISTERED" | "UNDER_REVIEW" | "REVIEWED" | "REJECTED";
  lastReviewedAt?: string;
  nextReviewDue?: string;
  authority: "AUTHORITATIVE" | "AUTHORITATIVE_CONDITIONAL" | "NON_AUTHORITATIVE" | "SECONDARY_CITATION_ONLY";
}
```

A URL alone never identifies evidence. If the content at a URL changes, that is a
new `sourceVersionId` (§11). Supersession is recorded only when the issuer
establishes it. "Newer" is never assumed to mean "supersedes" (CONFLICTS.md
preamble).

## 3. Evidence claim record (immutable)

```ts
interface EvidenceClaim {
  claimId: string;             // "CLM-OM-T2"
  sourceVersionId: string;
  locator: { page?: string; table?: string; row?: string; figure?: string; section?: string; clause?: string; footnote?: string };
  statement: string;           // verbatim values or quotation
  interpretation?: string;     // Farm Return's reading, labelled as such
  units: string; denominator: string;
  applicability: { crop?: string; species?: string; material?: string; dmPct?: string; timing?: string; method?: string; soil?: string; jurisdiction: string };
  sourceDerivation: "MEASURED" | "EXPERIMENTAL" | "ADVISORY_ESTIMATE" | "STATUTORY" | "POLICY" | "INFERRED";
  assumptions: string[]; limitations: string[];
  uncertainty?: string;        // only what the source states
  conflictsWith: string[];     // conflict ids
  reviewStatus: "DRAFT" | "REVIEWED" | "DISPUTED" | "WITHDRAWN";
}
```

The claim is the unit an agronomist challenges. SOURCES_AND_CLAIMS.md is the first
instance of these records.

## 4. Rule sets (scientific, regulatory and economic kept separate)

```ts
interface RuleSetVersion {
  ruleSetId: string;           // "slurry-agronomy-ie-2026-v1", "nitrates-ie-2026-v1"
  domain: "SLURRY_AGRONOMY" | "NITRATES_REGULATION" | "FERTILISER_ECONOMICS" | string;
  ledger: "SCIENTIFIC" | "REGULATORY" | "ECONOMIC";
  jurisdiction: string;
  semver: string;
  status: "DRAFT" | "APPROVED" | "ACTIVE" | "RETIRED" | "SUPERSEDED";
  publishedAt?: string;        // when Farm Return approved it
  effectiveFrom: string;       // legal/scientific activation (may be later than approval)
  effectiveTo?: string;        // set only by the superseding version's activation record
  sourceVersionIds: string[]; claimIds: string[];
  rules: { ruleId: string; claimIds: string[]; parameters: Record<string, unknown>; algorithmId: string }[];
  referenceCaseFile: string;   // e.g. reference-cases.slurry-agronomy-ie-2026-v1.json
  contentFingerprint: string;  // SHA-256 of the canonicalised rule set
  approval: { reviewers: { name: string; role: string; decision: string; at: string }[] };
  changeReason: string;
  supersedesRuleSetId?: string; supersededByRuleSetId?: string;
}
```

- **Immutability.** After a version reaches APPROVED, its parameters, claims and
  fingerprint never change. Any change is a new version: for example,
  `slurry-agronomy-ie-2028-v2`, which records new evidence, effective date, changed
  and unchanged rules, reason, and reference-case impact (§7). A status transition is
  itself an appended record, not a field edit.
- **Regulatory rule sets.** Permanent legal change follows the same pattern. For
  example, `nitrates-ie-2026-v1` gets `effectiveTo` = the day before
  `nitrates-ie-2028-v2`'s legally valid commencement. Campaign B's current rules
  (`SLURRY_REGULATORY_RULESET`: S.I. 588/2025 as amended by S.I. 119/2026) become
  `nitrates-ie-2026-v1` unchanged.
- **Economic rule sets.** These version the methodology (price-resolution hierarchy,
  costing), not market observations. Observations stay append-only evidence.

## 5. Temporary regulatory overrides

```ts
interface RegulatoryOverride {
  overrideId: string;          // "OVR-IE-2027-SLURRY-DEADLINE-EXT-01"
  baseRuleSetId: string; baseRuleId: string;   // e.g. nitrates-ie-2026-v1 / closed-period.zoneA
  jurisdiction: string; geographicScope?: { counties?: string[]; zones?: string[]; catchments?: string[] };
  validFrom: string; validTo: string;          // inclusive dates, both required
  replacement: { kind: "REPLACE_PARAMETERS" | "SUSPEND_RULE" | "ADD_CONDITION"; parameters: Record<string, unknown> };
  reason: string;
  sourceVersionId: string; publishedAt: string;
  status: "DRAFT" | "APPROVED" | "ACTIVE" | "EXPIRED" | "REVOKED";
  revocation?: { revokedAt: string; sourceVersionId: string; reason: string };
  precedence: number;          // higher wins; equal and overlapping → fail closed
}
```

```
applicableRule(baseRuleId, date, place)
  = baseVersionEffectiveOn(date)
  + overrides where status ∈ {APPROVED, ACTIVE}, not revoked, validFrom ≤ date ≤ validTo,
    jurisdiction and geography match, ordered by precedence
```

- Two overlapping overrides at equal precedence that modify the same parameter
  differently give EXPERT_REVIEW_REQUIRED. Nothing is merged.
- An expired override simply stops matching. The base rule was never edited, so it
  applies again.
- A one-year deadline extension is always an override, never a base edit.
- The existing `dynamic_spreading_exception_events.csv` columns (`event_id`,
  `rule_type`, `effective_from/to`, `geographic_scope`, `material`, `status`, …) are
  a subset of this record and would be migrated into it.

## 6. Recommendation provenance (persisted per recommendation or decision)

```ts
interface RecommendationRecord {
  recommendationId: string;
  generatedAt: string;                    // server-stamped
  planningDate: string;                   // planned application date (explicit input)
  engineVersion: string;                  // calculation code version
  scientificRuleSetId: string; scientificRuleSetFingerprint: string;
  regulatoryRuleSetId: string; appliedOverrideIds: string[];
  economicRuleSetId?: string;
  sourceVersionIds: string[];             // union used
  inputs: { name: string; value: unknown; evidenceClass: string; recordId?: string; recordedAt?: string }[];
  outputs: { status: string; reasons: string[]; rateM3Ha?: number; totalVolumeM3?: number; supplyKgHa?: unknown; balanceKgHa?: unknown };
  integrityFingerprint: string;           // assessment-integrity.ts canonical SHA-256 over all of the above
  supersedesRecommendationId?: string;
}
```

- Opening an old record shows its stored outputs. They are never recomputed under
  current rules.
- A separate, labelled comparison may say "newer guidance exists (v2); under v2 this
  would be …". It never replaces the stored record.
- Reuse `assessment-integrity.ts` canonicalisation. Store the four version IDs
  separately; never one generic "rules version".

## 7. Guidance update workflow, change record and differential testing

```
NEW SOURCE DETECTED/RECEIVED → SOURCE REGISTERED (new sourceVersionId) → FINGERPRINT/VERSION COMPARED
→ EVIDENCE REVIEW → MATERIAL CHANGES IDENTIFIED → NEW CLAIMS → NEW RULE-SET VERSION (DRAFT)
→ REFERENCE-CASE DIFFERENTIAL → SCIENTIFIC REVIEW → SOFTWARE/AUDIT REVIEW → EXPLICIT ACTIVATION → PRODUCTION USE
```

Monitoring may detect a change. It never activates anything.

```ts
interface RuleSetChangeRecord {
  fromRuleSetId: string; toRuleSetId: string;
  changes: { ruleId: string; previous: unknown; next: unknown; claimIds: string[]; reason: string }[];
  unchangedRuleIds: string[];
  changeKind: "GUIDANCE_CHANGED" | "IMPLEMENTATION_CORRECTION";   // §8
  effectiveFrom: string; scientificImpact: string;
  affectedReferenceCases: { caseId: string; before: unknown; after: unknown; causedByRuleId: string }[];
  approval: RuleSetVersion["approval"];
}
```

Differential test:

1. Keep the old expectation file.
2. Run every shared case ID under both versions.
3. Emit a deterministic, sorted before/after list.
4. Fail if any difference has no `causedByRuleId`.

The explanation lives in this record, not only in Git history.

## 8. Farm Return implementation corrections

When Farm Return implemented unchanged guidance incorrectly:

- The change record has `changeKind: "IMPLEMENTATION_CORRECTION"`.
- It names the affected engine and rule-set versions and the unchanged
  `sourceVersionId`.
- It describes the defect and the corrected implementation (a new engine version and,
  if parameters were wrong, a new rule-set version).
- It includes a query identifying potentially affected stored recommendations by
  engine and rule-set ID, plus the remediation or notification decision.

It is never labelled a guidance update. RISK-01 (SCIENCE_FREEZE.md §13) will be the
first such record.

## 9. Evidence archive

- **Permitted** (licence reviewed and allows it): store the original file in
  append-only storage keyed by `sourceVersionId`, with the SHA-256, retrieval time and
  URL. Never overwrite. A new retrieval is a new object.
- **Not permitted or not yet reviewed**: keep metadata, fingerprint, exact locator,
  verbatim transcription of the claimed values, and retrieval date.
- No unlicensed mirror. All Campaign C sources are currently `NOT_REVIEWED` for
  archiving.
- Statute (Irish Statute Book) is Government copyright and published for reuse.
  Confirm the licence before archiving.

## 10. Effective-date resolution

All dates are explicit inputs. No domain function reads the clock (RISK-07 must be
removed).

| Rule type | Governing date | Notes |
|---|---|---|
| Scientific rule set | Recommendation generation date → the version ACTIVE on that date | Science has no legal commencement. A new version applies to new recommendations only |
| Regulatory rule set + overrides | Planned application date (planning). Actual activity date (compliance record) | Both are stored. Assessed separately |
| Economic methodology | Generation date. Prices by their own `knownAt` | — |
| Evidence validity (soil test age, composition freshness) | Planned application date | — |

- **Future-dated versions.** An APPROVED version with `effectiveFrom` > governing
  date is ignored for that calculation, even if published. It is available to
  pre-activation tests. The transition is scheduled by its `effectiveFrom` (precedent:
  `NAP_N_CATCHMENT_AMENDMENT_2028`, `future_effective_rules.csv`).
- **Fail closed.** The resolver fails closed if it cannot establish any of: the
  jurisdiction, the governing date, exactly one ACTIVE version for the date, the
  required claims, conflict-free rules, or override precedence. It returns
  UNKNOWN_REQUIRED_DATA, EVIDENCE_CONFLICT, OUT_OF_SCOPE or EXPERT_REVIEW_REQUIRED.
  It never falls back to the newest version, and never uses an expired one because
  nothing replaced it.

## 11. Source-change detection and review cadence

Detection creates a REVIEW EVENT only. Methods:

- a fingerprint of the retrieved file;
- publication/version metadata (PDF metadata, "Updated" lines, `article:modified_time`);
- URL monitoring for new links on section pages;
- official feeds (Irish Statute Book, gov.ie);
- manual review.

For HTML, compare the extracted table text as well as the page hash, because page
chrome changes the hash.

| Source class | Cadence | Maintenance metadata |
|---|---|---|
| Legislation / S.I. / NAP / temporary notices | Monthly check of the Legislation Directory and DAFM notices; immediately on a known announcement | `lastReviewedAt`, `nextReviewDue`, `reviewFrequency`, `responsibleDomain`, `canonicalUrl`, `currentFingerprint`, `knownCurrentVersion`, `lastChangeDetectedAt` |
| Teagasc formal guidance (Green Book, organic manure tables, fact sheets) | Quarterly, plus before each spring season (January) | same |
| Peer-reviewed literature | Annually, or when Teagasc cites new work | same |
| Economic/market data | Per the CSO release calendar (data), annually (methodology) | same |

## 12. Database / code boundary and documentation structure

| Artefact | Home | Why |
|---|---|---|
| Source and claim records | Repository documents now (`docs/farm-return-next/campaign-c/`). Later: typed, generated data files | Review by pull request. Small volume |
| Versioned numeric rule tables | Immutable typed data modules per version (e.g. `src/domain/rulesets/slurry-agronomy-ie/2026-v1.ts`), content-hashed with a test pinning the hash | Deterministic, type-safe, testable. Updates arrive as new files, never edits |
| Algorithms | Pure TypeScript functions, versioned by engine version | Code review and tests |
| Temporary overrides | Data records, repo-versioned at first. Database later if notices must activate between releases, still gated by review | Time-bound, frequent |
| Recommendation records | Database (append-only), referencing rule-set IDs and fingerprints | Farm data. **Needs a separately authorised migration** |

Structure adopted here: one domain-scoped folder of small documents plus one JSON
per rule-set version. Nothing is copied from larger registers.

```
docs/farm-return-next/campaign-c/
  README.md                         index, status, reviewer guide
  SCIENCE_FREEZE.md                 scope, matrices, taxonomy, risks, STOPs
  SOURCES_AND_CLAIMS.md             source register + claims
  CONFLICTS.md                      CONF-/GAP- register
  REFERENCE_CASES.md                case summary
  reference-cases.<ruleSetId>.json  frozen expectations per version
  LIFECYCLE.md                      this contract
```

When a regulatory base or override is first registered, add `regulation/nitrates-ie/`
next to it. `docs/evidence-register.md` keeps a one-line pointer per rule set.

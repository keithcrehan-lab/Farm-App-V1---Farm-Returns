# Schemes — Legacy Migration Contract

Status: binding on every Schemes Adviser v1 phase from S0. It applies `CAMPAIGN.md`, "Legacy migration rule". `src/domain/schemes/standard/documents.test.ts` checks this map against actual imports and exports, and fails if a mapped export or an importer outside the campaign's writable directories is missing.

## 1. Two systems today

| | Legacy system | Canonical system |
|---|---|---|
| Rule content | Hard-coded `SCHEME_REGISTRY` in `src/domain/scheme-registry.ts` | `scheme_*` database tables, read through `src/lib/farm-data/schemes.ts` |
| Engine | `assessAllSchemes` in `src/domain/scheme-eligibility.ts` | `src/domain/schemes/` |
| States | `EligibilityState` | The states in the Standard, §5 |
| Schemes covered | The five versions in §3 | SCEP 2026 |
| Farmer facts | `support_profile_facts` | The same table through `schemeDataAdaptersFromSupportProfile`, plus `farm_scheme_fact_assertions` |

Legacy is migrated away from and is not expanded. No new scheme, rule or fact key is added to it. A legacy value is not evidence for a canonical register: most seeded versions are `RULES_UNVERIFIED`.

## 2. Map of legacy exports and current callers

Importers are listed as of the S0 base. "Type" means a type-only import. "Mock" means the test replaces the module with `vi.mock`. Every file below keeps its current behaviour in S0.

### `src/domain/scheme-registry.ts`

Exports: `SchemeCategory`, `SchemeAuthority`, `SchemeSourceTier`, `SchemeSource`, `SchemeVerificationStatus`, `SchemeRule`, `SchemeVersion`, `SCHEME_REGISTRY`, `getSchemeVersion`, `listSchemeVersions`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/page.tsx` | `listSchemeVersions` | Production. The only production read of the registry; also supplies `schemeNames` |
| `src/domain/scheme-eligibility.ts` | `SchemeRule`, `SchemeSource`, `SchemeVersion` | Type |
| `src/domain/support-opportunity.ts` | `SchemeVersion` | Type |
| `src/domain/scheme-eligibility.test.ts` | `getSchemeVersion`, `SchemeVersion` | Test |
| `src/domain/support-opportunity.test.ts` | `getSchemeVersion`, `SchemeVersion` | Test |
| `src/lib/pilot-acceptance-repairs.test.tsx` | `listSchemeVersions` | Test |
| `src/domain/schemes/standard/documents.test.ts` | `listSchemeVersions` | Test of this map |

`SCHEME_REGISTRY` has no importer outside its own module.

### `src/domain/scheme-eligibility.ts`

Exports: `SCHEME_ELIGIBILITY_ENGINE_VERSION`, `EligibilityState`, `RequirementResult`, `EligibilityAssessment`, `assessSchemeEligibility`, `assessAllSchemes`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/page.tsx` | `assessAllSchemes` | Production |
| `src/app/(app)/schemes/SchemesPageClient.tsx` | `EligibilityAssessment`, `EligibilityState` | Type; holds the legacy state labels and tones |
| `src/lib/scheme-farmer-text.ts` | `EligibilityAssessment` | Type |
| `src/domain/support-opportunity.ts` | `EligibilityAssessment` | Type |
| `src/domain/scheme-eligibility.test.ts` | `assessSchemeEligibility` | Test |
| `src/domain/support-opportunity.test.ts` | `EligibilityAssessment` | Test, type |
| `src/lib/pilot-acceptance-repairs.test.tsx` | `assessAllSchemes` | Test |

`SCHEME_ELIGIBILITY_ENGINE_VERSION` has no importer outside its own module.

### `src/domain/support-opportunity.ts`

Exports: `SUPPORT_OPPORTUNITY_ENGINE_VERSION`, `FinancialSensibilityVerdict`, `SupportOpportunity`, `estimateGrantSupportEur`, `buildSupportOpportunity`.

| Importer | Uses | Kind |
|---|---|---|
| `src/domain/support-opportunity.test.ts` | `buildSupportOpportunity`, `estimateGrantSupportEur` | Test |

It has no production caller. It stays unchanged; S8P2 does not rewire it.

### `src/domain/support-profile.ts`

Exports: `SUPPORT_PROFILE_VERSION`, `nowAsSupportProfileAssessedAt`, `SupportProfileFactKey`, `SupportProfileFact`, `SupportProfileKnownFact`, `SupportProfileGap`, `SupportProfileDerivedFacts`, `SupportProfile`, `buildSupportProfile`, `isPlausibleIsoDate`, `SupportProfileFactValidation`, `validateSupportProfileFactValue`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/page.tsx` | `buildSupportProfile`, `nowAsSupportProfileAssessedAt` | Production |
| `src/app/(app)/schemes/SchemesPageClient.tsx` | `SupportProfile`, `SupportProfileFactKey` | Type |
| `src/app/actions/support-profile.ts` | `nowAsSupportProfileAssessedAt`, `validateSupportProfileFactValue`, `SupportProfileFact`, `SupportProfileFactKey` | Production |
| `src/domain/scheme-eligibility.ts` | `isPlausibleIsoDate`, `validateSupportProfileFactValue`, `SupportProfile` | Production |
| `src/domain/schemes/scep-2026.ts` | `SupportProfile` | Type; **canonical SCEP depends on this** |
| `src/domain/schemes/support-profile-adapter.ts` | `SupportProfile`, `SupportProfileFactKey` | Type; **canonical SCEP depends on this** |
| `src/lib/farm-data/support-profile.ts` | `SupportProfileFact`, `SupportProfileFactKey` | Type |
| `src/lib/farm-data/mappers.ts` | `SupportProfileFact` | Type |
| `src/domain/support-profile.test.ts` | Builder and validator | Test |
| `src/domain/scheme-eligibility.test.ts` | `SupportProfile`, `SupportProfileFact` | Test, type |
| `src/domain/schemes/support-profile-adapter.test.ts` | `SupportProfile` | Test, type |
| `src/domain/schemes/scep-2026.test.ts` | `SupportProfile` | Test, type |
| `src/app/(app)/schemes/SchemesPageClient.test.tsx` | `SupportProfile` | Test, type |
| `src/lib/pilot-acceptance-repairs.test.tsx` | `SupportProfile` | Test, type |

### `src/domain/farm-strategy.ts`

Exports: `StrategyHorizonYears`, `STRATEGY_HORIZONS`, `FARM_STRATEGY_ENGINE_VERSION`, `StrategySupportAssumption`, `StrategyInvestmentAssumption`, `StrategyAnnualEffectAssumption`, `StrategyScenarioInput`, `StrategyCashFlowPoint`, `StrategyOutcome`, `StrategyComparison`, `compareStrategyToBaseline`.

| Importer | Uses | Kind |
|---|---|---|
| `src/domain/support-opportunity.ts` | `StrategyComparison` | Type |
| `src/domain/farm-strategy.test.ts` | `compareStrategyToBaseline`, `StrategyScenarioInput` | Test |
| `src/domain/support-opportunity.test.ts` | `compareStrategyToBaseline` | Test |

It is not a scheme engine and holds no scheme rule. It has no production caller and stays unchanged.

### `src/lib/scheme-farmer-text.ts`

Exports: `UNCHECKED_SOURCE_NOTE`, `RULES_UNVERIFIED_EXPLANATION`, `isInternalProvenanceText`, `farmerWhyThisState`, `farmerTextList`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/SchemesPageClient.tsx` | `farmerTextList`, `farmerWhyThisState` | Production; legacy assessment cards only |
| `src/lib/pilot-acceptance-repairs.test.tsx` | All | Test |

### `src/app/actions/support-profile.ts`

Exports: `listSupportProfileFactsAction`, `upsertSupportProfileFactAction`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/SchemesPageClient.tsx` | `upsertSupportProfileFactAction` | Production |
| `src/app/(app)/schemes/SchemesPageClient.test.tsx` | `upsertSupportProfileFactAction` | Test, mock |
| `src/lib/pilot-acceptance-repairs.test.tsx` | `upsertSupportProfileFactAction` | Test, mock |

`listSupportProfileFactsAction` has no importer outside its own module.

### `src/lib/farm-data/support-profile.ts`

Exports: `listSupportProfileFactsForFarm`, `upsertSupportProfileFact`.

| Importer | Uses | Kind |
|---|---|---|
| `src/app/(app)/schemes/page.tsx` | `listSupportProfileFactsForFarm` | Production |
| `src/app/actions/support-profile.ts` | `listSupportProfileFactsForFarm`, `upsertSupportProfileFact` | Production |

## 3. Which phase cuts over each legacy seeded version

| Legacy `schemeId` | Legacy version | Legacy status | Cutover phase | Canonical module |
|---|---|---|---|---|
| `biss` | `2026` | `RULES_UNVERIFIED` | S4P2 | `src/domain/schemes/biss/` |
| `anc` | `2026` | `RULES_UNVERIFIED` | S7P2 | `src/domain/schemes/anc/` |
| `tams3-general` | `2026-tranche` | `RULES_UNVERIFIED` | S8P2 | `src/domain/schemes/tams3/` |
| `tams3-yfcis` | `2026-tranche` | `CONFIRMED` | S8P2 | `src/domain/schemes/tams3/` |
| `national-reserve-young-farmer` | `2026` | `RULES_UNVERIFIED` | S10P2 | `src/domain/schemes/young-farmer/` |

SCEP, CRISS, the Eco Scheme and ACRES have no legacy seeded version, so they have no cutover and no suppression.

## 4. Per-scheme cutover rule

Cutover is per scheme and happens in the Schemes UI only. The rule is the same for each phase in §3.

1. **Condition.** The legacy assessment for a scheme is suppressed only when the farmer-facing read (`listStoredSchemeDefinitions` with its defaults, which return verified and enabled versions only) returns a version for that canonical scheme. Draft and superseded versions never suppress. A content pack never suppresses: runtime does not read one.
2. **Mechanism.** `src/app/(app)/schemes/page.tsx` decides. It leaves out that scheme's legacy assessment after `assessAllSchemes` has run. `assessAllSchemes`, the registry and every other frozen module stay unedited. No component recomputes the decision.
3. **Exclusive display.** One scheme is never shown from both systems, and never from neither where legacy existed.

| Stored version read | Legacy assessment | Canonical result |
|---|---|---|
| Returns a verified, enabled version for the scheme | Suppressed | Shown |
| Succeeds and returns none for the scheme | Shown | None |
| Fails | Shown | None; the page's existing unavailable state applies |
| Demo mode, no Supabase configured | Shown | None |
| Support-profile facts could not be read | Withheld, as today, with the existing unavailable state | Withheld |

The failed-read row keeps a farmer's existing result, because a failed read proves nothing about a stored version. The last row is existing behaviour: neither system can be trusted while the facts are unreadable, and the page says so.

4. **TAMS 3.** One canonical scheme replaces two legacy versions. S8P2 suppresses `tams3-general` and `tams3-yfcis` for the path each stored version covers, and a path it cannot cover keeps its legacy assessment.
5. **Facts stay in place.** Cutover does not move or copy a stored fact. `support_profile_facts` continues to supply the canonical adapter, and a farmer is never asked again for a fact it already holds. For example, canonical SCEP reads `biss_participant_2026` as `schemes.biss.2026.participation`, so cutting over BISS must leave that fact readable. A shared gap stays visible while any scheme, in either system, still needs it.
6. **No translation.** A legacy state or value is never converted into a canonical one, and a canonical result is never written back. Cutover replaces the display of a scheme; it does not map one vocabulary onto the other.
7. **Required tests in each cutover phase.** With and without a stored version; a failed read; never both systems; never neither where legacy existed; other schemes unaffected.

## 5. What stays until a separately authorised removal task

The campaign deletes and rewrites none of the following. Each frozen module takes additive edits only, and no phase's write boundary currently includes one.

- `src/domain/scheme-registry.ts`, `src/domain/scheme-eligibility.ts`, `src/domain/support-opportunity.ts`, `src/domain/support-profile.ts` and their tests.
- `src/domain/farm-strategy.ts` and its test.
- `src/lib/scheme-farmer-text.ts`, `src/app/actions/support-profile.ts` and `src/lib/farm-data/support-profile.ts`.
- `src/domain/schemes/support-profile-adapter.ts`.
- The `support_profile_facts` table and its existing migrations.
- The legacy rendering in `src/app/(app)/schemes/SchemesPageClient.tsx`, which stays for any scheme not yet cut over and for demo mode.

## 6. Conditions for the later removal task

The removal task is outside this campaign. S11P2's seed-readiness record lists which modules become removable as each scheme goes LIVE. Before any removal, all of the following must hold:

- every scheme in §3 is LIVE, meaning its seed packet is loaded and its post-load audit has passed;
- every fact the canonical adapter reads has moved to its canonical owner without losing provenance, under a separately authorised migration;
- no production importer of the module remains, confirmed against the actual imports;
- `compareStrategyToBaseline` and `estimateGrantSupportEur` have an explicit decision of their own, since neither depends on a cutover.

## 7. Known interaction for cutover phases

`src/domain/support-profile.ts`'s `SupportProfileFactKey` is a closed union matched by a database constraint on `support_profile_facts`. A new shared fact therefore cannot be added to that table without a migration. New scheme-owned facts belong in `farm_scheme_fact_assertions`, and a new canonical fact belongs with its owner. A phase that cannot meet its acceptance that way stops for migration approval.

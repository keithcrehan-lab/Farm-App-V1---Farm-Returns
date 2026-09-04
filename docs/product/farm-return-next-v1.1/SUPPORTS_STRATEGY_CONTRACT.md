# Supports Intelligence + Farm Strategy — contract

Farm Return Next, first Supports/Strategy build session, 2026-09-04.
Read alongside `docs/farm-return-next/DOMAIN_CONTRACTS.md` (this
programme's frozen-contract discipline, extended here rather than
duplicated) and `docs/evidence-register.md` (governs every sourced
scheme fact this contract's own registry cites).

## Product-owner navigation override

Primary mobile navigation is now **Today · Farm · Plan · Supports ·
Records** — a deliberate product-owner override of the prior four-item
`nav-items.ts` (`Today · Farm · Plan · Records`, plus a separate "More"
slot for every legacy screen — there was no `+`/Start-Job nav slot to
replace; Start Job is reached from within a Prompt's own expanded detail
sheet, `ExpandedPromptSheet.tsx`, unchanged by this session). `Supports`
is inserted between Plan and Records; the pre-existing "More" slot is
kept, not removed (`CLAUDE.md`: never remove an approved element without
explicit instruction) — the mobile bottom nav now renders six icons
(five primary + More) rather than five.

## What Supports is, and is not

> "Based on my actual farm, what supports may apply to me, what would I
> have to do, what could they be worth, and would pursuing them actually
> improve my farm return?"

Not a grants directory. Every screen this phase ships answers that
question from this farm's own real evidence, or says plainly that it
can't yet — never a generic scheme catalogue with no farm context.

## Architecture (built this session)

```
Farm evidence (Farm/Field/LivestockGroup — existing frozen contracts)
  -> Support Profile              src/domain/support-profile.ts
  -> Versioned Scheme Registry     src/domain/scheme-registry.ts
  -> Eligibility Engine            src/domain/scheme-eligibility.ts
  -> Support Opportunity           src/domain/support-opportunity.ts
  -> Farm Strategy                 src/domain/farm-strategy.ts
  -> Supports UI                   src/app/(app)/supports/page.tsx
```

Future (not built this session, contract only):
`docs/product/farm-return-next-v1.1/REQUEST_QUOTE_FUTURE_CONTRACT.md`.

## 1. Support Profile (`src/domain/support-profile.ts`)

Reuses existing frozen farm evidence — `Farm`, `Field[]`,
`LivestockGroup[]` — and `nutrients.ts`'s own `totalLivestockUnits`
(never recomputed). Derives, without asking: county, primary
enterprise(s), **total mapped area** (renamed from an earlier
`totalDeclaredAreaHa` — Codex audit round 1, HIGH: real polygon-mapped
area is not proof the same land is actually *declared* under BISS/CAP
with DAFM, a genuinely different fact this rename and the new gap fact
below both exist to keep separate), forage area (`null`, not `0`,
whenever any field's `plannedUse` is unresolved — missing must not
become zero), total livestock units.

Genuine gaps — the *only* facts this build's five seeded schemes
actually need and cannot derive from existing farm data — are a closed,
named set (`SupportProfileFactKey`): `date_of_birth`,
`head_of_holding_since`, `agricultural_qualification_level`,
`biss_participant_2026`, and (added round 1, replaced round 4 — see
below) `declared_area_ha`. Every value is validated at the write
boundary (`validateSupportProfileFactValue`, called from
`upsertSupportProfileFactAction` before any database write — Codex audit
round 1, HIGH: previously unvalidated) *and* at the database itself
(`support_profile_facts_value_shape_check`, a real `jsonb_typeof(value)`
check per key — Codex audit round 4, HIGH: `authenticated` holds direct
table grants, so app-level validation alone doesn't cover every possible
write path) — a real calendar date not in the future for the two date
facts, a whole NFQ level 0-10 for the qualification fact, a real
non-negative number for `declared_area_ha`, a real boolean for
`biss_participant_2026`.

`declared_area_ha` itself replaced an earlier `land_declared_for_schemes`
boolean (Codex audit HIGH, round 4): a plain yes/no couldn't prove
YFCIS's real 5-hectare-*declared* minimum (a farm with 20ha mapped but
only 1ha actually declared could otherwise pass) — `scheme-eligibility.ts`'s
`assessLandDeclaredGate` now reads this real number exclusively, never
`totalMappedAreaHa` (which is informational only; round 4 also fixed
that figure to exclude archived fields, which `listFieldsForFarm` itself
doesn't filter).

Persisted farm-scoped, RLS'd, real Dev-database-validated:
`supabase/migrations/20260904000000_support_profile_facts.sql` +
`20260904010000_...add_land_declared_key.sql` +
`20260904020000_...declared_area_and_value_shape.sql`,
`src/lib/farm-data/support-profile.ts` — see
`docs/validation/support-profile-facts-dev-validation.md` for the full
live validation account across all three rounds.

## 2. Versioned Scheme Registry (`src/domain/scheme-registry.ts`)

`Scheme`/`SchemeVersion`/`SchemeSource`/`SchemeRule` types, plus five
seeded `SchemeVersion`s, each rule individually cited to a real source
with a `SchemeSourceTier` and `retrievedVia` (honest about this
session's own `gov.ie` fetch-tool block — see the module's own header
comment). No magic number lives outside this file.

| Scheme | Category | `verificationStatus` |
|---|---|---|
| BISS (`biss`) | direct/basic support | `RULES_UNVERIFIED` — structure confirmed, 2026 national-average entitlement € value not confirmed |
| TAMS 3 general (`tams3-general`) | capital investment | `CONFIRMED` — 40% / €90,000 ceiling, two independent sources |
| TAMS 3 YFCIS (`tams3-yfcis`) | young/new farmer | `CONFIRMED` — 60% / €90,000 (€160,000 partnership), full eligibility terms quoted directly from Teagasc's own co-managing-body page |
| ANC (`anc`) | environmental | `RULES_UNVERIFIED` — only the stocking-density criterion confirmed; no per-ha rate, no designated-area boundary data |
| National Reserve Young Farmer (`national-reserve-young-farmer`) | young/new farmer | `CONFIRMED` (eligibility gate) — payment *value* depends on BISS's own unconfirmed figure |

Every `SchemeVersion` carries `knownLimitations: string[]` — read aloud
by the eligibility engine and the UI, never silently dropped.

## 3. Eligibility Engine (`src/domain/scheme-eligibility.ts`)

Deterministic, no AI call. States: `ELIGIBLE`, `LIKELY_ELIGIBLE`,
`MORE_INFORMATION_REQUIRED`, `NOT_ELIGIBLE` (farmer-facing) plus
`RULES_UNVERIFIED`/`SCHEME_UNAVAILABLE` (internal, fail-closed).

**Real, load-bearing distinction, not cosmetic**: `ELIGIBLE` is reserved
for a result resting entirely on evidence Farm Return already trusts;
any result that depends on a farmer-declared `SupportProfileFact`
(unverified against any real DAFM record) caps at `LIKELY_ELIGIBLE`. A
`RULES_UNVERIFIED` scheme can never reach `ELIGIBLE`/`NOT_ELIGIBLE`
regardless of how its one confirmed criterion resolves (test-enforced:
`scheme-eligibility.test.ts`). A scheme with no matching checker fails
closed to `SCHEME_UNAVAILABLE`, never silently treated as eligible. A
scheme whose own `effectiveFrom`/`effectiveTo`/`applicationOpen`/
`applicationCloses` window doesn't cover the assessment date fails closed
to a fourth internal state, `SCHEME_CLOSED`, with a real, dated
explanation (added round 1, HIGH: previously ignored entirely — the
seeded National Reserve scheme's own 15 May 2026 close date had no
effect on its assessed state; the state itself was originally
`NOT_ELIGIBLE` but corrected to a distinct `SCHEME_CLOSED` in round 3,
HIGH, once a real audit round pointed out that conflating scheme timing
with the farmer's own qualifying facts is misleading — a farmer reading
"Not eligible" after a close date could reasonably conclude they
personally don't qualify).

**Disclosed limitation, honestly reached only after round 1's own
fixes, not before**: no scheme in this registry can reach `ELIGIBLE`
today — every real gate that can resolve positively ultimately depends
on at least one fact only the farmer can supply (a real DAFM/BISS
land-declaration confirmation, or a young-farmer fact), so every
currently-reachable positive result is `LIKELY_ELIGIBLE`. `ELIGIBLE`
remains a real, defined, reachable state in the engine's own type (a
future scheme needing only Farm Return's own already-trusted evidence,
with nothing self-declared, would reach it) — this registry's current
five schemes just don't happen to have one yet, the same kind of
disclosed-not-fabricated gap this repository's own history already
normalises elsewhere (e.g. `LIKELY_ELIGIBLE` itself, before round 1's
`land_declared_for_schemes` fix, would have been similarly unreachable
for `tams3-general`).

## 4. Support Opportunity (`src/domain/support-opportunity.ts`)

Links a real `EligibilityAssessment` to, only when supplied, a real
`StrategyComparison` — and keeps "this may apply to you" and "this
appears financially sensible" as two genuinely separate verdicts
(`financiallySensible` is `"not_assessed"` with no strategy comparison,
never inferred from eligibility alone). `estimateGrantSupportEur` reads
only a `CONFIRMED` scheme's own `grantRatePct`/`ceilingEur` rules —
`undefined`, never a guess, for every other scheme in this registry.

## 5. Farm Strategy (`src/domain/farm-strategy.ts`)

Horizons 1/3/5/10 years. Baseline is a real, explicit zero ("continue
current farm operation, no new investment, no change to current
costs/income") — not fabricated. `peakCashRequirementEur` is always the
full gross capital cost (grant aid is reimbursement after spend in every
scheme this registry currently models, never assumed to reduce upfront
cash need) — kept structurally distinct from
`netEventualCapitalCostEur` (gross minus only `"approved"`/`"actual"`
support) and `cumulativeDifferenceVsBaselineEur` (the real long-term
return figure, which additionally depends on a support's own
`expectedYear` being known). `paybackYear` is `null`, never
extrapolated, whenever payback would fall outside the requested horizon.
`assumptionsDisclosed` is always populated — no inflation/discount
rate/financing cost/residual value/maintenance unless the caller
explicitly supplied it as an annual effect.

All nine required deterministic cases (spec §10) are real tests in
`farm-strategy.test.ts`: high-upfront/strong-return; delayed support
payment; no support; expected-but-unapproved support; unknown support
timing; negative-return investment; insufficient evidence; Year-1-poor-
Year-10-strong; grant-reduces-but-doesn't-fix a still-unattractive
investment.

## 6. UI (`src/app/(app)/supports/page.tsx`)

Real Support Profile ("known from your farm" / "needs your input") +
every real scheme's real eligibility assessment, using the light
Farm Return Next visual language (`FarmSectionHeading`, `Card`, no dense
KPI grid, no invented attractive numbers). See the page's own header
comment for exactly what's genuinely built this session vs. deliberately
deferred (a full Strategy-horizon comparison UI needs a real candidate
investment amount from the farmer, which this first slice's UI does not
yet collect — the domain engine itself is complete and tested; only the
"enter a candidate investment" form is deferred).

## Deliberately not built this session (disclosed, not silently skipped)

- Persistence for `EligibilityAssessment`/`SupportOpportunity`/
  `StrategyComparison` — all three are pure, recomputed-on-demand
  functions today. Their return shapes already carry
  `schemeVersionAssessed`/`assessedAt` so a future persistence layer
  (`SUPPORTS_STRATEGY_CONTRACT.md`'s own "historical assessments retain
  the scheme version used" requirement) doesn't need a shape change.
- A farmer-facing "enter a candidate investment cost" form — the Strategy
  engine and `estimateGrantSupportEur` are ready for one; wiring it into
  the Supports page is the natural next increment.
- Supplier/Request Quote marketplace — see the future contract doc.
- Any further scheme beyond the five seeded here.
- Today/Plan/Records/Ask AI integration beyond what's noted in this
  session's own final report.

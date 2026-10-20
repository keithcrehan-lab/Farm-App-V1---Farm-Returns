# Cattle C10 — Cattle UX

Predecessor: C9 (frozen by the campaign receipt `receipts/C9.json`)
Authority: human C10 overnight authorisation, 2026-10-20 (reference experience, design language and the five isolated C10 capabilities below). This brief replaces the placeholder hold; `C10_PREBUILD_REVIEW.md` records the read-only findings it is based on.
Phase directories (new): `src/app/(app)/cattle/`, `src/components/cattle/`, `src/domain/cattle/presentation/`, `src/domain/animal-plan/`, `src/server/cattle-demo/`
Verify command: `npx vitest run cattle animal-plan src/components/shell --maxWorkers=1 && npm run typecheck && npm run lint`

## Phase contract (Shared Cattle Architecture & Conformance v1)

Read `docs/farm-return-next/cattle/index.md` first, then only the shared documents it routes you to. CAT-INV ids are defined in `docs/farm-return-next/cattle/INVARIANTS.md`; this phase's interface contract is its section of `docs/farm-return-next/cattle/PHASE_INTERFACES.md`, widened by this brief to include C9 (the only route from cattle to Plan).

- **Outcome:** a farmer-facing cattle reference experience (Group → Animal → Performance → Record weight → Animal plan → Save → back to Animal) rendering frozen C1–C9 outputs honestly, plus five isolated C10 capabilities (below).
- **Owner:** presentation view-models, screens, display formatting, the demonstration herd, and the C10-owned `animal-plan` domain (plan draft, direct-cost ledger contract, mart valuation contract, projected direct return).
- **Inputs:** frozen public exports of C1–C9 and the Plan kernel only (C1 `projectAnimalSnapshot`; C4 `buildWeightReadContract` / `resolveGroupScope`; C5 `evaluatePerformance` incl. `projectionAt`; C6 `projectProductionGoals`; C3 `projectAnimalHealth`; C8 `recommendCattle`; C9 `planCattleWork`; Plan `createPlanJob`, `reevaluatePlanJob`, `compareSystemPriority`).
- **Outputs:** display structures with distinct honest states; screens; `animal-plan` pure results.
- **Invariants:** CAT-INV-009, 014, 017, 019, 022, 023.
- **Temporal model:** renders the `effectiveAt` / `knowledgeCutoff` it was given; never computes them from a clock. The demonstration viewpoint is fixture-supplied and advances only through recorded demo-session actions.
- **Identity model:** displays domain ids only in provenance detail; farmer identity is the C1 external identifier (tag). Never derives a domain id.
- **Semantic equality:** display only; formatting never feeds back into a domain call.
- **Status / evidence precedence:** every unresolved required input surfaces as its own display state, never resolved-looking (CAT-INV-009/022).
- **Units / precision:** display rounding is documented in the view-models only (CAT-INV-019); `animal-plan` money uses exact decimals and rounds only for display.
- **Provenance:** "Why?" progressive disclosure shows reason, sources, evidence type/strength, assumptions, limitations, unknowns, blockers and calculation traces; technical ids never appear in the primary view.
- **Forbidden dependencies:** formulas in components; independent eligibility, ADG, projection, obligation state, readiness or ranking; mock or fixture data for real accounts.
- **Human gates:** product decision gate; frozen-contract gate; migration gate.

## Data source honesty (unchanged principle)

- Supabase configured (real account): every cattle screen renders the honest "no canonical cattle records connected yet" state; no `SYNTH-*`, fixture, mart or cost value is rendered, and every C10 server action refuses.
- Supabase not configured (local demonstration mode): a clearly labelled `SYNTH-*` demonstration herd is built server-side in `src/server/cattle-demo/` and run through the real frozen engines. Display-only fixture labels (tag `1427`, breed label, group and field names, mart name and price band, cost entries) are demonstration data and are labelled as such wherever shown.
- Farmer actions in demonstration mode are appended to an in-browser demo session (never persisted). Server actions are stateless: they validate the caller-supplied session at the C10 boundary (untrusted input), replay fixtures + session through the frozen engines and return view-models. Nothing is written anywhere.
- The legacy `livestock_individuals` data is not adapted (no knowledge-time provenance); `/livestock` is unchanged.

## Authorised C10 capabilities (isolated; none is a frozen-phase change)

1. **Animal forward plan.** Sale date and target weight are saved as a new C6 goal declaration version (canonical C6 input, demo session). Feed and housing assumptions are a C10 plan draft. Projected weight comes only from C5 `evaluatePerformance` with `projectionAt` = sale date; feed/housing never change projected weight (no response model exists), and the UI says so.
2. **Projected direct return** (`src/domain/animal-plan/plan-economics.ts`), exactly: `projectedSaleValue = projectedWeightAtSale × selected €/kg`; `projectedDirectProfit = projectedSaleValue − recordedDirectCosts − forecastDirectHoldingCosts`; `currentSellNowMargin = currentEstimatedMarketValue − recordedDirectCosts`; `returnFromHolding = projectedDirectProfit − currentSellNowMargin`. Labour, land, finance, depreciation, overhead and unallocated costs are excluded and the UI says so. The word "profit" never appears without "projected direct".
3. **Direct-cost ledger** (`src/domain/animal-plan/cost-ledger.ts`): entry contract (animal, category, exact amount, currency, effective date, source, DIRECT vs ALLOCATED with basis, note/reference) and summaries; never a C8 economic observation or price source; no whole-farm completeness claim. Persistence awaits an architecture decision; demonstration entries are fixtures.
4. **Mart valuation** (`src/domain/animal-plan/mart-valuation.ts`): provider interface and result contract (source, market, report date, freshness, comparable category, pricing basis, observed range, derived central estimate, observed vs derived, live vs fixture). Only a labelled fixture provider exists (`src/server/cattle-demo/`); no scraping, no live claim, never an input to C8.
5. **Animal photos** (`src/components/cattle/photos/`): client-only session store behind an `AnimalPhotoStore` interface (multiple photos, one primary); never uploaded or persisted; UI says so. No avatar generation.

If any of these needs a frozen-contract change, a migration, a persistence owner, a C8 economic-authority change or a Plan semantic change, stop with the matching gate instead of improvising.

## Engineering constraints

1. Frozen code: do not modify any module an earlier phase created (anything under `src/domain/cattle/` outside `presentation/`, and `src/domain/plan/`). Reuse their public exports only.
2. Never edit `src/lib/farm-data/`, `src/types/`, `src/domain/types.ts`, `package.json`, lockfiles, `tsconfig.json`, lint/test/Next configs, `supabase/` or any `.sql` file. No new dependency. Never create `types.ts` under `src/domain/`.
3. Shared files C10 may touch: `src/components/shell/nav-items.ts` (+ its test) to add the Cattle entry; `docs/farm-return-next/DOMAIN_CONTRACTS.md` (append one "Cattle C10" section); `docs/evidence-register.md` (append one C10 definitions entry); this campaign's brief, manifest and review notes.
4. No clock read in any domain, view-model or demonstration-replay path. Client-only UI state (animation, draft inputs) may use the browser, never to compute domain time.
5. UNKNOWN is never zero, blank-as-OK, a default or a green tick; conflicting evidence stays conflicting; projection ≠ measurement; recommendation ≠ obligation; recommended window ≠ hard deadline ("must be completed by" only for a C9 `hardDeadline`); mock ≠ live; estimate ≠ guaranteed price.
6. No AI layer; no network call; no scraping; no real legal, veterinary, scientific, price or cost fact encoded as truth (demo values are synthetic and labelled).
7. Mobile-first, ≥44px touch targets, no hover-only primary interaction, semantic buttons/inputs/labels, `prefers-reduced-motion` respected; Farm Spatial V2 tokens and design contract (no new design system, no chart library).

## Gate-token discipline (mandatory)

Unchanged from the campaign: the orchestrator treats its listed judgement-gate tokens anywhere in a build/fix report or audit artifact as a human stop. Write one only when genuinely stopping, as `STOP: <TOKEN> — <one-sentence reason>`; never quote the list; never use a token as an identifier.

## Required tests

1. View-models: every distinct frozen state C10 renders (C1 resolution, C4 latest weight and membership, C5 derivation / comparison / prediction, C6 goal status, C3 withdrawal, C7 occurrence, C2 obligation, C8 outcome, C9 blocker status, Plan job status) maps to a deliberate display state; unknown never renders as zero/OK.
2. Boundary: components and view-models import no frozen engine internals and no formula; the demo replay calls only the public exports listed above; real-account mode renders no synthetic data and the server actions refuse.
3. Record weight: a qualifying weight completes the linked RECORD_WEIGHT job through `reevaluatePlanJob`; a back-dated one does not.
4. Projection: projected weight comes from C5 only and is unchanged by feed/housing inputs.
5. Economics: total cost, direct vs allocated, forecast holding cost, cost per kg, missing-cost states, exact profit / sell-now / return-from-holding formulas (positive, zero, negative), invalid date ordering, date-only stability.
6. Valuation: source metadata, range, low/base/high scenarios, missing and stale states, fixture never labelled live.
7. Photos: none, one, several, primary selection.
8. Accessibility: labels, semantic controls, keyboard/touch chart navigation, reduced motion.

## Acceptance criteria

- The reference journey works in local demonstration mode against the real frozen engines; real-account mode shows the honest unavailable state.
- No frozen file changed; no persistence, migration, schema, connector or dependency; Plan and C8 semantics unchanged.
- Targeted tests, full test suite, typecheck, lint and build pass; independent audit of the complete C10 delta with no open Critical/High.

## Stop conditions

Stop with a `STOP: <TOKEN> — reason` line instead of improvising when: a frozen C0–C9 contract or Plan semantics would need changing; persistence, a schema or a migration would be needed; a persistence or domain owner cannot be determined; C8's economic authority would change; a scientific or price model would have to be invented; a market source would need scraping or would be treated as authoritative; a financial definition becomes ambiguous; a trust boundary is unclear; a High defect of the same family recurs; frozen tests would need weakening; or there is material doubt about correctness.

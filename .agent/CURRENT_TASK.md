# Task: CC-FU-B — label slurry DM provenance truthfully

Task ID: cc-fu-b-label-slurry-dm-provenance-truthfully-20261001
Starting HEAD: 5443257c5cf0e2092a0c10a6fc50dc170a6ec16e
Verify command: `npm run typecheck && npm run build`

## Objective

Resolve BLOCKERS.md CC-FU-B: the slurry available-nutrient assessment
(`organicApplication.availableNutrientAssessment.evidenceState`, produced by
`resolveAvailableSlurryNutrients` in `src/domain/nutrients.ts`) is labelled `MEASURED`
whatever the source of the slurry dry matter % it was computed from. The national-average
DM fallback (`dmPctEvidence.status === "estimated"`) and a farmer-declared DM % must not be
presented as a laboratory measurement. Labels/provenance only: no nutrient value changes.

## Authority

The product owner authorised on 2026-10-01 the frozen-contract change CC-FU-B needs: a new
parameter on `resolveAvailableSlurryNutrients` carrying the DM % evidence status. Follow the
contract-change protocol in `docs/farm-return-next/DOMAIN_CONTRACTS.md` exactly for that
signature change (including its bookkeeping), and update every caller.

## Scope

- Pass the DM % evidence status `calculateNutrientPlan` already holds
  (`organicApplication.dmPctEvidence.status`) into `resolveAvailableSlurryNutrients`.
- The OK outcome's `evidenceState` becomes the weaker of: the evidence state the resolver
  returns today (table/method), and the evidence state of the DM % input.
- Map the DM % status to an evidence state with the soil-index precedent already in this
  module (`calculateNutrientPlan`'s `fertilityEvidence`, `src/domain/nutrients.ts` ~L1935:
  `MEASURED` only when the lab quantity is `verified`, otherwise `IRISH_DEFAULT`). Product-owner
  decision 2026-10-01: DM % `verified` → `MEASURED`; `farmer_adjusted`, `estimated` and any
  other status → `IRISH_DEFAULT`. Do NOT use `evidenceStateForDirectAssertion`
  (`src/domain/input-gates.ts`): its own documentation excludes farmer estimates of continuous
  lab quantities. Combine with the existing weakest-state precedent (`weakestEvidenceState` in
  `src/domain/fertiliser-plan-cost.ts`, `EVIDENCE_STATE_PRIORITY` in `src/domain/evidence.ts`);
  reuse or export it rather than writing a new priority order.
- Review every consumer that reads this `evidenceState` (economics, reports, audit export,
  UI) and confirm each still behaves correctly with the weaker label; adjust only what the
  label change requires.

## Out of scope

- Any nutrient value, availability factor, table, timing rule or fail-closed behaviour.
- The engine version (`nutrient_engine_v1.2.0`): values are unchanged. If the contract-change
  protocol explicitly requires a version bump for a metadata-only change, STOP instead.
- CC-FU-C, CC-B3, per-nutrient P/K architecture, Campaign C rules, migrations, harness/runner,
  push/deploy, secrets, external research.

## Acceptance criteria

- National-average DM (`estimated`) → assessment `evidenceState` is not `MEASURED`
  (`IRISH_DEFAULT` by the existing precedent).
- Laboratory DM (`verified`) → unchanged from today.
- Farmer-declared DM (`farmer_adjusted`) → not `MEASURED` (`IRISH_DEFAULT`).
- All nutrient figures, statuses and reason codes are identical to before for every case.
- CC-FU-B marked resolved in `docs/farm-return-next/BLOCKERS.md`; minimal
  `IMPLEMENTATION_LOG.md` / `BUILD_STATE.json` update; CC-FU-C stays open.

## Required tests

- Resolver and `calculateNutrientPlan` tests for estimated / farmer_adjusted / verified DM %
  across LESS (spring, summer) and splashplate (spring), asserting the evidence state and
  that n/p/k are unchanged.
- Existing nutrients, slurry-economics, report and audit-export tests still pass.

## STOP conditions

BUILD_RESULT: BLOCKED <reason> if any nutrient value would change, if an OK assessment can
arise from a DM % with no figure at all (`unavailable`), if a consumer would need a
behaviour change beyond the label, or if the protocol requires an engine-version bump.

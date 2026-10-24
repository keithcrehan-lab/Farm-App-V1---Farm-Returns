# Pilot Integration — state

| | |
|---|---|
| Current phase | P4 complete (deterministic). Waiting for the signed-in walkthrough. |
| Branch | `pilot-integration-v1` (P0 `9f6a1cb`; P1 `ef9f12f`; P2 `867bdb2`; P3 `e333a8d`) |
| Implementation SHA | `b6dba8b` (P4 What Matters and pilot navigation) |
| Status | `READY_FOR_MANUAL_SIGNED_IN_PILOT_CHECK`. Not "pilot ready" until the walkthrough below passes. |
| Pushed | no |
| Open blocker | the signed-in walkthrough. No authorised dev account was available to the agent, and none was created. |

## What P4 delivered (D15)

- **What Matters (`/what-matters`):** a real screen. It uses the same audited evaluation as Farm's "What matters now"
  through the shared `useWhatMattersPilot` hook. It shows what needs attention, the reason, the action, and the
  evidence used: which CSO fertiliser prices are on record, the contractor rate, slurry plans and weather.
  - **No price evidence:** if no price evidence is persisted, the screen says so and assumes no price.
  - **Farm:** keeps the summary and links to What Matters.
- **Pilot navigation:**
  - **Primary:** Farm, What Matters, Plan, Cattle and Records.
  - **More:** the field, soil, nutrient, spreading, supports, market, reports and settings screens.
  - **Hidden:** Finance, Dashboard, Silage, Feed Optimiser and Input Planner (kept, reachable by URL).
  - **Sign-in:** lands on Farm.
- **Ask AI:** hidden for signed-in farms, since no provider is connected. Demo mode keeps it.
- **Farm:** the "Forecast view coming soon" line is gone.
- **Unchanged:** the schema, `src/domain`, and the P1–P3 cattle paths. `/livestock` still redirects to
  `/cattle/manage`.

## Verification (P4)

- **P4 tests:**
  - `what-matters.test.tsx` (13): screen states, missing-price wording, no dead nav links, hidden screens, the landing
    page and Ask AI.
  - `what-matters-pilot.test.ts`: 2 tests for the evidence summary.
- **Affected suites:** P1, P2 and P3 cattle, the components, the store, the routes and `src/lib`: 1772 tests in 144
  files, all passing.
- **Final full gate:** passed on `b6dba8b` (`quality-20261024T174644Z-84668`).
  - Tests: 6351 in 325 files.
  - Typecheck, lint (0 errors, the 2 pre-existing C8 warnings) and build all pass.
  - The tree was clean apart from the docs.
- **Browser:**
  - **Demo:** loads, and the herd is labelled synthetic. What Matters shows the demo notice. `/` and `/livestock`
    redirect correctly. The nav shows only pilot destinations.
  - **Signed-out real mode:** `/`, `/what-matters`, `/cattle`, `/livestock` and `/cattle/manage` all redirect to
    sign-in.
  - **Signed-in walkthrough:** not done.
- **Codex:** ZERO.

## Next action: manual signed-in pilot check (person)

Sign in locally to Farm Return V1 Dev (`npm run dev`) and check:
1. You land on Farm, which shows your real fields (not Ballybeg).
2. **Field:** open a field, then its soil or nutrient plan.
3. **What Matters:** it shows either a recommendation or the evidence it lacks.
   - If price evidence is missing, the operator can run the CSO sync once
     (`POST /api/admin/market/sync-cso-fertiliser-prices` with `x-admin-secret`), then recheck.
4. **Cattle:** Cattle → group → animal → Record Weight. The profile updates, and the weight is still there after a
   reload.
5. **Manage herd:** the same group and animal appear. Opening `/livestock` lands here.
6. **Slurry:** the spreading/slurry plan and its compliance details work.
7. **Records and Supports:** Records shows completed work and evidence, and Supports shows eligibility.
8. **Navigation:** has no Ask AI, Finance, Silage or other unfinished destination, and no demo data appears anywhere.

If all of these pass, Pilot Integration is complete and ready for a farmer pilot.

## Excluded from the pilot (not started)

AI assistant, full Finance, silage, feed optimiser, input planner, cattle marketplace and mart integration, cattle
photos, group split/merge, weighing method, persisted cattle work, and an automatic CSO price schedule.

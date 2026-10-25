# Pilot Integration — state

| | |
|---|---|
| Current phase | **Pilot Integration COMPLETE** (P0–P4 and signed-in manual acceptance) |
| Branch | `pilot-integration-v1` (P0 `9f6a1cb`; P1 `ef9f12f`; P2 `867bdb2`; P3 `e333a8d`; P4 `b6dba8b`; repairs `a0ba9d1`) |
| Final implementation SHA | `5e35def` (D16 capability-gated real-mode cattle actions) |
| Final full gate | `quality-20261025T193923Z-33856` on `5e35def`: 6373 tests in 327 files, typecheck, lint (0 errors), build |
| Status | `PILOT_INTEGRATION_COMPLETE — READY_FOR_FARMER_PILOT` |
| Pushed | no. Codex: ZERO. |

## Closure: manual signed-in acceptance (2026-10-24/25)

The agent drove the user's signed-in browser against Farm Return V1 Dev (the real farm "KC"). The user authorised
using real dev data and one test weight.

**Passed:**
- Farm;
- field, soil and nutrients;
- What Matters (the truthful missing-evidence state);
- slurry and compliance;
- Records and evidence;
- Supports;
- pilot navigation;
- demo isolation;
- the repairs at `a0ba9d1`: headcount-group link, "Live weight not recorded", wording on Supports, Records and Plan.

**D16 at `5e35def`** (authorised):
- The animal "test" shows no programme, requirement, withdrawal or goal job; the herd shows "0 open jobs" and the
  group "Nothing currently needs attention".
- Programmes, requirements, medicine and goals are still shown as couldn't be checked or unknown.

**Record Weight** (approved test weight 601 kg, 25 Oct, on the existing dev animal "test"):
- The save succeeded and the sheet closed.
- The profile refreshed to 601 kg with a gain of 1.00 kg/day (24–25 Oct).
- After a reload, the history shows both weights.
- Manage herd shows the same group row. `/livestock` redirects to `/cattle/manage`.

**Non-blocking follow-ups** (not started):
- **Price sources:** What Matters reads only persisted CSO rows (the operator sync), while Market Prices and the
  Fertiliser Plan use the CSO series embedded in the app. No sync was run.
- **Manage herd live weight:** the "Total Cattle" weight is based on group averages, so it says "Live weight not
  recorded" even when individual animals have weights.
- **Plan:** lists closed-period notices under "Genuine opportunities".
- **Records:** the inputs line shows raw codes.
- **Dev farm test data:** "Dev Test Shed…", "QA Test Product" quotes, and the animal "test" with its weights.
- **Capability-gated parts (D8/D16):** revisit when programme, obligation, medicine or goal storage is added.

## History

## Manual signed-in walkthrough (2026-10-24, agent-driven in the signed-in browser)

**Passed:**
- Farm (real farm "KC", 10 fields);
- field, soil and nutrients;
- What Matters: the truthful missing-evidence state. No CSO price rows are persisted in dev, and no slurry plan has
  both a method and a date;
- slurry and compliance;
- Records and Supports routes;
- pilot navigation;
- no demo leakage.

**Repaired at `a0ba9d1`:**
1. A headcount-only group (e.g. "weanlings", 20 head) was plain text on `/cattle`. It now links to
   `/cattle/groups/<id>`.
2. Manage herd showed "Live Weight 0 kg · Avg 0 kg" with no weight recorded. It now reads "Live weight not recorded"
   (`summariseLiveWeight`).
3. Supports showed internal tooling provenance ("this session's own fetch tool… HTTP 403"). The farmer now sees plain
   wording; the registry and engine are unchanged.
4. Records named fields by raw id. It now shows the field name.
5. Plan showed raw material codes and MM-DD dates. It now shows readable words.

**Repair verification:**
- Repair tests (`src/lib/pilot-acceptance-repairs.test.tsx`, plus one headcount-link test) and the affected suites
  pass: 1941 tests in 158 files.
- Full gate passed on `a0ba9d1` (`quality-20261024T200613Z-7797`): 6363 tests in 326 files, plus typecheck, lint
  (0 errors, 2 pre-existing warnings) and build. Codex: ZERO.

**Follow-up, not fixed (a decision for later):** What Matters reads CSO prices only from the persisted
`market_price_observations` table, which only the operator sync fills. Market Prices and the Fertiliser Plan use the
CSO series embedded in `src/domain/market.ts`. These are separate sources by design, not a wiring slip. Running the
operator sync, or a future decision to share one source, removes the visible difference. No sync was run.

**Other observations, not fixed:**
- Plan lists closed-period notices under "Genuine opportunities".
- The dev farm holds test rows ("Dev Test Shed…", "QA Test Product" quotes).

**Remaining manual checks at that point** (completed 2026-10-25, see Closure):
- A. Re-check that a headcount-only group opens.
- B. Re-check that Manage herd shows "Live weight not recorded".
- C. Confirm the wording on Supports, Records and Plan.
- D. Create one clearly labelled dev test animal (Manage herd → Add an animal).
- E. Record one weight on it.
- F. Reload.
- G. Confirm `/cattle` and Manage herd show the same persisted data.

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

## Original P4 manual checklist (superseded by the remaining checks above)

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

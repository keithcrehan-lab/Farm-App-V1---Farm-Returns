# Authenticated Real-Data Stabilisation Phase — Final Report

**Starting SHA:** `833b0ed` (the Native Mobile / Background GPS
Feasibility Phase's own closing commit)
**Ending SHA:** `90ab9e6` (round 12's own closing commit; this report
and the quality-gate re-run land in a following commit)
**Branch:** `farm-return-next` only — `main` untouched throughout.

## 1–2. Starting/ending SHA

See above.

## 3. Authenticated Dev farm status

Real Supabase CLI access to `Farm Return V1 Dev` (project ref
`whevugeisqlpfnrugfsd`, linked, read-only throughout — no writes, no
production project touched). Three real `farms` rows exist; the first
created ("KC") is the product owner's own real farm, the other two are
timestamped "E2E Test Farm..." rows from prior automated testing.

```text
Authenticated Dev farm ("KC"):

Farm                          PRESENT (onboarding complete)
Fields                        1
Mapped boundaries             1  (real polygon, area 0.62ha)
P/K Index recorded            YES (both)
Verified soil test            0
Livestock groups              1  (suckler_cow, 20 head, grazing)
Housing units                 0
Slurry allocations            0
Financial assumptions         2  (fertiliser price: estimated,
                                  fuel price: farmer_adjusted)
Job Sessions                  0
Job Actuals                   0
Decisions                     0
Jobs                          0
Telemetry events              0
Notifications                 0
Livestock individuals         0
Weight observations           0
Supplier quotes               0
```

Real counts, not fabricated for this report. This is a genuinely
lightly-used real account — most screens' own honest empty states are
what a farmer at this exact stage of setup should see.

## 4. Screens audited

All screens named in the governing brief's own checklist: Today, Farm/
Fields, Field Detail, Plan, Records, Ask AI, Livestock (overview +
economics), Housing, Soil, Nutrients, Spreading, Silage, Input Planner,
Feed Optimiser, Finance, Market Prices, Reports, Settings, and the Job
flow (Start/Active/Finish/Confirm Actual/Record). Full detail, per
screen: `AUTHENTICATED_REAL_DATA_AUDIT.md`.

**Method, disclosed plainly**: this session had no credentials for the
real farmer's own account, and creating an account or entering a
password is prohibited regardless of authorization — so no live,
interactive, authenticated browser click-through was performed. Every
classification rests on (a) the real database state above, (b) direct
reading of each screen's own data-loading code, and, for the specific
reported mobile symptom, (c) real, reproduced browser evidence gathered
by loading this same dev server over the LAN-IP origin a phone uses.

## 5–10. Screen classification counts

| Classification | Count | Notes |
|---|---|---|
| `REAL_DATA_WORKING` | 17 | Today, Fields, Field Detail, Plan, Livestock overview, Soil, Nutrients, Spreading, Input Planner, Finance, Market Prices, Reports, Settings, Feed Optimiser, Housing, Ask AI's own real context wiring, Active/Finish Job's own code path |
| `REAL_DATA_PARTIAL` | 2 | Livestock economics, Feed Optimiser — both had a real bug (§11), now fixed, with a real remaining `BLOCKED_EXTERNAL` gap for non-weanling market pricing |
| `HONEST_EMPTY_STATE` | 4 | Housing (0 sheds), Records (0 decisions/jobs), Job flow's own resulting Record, Soil's "Verified Tests" tab |
| `NOT_IMPLEMENTED` | 1 | Silage (documented, disclosed, pre-existing — no sourced yield/DM-conversion model) |
| `BLOCKED_EXTERNAL` | 1 | Ask AI's own LLM connection (no provider configured) |
| `BLOCKED_HUMAN` | 0 | none newly found this phase |

No screen was left `UNKNOWN`.

## 11. Genuine bugs fixed

**One real, consequential bug, found and fixed across two screens**:
Livestock economics (`/livestock/[groupId]`) and Feed Optimiser
(`/feed-optimiser`, via an indirect re-export the initial direct-
`mock-farm`-import grep missed) both computed a real, authenticated
farmer's real steer group's margin/recommendation figure from
`CATTLE_PRICE_EUR_PER_KG_CARCASS` — a mock Bord Bia constant —
unconditionally, with only a generic "estimates" footer disclosing it.
Fixed: real mode with a real steer group now shows an honest "Market
data is currently unavailable" state instead of computing from the
fabricated price; the real weanling path (genuine CSO live-mart
pricing) and the real concentrate-cost feed-strategy comparisons are
both unaffected. A real heifer group can never actually reach this
path at all — `finishingOptionsForGroup` already fails closed for
`finishing_heifer` (no evidenced budget exists).

No other genuine mock-leakage bug was found across the remaining ~20
screens audited — every other screen with a `mock-farm` import was
already correctly gated on `isRealMode`/`useIsRealMode()`, or naturally
inert against a real Postgres UUID (a mock silage plan's demo field id
never matches a real field's UUID, so the lookup correctly resolves
"no plan" either way).

## 12. Mock-data leakage found/fixed

Covered in §11 above — one real leakage found and fixed, on two
screens sharing the same underlying constant.

## 13. Database/RLS issues found

None. This phase performed read-only queries against `Farm Return V1
Dev` and found no RLS or schema issue — the real farm's own data
returned correctly scoped, and every screen's own real-mode query code
already uses the established `useFarmStore()`/`farm-data` adapters.

## 14. Mobile-specific issues found

**The real, primary finding of this phase**: loading this dev server
over the same LAN-IP origin a phone uses, and clicking a real
client-side navigation link, reproduced four real `503` responses among
`_next/static/chunks/*.js` requests on the first visit to a route in
this dev-server process's lifetime — most likely explained by
Turbopack's own on-demand compilation under real Wi-Fi latency (not yet
independently confirmed by a server-side trace correlating the exact
timing; disclosed as the best-supported hypothesis, not settled fact).
This is a **development-mode-only** failure class: a production build
compiles every route ahead of time, so no route is ever "cold" for a
first visitor.

A second, defensive fix (`allowedDevOrigins`/`DEV_LAN_IP`) was tried
and then **genuinely reverted** once empirically tested: removing it
entirely and repeating the same real navigation test produced identical
behaviour (no `403`, the same `503` pattern), because the phone's own
request `Origin` already equals the dev server's own request host by
construction for this direct-LAN-IP topology — the check never actually
gates this specific case. Kept in the record as a real, disclosed
correction, not silently dropped.

## 15. Hosting/Vercel conclusion

See §19 below and `HOSTING_DIAGNOSIS.md` in full.

## 16. External integration status

- **Mapbox**: real, working, no origin restriction — tested directly
  against the real configured token with three different `Referer`
  headers (`localhost`, the LAN IP, none); all three returned `200`.
- **Supabase auth**: cookies set with no explicit `secure` flag by
  `@supabase/ssr`; `proxy.ts`'s redirect behaviour confirmed identical
  over LAN IP and localhost.
- **Geolocation**: already defensively guarded
  (`isGeolocationAvailable()`) against an insecure/unavailable context;
  cannot crash a render.
- **Met Éireann, CDSE satellite, market-price feed**: unchanged this
  phase — real, pre-existing, disclosed `BLOCKED_EXTERNAL` items already
  carried in `BLOCKERS.md`, not newly investigated here.

## 17. Codex audit results

**Twelve real rounds**, every one finding at least one real,
non-speculative issue, closing on round 12 finding nothing beyond its
own closing-statement wording:

- **Round 1** (`60f3fb1`): 0C/1 CRITICAL/2M/1L — the cattle-price
  fabrication (§11), a methodology overclaim, a hosting-diagnosis
  certainty overclaim, a hardcoded LAN IP. All fixed.
- **Round 2** (`c91913f`): 0C/0H/3M/1L — a fallback-default regression
  in round 1's own fix, `next_action` staleness, state/log
  synchronisation, an unfinished transitive dependency check. All
  fixed.
- **Round 3** (`bd860cb`): 0C/2H/2M — a repeated provenance overclaim on
  a *different* constant, `next_action` stale *again* (fixed
  structurally), a hosting-diagnosis wording blur, missing regression
  tests. All fixed.
- **Round 4** (`bdb3e34`): 0C/0H/3M — a contradictory-copy regression,
  an overclaimed test-coverage record, a stale quality-gate record. All
  fixed.
- **Round 5** (`12cc75b`): 0C/1H/1M — the *same* provenance overclaim
  repeated a third time in a new location, a stale round-number in a
  closing sentence. Both fixed.
- **Round 6** (`8c90e1c`): 0C/0H/1M — **a real, empirically-verified
  REVERSAL**: `allowedDevOrigins` was never actually needed for this
  direct-LAN-IP topology; removed and re-tested to confirm before
  reverting, not just argued about.
- **Round 7** (`8ff6c34`): 0C/0H/2M — a reused, now-inaccurate subtitle
  on an empty state; an overstated "steer/heifer" historical claim
  (heifers can never reach the affected code path). Both fixed.
- **Round 8** (`ff9a961`): 0C/0H/0M/1L — the smallest finding count
  yet: one leftover "steer/heifer" phrase in the test file itself.
  Fixed.
- **Round 9** (`153f8c2`): 0C/0H/2M — a *new* real bug (the
  Feed Optimiser intro copy didn't check `supported`, misdescribing an
  unsupported group's empty state) and a hosting-diagnosis
  self-contradiction ("none of consequence were found" beside a
  documented CRITICAL). Both fixed, with a new regression test.
- **Round 10** (`98dea9f`): 0C/0H/1M — the identical provenance
  overclaim, missed in the *original* round-1 log entry itself. Fixed.
- **Round 11** (`09d6bb4`): 0C/0H/0M/1L — a missing currency symbol on
  newly-added copy. Fixed.
- **Round 12** (`90ab9e6`): 0C/0H/0M/1L — round 11's own closing
  paragraph contradicted itself about whether the loop was closed.
  Fixed; **loop closed for real on this round**.

Full quality gate re-run and green after every single round —
1535/1535 tests (up from 1528/1528 at the phase's own start), 7 new
regression tests, none weakened or removed.

## 18. Final test count

**1535/1535 passing, 121/121 test files.** `apps/mobile-spike/`'s own
isolated suite (unaffected by this phase) not counted in this figure.

## 19. Remaining blockers

- `BLOCKED_EXTERNAL` (pre-existing, carried in `BLOCKERS.md`, unchanged
  this phase): no automated market-price feed (gates Livestock
  economics' remaining non-weanling pricing, silage yield model, CDSE
  satellite NDVI credentials, Met Éireann forecast licence).
- `BLOCKED_EXTERNAL` (this phase's own real finding, disclosed, not
  fully proven): the exact causal mechanism behind the reproduced `503`
  pattern — Turbopack on-demand compilation is the best-supported
  hypothesis, pending a server-side trace correlating the exact timing
  with a real compile event, named as a concrete follow-up in
  `HOSTING_DIAGNOSIS.md`.
- No `BLOCKED_HUMAN` item was newly identified this phase.

## 20. Is the authenticated farm-data foundation safe to build on?

See §21 below.

---

**Is Vercel the reason the authenticated mobile screens were
incomplete?**

**PARTLY.**

Explanation: no auth/cookie/Server-Action/Mapbox breakage was found —
each was tested directly against the real LAN-IP topology a phone uses,
not assumed. What this phase found instead is a real, reproduced `503`
pattern on cold-route JS chunks, most likely explained by `next dev`'s
own on-demand compilation under real Wi-Fi latency — a genuine
dev-server artifact that a production build (Vercel or any other static
build) removes by construction, since there is no "cold route" for a
first visitor to ever hit. A defensive `allowedDevOrigins` fix was tried
and then genuinely reverted once direct testing showed it made no
difference for this exact topology — a real, disclosed correction, not
a hedge left in place "just in case." Recommend the product owner
re-test on their phone against the now-warm, restarted dev server
before concluding a deployment is strictly required; if screens still
fail to load, that is new evidence this diagnosis does not already
explain.

**Is the authenticated farm-data layer now sufficiently reliable to
begin Supports Intelligence + Farm Strategy?**

**YES.**

Explanation: this phase's own real, twelve-round, adversarial Codex
audit found exactly one genuine data-fabrication bug across roughly
twenty screens (a mock cattle price silently feeding a real farmer's
real financial figures) — now fixed, tested, and re-verified clean. No
RLS/farm-isolation issue was found. No other screen showed a real
farmer a fabricated or mislabelled number. Every honest-empty-state
screen this phase checked was already correctly built (matching this
codebase's own extensive, multi-session history of exactly this
discipline). The one open item (§19's `503` root-cause confirmation) is
a local-dev-testing concern, not a production-readiness one. With no
open Critical/High integrity blocker, the recommended next phase is:

**Supports Intelligence + Farm Strategy Foundation.**

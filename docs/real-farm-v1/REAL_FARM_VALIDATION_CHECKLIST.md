# Real Farm V1 — validation checklist

How to verify this build against a genuine real Irish farm, once a real
Supabase project exists (see `supabase/README.md`). Every row below is
either **Ready to test** (the code path exists and should work — not yet
run against a live database in this environment, per `BUILD_LOG.md`'s
credential-blocker notes throughout) or **Blocked** (a documented,
specific reason, not a placeholder).

## 0. Setup

- [ ] Create a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL`/
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
- [ ] Apply `supabase/migrations/*.sql` (CLI `supabase db push` or the SQL
      editor — see `supabase/README.md`).
- [ ] Confirm Email auth is enabled and redirect URLs cover your dev/prod
      origin.
- [ ] `npm run build` — confirm it still builds clean with real env vars
      set (routes that were static should become dynamic where they read
      the session, e.g. `/settings`, `(app)` routes).

## 1. Farm setup — **Ready to test**

- [ ] Sign up with a real email → confirmation email arrives → confirming
      lands on `/onboarding` (not a farm-less dashboard).
- [ ] Complete onboarding Step 1 (Farm) → a real `farms` row exists.
- [ ] Add 2+ real fields in Step 2 (name, area, planned use) → real
      `fields` rows, farm-centroid placeholder position.
- [ ] Finish onboarding → land on `/dashboard` showing the real farm just
      created, not `mock-farm.ts`'s "Ballybeg Farm" demo data.
- [ ] On `/fields`, draw a real boundary on one field (Mapbox draw tool) →
      `areaHa`/`centroid` update to the derived values; area input on that
      field's edit form is now locked/read-only (BUILD_LOG.md Phase 7).
- [ ] Rename a field, change its planned use, confirm the change persists
      after a full page reload (i.e. actually round-tripped to Postgres,
      not just local React state).
- [ ] Archive a field → disappears from `/fields`, `/nutrients`,
      `/soil`'s field lists; reappears and is fully usable again after
      "Restore".

## 2. Soil — **Ready to test**

- [ ] Add a real lab soil test (sample date, lab, ref, P/K mg/L, pH) to a
      field on `/soil`.
- [ ] Confirm the P/K Index shown updates to the lab-derived
      classification (Teagasc Green Book tables), not the pre-test
      estimated default, and the status badge changes to "Verified".
- [ ] Confirm the soil-test validity line appears ("Valid — N years old" /
      the 4-year disregard wording) and the age is correct for the date
      entered.
- [ ] Enter a soil test with a sample date >4 years old and a non-Index-4
      P value → `/nutrients`' NAP compliance card for that field should
      show the ceiling as `"Unconfirmed"`/`planning_advice` rather than a
      confirmed statutory figure (Scientific Engine V3's disregard rule —
      confirm it isn't silently bypassed).

## 3. Livestock — **Ready to test**

- [ ] Add 2+ real livestock groups (category, count, weight, system) on
      `/livestock`.
- [ ] Confirm no group shows a fabricated "On Track" status pill
      (BUILD_LOG.md Phase 5 — the pill should be entirely absent for a
      newly-created group, not showing green by default).
- [ ] **Blocked / expected gap**: `/feed-optimiser` will show an honest
      "isn't available for this farm yet" empty state instead of a real
      strategy comparison — this engine is still tied to two specific
      demo group ids (BUILD_LOG.md Phase 12), not your farm's real
      category/group. Confirm the empty state appears (not a blank page,
      not a crash, not someone else's demo numbers).

## 4. Housing — **Ready to test**

- [ ] On `/housing` with zero sheds recorded, confirm a real empty state
      appears (not a crash — this was a real bug, BUILD_LOG.md Phase 11).
- [ ] Add a real shed (name, type, period, capacity, fill %) → appears
      immediately and persists after reload.
- [ ] Confirm `slurryEstimate` on a new shed is visibly a placeholder
      (`slurry_engine_v1.0.0 (mock)`), not presented as a real
      measurement — the real excretion-rate coefficient is a documented,
      still-open blocker.

## 5. Silage — **Blocked, documented**

- [ ] Confirm `/silage` shows an honest empty state for your real farm
      (not the demo farm's "Back Field" plan, not a blank page) —
      BUILD_LOG.md Phase 10/11 investigated this in depth: no sourced
      silage yield model or fresh-to-DM conversion factor exists in this
      app's evidence base, so real per-field silage planning is
      deliberately not built yet, not silently broken.

## 6. Weather — **Ready to test**

- [ ] `/spreading`'s Current Conditions/9-Day Forecast cards show a real
      Met Éireann station name and distance in km — confirm the distance
      is plausible for your farm's real location and the copy never
      implies the station is on your land.
- [ ] Confirm the per-field legal status pill (closed period, S.I.
      588/2025) reflects the real current date and your farm's real
      county.
- [ ] Disconnect network / simulate a Met Éireann API failure → confirm
      the weather cards show an "unavailable" state, not a `0` or a
      silently stale reading.

## 7. Nutrients — **Ready to test**

- [ ] `/nutrients` field selector lists your real fields (not the demo
      farm's Home/Back/River/Road Fields).
- [ ] Pick a field with no soil test yet → confirm the plan still
      computes (from the estimated P/K default) but every relevant figure
      shows `"estimated"` status, not `"verified"`.
- [ ] Confirm the headline N/P/K requirement card shows a status/source
      badge (BUILD_LOG.md Phase 8 — this was previously silently unlabelled).
- [ ] Trigger a `BLOCKED_INSUFFICIENT_EVIDENCE` NAP compliance state (e.g.
      a herd with no captured age/sex data) → confirm the missing-inputs
      list renders, and no plausible-looking ceiling number appears
      anyway.

## 8. Inputs — **Ready to test**

- [ ] `/input-planner` fertiliser/feed requirement rows reconcile to your
      real fields' nutrient plans and real livestock groups' concentrate
      needs (cross-check the tonnage against `/nutrients`/`/finance`).
- [ ] Confirm the bulk-buy card clearly marks regional demand/price/
      saving as "(example)"/"illustrative" and only "Your requirement" is
      presented as real (BUILD_LOG.md Phase 13).

## 9. Finance — **Partially ready to test**

- [ ] Confirm `FertiliserSlurryCard`'s cost/value figures reconcile to
      `/nutrients`'/`/input-planner`'s real numbers for the same farm.
- [ ] Confirm `MarginHeroCard`/`CashflowCard`/`BestOpportunitiesCard` all
      show a visible "Sample data" badge — these remain intentionally
      mock (no real sales-timing/recommendation engine exists) and must
      never be mistaken for your farm's real forecast.
- [ ] On the new Financial Assumptions card, set a real fertiliser price
      → confirm it persists after reload and shows `"farmer_adjusted"`
      status.
- [ ] **Known, documented gap**: that assumption value does not yet flow
      into `FeedCostOverviewCard`/`FertiliserSlurryCard`'s actual cost
      calculation (BUILD_LOG.md Phase 14) — confirm this is the case (not
      a silent partial success) until a follow-up phase wires it through.

## 10. Reports — **Not yet re-verified this build**

- [ ] Confirm CSV/JSON/audit-trace exports still work and reference the
      real signed-in farm's data, not the demo farm — not specifically
      re-tested in Phases 1–15; flag any regression found.

## 11. Cross-cutting

- [ ] Sign out, sign back in → same real farm and data reappear (not a
      fresh onboarding prompt, not someone else's farm).
- [ ] Create a second test account → confirm it cannot see the first
      account's farm under any URL (RLS enforcement — `farms.user_id`).
- [ ] Edit a field's P/K index on `/soil` → confirm `/nutrients`' plan for
      that field updates immediately on the same session (Phase 6/7
      real-mode wiring).

---

**How to read a failed row**: check `docs/real-farm-v1/BUILD_LOG.md` for
the phase that covers it first — most known gaps are already documented
there with the specific reason. A failure that *isn't* already documented
is a real regression this build introduced; open it as a bug, don't
assume it's an accepted gap.

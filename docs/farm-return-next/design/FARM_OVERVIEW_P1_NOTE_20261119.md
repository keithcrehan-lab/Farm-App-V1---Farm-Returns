# Farm Overview Phase 1: implementation note

Date: 19 November 2026 · Branch `feature/farm-overview-p1-20261119` · Base `4505abd6`
Brief: `FARM_OVERVIEW_SMART_HYBRID_PHASE1_BRIEF_20261119.md`. Status: implemented. **Tests not run by the implementer.** Not committed or deployed.

## What changed

| Area | Change |
|---|---|
| `src/lib/farm-spatial-lenses.ts` | `MAP_LENS_IDS = [current, grass, nutrients]`, labelled Overview / Grass / Soil, and `DEFAULT_FARM_LENS = current`. The `current` lens label and caption are now Overview. `resolveFarmLensId`: `overview` and `current` open Overview, `conditions` opens the default, `soil` opens Nutrients. |
| `FarmLensControl.tsx` | 3-column switch with `min-h-11` targets. Selection semantics (`aria-pressed`, domain rule) are unchanged. |
| `src/lib/farm-today-overview.ts` (new) | Pure presentation adapter that builds `FarmTodayView` from the page's existing `allPrompts` and `todayOpportunities`. It computes no figures. |
| `FarmTodayPanel.tsx` (new) | Compact and expandable Farm Today panel in the deep-green glass style. |
| `MapHero.tsx` | Optional `getActionBadge` prop that adds a neutral count badge and an optional label visible at every zoom. Other callers are not affected. |
| `today/page.tsx` | Wires the panel and badges for Overview only. Farm-wide topics open the existing sheet without moving the camera. Field actions select the field. The drawer leads with the field's action. |

## Data contract

- **Farm-wide topics**: the canonical `TodayOpportunity` list, in its canonical order. HIGH and MEDIUM appear under "Farm-wide". LOW and For later appear under "On record · not urgent". Each shows its priority label, its first real blocker and its evidence summary. Topics never mark a field marker. `affectedFieldIds` is not used for the map on Overview.
- **Field actions**: only from the field's own Prompt:
  - `soil_test_age` OK with value `DISREGARD` means a new soil test is needed (statutory 4-year rule). Evidence shown: lab sample date.
  - `fertiliser_recommendation` OK, **only while the same field's chemical-fertiliser spreading-window Prompt is OK**. In the closed period it stays a farm-wide planning topic. Evidence shown: the evidence tier label, nutrient plan, and "chemical calendar open".
  - Spreading-window, commonage and local-buffer Prompts never mark a field.
- **Ordering**: field groups are sorted by field name, then stable id. The panel states "by field name, not ranked". No field-level urgency is claimed.
- **Map**: up to 3 labelled mapped fields. Other mapped fields with actions get a count badge only. Unmapped fields appear in the list and link to their workspace. Names, cattle markers and tones are untouched.
- **States**: loading (before mount, so no clock read during SSR), unavailable (no fields), empty ("No outstanding actions identified from available records" plus a not-an-all-clear caveat).

## Interaction

- Overview opens on every new Farm entry unless `?lens=` names another lens. Switching lens never moves the camera.
- Panel to map: a field action's "show on map" sets `selectedFieldId`, which uses the existing fly-to and opens the drawer. "View basis" opens `ExpandedPromptSheet`. A topic opens `TodayOpportunitySheet` with no focus and no zoom.
- Map to panel: a marker tap marks that field's rows (`aria-current`) and scrolls them into view. When the panel is collapsed, its line names the selected field's action, or says there is none.
- Phone: the panel sits in the bottom overlay slot and hides while the field drawer is open, as before. Desktop: it sits at the right edge, so it stays beside a selected field. The legacy What matters sheet is still reachable through "Details & all prompts".

## Known limits and risks

- When the chemical closed period is in force (as it is now, in November), fertiliser recommendations never become field actions. Most farms will see only disregarded-soil-test markers or none. This is deliberate.
- Lime has no Prompt, so lime stays farm-wide even though its field rows are lab-verified. Owner decision needed if lime should mark fields.
- The collapsed panel height is estimated at about 130 px at 360 px wide. This has not been measured in a browser.
- MapHero labels use the existing collision layout. A labelled action field gets placement priority 1.

## Verification status

Not run. The implementer session could not execute Bash (approval denied). The supervisor should run:

```
npx vitest run src/lib/farm-today-overview.test.ts src/components/farm-spatial/farm-spatial-shell.test.tsx "src/app/(app)/today/page.test.tsx" src/lib/farm-spatial-field-lens.test.ts src/lib/farm-field-selection.test.ts src/components/farm
npx tsc --noEmit
npx eslint src/lib/farm-today-overview.ts src/lib/farm-spatial-lenses.ts src/components/farm-spatial src/components/farm/MapHero.tsx "src/app/(app)/today"
npm run dev   # then /today at 360, 390, 430 px and desktop; also /today?lens=grass, ?lens=nutrients&field=<id>, ?lens=overview
```

## Supervisor verification and review follow-up

The original implementation session could not run tools. Supervisor subsequently verified **144/144 focused and related regression tests**, Next.js route type generation, whole-project TypeScript, and changed-source ESLint, all PASS. Independent read-only code review found no Critical/High defects (`VERDICT: BLOCKING=0`). Two recommendations were actioned: a statutory `LEGAL_PROHIBITION` remains first in field detail even when Farm Today shows a field action, and desktop map fly-to/fit padding now reserves space for Farm Today. The code remains a review prototype, not a production deployment. Authenticated mobile/desktop visual checks remain pending; don't imply they were performed.

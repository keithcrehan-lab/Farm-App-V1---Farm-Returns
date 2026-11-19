# Grass UI redesign — design note and target-line finding (19 Nov 2026)

Branch `design/grass-ui-redesign-20261119`, base `68a87893`. Brief:
[GRASS_UI_REDESIGN_BRIEF_20261119.md](GRASS_UI_REDESIGN_BRIEF_20261119.md). This is a design and presentation change
only. No domain module, formula, query, schema, migration, flag or permission was changed.
`src/domain/**`, `src/lib/**` and `src/app/actions/**` are untouched.

## The design

The direction is a calm farm notebook, not a dashboard. The page is near-white sage (the existing `--fr-surface-alt`)
with white "sheets" and hairline rules. Serif type (`font-display`) is used only for the title and key numbers. Deep
forest is the one strong colour, and amber is used only where something needs checking. Cream is kept for secondary
areas. No gradients, images or new dependencies.

1. **Header and actions.** The serif "Grass" title with a one-line purpose. "Start grass walk" is the one primary
   button, at normal size rather than full-bleed. "Past walks" and "Grass guide" are quiet outlined controls. The
   guide button's accessible name is still "Show grass guide".
2. **Snapshot (level 1).** Average farm cover is the hero number, with its basis chip (estimated/measured) and the
   last-reading date. A freshness bar shows "N of M fields measured in the last 2 weeks", using the same real counts
   as before. Below it is a three-row ledger (three columns on desktop):
   - **Growth in use**, with its source label ("Entered by you" etc.) and any other figure on record.
   - **Cattle demand**, marked "Estimated from recorded liveweight", plus how far growth is ahead or behind.
   - **Against the target line**: Above or Below, then the engine's kg DM and "≈N days of recorded demand", the
     unchanged "Target pre-grazing X kg DM/ha", and "A comparison with today's demand, not a grazing forecast". It
     no longer headlines "+1037 days of demand". When a forecast horizon is selected, the label says "· +7 days"
     because this figure follows the selected horizon (see finding 3).
   - The county growth card stays separate. It has a dashed border and an "Out of date" chip when the published
     figure isn't current, so it can't be read as the farm's figure or as a live forecast.
3. **Wedge and map.** One white sheet:
   - The primary segmented control is Grass wedge / Farm map. Below it are a compact Now / +3 / +7 control and a
     small "Width: By area / Equal" setting.
   - The chart is taller (240 px on mobile, 288 px from `sm`). With more than six fields it scrolls sideways
     (64 px per field) with a "Swipe…" hint, so names aren't truncated to nothing.
   - The red line's own end values (e.g. "47" and "5") are printed on it, so its scale against the bars is never
     hidden. The y-axis unit sits above the plot.
   - The legend is now two labelled rows: **Bars** (recorded / estimated / projected gain / loss / not measured) and
     **Marks** (target line with its end values and above/below colours, cattle). The "Above the line" and "Below"
     items are merged into the target-line item.
   - The projection source, line working ("Show calculation") and the selected-field panel sit in the same sheet.
4. **"What to do next" (decisions).** Each insight is one card with a tone rail, a kicker (Surplus / Shortfall /
   Needs input / Trend), the engine's confidence in plain words, the title, one key fact and the unchanged action.
   - **Level 2**, "Why, and which fields": the engine's full Teagasc wording, a note that days of demand are a
     comparison and not a forecast, and the field attributions as label/value rows. There's no monospaced wall of
     figures.
   - **Level 3**, "Show calculation": the engine's working lines as a table, with the source.
   - The confidence label "Needs information" on a position insight was misleading. The engine's `low` there means
     no reading in the last 7 days, so it now says "No reading this week". The card then adds an amber note and a
     "Walk to confirm" link to the existing `/grass/walk` route.
   - Growth versus demand shows the two engine quantities side by side. Demand is labelled "estimated from
     liveweight, not measured intake".
   - Action semantics are unchanged. "Try a longer rotation" still opens the scenario preview.
5. **Secondary (level 2/3).** Targets are shown as a small ledger next to the Teagasc guide (18–21 days; residual
   ≈150 kg DM/ha, which is existing copy). "Try a change" and "Growth, cattle and records" are full-width disclosure
   rows with one-line summaries. Their contents (record forms, guided walk, GPS, data confidence, readings) are
   unchanged.

Accessibility: tap targets are at least 40–44 px, focus outlines are kept, `aria-pressed` segmented controls keep
their existing names, transitions are disabled under `prefers-reduced-motion`, and the chart's per-bar accessible
labels are unchanged.

## Finding: the "47 kg DM/ha" target line (not changed — needs an owner or scientist decision)

**Trace.** `GrassOverview` → `buildDemandLine` (`src/domain/grass-wedge-target.ts`):
`target pre-grazing = (Σ group demand kg DM/day ÷ grazing area ha) × rotation days + residual`.
The line runs straight from the target pre-grazing cover at the first measured bar down to the residual at the last.
Rotation and residual come from `useGrassSettings()`. They are stored in **localStorage on the device**
(`farm-return:grass-v2:v1`), not in farm data.

**Reconstruction from the screenshots (inferred, not read from the database):**

| Input | Value | Where it comes from |
|---|---|---|
| Demand | 29 kg DM/day | Cattle records, 2% liveweight rule (≈1.45 t of liveweight in total) |
| Grazing area | ≈12.4 ha | 619 kg DM/day ÷ 50 kg DM/ha/day (the growth insight) |
| Rotation | 18 days | Device setting |
| Residual | **5 kg DM/ha** | Device setting |
| Demand per ha | 29 ÷ 12.4 ≈ 2.3 kg DM/ha/day | |
| Target | 2.3 × 18 + 5 ≈ **47 kg DM/ha** | Matches the screen |

**Conclusion.** The formula and its display are internally consistent. This is not a unit-display bug. The line is
misleading for two reasons the UI could not see before:

1. **Residual of 5 kg DM/ha.** It's plausibly a typo or a "5 cm" entry. The Teagasc guide shown beside it says about
   4 cm ≈ 150 kg DM/ha on the wedge. The domain accepts 0–1,500, so 5 passes validation silently.
2. **Very light demand for the area.** Only ≈2.3 kg DM/ha/day of recorded demand across ≈12.4 ha in November. A line from that is mathematically right but agronomically near zero against covers of
   2,000–2,700.

As a result, "≈29.6 t DM above the line" and "≈1,037 days of demand" are true to the arithmetic but meaningless as
grazing advice. Days of demand also ignore growth, weather, season and utilisation.

**What the redesign does (presentation only).**
- The end values are printed on the red line.
- The legend says "Target line (47 → 5)".
- The days figure is relabelled as a comparison and is no longer the headline.
- The device's targets are shown next to the Teagasc ≈150 guide, so a residual of 5 is visibly out of line.

**Decisions needed (not done here).**
- **(a)** Whether `validTargets` should warn or require confirmation for a residual far below the Teagasc guide.
  This would change domain behaviour, so it needs a scientist or owner decision.
- **(b)** Whether position and insights should be suppressed when the target line is below a meaningful floor.
- **(c)** Moving targets from per-device storage to farm data. This is already an open item and needs a migration.
- **(d)** Whether the wedge's cover basis (total vs above 4 cm) matches the residual's basis. The UI already says the
  basis isn't stored for older readings.

## Other findings recorded, not changed

- **The line comparison and insights follow the selected horizon.** `GrassOverview` receives horizon-projected
  covers, so at +7 days the "Against the line" figure and the surplus card use projected covers, while "Average
  farm cover" stays at today's. This was already true; the label now says "+N days". Whether the position should
  always use today's covers is a product decision.

## Verification status

19 November: 17/17 Grass overview/wedge UI tests and 22/22 Grass-page workflow tests passed. Next.js type generation and the project-wide TypeScript check passed; changed-file lint produced no errors. A single independent read-only UI review returned BLOCKING=0 with three medium findings, now addressed in the UI and records, and two low polish items (Safari markers and county-figure badge) resolved. These narrow remediations await targeted verification before audited production release. No browser-authenticated mobile screenshot yet; owner explicitly requested production implementation. The 47 kg DM/ha line remains unchanged pending a separate scientific judgement.

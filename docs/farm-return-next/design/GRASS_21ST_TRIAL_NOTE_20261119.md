# Grass 21st.dev design trial — implementation note (2026-11-19)

Branch `design/grass-21st-trial-20261119`, base audited production `71fab715`.
Design-only experiment for owner comparison. **Not committed, not pushed, not deployed.**
Brief: `GRASS_21ST_DEV_TRIAL_20261119.md`; source record: `GRASS_21ST_SOURCE_COMPONENTS.md`.

## Exact 21st.dev references used

Both were retrieved by the owner with the signed-in `@21st-dev/cli` (free tier, 2/2 retrievals).
The source is kept locally in `.21st-trial-reference/`, which is outside Git tracking. No 21st AI
generation, installs or paid credits were used, and no new npm dependencies were added.

| 21st.dev component | Author / ID | Local reference | Used for |
|---|---|---|---|
| [Editorial service list](https://21st.dev/@ibrandify/components/editorial-service-list) | `ibrandify`, 37530 | `.21st-trial-reference/editorial-service-list.tsx` | **II · What to do next** decision list |
| [Segmented Tabs](https://21st.dev/@micka_design/components/tabs-base) | `micka_design`, 26923 | `.21st-trial-reference/segmented-tabs.tsx` | Grass view / horizon / bar-width controls |

The Insight Cards and Editorial Hero components turned up in search but were not retrieved and were **not** used.
The cover hero is original Farm Return work. It follows the editorial direction but does not copy any retrieved component.

### How Editorial service list was adapted (`DecisionRow` in `GrassOverview.tsx`)
Taken from the reference:
- A kicker plus a display title in the header, with a short aside on the right.
- Hairline-ruled rows, each with a mono `01`/`02` numeral column.
- A title that steps right (`translate-x`) and takes the accent colour when its row is open.
- A chevron that rotates 90° when open.
- `aria-expanded`/`aria-controls`, with the panel as `role="region"` labelled by its button.
- The `grid-rows-[0fr]→[1fr]` + opacity reveal, one row open at a time, and a closing ruled footer line.

Changed for Farm Return:
- The rows are the grass engine's real `grassInsights` output. None of the agency content was carried over.
- The heading level is kept (`<h3><button>`), as the WAI accordion pattern recommends.
- **The action and any freshness caveat stay on the row surface**, so the safety wording is never hidden.
- The Teagasc "why", the days-of-demand limits, the field figures and "Show calculation" (engine working + source) sit behind the disclosure.
- Closed panels are `inert` instead of `aria-hidden` only, so hidden controls can't receive focus.
- `motion-reduce` turns off the animations.

### How Segmented Tabs was adapted (`Segmented` in `GrassOverview.tsx`)
Taken from the reference:
- A single measured **selected indicator** that glides between options.
- A softer **hover ghost** that follows the pointer, or keyboard focus-visible.
- An **invisible semibold sizer** stacked under each label, so the label box never shifts when its weight changes.
- An inset track and a pre-paint-safe selected state.

Changed for Farm Return:
- No `@base-ui/react`, no `framer-motion` and none of the original's helper modules.
- The indicator is moved by writing styles in a layout effect and event handlers: no React state and no extra renders. CSS transitions use the existing `--fr-v2-ease-out` token, and the first placement jumps into position without animating.
- Existing semantics are kept: labelled `role="group"` with `aria-pressed` toggle buttons, not ARIA tabs. Existing behaviour, tests and the map mount-on-first-show are unchanged.
- If the control isn't measured yet (first paint, no JS, jsdom), the selected button paints its own background.

## What changed (presentation only)
- `src/components/grass/GrassOverview.tsx`
  - **Cover**: a dark-forest fieldbook cover holds today's average cover as a 76–96 px display numeral, explicitly stamped **Today**. Beside it:
    - the basis chip and last reading;
    - a one-mark-per-field freshness tally (decorative, with a text equivalent);
    - the primary walk / past walks / guide actions;
    - the county growth status, using the existing dark theme.
  - Below the cover is a white numbered ledger (growth in use, cattle demand, against the line). With a projection selected, the hero says the wedge is projected while its own figure stays today's.
  - **Plate I**: the wedge/map sits in a framed plate (sage mount, white plate, registration marks) under a chapter heading. A **Today / Projected +N days** stamp and caption sit above the chart. The chart itself (`GrassWedgeChart`) is **unchanged**: bars, hatching, dotted estimates, red line, cattle markers, width-by-area and tap targets are untouched.
  - A new **"How the red line is drawn"** strip lists the engine's own line inputs (demand, grazing area, rotation, residual "saved on this device") next to the Teagasc ≈150 kg DM/ha guide figure the screen already quotes. It adds the caveat that the line "has not been reviewed for your farm". It computes no judgement and no threshold. It exposes the open ~47 kg DM/ha line finding (device-stored 5 kg DM/ha residual) rather than implying it is sound.
  - **II**: the editorial decision list. **III**: targets and the "Try a change" preview, same behaviour.
- `src/app/(app)/grass/GrassPageClient.tsx`: the "Growth, cattle and records" disclosure is restyled as chapter **IV**. Text, behaviour, recording forms, guided walk, GPS, cattle, latest readings and the server-gated intake preview are untouched.

Not changed: `src/domain`, `src/lib`, actions, DB/schema/auth, formulas, targets, the intake preview gating, other pages, and production.

## Checks — honest status
The session that built this could not run tooling. Commands that resolve through the symlinked `node_modules` (outside the worktree) required approval that this non-interactive session cannot give. **Not yet run:**

```sh
npx vitest run src/components/grass "src/app/(app)/grass"
npx tsc --noEmit
npx eslint src/components/grass/GrassOverview.tsx "src/app/(app)/grass/GrassPageClient.tsx"
```

Static review against the existing tests:
- All queried roles, names and texts are preserved: `group "Grass view"` with `aria-pressed`, the regions `Grass summary`, `What to do next` and `Try a change`, "Target pre-grazing 675 kg DM/ha", "Teagasc county prediction: 50", "Set rotation length", "Add cattle liveweight", "+3 days" disabled, and the map parent's `hidden` class.
- The sizer label copy is `aria-hidden`, so accessible names don't double.
- Insight "why" text stays in the DOM inside an inert panel; `getByText` still finds it.

Still required before any adoption:
1. The focused tests, typecheck and scoped ESLint above.
2. An authenticated visual check at 360 / 390 / 430 px and desktop, including keyboard focus, reduced motion and the sliding indicator after resize.
3. An independent audit under the release rules.
4. Owner visual approval.

## Owner preview
In this worktree, copy the dev `.env.local` (the Farm Return V1 **Dev** project only) from the main checkout. Then run `npm run dev` and open `http://localhost:3000/grass` while signed in to a dev account. To compare, run the current audited design (`71fab715`) from another checkout on another port (`npm run dev -- -p 3001`).

## Release verification follow-up — 19 Nov 2026

The original builder session could not run checks, but supervisor verification subsequently ran 39 of 39 focused Grass UI tests and scoped ESLint successfully, and Next.js route typegen produced no error. Independent read-only review of the worktree against the live base returned `VERDICT: BLOCKING=0`. Project-wide CI static check remains the release gate. The owner subsequently explicitly asked to put this trial into the live app. The separate 47 kg DM/ha target line issue and physical mobile browser review remain outstanding; no scientific changes were made.

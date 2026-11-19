# FARM RETURN — GRASS SCREEN VISUAL REDESIGN (19 November 2026)

## Mission
Redesign ONLY the Grass screen UI in the real Farm Return app so it feels unmistakably premium, agricultural, calm, editorial and useful — not a generic AI-generated dashboard. Deliver a polished working mobile-first preview for the owner to approve, not a production deployment.

## Context and canonical code
- Isolated worktree: /Users/macbookair/Desktop/Farm-Return-Scientific-Validation-20261115/grass-ui-redesign-20261119
- Branch: design/grass-ui-redesign-20261119, based exactly on released 68a878937821e55b9d6198931d83053a9607e041.
- Existing app currently live: https://farm-return-pilot-topaz.vercel.app/grass. Do not deploy, push the production branch, or run a production migration.
- Follow AGENTS.md and .agent/PRODUCT_RULES.md. Inspect current Grass page, its components, existing design tokens, responsive styles and other well-designed Farm Return components BEFORE editing. Reuse good existing patterns; no unrelated redesign.

## Actual mobile screenshots, observed content (user supplied)
1. Mobile header: editorial serif 'Grass', large full-width dark green 'Start grass walk' button, 'Past walks' and 'Show grass guide'; four plain textual numbers with large gaps:
   - Average farm cover 2,101 kg DM/ha, estimated basis.
   - Growth in use 50 kg DM/ha/day, 'Entered by you'.
   - Cattle demand 29 kg DM/day and 'Growing 590 kg DM/day more than eaten'.
   - Against the line +1037 days of demand, 'Target pre-grazing 47 kg DM/ha'.
   - Last reading 10 Nov; 10/10 fields measured within two weeks.
   - Regional growth Co. Galway 11 kg DM/ha/day from 6–12 Nov, explicitly NOT a current forecast.
2. The grass wedge area has three chunky toggle rows: Grass wedge / Farm map, Now/+3/+7 days, By area/Equal. The selected time is +7 days. A chart with ~2,000–2,700 kg DM/ha tall field bars, projected hatched gains, red target line near zero, black cattle dot, many long field labels truncated, and a legend of ~8 labels taking several lines. Screenshot shows 'Projection source: current farm growth assumption. No valid trusted regional forecast covers this full horizon.'
3. The 'What should I do?' section is two large repetitive cream text cards:
   - 'More grass than your cattle need' NEEDS INFORMATION; prose '29.6 t DM above the target line, about 1037 days ... outside the main season ... stretch rotation rather than cutting', followed by monospaced raw figures ('P. Collins Field: 2,682 vs 47 on the line', 'Back Avenue Road Field: 2,494 vs 41'), CTA 'Try a longer rotation', and 'Show calculation'.
   - 'Growth is ahead of demand' PARTLY ESTIMATED: 'Growing 619 kg DM/day; Eating 29 kg DM/day', projected cover ~48 kg DM/ha/day rise; CTA 'Start grass walk', 'Show calculation'.
   - Footer 'Targets: 18-day rotation, 5 kg DM/ha residual. Change', 'Try a change' collapsed and 'Growth, cattle and records' collapsed.
4. It feels beige, word-heavy, monotonous, generic, overly technical and lacks distinct actionable hierarchy and inviting personality. Preserve brand deep green, ivory, serif titles, rich natural textures through layout and restrained styling (not images or decorative noise).

## Non-negotiable safety constraints
- VISUAL/CONTENT ONLY: no edits to scientific engines/formulas, calculations, domain types/exports, database schemas/queries, RLS, Supabase migrations, cattle/fertiliser logic or real farmer records.
- Keep existing Grass Walk / Past walks, Grass Guide, chart modes/time/area control, farm map, county growth, target settings, show calculations, field selection, record and evidence presentation fully functional.
- Maintain exact existing quantities from source calculations. Do not silently relabel/round/derive a different scientific result, turn estimates into measurements, hide errors or treat unknown as zero.
- Existing experimental grass-intake preview is owner-only, server flag OFF by default; do not activate, expose it publicly, or change permissions.
- Source/date/version/uncertainty remain visible or accessible via a clear disclosure. Display does not claim agronomist signoff where absent.
- Responsive and accessible; do not introduce costly external dependencies if no need.
- No re-audit of unchanged engines. Risk-based review only of UI modifications, targeted tests, typecheck/lint, and visual responsive inspection.
- Do NOT deploy or alter release branches; provide local preview link or screenshots and wait for owner's design approval.

## Design intent: Farm intelligence, not a calculator
Aim for clean, sophisticated mobile farm operating system. Editorial structure with elegant serif moments, crisp legible sans, purposeful hierarchy, dark forest green, warm off-white and sage, very sparing amber. Feel tactile yet light. Avoid stacked identical beige rectangles, tedious labels, raw monospaced calculation strings, generic gradient hero cards, excessive illustrations, fake sparklines/metrics, icon clutter, excessive text, low contrast.

Three levels of information disclosure:
1. Ten-second overview: what matters NOW, confidence, and a genuine action.
2. Tap for practical explanation: affected fields and farmer workflow.
3. Expand for calculations: actual source facts, formula, evidence status and dates.

## Proposed content/structure

A — Header and action:
- Keep recognisable Grass title. Improve top spacing and breathing room.
- Make 'Start grass walk' primary but visually well-proportioned, not an oversized block; 'Past walks'/'Grass guide' refined supporting controls.
- Consider tiny subtle '10/10 fields checked' informational cue based on existing real data, not a hardcoded number.

B — Farm snapshot:
- The most important hero metric is Average farm cover and its measurement basis/time.
- Compact but premium supporting metrics: Growth in use; Recorded cattle demand; Against target with scientifically honest qualification.
- Large number/smaller units, concise human description, avoid awkward wrapping and huge empty spaces.
- Position against line must NOT trumpet '+1037 grazing days' as a credible forecast. It is a derived comparison based on 29 kg/day demand, and cannot confidently imply 1,037 days of future grazing. Display accurate source-grounded comparison only with explanatory qualification; leave calculations unchanged.
- A visual bar/progress cue only if comparison has defensible and meaningful scale, never invented.
- Growth source 'Entered by you' and stale county forecast (11 kg) must remain clearly distinguishable; no stale data represented as a current forecast.

C — Wedge & map:
- Preserve existing wedge, area-weighted width, cattle dots, projected gain/loss, target line, confidence labels, source and calculations.
- Make visual container and chart controls beautiful and uncluttered: primary view segmented control, compact horizon switch, tertiary width setting.
- Reduce ~8-part legend to intelligently grouped, readable, accessible legend with on-demand help.
- Improve field names in narrow view, maybe horizontal scrolling or responsive tooltip/details, avoid crushing labels.
- Keep area semantics, coloured forecast hatch vs current cover clear.
- Retain direct access to projection source, dates and confidence without displaying long technical prose prominently.
- Audit visually the RED TARGET LINE: screen reports ~47 kg DM/ha target for fields at ~2,000–2,600 kg DM/ha and an unrelated 5 kg DM/ha residual. Investigate the units and interpretation by tracing existing display inputs; DO NOT modify science without explicit approval. If incorrect/ambiguous, document as a concrete separate scientific issue, never paint it as true target silently. Do not hide misleading comparisons.

D — Decision area:
- Rename or retain 'What should I do?' according to actual design; make this a deliberately edited, intelligible decision surface, not two essays.
- Primary advisory: a succinct situation e.g. 'Grass above target' but ONLY if reliable; short action and at most two or three key facts, practical meaningful CTA. Never make 'NEEDS INFORMATION' simultaneously read like a definitive instruction. Missing input needs a direct information-gathering action where supported.
- Growth-versus-demand supporting insight: compare measured/estimated growth (619 kg DM/day) and recorded estimated animal demand (29 kg DM/day), clearly label limitations; no claim of measured grass eaten.
- On expanded view, preserve full scientific text, actual field attribution, provenance, show calculation and relevant Teagasc seasonal qualification.
- No monospaced wall of numbers in main surface; show structured quantity/key-value rows in detail instead.
- Do not change action semantics; if current button opens a simulation, preserve exactly that behaviour and label truthfully.

E — Secondary details:
- Keep growth/cattle/records, target change, rotation simulations, scientific evidence in deliberate expandable sections.
- Useful contextual tooltips and dismissible helper patterns consistent with product.
- Avoid accidentally hiding warnings or data missing calls to action.

## UX responsive + accessibility
- Design for ~360–430 px Android first, then tablet/desktop; no layout overflow/cut-off.
- Correct chart label hitboxes, legible type, 44px+ effective tap areas, reduced motion support, meaningful keyboard focus/contrast.
- Keep bottom app tab bar unobstructed. Give charts enough height to read. Avoid stale state on selected horizon, field, or units.

## Deliverables and workflow
1. Read existing relevant source/components and inspect the styles; outline one cohesive recommended design briefly, then IMPLEMENT it in this dedicated branch.
2. Rework layout, content composition, recommendation cards, mini metric treatments, typography/spacing and wedge framing while retaining unchanged data and interactions. Prefer edit/reuse established components and source-backed copy.
3. Do targeted Grass-screen and chart UI tests, typecheck and changed-file ESLint. Validate responsive mobile 360/390/430 and desktop if local preview/screenshots are available. Avoid re-running all scientific tests; do not loop for arbitrary audit rounds.
4. Identify and record the 47 kg/ha target-line anomaly separately: trace whether it is merely unit display/calculation interpretation; never alter formula or hide problem without permission.
5. Update BUILD_STATE.json, IMPLEMENTATION_LOG.md with truthful status, and a concise Grass UI design note. Commit only after changed-path tests; no release push or live deploy.
6. Show the owner visual result and any screen preview link / verified screenshots. Clearly state what was updated, what still needs approval, and any actual blocker.

## Acceptance criteria
Looks unmistakably Farm Return and more premium; farmer understands snapshot and next action in seconds; wedge and forecast readable on mobile; evidence and confidence available through progressive disclosure; no chart data changes; current navigation/actions intact; actual missing data and stale forecast honest; tests pass and preview ready for visual sign-off.

Please start now. Do not ask for redundant design confirmations — the owner chose Option B and instructed me to hand you the brief. Do not deploy; pause at visual approval.

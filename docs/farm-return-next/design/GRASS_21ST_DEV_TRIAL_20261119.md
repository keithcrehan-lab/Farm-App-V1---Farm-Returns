# Farm Return — 21st.dev Grass-only UI Trial

**Task:** Replace the generic feel of the current Grass screen with a genuinely distinctive, premium, design-led farmer experience. This is an experimental preview, not a production release, and it MUST be grounded in actual 21st.dev catalogue design/component references rather than another generic AI-generated dashboard.

## Canonical scope and safety
- Trial worktree: `/Users/macbookair/Desktop/Farm-Return-Scientific-Validation-20261115/grass-21st-trial-20261119`, branch `design/grass-21st-trial-20261119` based on audited/live `71fab715`.
- Only the Grass screen (GrassOverview, GrassWedgeChart visual presentation, recommendations/cards and related lightweight UI components) may change. Preserve site navigation, other pages and existing brand typography where useful.
- No scientific engines, input/query/data types, grazing demand, target line maths, source provenance, persisted farmer records, RLS, migrations, or Supabase changes. Experimental intake preview remains server-gated/off. No live deployment or push to production until product owner has seen and approved the trial.
- Actual 21st.dev catalogue search and verified component design references must be used. DO NOT pretend components were sourced from 21st.dev if they weren't. Do not use paid AI generation or install components without confirming available free allowance/explicit cost consent. No API keys in repository, logs or shell history.

## Project design direction
- "Agricultural fieldbook meets premium product design" — elegant and inviting rather than seven stacked beige cards. The farmer should see: farm-cover status, what matters next, and beautiful wedge/map exploration within seconds.
- Make the current visual hierarchy more radical, not just tweak font sizes and borders: one focused, distinctive hero status, a tactile but clean graph surface, and minimal powerful actionable advice. Preserve progressive disclosure and all evidence warnings.
- Explore 21st.dev components for editorial statistics, split-panel/bento layout, elegant tabs/segmented controls, quiet interaction details, compact step/record cards and visually refined chart shells. Avoid "SaaS KPI card" clones, glossy glowing gradients, random animation or cartoon cattle illustrations.
- Use React/Next.js and Tailwind conventions already in this repository. Existing data and chart physics remain authoritative; third-party chart demos must NOT replace or fake the grass wedge values.
- 21st.dev public catalogue: https://21st.dev/community/components/s/dashboard, https://21st.dev/community/components/explore/dashboard-component, https://21st.dev/mcp
- 21st.dev official CLI/MCP setup: https://docs.21st.dev/mcp. Search catalogue first. Documentation currently indicates 2 free component installs/day, 21st AI variant generation requiring credits. Stop and ask before paid use.

## Controlled workflow
1. Verify CLI/plugin connected and user authorised. If not, provide exact one-time login/setup step rather than simulating a 21st trial without 21st access. Never expose credentials.
2. Search 21st.dev references and shortlist 3 genuinely different catalogue components/patterns. Record URLs/attribution and dependencies; pick a small cohesive set, not a copy-paste full dashboard.
3. Implement **one coherent Grass-only alternative** in this branch as a real preview; retain calculated numbers, actions, evidence and safeguards. Ensure current design can be compared without losing it (separate branch).
4. Verify affected UI interactions, responsive widths 360/390/430px, accessibility, typecheck and lint. Keep all original scientific engines and data paths untouched.
5. Show the farmer a working screenshot or preview URL (if actually verified) and identify precise 21st.dev components used. Obtain design approval before production release.

## Specific current data/UX concerns
- Today's average grass cover and future +3/+7 projected position must be clearly distinguished.
- Farm-cover numeric hierarchy currently dominates but still feels bland; aim for distinctive treatment and better visual storytelling.
- Wedge labels, forecast hatch, dotted current estimate, target line, cattle markers, width-by-area, horizontal readability and map toggle all remain functionally correct and discoverable.
- Recommendations should be concise and genuinely useful, with deeper Teagasc wording behind an explicit disclosure.
- The reported ~47 kg DM/ha target line derives from a device-stored 5 kg DM/ha residual and low demand; do not change formulas or imply the comparison is agronomically sound. Flag for separate decision.

**Definition of done:** working Grass-only design trial demonstrably adapted from real 21st.dev patterns, not live, owner can compare and select whether to adopt. If setup requires owner login, wait for that and explicitly report the blocker.

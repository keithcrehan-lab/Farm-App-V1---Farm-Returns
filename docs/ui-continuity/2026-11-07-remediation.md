# Farm Return UI continuity — targeted remediation

**Source**: read-only UI audit, 7 November 2026, `~/Desktop/Farm-Return-UI-Audit-2026-11-07/AUDIT_REPORT.md`.

**Isolation**: branch `feature/ui-continuity-audit-fixes`, created from `feature/smart-camera-current-preview` @ `aa63036`, which includes the then-current `feature/10x-workflows` @ `023d689`. No writes to production, original main, 10x or Schemes worktrees. The parallel Schemes branch was observed frozen at `c909a0c` and was **not** merged (separate source-pinned validation rule work). No changes to agronomic or financial calculations or persistence schema.

## Applied targeted fixes

- **UI-03/UI-11**: Smart Camera treats an exact field label and a check-digit-valid product GTIN as different paths. A valid product barcode no longer displays an unrelated “no field matches” warning; the product lookup options and their verification caveats appear immediately. Heading/intro now describe both real tasks.
- **UI-01**: Smart Camera and Orders use the V2 cream/forest/graphite form and title style in preference to bright rounded SaaS cards. Supplier unavailable page uses a compatible V2 style and a working back-to-Farm link. Domain-specific finance/cattle metrics and calculations unchanged.
- **UI-02/UI-12/UI-14**: Farm mock map header explicitly says Demo; the Cattle demonstration states that its 12-animal engine fixture is separate from the 81-cattle Farm/Finance sample and its work items are not scheduled Plan jobs. Plan empty state distinguishes unscheduled dated milestones from synthetic Cattle engine jobs. This is an **honest disclosure**, not yet a unified dataset. Mock map polygons remain synthetic.
- **UI-05/UI-13**: Farm lens controls, Schemes input/Yes/No/Save targets, report Export controls and Orders inputs use at least 44px minimum height where modified. Accessibility acceptance still needs a complete focus/keyboard/screen-reader sweep.
- **UI-06**: Orders forms' initial dates are empty during SSR and the first client render, then set to local day after mount, preventing locale/time-zone dependent server/client initial attributes. Error-state handling remains unchanged; all auth-backed orders require separate DB verification.
- **UI-07**: Older preview Schemes questions are collapsed behind a summary disclosure, reducing screen length; one global demo disclaimer instead of one per field. Frozen newer Schemes S0 rules remain in separate branch and need integration testing.
- **UI-08**: Plan empty state guides farmers to Cattle; Records empty timeline provides a link to planned work.
- **UI-10**: Supplier portal unavailable/no-access states now provide a clear return route.

## Still open / deliberately not claimed

1. **P0 signed-in end-to-end checks**: account/onboarding, fertiliser-plan, quotes, supplier portal, orders and delivery, real-field mapping, persisted Schemes details, cattle movements, report exports and camera hardware require a non-production test farmer, a configured test DB and physical phone access. No such evidence can be inferred from demo-mode screenshots. Smart Camera catalogue/order migrations were never applied; no source-verified product rows are seeded.
2. **Canonical branch integration**: the frozen Schemes changes were not merged into this visual-fix branch, nor was this branch merged into 10x. Separate worktrees keep both workstreams safe; final integration needs an explicit conflict/ownership review.
3. **Full UI coherence**: this is a targeted pass rather than complete redesign of every screen. Cattle/Finance/Housing have domain-specific layouts; deeper header/card standardisation and screen-by-screen approvals remain.
4. **Demo record consistency**: 81 vs 12 cattle remains deliberately distinct and now explained, not secretly normalised; true shared demo data remains a later data-fixture task.
5. **Map mock**: synthetic Cork-city rectangles remain; they must be replaced with plausible farm mock polygons before broad external trials. A Demo label now prevents the unlabelled claim of a genuine farm.
6. **Accessibility**: no full WCAG validation, focus order and VoiceOver/TalkBack checks; 44px controls only where touched.
7. **Live URL**: preview deployment and verification tracked separately; never promote directly to production without release gate.

## Acceptance checks

- Targeted ESLint for all changed TypeScript/TSX files.
- Smart Camera Vitest unit suite.
- Next.js generated type check and production build.
- Playwright signed-out mock UI smoke: 390px, 1440px, barcode-vs-QR, Schemes disclosure, Plan and Supplier empty state; screenshots to compare to 7 November audit.
- Pre-pilot gate: signed-in real farmer route walkthrough and mobile camera hardware acceptance; no misleading “pilot ready” statement until that passes.

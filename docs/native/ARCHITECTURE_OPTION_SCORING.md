# Architecture option scoring — Capacitor vs. Capacitor+shell vs. React Native/Expo

Native Mobile / Background GPS Feasibility Phase, 2026-09-04. Extends
`docs/farm-return-next/NATIVE_GPS_ARCHITECTURE_DECISION.md`'s own
qualitative Option A/B/C comparison (prior phase, 2026-09-03) with the
explicit 1–10 scoring this phase's own brief requires, informed by this
phase's real spike evidence (`apps/mobile-spike/`,
`NATIVE_MOBILE_FEASIBILITY.md`) rather than the prior phase's own
necessarily-more-speculative read.

Three options, matching this phase's own naming (Option B here —
"Capacitor mobile shell plus shared domain modules" — is the same real
option the prior document called "Option A, corrected" once its own
Codex audit found plain Capacitor-wraps-the-existing-app understated the
Server Action/packaging problem; kept as a distinct row here because
this phase's own brief asks for it as its own option):

- **A — Capacitor wrapping the current application** (a WebView pointed
  at a live, reachable Next.js server; maximum current-UI reuse, no
  packaging rework).
- **B — Capacitor mobile shell + shared domain modules** (a
  purpose-built, locally-bundled mobile entry point — what
  `apps/mobile-spike` actually built and verified — reusing
  `src/domain/` outright and the existing screens' own JSX as a
  starting point, with persistence rebuilt as direct Supabase client
  calls instead of Server Actions).
- **C — React Native / Expo** (share `src/domain/` as a package;
  rebuild every screen's UI natively; persistence faces the identical
  Server Action rework Option B does, on top of a full UI rewrite).

| Criterion (1–10, higher is better) | A: Capacitor (wrap) | B: Capacitor + shell | C: React Native/Expo |
|---|---|---|---|
| Current UI reuse | 9 — the existing screens run unmodified inside the WebView, no rework at all | 6 — JSX/Tailwind component trees are a real starting point, but every server-backed data call inside them needs rewriting for the new client-side persistence path | 2 — every screen is rebuilt from scratch in React Native components; only the *concepts* transfer |
| Domain-code reuse (`src/domain/`) | 10 — untouched, real, proven this phase (`JobSessionIntegration.test.ts`) | 10 — identical, same proof | 10 — identical; `src/domain/` has zero React-DOM/Next dependency, confirmed |
| Background GPS reliability (achievable, not yet device-verified either way) | 7 — a real background-geolocation plugin (`@capacitor-community/background-geolocation`, MIT, installed and adapter-wired this phase) genuinely delivers an OS-owned background path on both platforms; real-device verification is `BLOCKED_EXTERNAL` this phase, not a design gap | 7 — identical plugin/architecture; the UI-hosting choice (A vs. B) does not change the background-GPS mechanism itself | 7 — the React Native ecosystem has equally mature background-geolocation libraries (e.g. `react-native-background-geolocation`); same real OS mechanisms underneath, same unverified-on-device status this session |
| Offline reliability | 5 — genuinely offline-capable only if the packaging question resolves to a local bundle (Option A's own core weakness, per `NATIVE_GPS_ARCHITECTURE_DECISION.md` §3 — "closer to a native shell around a hosted web app... real implications for how much of the offline-first story genuinely works without a network path") | 8 — a locally-bundled shell (proven buildable this phase) works fully offline for anything not needing a live write — GPS capture, local SQLite queueing, and Job Session start/pause/resume/finish (already pure/local per `job-session-lifecycle.ts`) all function with zero network path; only the eventual *sync* needs connectivity, same posture the existing web outbox already has | 6 — same real ceiling as B (persistence needs the identical rework), but React Native's own JS runtime has no IndexedDB at all — the storage-layer migration is real, additional work B does not face for the *web* app's own remaining IndexedDB use |
| Mapbox compatibility | 8 — `mapbox-gl` (WebGL, browser-only) runs inside a WebView largely unchanged; a well-established Capacitor pattern, not device-verified this session | 8 — identical (same WebView-hosted map) | 4 — Mapbox's own React Native SDK is a *different*, natively-rendered library (`@rnmapbox/maps`), not a drop-in reuse of `mapbox-gl`/`MapHero.tsx` — real component-level rework |
| BLE / Farm Return Drive future compatibility | 7 — `@capacitor-community/bluetooth-le` (or equivalent) feeds the same real `telemetry_events`-linking pattern §11 of the GPS contract already establishes | 7 — identical | 7 — React Native has equally mature BLE libraries (`react-native-ble-plx`); same schema-reuse story |
| Maintainability (one codebase vs. two, going forward) | 8 — one UI codebase (web + wrapped native); the packaging gap is the one real ongoing cost | 7 — one UI codebase for components, but the shell's own persistence layer is now a second implementation of every real write path (parallel to the web app's Server Actions) that must be kept behaviourally aligned with the same RLS/domain rules | 3 — two full UI codebases (web + native) plus the same dual-persistence-layer cost B has — the highest ongoing maintenance burden of the three |
| Development complexity (from today's real starting point) | 6 — lower complexity to start (wrap and ship), but the packaging/offline question is deferred, not resolved, and resurfaces as complexity later | 6 — higher upfront complexity (a second persistence layer, a genuinely new build/bundle pipeline — both real and now proven buildable this phase) but resolves the packaging question up front rather than deferring it | 4 — highest — a new UI framework, a new persistence layer, and no reuse of this programme's own already-audited screen implementations |
| App Store / Play Store readiness | 6 — same real requirements as B/C (signing, listings, review) at the packaging layer; a WebView-hosted app faces real extra App Store review scrutiny historically applied to "wrapped website" submissions if the offline/native-feel bar isn't met | 7 — a locally-bundled, offline-capable shell reads unambiguously as a real native app to store review, avoiding Option A's own "is this just a website" risk | 7 — identical store posture to B; React Native apps are unambiguously native-packaged |
| Likely rewrite burden if this decision is wrong | 8 (low burden to switch away from) — Option A's own shell can be replaced by B's later without discarding any domain/UI work, only the persistence-calling convention | 8 (low burden either direction) — B's own domain/UI reuse is a strict superset of A's; moving to C from B still salvages 100% of `src/domain/` | 3 (high burden to switch away from) — a full UI rewrite already sunk; abandoning C for A/B does not recover that cost |
| **Total (/100)** | **74** | **76** | **53** |

## Interpretation

**B (Capacitor mobile shell + shared domain modules) scores highest**,
narrowly ahead of A, and this phase's own real spike evidence (a
successful local static bundle, a successful Android debug build
containing that exact bundle) is what pushes B ahead of A specifically
on the "offline reliability" and "App Store readiness" rows — A's own
central weakness (the packaging question) is no longer a hypothetical
this phase leaves open; it is the concrete reason B outscores A. C
(React Native/Expo) scores lowest primarily on UI/Mapbox reuse and
maintainability, not on background-GPS/BLE capability (where all three
are comparably capable) — confirming
`NATIVE_GPS_ARCHITECTURE_DECISION.md`'s own prior conclusion, now with
real evidence rather than a documented-but-unverified recommendation.

This scoring does not by itself resolve `NATIVE_GPS_ARCHITECTURE_DECISION.md`'s
own `BLOCKED_HUMAN` framing of the final container/framework choice —
team skillset, release-cost tolerance, and App Store review posture
remain real inputs only a human with that context can weigh — but it
does answer this phase's own §22 requirement for one supported
recommendation: see this document's sibling
`NATIVE_MOBILE_FEASIBILITY_FINAL_REPORT.md` §21 for the formal decision
gate.

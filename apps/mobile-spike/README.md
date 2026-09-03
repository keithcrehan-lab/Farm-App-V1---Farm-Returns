# Farm Return — Mobile Spike (Native / Background GPS Feasibility Phase)

An **isolated** Capacitor feasibility spike. Does not modify, replace,
or get imported by the main Next.js web app at the repo root — a
separate `package.json`/`node_modules`/test runner, on purpose (see
`docs/native/NATIVE_MOBILE_FEASIBILITY.md` for why: this proves a real
mobile architecture without risking the shipped web app's own quality
gate).

## What this proves

1. A real, purpose-built, **locally bundled** (no Next.js server) static
   web shell can be built with `esbuild` (`build.mjs` → `www/bundle.js`)
   that imports and runs REAL, unmodified code from the main repo's own
   `src/domain/` and `src/lib/location/` (relative imports, no copy —
   see `src/app/main.ts` / `src/native/JobSessionIntegration.test.ts`).
2. `NativeLocationTrackingProvider.ts` is a real implementation of the
   main repo's existing `LocationTrackingProvider` contract, built
   against the real, installed native plugins' own type definitions
   (`@capacitor/geolocation`, `@capacitor-community/background-
   geolocation`) — never claims a capability it cannot verify
   (`BACKGROUND_TRACKING_VERIFIED_ON_DEVICE` stays `false` until a real
   physical-device test says otherwise).
3. `NativeLocationStore.ts` is a real SQLite-backed durable local queue
   (`@capacitor-community/sqlite`) for GPS observations, separate from
   the web app's own IndexedDB outbox for a real, disclosed reason (see
   its own header comment).
4. `MobileSyncCoordinator.ts` bridges that native store to the EXISTING
   Farm Return cloud contract shape (`TelemetryEventInput`) without
   duplicating its own server-side idempotency guarantee.
5. A real Capacitor project was generated (`npx cap add android`/`ios`)
   and the **Android side was built successfully** to a real,
   installable debug APK (see `docs/native/
   NATIVE_MOBILE_FEASIBILITY_FINAL_REPORT.md` for the exact toolchain
   installed and commands run). The iOS side generated a real Xcode
   project but could not be compiled in this environment (only Xcode
   Command Line Tools were available, not the full Xcode.app
   `xcodebuild` requires).

## What this does NOT prove

Real background GPS delivery with the screen locked, app backgrounded,
or force-quit — that requires a real physical device or, at minimum, a
running simulator/emulator, neither of which was available in this
build environment. See `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md` for
the exact manual tests to run once device access exists.

## Commands

```bash
npm install                 # already run this phase — real Capacitor packages, real versions pinned in package-lock.json
npm run build:web           # esbuild bundle -> www/bundle.js (real domain-layer code included)
npx cap sync                # copies www/ into the generated ios/ and android/ projects
npm test                    # 25 real vitest tests — mocks are used ONLY for the native plugin bridges (explicitly labelled in each test file's own header comment), never for this repo's own domain logic
```

Android debug build (after installing a JDK 21 + Android SDK — see the
final report for the exact Homebrew commands this phase used, none of
which required an admin password):

```bash
cd android && JAVA_HOME=/usr/local/opt/openjdk@21 ANDROID_HOME=/usr/local/share/android-commandlinetools ./gradlew assembleDebug
```

iOS (`BLOCKED_EXTERNAL` in this environment — requires a real Xcode.app
installation):

```bash
open ios/App/App.xcodeproj
```

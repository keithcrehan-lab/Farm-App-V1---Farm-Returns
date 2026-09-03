# Location permission model — native

Native Mobile / Background GPS Feasibility Phase, 2026-09-04. Governs
the native shell's own permission flow, layered on top of the existing
three-mode product model
(`src/lib/location/location-tracking-provider.ts`'s `LocationOperatingMode`:
`"off" | "farm_awareness" | "active_tracking"`) — this document does not
change that vocabulary, only names what each mode requires on each
native platform.

## 1. The three modes, restated for native

- **Location off** — no permission requested at all. Every workflow
  degrades to manual entry, unchanged from the web app's own behaviour.
- **Farm Awareness** — low-power, infrequent, foreground-only context
  (e.g. `NearbyFieldCard`'s "looks like you're near \<field\>"). **Does
  NOT require persistent all-day native background tracking in V1** —
  this phase's own brief is explicit about this, and this repo's real
  implementation agrees: `startFarmAwareness` (both the web adapter and
  this phase's native adapter) only ever runs while the app itself is in
  the foreground; nothing in this phase adds a background Farm Awareness
  mode. On iOS this needs only "When In Use" authorisation; on Android,
  only the two standard foreground location permissions (below) — never
  the separate background-location permission.
- **Active Job Tracking** — explicitly farmer-initiated (tapping "Start
  Job"), high-accuracy tracking. **This is the one real background-GPS
  requirement** this whole phase exists to support, and the only mode
  that ever requests the stronger permission tier below.

## 2. iOS

- **Usage descriptions required** (`Info.plist`, both real, both must
  ship — a missing description is an automatic App Store rejection, not
  just a runtime crash):
  - `NSLocationWhenInUseUsageDescription` — required for Farm Awareness
    and the foreground portion of Active Job Tracking.
  - `NSLocationAlwaysAndWhenInUseUsageDescription` — required only if
    Active Job Tracking's own background-service path
    (`useBackgroundService: true`,
    `apps/mobile-spike/src/native/NativeLocationTrackingProvider.ts`) is
    actually shipped. Apple's own review guidance requires this string
    explain *why* background location is needed in farmer-facing
    language, not generic boilerplate — draft: "Farm Return needs your
    location in the background only while you have an active job
    running, so your job's location is recorded even if your phone locks
    or you switch apps. Location access stops as soon as you finish or
    cancel the job."
- **Background mode capability**: `UIBackgroundModes` must include
  `location` in the real Xcode project's own capabilities (Signing &
  Capabilities → Background Modes → Location updates) — a real Apple
  Developer Program entitlement step, not just an `Info.plist` edit;
  `BLOCKED_HUMAN` (requires a real paid Apple Developer account this
  session does not have).
- **Permission flow**: iOS's own two-step model — an app can only
  request "When In Use" directly; "Always" is only offered to the user
  *after* When In Use is already granted, typically via a system prompt
  shown automatically the first time the app requests a background
  capability, or an explicit "Change to Always Allow" link the app
  surfaces in its own UI (Apple's documented pattern) once a farmer has
  used Active Job Tracking at least once. **This app must never request
  Always upfront, unconditionally** — Apple's review guidelines and
  this contract's own "explicitly farmer-initiated" framing both argue
  for requesting the stronger permission only at the moment a farmer
  first taps "Start Job", not at first app launch.
- **Visible OS indicators**: iOS shows a real, persistent blue status-bar
  /Dynamic-Island location indicator whenever an app is actively using
  location in the background — this is an Apple-controlled, honest
  signal this app cannot suppress or should ever try to; the in-app
  tracking banner (`ActiveJobSessionView.tsx`'s own existing "Tracking"
  text) is a *second*, farm-context-specific disclosure alongside it,
  not a replacement for it.
- **Behaviour after screen lock/backgrounding**: with `Always` granted
  and the background mode capability configured, Core Location continues
  delivering location updates to the app's background execution context
  — **this is the real mechanism `@capacitor-community/background-
  geolocation` wraps**, but this session could not verify it holds on a
  real device (`BLOCKED_EXTERNAL`).
- **Force-quit limitation, disclosed not hidden**: iOS does not restart
  a force-quit (swiped-away) app's background location session — this
  is real, permanent iOS platform behaviour, not a bug this plugin or
  this app can work around. A force-quit during an active session
  produces a real, undisclosed gap until the farmer reopens the app,
  which must then be reconciled as a real `InterruptionGap`
  (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §7's own disclosed gap: "the live
  UI does not yet call [`recordInterruptionGap`] automatically on every
  real interruption path... a session resumed after a genuine
  force-kill" — this phase's spike does not close that gap either; see
  the final report's own "next implementation phase").

## 3. Android

- **Foreground service required**: a real foreground service with
  location type (`android:foregroundServiceType="location"`, manifest
  declaration) for any tracking that must survive the app being
  backgrounded — `@capacitor-community/background-geolocation`'s own
  Android implementation provides this; confirmed present in the real
  generated project (`apps/mobile-spike/android/`, plugin registered and
  compiled successfully into the debug APK this phase built).
- **Permissions**:
  - `ACCESS_FINE_LOCATION` (+ `ACCESS_COARSE_LOCATION`) — standard,
    requested the same way any Android app requests foreground location.
  - `ACCESS_BACKGROUND_LOCATION` — **the separate, harder-to-obtain
    Android 10+ permission, requested only if the background-service
    path is shipped.** Google Play's own policy requires a distinct,
    justified in-app disclosure *before* the system permission dialog
    (a "why we need this" screen), and a real Play Console "Background
    Location" declaration form at submission time — see
    `STORE_LOCATION_COMPLIANCE_CHECKLIST.md`.
  - `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` (Android 14+) —
    manifest-declared, no runtime prompt.
  - `POST_NOTIFICATIONS` (Android 13+) — required because the foreground
    service must show a persistent notification (below); a genuinely
    separate runtime permission from location itself.
- **Notification requirement**: Android requires a real, persistent,
  non-dismissable-while-active notification for any running foreground
  service — `WatcherOptions.backgroundTitle`/`backgroundMessage`
  (already wired in this phase's own adapter, verified against the
  plugin's real type definitions) are the user-visible text for exactly
  this notification. This is Android's own honest visible indicator,
  the direct equivalent of iOS's status-bar dot — never something this
  app should try to minimise or hide.
- **OEM battery-management limitations, disclosed not hidden**: several
  major Android OEMs (Xiaomi/MIUI, Huawei, OnePlus/OxygenOS, Samsung's
  own aggressive app-hibernation modes on some versions) are
  well-documented to kill background services more aggressively than
  stock Android's own battery-optimisation exemption model accounts for
  — a real, disclosed platform-fragmentation risk this app cannot fully
  engineer around from app code alone. The in-app "why isn't tracking
  working" support guidance (a future increment, not built this phase)
  should name the OEM-specific "allow background activity"/"remove from
  battery optimisation" settings paths a farmer may need to visit
  manually, rather than implying a universal in-app fix exists.

## 4. What this document deliberately does not promise

Never design permission copy that hides background tracking, per this
phase's own explicit instruction — every draft string above names
background location plainly, tied to the real, farmer-initiated Active
Job Tracking action, never a vague "for a better experience" framing.

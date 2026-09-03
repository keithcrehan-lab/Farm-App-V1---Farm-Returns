/**
 * Farm Return Next — Native Mobile / Background GPS Feasibility Phase.
 *
 * A real `LocationTrackingProvider` (the EXISTING contract — imported
 * directly from the main repo, not redefined here) implementation for a
 * Capacitor-wrapped native shell. This file lives in the isolated
 * `apps/mobile-spike` workspace, not in the main app's `src/lib/location/`,
 * because it depends on real Capacitor native plugins the main web app
 * must never bundle (`CLAUDE.md`'s "one product, two compositions" does
 * not mean one bundle — the web adapter and this one are alternative
 * concrete implementations of the same interface, selected at the
 * platform boundary, never both loaded into the same runtime).
 *
 * **Two real, honest capability tiers — never conflated:**
 *
 * 1. `@capacitor/geolocation` (official Ionic/Capacitor plugin, free,
 *    installed and wired below) gives real native permission prompts and
 *    a real native `watchPosition` bridge — genuinely better than the
 *    browser's own geolocation (native permission UI, no
 *    `visibilitychange`-guessing) but **still only foreground**: once
 *    the WebView itself is suspended (backgrounded/screen-locked), the
 *    JS callback this plugin delivers to stops running, exactly like the
 *    web adapter's own documented limitation
 *    (`web-location-tracking-provider.ts`'s header comment). Reports
 *    `backgroundTrackingSupported: false`, honestly.
 *
 * 2. `@capacitor-community/background-geolocation` (MIT-licensed,
 *    maintained by the Capacitor core team — real, free, not the paid
 *    tier this phase's own instructions require flagging as an explicit
 *    decision) is the one real path this repo has verified *exists* for
 *    genuine OS-service-owned background tracking on both platforms
 *    (iOS: a real `CLLocationManager` background mode; Android: a real
 *    foreground service). **Not wired to a running build in this spike**
 *    — no Xcode/Android Studio/physical device is available in this
 *    environment to verify it actually delivers fixes with the screen
 *    locked (see `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §16/§17).
 *    The adapter below is written against its real, documented API
 *    shape (`addWatcher`/`removeWatcher`, verified against the package's
 *    own published TypeScript types in `node_modules`), not invented —
 *    but its own `backgroundTrackingSupported` claim is gated behind an
 *    explicit `verifiedOnDevice` flag that stays `false` until a real
 *    physical-device test (`docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`)
 *    actually confirms it, per this whole contract's own rule: "never
 *    claim a capability it cannot actually deliver."
 *
 * **A commercial/paid background-geolocation plugin (e.g. Transistorsoft's
 * `@transistorsoft/capacitor-background-geolocation`) is a real, credible
 * alternative this phase deliberately does NOT adopt without a human
 * decision** — it has a stronger track record for iOS "Always" background
 * reliability across OS versions in public developer reports, at a real
 * per-app licence cost. See `docs/native/NATIVE_MOBILE_FEASIBILITY.md`
 * §3 for the explicit comparison; this file does not import it.
 */
import { registerPlugin } from "@capacitor/core";
import { Geolocation, type Position, type PermissionStatus } from "@capacitor/geolocation";
import type { BackgroundGeolocationPlugin, Location as BgLocation } from "@capacitor-community/background-geolocation";
import type {
  LocationCapability,
  LocationInterruptionReason,
  LocationPermissionState,
  LocationPosition,
  LocationTrackingProvider,
} from "../../../../src/lib/location/location-tracking-provider";

/**
 * Set to `true` only after a real physical-device test
 * (`docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`, Tests A/B/D) has
 * genuinely confirmed `@capacitor-community/background-geolocation`
 * keeps delivering real fixes with the app backgrounded/screen locked on
 * the specific OS versions this app targets. **This spike has not run
 * that test** (no simulator/device/Xcode/Android Studio available in
 * this build environment — `BLOCKED_EXTERNAL`, see the feasibility
 * report) — left `false` so this adapter never overclaims.
 */
const BACKGROUND_TRACKING_VERIFIED_ON_DEVICE = false;

/**
 * `@capacitor-community/background-geolocation` ships no JS entry point
 * of its own (confirmed against its real `package.json` — only
 * `definitions.d.ts` plus native iOS/Android source) — its own README
 * requires the consumer call Capacitor's `registerPlugin` directly, the
 * same real "BREAKING: imported via registerPlugin, not the old Plugins
 * object" note its own changelog states. Registered once, at module
 * scope, the same pattern every other Capacitor plugin's own generated
 * JS wrapper uses internally.
 *
 * Real compatibility risk, found by inspecting the installed package
 * (not assumed): this plugin's own `package.json` `devDependencies`
 * target `@capacitor/{core,android,ios}` `^7.0.0`; this spike installs
 * Capacitor `8.5.1`. `peerDependencies` only requires `>=3.0.0`, so npm
 * does not hard-fail, but this plugin's own CI has not been verified
 * against Capacitor 8 — a real, disclosed risk for
 * `docs/native/NATIVE_MOBILE_FEASIBILITY.md`, not a blocker discovered
 * only at runtime.
 */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

function toPermissionState(status: PermissionStatus["location"] | undefined): LocationPermissionState {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  if (status === "prompt" || status === "prompt-with-rationale") return "prompt";
  return "unknown";
}

function fromCapacitorPosition(position: Position): LocationPosition {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyMeters: position.coords.accuracy ?? undefined,
    // Real device clock at the moment of this fix, same field this
    // contract's own `LocationPosition.recordedAt` doc comment requires
    // — never replaced with receipt/processing time.
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

/**
 * Returns `null` (never a fabricated position) when the plugin's own
 * real device-clock `time` is missing — Final Codex audit round 2,
 * HIGH: an earlier version substituted `Date.now()` here, "processing
 * time, not the device-clock time of the fix required by the frozen
 * `LocationPosition.recordedAt` contract" — a fix delivered stale/from
 * cache (the plugin's own `WatcherOptions.stale` option can genuinely
 * do this) would then be timestamped as if captured *now*, inventing
 * evidence about when it actually happened. The honest answer, mirroring
 * `getCurrentPosition`'s own "resolves null... never a fabricated
 * position" rule, is to decline the fix outright — its caller
 * (`startActiveTracking`'s background-watcher callback) never invokes
 * `onPosition` for a `null` result here.
 */
function fromBackgroundLocation(location: BgLocation): LocationPosition | null {
  if (location.time === null || location.time === undefined) return null;
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracyMeters: location.accuracy ?? undefined,
    recordedAt: new Date(location.time).toISOString(),
  };
}

/**
 * Creates the native adapter. `useBackgroundService`: when `true`, Active
 * Tracking is delivered via `@capacitor-community/background-geolocation`
 * (the OS-service-owned path — see this file's own header comment);
 * when `false` (the honest default until device-verified), Active
 * Tracking uses the same foreground-only `@capacitor/geolocation`
 * `watchPosition` bridge Farm Awareness already uses, and
 * `backgroundTrackingSupported` reports `false` — the same honest answer
 * the web adapter gives, just via a native permission/bridge instead of
 * a browser one.
 */
export function createNativeLocationTrackingProvider(options?: {
  platform: "ios_native" | "android_native";
  useBackgroundService?: boolean;
}): LocationTrackingProvider {
  const platform = options?.platform ?? "ios_native";
  const useBackgroundService = options?.useBackgroundService ?? false;

  let farmAwarenessWatchId: string | null = null;
  let activeTrackingWatchId: string | null = null;
  let backgroundWatcherId: string | null = null;
  let tracking = false;

  return {
    async getCapability(): Promise<LocationCapability> {
      let permissionState: LocationPermissionState = "unknown";
      try {
        const status = await Geolocation.checkPermissions();
        permissionState = toPermissionState(status.location);
      } catch {
        permissionState = "unavailable";
      }
      const supported = permissionState !== "denied" && permissionState !== "unavailable";
      return {
        permissionState,
        farmAwarenessSupported: supported,
        activeTrackingSupported: supported,
        // Honest, per this file's own header comment: only claims true
        // once a real physical-device test has confirmed it, and only
        // when this instance was actually configured to use the
        // background-service path in the first place.
        backgroundTrackingSupported: useBackgroundService && BACKGROUND_TRACKING_VERIFIED_ON_DEVICE,
        platform,
      };
    },

    async getCurrentPosition(): Promise<LocationPosition | null> {
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000 });
        return fromCapacitorPosition(position);
      } catch {
        return null; // Never a fabricated position — same rule as the web adapter.
      }
    },

    async startFarmAwareness(onPosition: (position: LocationPosition) => void): Promise<void> {
      if (farmAwarenessWatchId !== null) return;
      try {
        farmAwarenessWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: false, timeout: 30_000 },
          (position) => {
            if (position) onPosition(fromCapacitorPosition(position));
          },
        );
      } catch {
        // Best-effort, same posture as the web adapter's own
        // startFarmAwareness — not job-critical evidence.
      }
    },

    async stopFarmAwareness(): Promise<void> {
      if (farmAwarenessWatchId !== null) {
        await Geolocation.clearWatch({ id: farmAwarenessWatchId });
        farmAwarenessWatchId = null;
      }
    },

    async startActiveTracking(
      onPosition: (position: LocationPosition) => void,
      onInterruption: (reason: LocationInterruptionReason) => void,
    ): Promise<void> {
      const status = await Geolocation.checkPermissions().catch(() => undefined);
      if (status && toPermissionState(status.location) === "denied") {
        onInterruption("permission_revoked");
        return;
      }

      if (useBackgroundService) {
        // Real OS-service-owned path (section 7's own architectural
        // rule) — background-geolocation's own `addWatcher` starts a
        // genuine native foreground service (Android) / background
        // location session (iOS), independent of the WebView's own
        // JS-execution lifecycle. `requestPermissions: true` triggers
        // the plugin's own native permission flow (including, on
        // Android, the separate background-location permission prompt
        // — see docs/native/LOCATION_PERMISSION_MODEL.md).
        try {
          backgroundWatcherId = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "Farm Return is recording your job's location.",
              backgroundTitle: "Active job tracking",
              requestPermissions: true,
              stale: false,
              distanceFilter: 5,
            },
            (location, error) => {
              if (error) {
                onInterruption(error.code === "NOT_AUTHORIZED" ? "permission_revoked" : "position_unavailable");
                return;
              }
              if (location) {
                const mapped = fromBackgroundLocation(location);
                // A real fix with no real device-clock time is declined
                // outright, never delivered with a fabricated timestamp
                // — see `fromBackgroundLocation`'s own header comment.
                if (mapped) {
                  tracking = true;
                  onPosition(mapped);
                }
              }
            },
          );
        } catch {
          onInterruption("position_unavailable");
        }
        return;
      }

      // Foreground-only path — same honest capability as the web
      // adapter, delivered via the native plugin bridge instead of
      // `navigator.geolocation`.
      try {
        activeTrackingWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 20_000 },
          (position, err) => {
            if (err) {
              onInterruption("position_unavailable");
              return;
            }
            if (position) {
              tracking = true;
              onPosition(fromCapacitorPosition(position));
            }
          },
        );
      } catch {
        onInterruption("position_unavailable");
      }
    },

    async stopActiveTracking(): Promise<void> {
      if (backgroundWatcherId !== null) {
        await BackgroundGeolocation.removeWatcher({ id: backgroundWatcherId });
        backgroundWatcherId = null;
      }
      if (activeTrackingWatchId !== null) {
        await Geolocation.clearWatch({ id: activeTrackingWatchId });
        activeTrackingWatchId = null;
      }
      tracking = false;
    },

    isActivelyTracking(): boolean {
      return tracking;
    },
  };
}

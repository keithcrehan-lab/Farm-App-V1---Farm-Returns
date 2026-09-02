/**
 * Farm Return Next — the real, honest web/browser adapter for
 * `LocationTrackingProvider` (`location-tracking-provider.ts`'s own header
 * comment). Built on the standard `navigator.geolocation` API — no native
 * capability is simulated or implied.
 *
 * **Isomorphic-safe module, not `"use client"` or `server-only`** — same
 * discipline as `src/lib/offline/outbox.ts`: nothing here throws merely
 * from being imported during SSR; `navigator`/`geolocation` are only ever
 * read inside an exported function body, never at module scope.
 *
 * **Background tracking is honestly unsupported** — `getCapability()`
 * always reports `backgroundTrackingSupported: false`. `watchPosition`
 * has no cross-platform guarantee of continuing once a tab is
 * backgrounded or the screen locks (iOS Safari in particular suspends a
 * backgrounded tab's JavaScript execution); this adapter does not attempt
 * to work around that with a service worker or any other mechanism that
 * would only work on some platforms some of the time — see
 * `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §9 for why that would be a
 * fictional guarantee rather than a real one.
 *
 * **Visibility-based interruption detection** — this adapter listens for
 * the page's own `visibilitychange` event and, if the page is hidden for
 * longer than `BACKGROUND_INTERRUPTION_THRESHOLD_MS` while actively
 * tracking, fires `onInterruption("app_backgrounded")` once, the real
 * signal `job-session-lifecycle.ts`'s `recordInterruptionGap` needs — not
 * a guess, but not a guarantee of catching every real gap either (a true
 * force-kill fires no events at all; the caller's own session-resume path
 * closing an implausibly-long-open interval is the backstop for that
 * case, documented in `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §10).
 */
import type {
  LocationCapability,
  LocationInterruptionReason,
  LocationPermissionState,
  LocationPosition,
  LocationTrackingProvider,
} from "./location-tracking-provider";

const BACKGROUND_INTERRUPTION_THRESHOLD_MS = 30_000;

function isGeolocationAvailable(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

async function readPermissionState(): Promise<LocationPermissionState> {
  if (!isGeolocationAvailable()) return "unavailable";
  if (typeof navigator === "undefined" || !("permissions" in navigator) || !navigator.permissions?.query) {
    // Real browsers without the Permissions API (older Safari) — honestly
    // "unknown", never guessed as "granted".
    return "unknown";
  }
  try {
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (status.state === "granted") return "granted";
    if (status.state === "denied") return "denied";
    return "prompt";
  } catch {
    return "unknown";
  }
}

function toLocationPosition(position: GeolocationPosition): LocationPosition {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracyMeters: position.coords.accuracy,
    recordedAt: new Date(position.timestamp).toISOString(),
  };
}

export function createWebLocationTrackingProvider(): LocationTrackingProvider {
  let farmAwarenessWatchId: number | null = null;
  let activeTrackingWatchId: number | null = null;
  let activeInterruptionCallback: ((reason: LocationInterruptionReason) => void) | null = null;
  let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  let visibilityListenerAttached = false;

  function clearBackgroundTimer(): void {
    if (backgroundTimer !== null) {
      clearTimeout(backgroundTimer);
      backgroundTimer = null;
    }
  }

  function onVisibilityChange(): void {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      clearBackgroundTimer();
      backgroundTimer = setTimeout(() => {
        if (activeInterruptionCallback) activeInterruptionCallback("app_backgrounded");
      }, BACKGROUND_INTERRUPTION_THRESHOLD_MS);
    } else {
      clearBackgroundTimer();
    }
  }

  function attachVisibilityListener(): void {
    if (visibilityListenerAttached || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", onVisibilityChange);
    visibilityListenerAttached = true;
  }

  function detachVisibilityListener(): void {
    if (!visibilityListenerAttached || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    visibilityListenerAttached = false;
    clearBackgroundTimer();
  }

  return {
    async getCapability(): Promise<LocationCapability> {
      const permissionState = await readPermissionState();
      const supported = isGeolocationAvailable() && permissionState !== "denied" && permissionState !== "unavailable";
      return {
        permissionState,
        farmAwarenessSupported: supported,
        activeTrackingSupported: supported,
        // Honest, always -- see this file's own header comment.
        backgroundTrackingSupported: false,
        platform: "web",
      };
    },

    async getCurrentPosition(): Promise<LocationPosition | null> {
      if (!isGeolocationAvailable()) return null;
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(toLocationPosition(position)),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        );
      });
    },

    async startFarmAwareness(onPosition: (position: LocationPosition) => void): Promise<void> {
      if (!isGeolocationAvailable()) return;
      if (farmAwarenessWatchId !== null) return; // already running
      farmAwarenessWatchId = navigator.geolocation.watchPosition(
        (position) => onPosition(toLocationPosition(position)),
        () => {
          // A real error stops this watch silently from the caller's
          // perspective -- Farm Awareness is best-effort context, not a
          // job-critical evidence stream (unlike Active Tracking, which
          // reports interruptions explicitly).
        },
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 30_000 },
      );
    },

    async stopFarmAwareness(): Promise<void> {
      if (farmAwarenessWatchId !== null && isGeolocationAvailable()) {
        navigator.geolocation.clearWatch(farmAwarenessWatchId);
        farmAwarenessWatchId = null;
      }
    },

    async startActiveTracking(
      onPosition: (position: LocationPosition) => void,
      onInterruption: (reason: LocationInterruptionReason) => void,
    ): Promise<void> {
      if (!isGeolocationAvailable()) {
        onInterruption("position_unavailable");
        return;
      }
      activeInterruptionCallback = onInterruption;
      attachVisibilityListener();
      activeTrackingWatchId = navigator.geolocation.watchPosition(
        (position) => {
          // A real fix arriving cancels any pending background-interruption
          // timer -- the tab clearly still has JS execution and a GPS fix,
          // whatever visibilitychange last reported.
          clearBackgroundTimer();
          onPosition(toLocationPosition(position));
        },
        (error) => {
          onInterruption(error.code === error.PERMISSION_DENIED ? "permission_revoked" : "position_unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
    },

    async stopActiveTracking(): Promise<void> {
      if (activeTrackingWatchId !== null && isGeolocationAvailable()) {
        navigator.geolocation.clearWatch(activeTrackingWatchId);
        activeTrackingWatchId = null;
      }
      activeInterruptionCallback = null;
      detachVisibilityListener();
    },

    isActivelyTracking(): boolean {
      return activeTrackingWatchId !== null;
    },
  };
}

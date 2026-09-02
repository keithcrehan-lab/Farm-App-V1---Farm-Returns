/**
 * Farm Return Next — the `LocationTrackingProvider` capability boundary
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §9). This repository today is a browser/PWA web app, not a native
 * iOS/Android application — this interface exists specifically so no
 * caller ever has to guess, or silently assume, more location capability
 * than the current platform genuinely provides.
 *
 * **This module defines the contract only — no browser API is called
 * here.** `web-location-tracking-provider.ts` is the one real adapter
 * this checkpoint ships; a future native adapter (Core Location on iOS,
 * an Android foreground location service) implements this exact same
 * interface and is a drop-in replacement for any caller, without either
 * adapter needing to know the other exists.
 *
 * **The one rule every adapter must follow**: never claim a capability it
 * cannot actually deliver. `LocationCapability.backgroundTrackingSupported`
 * exists specifically so a caller (the Active GPS Job Mode UI) can show an
 * honest warning ("keep the app open — location tracking pauses if the
 * app is backgrounded") instead of silently failing later. A future
 * native adapter that genuinely supports background tracking sets this
 * `true`; the current web adapter never does.
 */

export type LocationPermissionState = "unknown" | "granted" | "denied" | "prompt" | "unavailable";

/** The three frozen operating modes (§7). `"off"` is not merely "no mode
 * requested" — it is the app's own explicit, honest response to a denied
 * or absent permission, degrading every workflow to manual entry rather
 * than pretending location context exists. */
export type LocationOperatingMode = "off" | "farm_awareness" | "active_tracking";

export interface LocationPosition {
  lat: number;
  lng: number;
  /** Meters, when the platform reports one — never fabricated when absent. */
  accuracyMeters?: number;
  /** Device clock at the moment of this fix (ISO datetime) — the real
   * "Observed" timestamp, distinct from whenever the app happens to
   * receive/process it. */
  recordedAt: string;
}

export interface LocationCapability {
  permissionState: LocationPermissionState;
  /** Whether this adapter can run the low-power, infrequent "am I near
   * the farm" mode at all (§7 Farm Awareness). */
  farmAwarenessSupported: boolean;
  /** Whether this adapter can run high-accuracy tracking while the app is
   * in the foreground. */
  activeTrackingSupported: boolean;
  /**
   * Whether this adapter can keep tracking (and durably persisting
   * observations) while the app is backgrounded or the screen is locked.
   * **The current web adapter always reports `false`** — no browser/PWA
   * API this app can reach today gives that guarantee across iOS Safari
   * and Android Chrome alike (§9's own instruction: "do NOT pretend
   * browser/PWA JavaScript can guarantee native-grade background GPS
   * while the device is locked"). A future native adapter reports `true`
   * once it genuinely delivers it via Core Location / an Android
   * foreground service.
   */
  backgroundTrackingSupported: boolean;
  platform: "web" | "ios_native" | "android_native";
}

export type LocationInterruptionReason = "permission_revoked" | "position_unavailable" | "app_backgrounded" | "timeout";

export interface LocationTrackingProvider {
  /** Real, current capability — never a static constant; permission can
   * change between calls (revoked in OS settings mid-session, etc.). */
  getCapability(): Promise<LocationCapability>;

  /** One-shot current position for Farm Awareness / a manual "where am I"
   * check — resolves `null` (never a fabricated position) if genuinely
   * unavailable. */
  getCurrentPosition(): Promise<LocationPosition | null>;

  /** Starts the low-power Farm Awareness mode (§7) — infrequent,
   * lower-accuracy updates, not intended to reconstruct a detailed
   * movement history. `onPosition` fires only for genuine, real fixes. */
  startFarmAwareness(onPosition: (position: LocationPosition) => void): Promise<void>;
  stopFarmAwareness(): Promise<void>;

  /**
   * Starts the highest-accuracy tracking this adapter can genuinely
   * provide, for an active Job Session (§7). `onInterruption` fires when
   * tracking genuinely stops delivering real fixes for a reason the app
   * did not choose (permission revoked, GPS unavailable, the OS
   * suspending a backgrounded tab) — the caller is responsible for
   * turning that into a real `InterruptionGap`
   * (`src/domain/job-session-lifecycle.ts`), never for silently
   * continuing as if tracking were unaffected.
   */
  startActiveTracking(
    onPosition: (position: LocationPosition) => void,
    onInterruption: (reason: LocationInterruptionReason) => void,
  ): Promise<void>;
  stopActiveTracking(): Promise<void>;

  isActivelyTracking(): boolean;
}

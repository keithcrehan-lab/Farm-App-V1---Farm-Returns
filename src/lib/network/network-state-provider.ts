/**
 * Farm Return Next — the `NetworkStateProvider` capability boundary
 * (Phase B, native/background GPS readiness, 2026-09-03). Same reasoning
 * as `src/lib/location/location-tracking-provider.ts`'s own header
 * comment: this repository today is a browser/PWA web app, and every
 * connectivity check before this phase was a raw, scattered
 * `navigator.onLine` read directly inside a component
 * (`ActiveJobSessionView.tsx`) — honest but not something a future native
 * adapter (with a richer, more reliable reachability API — iOS
 * `NWPathMonitor`, Android `ConnectivityManager`) can plug into without
 * every call site changing. This interface exists so no caller ever has
 * to guess, or silently assume, more connectivity signal than the
 * current platform genuinely provides — exactly the same rule
 * `LocationTrackingProvider`'s own header comment states for location.
 *
 * **This module defines the contract only — no browser API is called
 * here.** `web-network-state-provider.ts` is the one real adapter this
 * phase ships, built on `navigator.onLine` + the `online`/`offline`
 * window events (the same signal every call site already used
 * ad hoc) — a future native adapter implements this exact same
 * interface and is a drop-in replacement, without either adapter
 * needing to know the other exists.
 *
 * **The one rule every adapter must follow**: never claim connectivity
 * it cannot actually verify, and never claim a richer signal (e.g. real
 * reachability, not just "the OS thinks an interface is up") than the
 * platform genuinely provides. `navigator.onLine`'s own well-known
 * limitation — it reports whether the device has *a* network interface
 * up, not whether the Supabase API is actually reachable — is disclosed
 * on `NetworkCapability`, not hidden.
 */

export interface NetworkCapability {
  /** Whether this adapter can report online/offline state at all. */
  supported: boolean;
  /**
   * Whether this adapter's `isOnline()` reflects genuine reachability
   * (a real ping/health-check) or only the OS/browser's own best guess
   * that *a* network interface is up. **The current web adapter always
   * reports `false`** — `navigator.onLine` is well known to report
   * `true` on a device connected to a Wi-Fi network with no real
   * internet path (a captive portal, a dead upstream link). A future
   * native adapter that performs a genuine reachability check reports
   * `true` once it does.
   */
  reachabilityVerified: boolean;
  platform: "web" | "ios_native" | "android_native";
}

export interface NetworkStateProvider {
  getCapability(): NetworkCapability;

  /** Real, current online/offline state — never a cached/stale value. */
  isOnline(): boolean;

  /**
   * Subscribes to real online/offline transitions. Returns an
   * unsubscribe function. `onChange` fires only on a genuine transition
   * (never a duplicate call for the same state), mirroring
   * `LocationTrackingProvider.startActiveTracking`'s own
   * "`onPosition` fires only for genuine, real fixes" discipline.
   */
  subscribe(onChange: (online: boolean) => void): () => void;
}

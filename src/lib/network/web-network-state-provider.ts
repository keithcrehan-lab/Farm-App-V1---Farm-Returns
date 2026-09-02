/**
 * Farm Return Next — the real, honest web/browser adapter for
 * `NetworkStateProvider` (`network-state-provider.ts`'s own header
 * comment). Built on `navigator.onLine` + the `online`/`offline` window
 * events — the exact signal every call site used ad hoc before this
 * phase, now behind one real, testable boundary.
 *
 * **Isomorphic-safe module, not `"use client"` or `server-only`** — same
 * discipline as `src/lib/location/web-location-tracking-provider.ts`:
 * nothing here throws merely from being imported during SSR;
 * `navigator`/`window` are only ever read inside an exported function
 * body, never at module scope.
 */
import type { NetworkCapability, NetworkStateProvider } from "./network-state-provider";

function isNavigatorOnlineAvailable(): boolean {
  return typeof navigator !== "undefined" && "onLine" in navigator;
}

export function createWebNetworkStateProvider(): NetworkStateProvider {
  return {
    getCapability(): NetworkCapability {
      return {
        supported: isNavigatorOnlineAvailable(),
        // Honest, always -- see this file's own header comment and
        // network-state-provider.ts's own doc comment on
        // reachabilityVerified.
        reachabilityVerified: false,
        platform: "web",
      };
    },

    isOnline(): boolean {
      if (!isNavigatorOnlineAvailable()) return true; // no signal at all -- assume online rather than blocking every caller
      return navigator.onLine;
    },

    subscribe(onChange: (online: boolean) => void): () => void {
      if (typeof window === "undefined") return () => {};
      let lastKnown = isNavigatorOnlineAvailable() ? navigator.onLine : true;
      const handleOnline = () => {
        if (lastKnown === true) return; // genuine transition only
        lastKnown = true;
        onChange(true);
      };
      const handleOffline = () => {
        if (lastKnown === false) return; // genuine transition only
        lastKnown = false;
        onChange(false);
      };
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    },
  };
}

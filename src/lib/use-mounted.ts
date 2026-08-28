"use client";

import { useEffect, useState } from "react";

/**
 * True only after the client has mounted — the standard SSR-safe pattern
 * for a value that must read live browser/wall-clock state (`Date`,
 * `window`, `localStorage`) without risking a hydration mismatch: render
 * the SSR-safe fallback on both the server and the client's first paint
 * (identical output, so React never warns), then flip `true` in a
 * client-only effect once it's safe to show the real value. Generalises
 * the pattern `MobileGreetingHeader` (time-of-day greeting) and
 * `farm-store.tsx` (localStorage rehydration) already use individually,
 * for reuse anywhere else the same problem shows up — see
 * `EconomicsStatRow`/`FeedGroupSummaryCard`'s `targetDate` for the case
 * that motivated pulling this into a shared hook.
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // One-time post-mount flag — the sanctioned SSR-safe pattern documented above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted;
}

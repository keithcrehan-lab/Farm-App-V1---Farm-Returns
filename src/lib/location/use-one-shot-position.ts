"use client";

import { useEffect, useRef, useState } from "react";
import { createWebLocationTrackingProvider } from "@/lib/location/web-location-tracking-provider";
import type { LocationPosition } from "@/lib/location/location-tracking-provider";

/**
 * One real, one-shot browser geolocation fix per mount — the shared
 * source both `NearbyFieldCard` (real "near <field>" awareness) and
 * `MapHero`'s own "you are here" dot read from, so a farmer is only
 * ever asked for permission once per Today visit, not once per
 * consumer. Real, honest, never fabricated: resolves `null` (not a
 * guess) when permission is denied/unavailable, the same contract
 * `LocationTrackingProvider.getCurrentPosition()` itself guarantees.
 */
export function useOneShotPosition(): LocationPosition | null {
  const [position, setPosition] = useState<LocationPosition | null>(null);
  const providerRef = useRef(createWebLocationTrackingProvider());

  useEffect(() => {
    let cancelled = false;
    providerRef.current.getCurrentPosition().then((real) => {
      if (!cancelled && real) setPosition(real);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return position;
}

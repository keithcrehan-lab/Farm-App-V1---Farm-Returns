"use client";

import { useSyncExternalStore } from "react";

/** Whether a CSS media query currently matches, for layout decisions CSS
 * can't reach (e.g. a Mapbox camera's padding beside a desktop panel).
 * `false` on the server and first paint; updates when the query changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** The desktop composition breakpoint (Tailwind `lg`). */
export const DESKTOP_QUERY = "(min-width: 1024px)";

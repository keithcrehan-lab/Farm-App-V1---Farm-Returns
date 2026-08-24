"use client";

import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { useFarm } from "@/store/farm-store";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function MobileGreetingHeader() {
  const farm = useFarm();
  // A neutral, SSR-safe default: the server and the client's first paint
  // must render identical text, but the server's wall clock and the
  // browser's can differ (or, in tests, the browser's clock is
  // deliberately mocked — see tests/e2e/visual.spec.ts) — either way,
  // computing `greeting()` directly during render risks a hydration
  // mismatch. A client-only effect swaps in the real time-of-day greeting
  // once mounted, the same pattern farm-store.tsx uses for localStorage.
  const [greetingText, setGreetingText] = useState("Hello");
  useEffect(() => {
    // One-time post-mount read of an external system (the wall clock) —
    // the same sanctioned exception documented in farm-store.tsx's
    // localStorage rehydration effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above.
    setGreetingText(greeting());
  }, []);

  return (
    <header className="mb-5 flex items-center justify-between lg:hidden">
      <div>
        <span className="mb-1 flex items-center gap-1.5 text-fr-green-700">
          <Sprout className="size-5" />
          <span className="text-sm font-semibold">Farm Return</span>
        </span>
        <h1 className="text-title text-fr-ink-900">
          {greetingText}, {farm.ownerName}
        </h1>
        <p className="text-sm text-fr-ink-600">Here&apos;s what&apos;s happening on your farm today.</p>
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fr-green-100 text-sm font-semibold text-fr-green-700">
        {farm.ownerName[0]}
      </span>
    </header>
  );
}

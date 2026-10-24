import { isSupabaseConfigured } from "@/lib/supabase/env";
import { WhatMattersScreen } from "./WhatMattersScreen";

export const metadata = { title: "What Matters · Farm Return" };

/**
 * Pilot Integration P4 (DECISIONS D15) — the dedicated What Matters destination. It shows the same real evaluation
 * as Farm's "What matters now" slot (`evaluateWhatMattersPilot`, through `useWhatMattersPilot`), with the evidence
 * behind it. Demonstration mode has no farm records to evaluate, so it says so instead of evaluating anything.
 */
export default function WhatMattersPage() {
  return <WhatMattersScreen mode={isSupabaseConfigured() ? "REAL" : "DEMO"} />;
}

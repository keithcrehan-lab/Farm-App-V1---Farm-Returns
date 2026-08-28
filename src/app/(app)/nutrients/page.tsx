import { Suspense } from "react";
import { NutrientsPageClient } from "./NutrientsPageClient";

// NutrientsPageClient reads `?field=` via useSearchParams, which opts the
// tree into client-side rendering up to the nearest Suspense boundary
// during prerendering — see next/dist/docs use-search-params.md (same
// pattern as (auth)/sign-in/page.tsx).
export default function NutrientsPage() {
  return (
    <Suspense fallback={null}>
      <NutrientsPageClient />
    </Suspense>
  );
}

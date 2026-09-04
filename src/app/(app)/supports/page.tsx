import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSupportProfileFactsForFarm } from "@/lib/farm-data/support-profile";
import { mockFarm, mockFields, mockLivestockGroups } from "@/data/mock-farm";
import { buildSupportProfile } from "@/domain/support-profile";
import { assessAllSchemes } from "@/domain/scheme-eligibility";
import { listSchemeVersions } from "@/domain/scheme-registry";
import { SupportsPageClient } from "./SupportsPageClient";

/** Postgres SQLSTATE `undefined_table` — same disclosed-until-applied
 * posture as `records/page.tsx`'s identical constant: the one specific,
 * expected failure mode while `support_profile_facts` might not yet be
 * applied in whichever environment this runs against (it IS
 * `VALIDATED_DEV` against `Farm Return V1 Dev` — see
 * `docs/validation/support-profile-facts-dev-validation.md` — but this
 * page's own code must stay honest for any other environment too). */
const UNDEFINED_TABLE = "42P01";

function isUndefinedTableError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === UNDEFINED_TABLE;
}

/**
 * Farm Return Next — Supports Intelligence + Farm Strategy phase.
 * `docs/product/farm-return-next-v1.1/SUPPORTS_STRATEGY_CONTRACT.md`.
 *
 * A real server component (mirrors `records/page.tsx`'s own pattern,
 * not the client-store pattern `plan/page.tsx` uses) — Support Profile
 * derivation needs `Farm`/`Field[]`/`LivestockGroup[]` plus this farm's
 * own persisted `support_profile_facts`, all fetched together here
 * rather than assembled piecemeal client-side. Demo/mock mode
 * (`!isSupabaseConfigured()`) renders the same real domain engines
 * (`buildSupportProfile`/`assessAllSchemes`) against `mock-farm.ts`'s
 * own real mock dataset — no separate mock-mode code path to drift from
 * the real one.
 *
 * Deliberately NOT built this session (see the contract doc's own
 * "deliberately not built" section): a candidate-investment entry form,
 * so no `StrategyComparison`/`SupportOpportunity` renders yet either —
 * `farm-strategy.ts`/`support-opportunity.ts` are complete and tested,
 * just not yet wired to a real farmer-facing input here. Adding a
 * placeholder "Strategy — coming soon" panel was deliberately avoided
 * (`plan/page.tsx`'s own precedent: no invented UI for a capability with
 * nothing real to show yet).
 */
export default async function SupportsPage() {
  const schemeVersions = listSchemeVersions();
  const schemeNames = Object.fromEntries(schemeVersions.map((s) => [s.schemeId, s.name]));

  if (!isSupabaseConfigured()) {
    const profile = buildSupportProfile(mockFarm, mockFields, mockLivestockGroups, []);
    const assessments = assessAllSchemes(profile, schemeVersions, new Date().toISOString());
    return <SupportsPageClient profile={profile} assessments={assessments} schemeNames={schemeNames} />;
  }

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    const profile = buildSupportProfile(mockFarm, mockFields, mockLivestockGroups, []);
    const assessments = assessAllSchemes(profile, schemeVersions, new Date().toISOString());
    return <SupportsPageClient profile={profile} assessments={assessments} schemeNames={schemeNames} />;
  }

  const [fields, livestockGroups] = await Promise.all([listFieldsForFarm(farm.id), listLivestockGroupsForFarm(farm.id)]);

  let facts: Awaited<ReturnType<typeof listSupportProfileFactsForFarm>> = [];
  try {
    facts = await listSupportProfileFactsForFarm(farm.id);
  } catch (error) {
    if (!isUndefinedTableError(error)) {
      console.error("[supports] listSupportProfileFactsForFarm failed with an unexpected error:", error);
    }
  }

  const profile = buildSupportProfile(farm, fields, livestockGroups, facts);
  const assessments = assessAllSchemes(profile, schemeVersions, new Date().toISOString());

  return <SupportsPageClient profile={profile} assessments={assessments} schemeNames={schemeNames} />;
}

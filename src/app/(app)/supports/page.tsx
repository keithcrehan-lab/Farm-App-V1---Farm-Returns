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
 * rather than assembled piecemeal client-side.
 *
 * **Mock data is used only in genuine demo mode
 * (`!isSupabaseConfigured()`)** — Codex audit CRITICAL (round 1,
 * 2026-09-04): an earlier version of this page also fell back to
 * `mockFarm`/`mockFields`/`mockLivestockGroups` whenever a real,
 * Supabase-configured, authenticated session had no farm on record —
 * a real signed-in farmer could then see fabricated area/livestock/
 * eligibility figures presented as their own, unlabelled. Fixed: that
 * branch (only reachable defensively — `layout.tsx` already redirects an
 * incomplete-onboarding session to `/onboarding` before this page ever
 * renders) now renders `profile={null}`, which
 * `SupportsPageClient`/`page.tsx`'s own render below shows as a real,
 * honest "we couldn't find your farm" state, never mock figures — the
 * exact same "empty over fabricated" choice `records/page.tsx` already
 * makes for its own no-farm branch.
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
    return <SupportsPageClient profile={null} assessments={[]} schemeNames={schemeNames} />;
  }

  const [fields, livestockGroups] = await Promise.all([listFieldsForFarm(farm.id), listLivestockGroupsForFarm(farm.id)]);

  // Codex audit MEDIUM (round 1, 2026-09-04): an earlier version treated
  // every failure here — not just the one expected "migration not
  // applied yet" case — as an honest empty fact list, inviting a farmer
  // to re-answer questions Farm Return might actually already have on a
  // genuine, temporary read failure. Same disclosed-until-applied
  // posture as `records/page.tsx`'s identical try/catch: only the
  // specific, expected error renders as honestly empty; anything else
  // renders a distinct "temporarily unavailable" state via
  // `factsUnavailable`, never silently swallowed into "needs your input".
  let facts: Awaited<ReturnType<typeof listSupportProfileFactsForFarm>> = [];
  let factsUnavailable = false;
  try {
    facts = await listSupportProfileFactsForFarm(farm.id);
  } catch (error) {
    if (isUndefinedTableError(error)) {
      facts = [];
    } else {
      console.error("[supports] listSupportProfileFactsForFarm failed with an unexpected error:", error);
      factsUnavailable = true;
    }
  }

  const profile = buildSupportProfile(farm, fields, livestockGroups, facts);
  const assessments = assessAllSchemes(profile, schemeVersions, new Date().toISOString());

  return <SupportsPageClient profile={profile} assessments={assessments} schemeNames={schemeNames} factsUnavailable={factsUnavailable} />;
}

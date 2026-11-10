"use server";

/**
 * SCEP 2026 action deadlines for Plan, built exactly as the Schemes page
 * builds them (same stored rules, profile and fact assertions). Plan only
 * gets the actions with their deadlines and progress; nothing is
 * estimated here. Anything that fails returns "unavailable" so Plan stays
 * quiet rather than guessing.
 */
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSupportProfileFactsForFarm } from "@/lib/farm-data/support-profile";
import { listStoredSchemeDefinitions } from "@/lib/farm-data/schemes";
import { listSchemeFactAssertionsForFarm } from "@/lib/farm-data/scheme-facts";
import { buildSupportProfile, nowAsSupportProfileAssessedAt } from "@/domain/support-profile";
import { buildScep2026View } from "@/domain/schemes/scep-2026";
import type { SchemeActionLike } from "@/domain/recommendations";

export async function loadScepForPlanAction(): Promise<{ status: "ok"; name: string; actions: SchemeActionLike[] } | { status: "unavailable" }> {
  try {
    const farm = await getFarmForCurrentUser();
    if (!farm) return { status: "unavailable" };
    const [fields, groups, facts, definitions] = await Promise.all([
      listFieldsForFarm(farm.id),
      listLivestockGroupsForFarm(farm.id),
      listSupportProfileFactsForFarm(farm.id),
      listStoredSchemeDefinitions(),
    ]);
    const definition = definitions.find((d) => d.version.schemeKey === "scep" && d.version.schemeYear === 2026 && d.version.rulesVersion === "scep-2026-v1");
    if (!definition) return { status: "unavailable" };
    const assertions = await listSchemeFactAssertionsForFarm(farm.id, definition.version.id);
    const view = buildScep2026View({ definition, profile: buildSupportProfile(farm, fields, groups, facts), assertions, nowIso: nowAsSupportProfileAssessedAt() });
    // Only a farm confirmed in the scheme gets scheme deadlines.
    if (view.participation !== true) return { status: "ok", name: view.name, actions: [] };
    return {
      status: "ok",
      name: view.name,
      actions: view.actions.map((a) => ({ key: a.key, label: a.label, deadline: a.deadline, deadlineState: a.deadlineState, state: a.state, detail: a.detail, current: a.current, target: a.target })),
    };
  } catch (err) {
    console.error("[Plan] SCEP load failed", err);
    return { status: "unavailable" };
  }
}

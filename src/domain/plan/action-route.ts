/**
 * Plan kernel — canonical action routes.
 *
 * Every actionable job carries one typed primary route into the existing
 * canonical Farm Return workflow, with its target pre-selected. Plan does
 * not own or build those workflows; entering through Plan must write
 * through them, never to a Plan-owned copy. Each href below is an existing
 * application route — no query parameter the destination does not already
 * read is invented here.
 */

export type PlanActionRoute =
  /** `/livestock/[groupId]` — the group's canonical livestock workflow. */
  | { kind: "LIVESTOCK_GROUP"; groupId: string }
  /** `/soil-sample/[fieldId]` — soil sampling for one field. */
  | { kind: "FIELD_SOIL_SAMPLE"; fieldId: string }
  /** `/nutrients?field=` — the field's persisted nutrient application plan. */
  | { kind: "FIELD_NUTRIENT_PLAN"; fieldId: string }
  /** Manual task with no canonical digital workflow. */
  | { kind: "NONE"; reason: "MANUAL_TASK" };

export type PlanActionRouteKind = PlanActionRoute["kind"];

/** The href for a route, or `null` when the work has no digital workflow. */
export function actionRouteHref(route: PlanActionRoute): string | null {
  switch (route.kind) {
    case "LIVESTOCK_GROUP":
      return `/livestock/${encodeURIComponent(route.groupId)}`;
    case "FIELD_SOIL_SAMPLE":
      return `/soil-sample/${encodeURIComponent(route.fieldId)}`;
    case "FIELD_NUTRIENT_PLAN":
      return `/nutrients?field=${encodeURIComponent(route.fieldId)}`;
    case "NONE":
      return null;
  }
}

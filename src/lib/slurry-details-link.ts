import type { FieldMissingSlurryPlanningDetails, MissingSlurryPlanningDetail } from "@/domain/what-matters-no-recommendation";

/** Deep link from What Matters into the existing field editor
 * (`/fields?field=<id>`, whose Constraints tab already edits a slurry
 * allocation's method/date through the farm store's canonical write path),
 * carrying which details were missing so that screen asks only for those. */
export function slurryDetailsHref(detail: FieldMissingSlurryPlanningDetails): string {
  return `/fields?field=${encodeURIComponent(detail.fieldId)}&complete=slurry&missing=${detail.missing.join(",")}`;
}

/** Reads `slurryDetailsHref`'s own params back. `null` unless the link was
 * a real slurry-details request with at least one recognised detail. */
export function parseSlurryDetailsRequest(complete: string | null, missing: string | null): MissingSlurryPlanningDetail[] | null {
  if (complete !== "slurry" || !missing) return null;
  const details = missing.split(",").filter((d): d is MissingSlurryPlanningDetail => d === "method" || d === "date");
  return details.length > 0 ? [...new Set(details)] : null;
}

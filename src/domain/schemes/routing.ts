import type { SchemeDataRoute } from "./contracts";

const INTERNAL_ORIGIN = "https://farm-return.local";

function assertInternalPath(path: string, label: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`${label} must be an internal Farm Return path`);
  }
}

/**
 * Stable return location for one missing-data item. The requirement id is
 * preserved so the Schemes screen can restore the exact checklist item
 * after the owner screen saves the fact.
 */
export function schemeRequirementReturnPath(input: {
  schemeId: string;
  schemeVersion: string;
  requirementId: string;
}): string {
  const params = new URLSearchParams({
    scheme: input.schemeId,
    version: input.schemeVersion,
    requirement: input.requirementId,
  });
  return `/schemes?${params.toString()}#requirement-${encodeURIComponent(input.requirementId)}`;
}

/**
 * Adds a Schemes return target to an exact canonical editor route without
 * changing the route's existing query or hash. Destination screens can
 * consume this token after a successful save; until a specific editor is
 * wired, the token remains harmless.
 */
export function withSchemeReturnTo(ownerHref: string, returnTo: string): SchemeDataRoute {
  assertInternalPath(ownerHref, "ownerHref");
  assertInternalPath(returnTo, "returnTo");

  const url = new URL(ownerHref, INTERNAL_ORIGIN);
  url.searchParams.set("returnTo", returnTo);

  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    returnTo,
  };
}

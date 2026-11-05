import type {
  SchemeDataPoint,
  SchemeReadiness,
  SchemeReadinessBucket,
  SchemeReadinessItem,
  SchemeRequirement,
} from "./contracts";

function bucketFor(point: SchemeDataPoint): SchemeReadinessBucket {
  if (point.state === "KNOWN") return "already_known";
  if (point.state === "MISSING" && point.resolutionOwner === "farmer") return "needs_you";
  return "needs_review";
}

function missingIntegrationPoint(dataKey: string, owner: SchemeRequirement["owner"]): SchemeDataPoint {
  return {
    key: dataKey,
    owner,
    state: "UNSUPPORTED",
    resolutionOwner: "system",
    evidence: [
      {
        sourceKind: "derived",
        detail: "No canonical Farm Return data adapter supplied this required data point.",
      },
    ],
  };
}

/**
 * Scheme readiness is deliberately independent from eligibility.
 *
 * - Counts unique applicable required data points, not rules. If one farm
 *   fact feeds five rules, the farmer is asked for it once and it counts
 *   once.
 * - NOT_APPLICABLE data is removed from the denominator.
 * - A missing adapter is a system/integration gap, never presented as
 *   farmer-missing data.
 * - 100% means every applicable required data point is usable. It does
 *   not mean the farm is eligible.
 */
export function evaluateSchemeReadiness(
  schemeVersionKey: string,
  requirements: SchemeRequirement[],
  points: ReadonlyMap<string, SchemeDataPoint>,
): SchemeReadiness {
  const ordered = requirements
    .filter((requirement) => requirement.required && requirement.applicable)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const unique = new Map<string, SchemeRequirement>();
  const ownerConflicts = new Set<string>();

  for (const requirement of ordered) {
    const existing = unique.get(requirement.dataKey);
    if (!existing) {
      unique.set(requirement.dataKey, requirement);
      continue;
    }
    if (existing.owner !== requirement.owner) ownerConflicts.add(requirement.dataKey);
  }

  const items: SchemeReadinessItem[] = [];

  for (const requirement of unique.values()) {
    let point = points.get(requirement.dataKey) ?? missingIntegrationPoint(requirement.dataKey, requirement.owner);

    if (ownerConflicts.has(requirement.dataKey)) {
      point = {
        ...point,
        state: "REVIEW_REQUIRED",
        resolutionOwner: "system",
        route: undefined,
      };
    }

    if (point.state === "NOT_APPLICABLE") continue;

    items.push({
      requirementId: requirement.id,
      dataKey: requirement.dataKey,
      label: requirement.label,
      owner: requirement.owner,
      purpose: requirement.purpose,
      state: point.state,
      bucket: bucketFor(point),
      route: point.route,
      resolutionOwner: point.resolutionOwner,
    });
  }

  const alreadyKnown = items.filter((item) => item.bucket === "already_known");
  const needsYou = items.filter((item) => item.bucket === "needs_you");
  const needsReview = items.filter((item) => item.bucket === "needs_review");
  const totalCount = items.length;
  const completeCount = alreadyKnown.length;

  return {
    schemeVersionKey,
    completeCount,
    totalCount,
    percentage: totalCount === 0 ? null : Math.round((completeCount / totalCount) * 100),
    assessable: totalCount > 0,
    items,
    alreadyKnown,
    needsYou,
    needsReview,
  };
}

import type { SchemeDataOwner, SchemeDataPoint } from "./contracts";

export interface SchemeDataAdapterResult {
  owner: SchemeDataOwner;
  points: SchemeDataPoint[];
}

/**
 * Composes canonical data supplied by the owning Farm Return modules.
 *
 * A key may be supplied by exactly one owner. If two modules claim the
 * same key, Schemes does not choose one silently: the point becomes a
 * system review requirement until ownership is corrected.
 */
export function composeSchemeDataSnapshot(
  adapters: SchemeDataAdapterResult[],
): ReadonlyMap<string, SchemeDataPoint> {
  const snapshot = new Map<string, SchemeDataPoint>();

  for (const adapter of adapters) {
    for (const point of adapter.points) {
      if (point.owner !== adapter.owner) {
        throw new Error(
          `SCHEME_DATA_ADAPTER_OWNER_MISMATCH:${adapter.owner}:${point.key}:${point.owner}`,
        );
      }

      const existing = snapshot.get(point.key);
      if (!existing) {
        snapshot.set(point.key, point);
        continue;
      }

      snapshot.set(point.key, {
        key: point.key,
        owner: existing.owner,
        state: "REVIEW_REQUIRED",
        resolutionOwner: "system",
        evidence: [
          ...(existing.evidence ?? []),
          ...(point.evidence ?? []),
          {
            sourceKind: "derived",
            detail: `Canonical ownership conflict: ${existing.owner} and ${point.owner} both supplied this data key.`,
          },
        ],
      });
    }
  }

  return snapshot;
}

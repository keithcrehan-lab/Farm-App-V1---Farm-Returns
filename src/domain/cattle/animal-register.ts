/**
 * Cattle C1 — register-level external identifier check.
 *
 * Projects every supplied animal ledger at the same explicit `effectiveAt` /
 * `knowledgeCutoff` and reports when two DIFFERENT Farm Return animals both
 * claim the same external identifier (same scheme, exact string — no format
 * rule or normalisation) in valid time. Both animals are preserved; nothing
 * is merged. An identifier whose earlier holder's claim has ended
 * (non-overlapping valid time) is not a current conflict. An animal whose
 * identifier evidence is INVALID_EVIDENCE cannot be cleared and is reported
 * as unresolved (fail closed). Pure; no persistence.
 */

import { compareStrings } from "./integrity";
import { intervalCovers, isValidAnimalInstant, type AnimalLedger, type FarmReturnAnimalId } from "./animal-ledger";
import { projectAnimalSnapshot, type AnimalProjectionQuery } from "./animal-snapshot";

export interface ExternalIdentifierConflict {
  scheme: string;
  identifier: string;
  /** Distinct Farm Return animals claiming it (sorted). Never merged. */
  animalIds: FarmReturnAnimalId[];
  /** Claiming assertion ids, sorted. */
  assertionIds: string[];
}

export type AnimalRegisterIssueCode =
  | "CATTLE_REGISTER_INVALID_QUERY"
  | "CATTLE_REGISTER_INVALID_LEDGER"
  | "CATTLE_REGISTER_DUPLICATE_ANIMAL_LEDGER"
  | "CATTLE_REGISTER_IDENTIFIERS_UNRESOLVED";

export interface AnimalRegisterIssue {
  code: AnimalRegisterIssueCode;
  /** The animal concerned, or the ledger's position when its id is unusable. */
  animalId: string | null;
  ledgerIndex: number | null;
}

export interface ExternalIdentifierRegisterCheck {
  effectiveAt: string;
  knowledgeCutoff: string;
  /** `true` only when there are no conflicts and no issues. */
  clear: boolean;
  conflicts: ExternalIdentifierConflict[];
  issues: AnimalRegisterIssue[];
}

export function checkExternalIdentifierRegister(
  ledgers: readonly AnimalLedger[],
  query: AnimalProjectionQuery,
): ExternalIdentifierRegisterCheck {
  const effectiveAt = query?.effectiveAt;
  const knowledgeCutoff = query?.knowledgeCutoff;
  const issues: AnimalRegisterIssue[] = [];
  const claims = new Map<string, { scheme: string; identifier: string; animals: Set<string>; assertions: Set<string> }>();
  const seen = new Map<string, number>();
  if (!isValidAnimalInstant(effectiveAt) || !isValidAnimalInstant(knowledgeCutoff)) {
    return { effectiveAt, knowledgeCutoff, clear: false, conflicts: [], issues: [{ code: "CATTLE_REGISTER_INVALID_QUERY", animalId: null, ledgerIndex: null }] };
  }
  Array.from(ledgers).forEach((ledger, ledgerIndex) => {
    const projected = projectAnimalSnapshot(ledger, { effectiveAt, knowledgeCutoff });
    if (!projected.ok) {
      issues.push({ code: "CATTLE_REGISTER_INVALID_LEDGER", animalId: typeof ledger?.animalId === "string" ? ledger.animalId : null, ledgerIndex });
      return;
    }
    const { snapshot } = projected;
    if (seen.has(snapshot.animalId)) {
      issues.push({ code: "CATTLE_REGISTER_DUPLICATE_ANIMAL_LEDGER", animalId: snapshot.animalId, ledgerIndex });
    }
    seen.set(snapshot.animalId, ledgerIndex);
    for (const scheme of snapshot.externalIdentifiers.byScheme) {
      if (scheme.state === "INVALID_EVIDENCE") {
        issues.push({ code: "CATTLE_REGISTER_IDENTIFIERS_UNRESOLVED", animalId: snapshot.animalId, ledgerIndex });
        continue;
      }
      for (const a of scheme.evidence) {
        if (a.kind !== "EXTERNAL_IDENTIFIER" || !intervalCovers(a, snapshot.effectiveAt)) continue;
        const key = JSON.stringify([a.value.scheme, a.value.identifier]);
        const entry = claims.get(key) ?? { scheme: a.value.scheme, identifier: a.value.identifier, animals: new Set(), assertions: new Set() };
        entry.animals.add(snapshot.animalId);
        entry.assertions.add(a.assertionId);
        claims.set(key, entry);
      }
    }
  });
  const conflicts: ExternalIdentifierConflict[] = [...claims.values()]
    .filter((c) => c.animals.size > 1)
    .map((c) => ({
      scheme: c.scheme,
      identifier: c.identifier,
      animalIds: [...c.animals].sort(compareStrings) as FarmReturnAnimalId[],
      assertionIds: [...c.assertions].sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.scheme, b.scheme) || compareStrings(a.identifier, b.identifier));
  const uniqueIssues = dedupeIssues(issues);
  return {
    effectiveAt,
    knowledgeCutoff,
    clear: conflicts.length === 0 && uniqueIssues.length === 0,
    conflicts,
    issues: uniqueIssues,
  };
}

function dedupeIssues(issues: AnimalRegisterIssue[]): AnimalRegisterIssue[] {
  const map = new Map(issues.map((i) => [JSON.stringify([i.code, i.animalId, i.ledgerIndex]), i]));
  return [...map.values()].sort(
    (a, b) => compareStrings(a.code, b.code) || compareStrings(a.animalId ?? "", b.animalId ?? "") || (a.ledgerIndex ?? -1) - (b.ledgerIndex ?? -1),
  );
}

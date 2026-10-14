/**
 * Cattle C7 — membership and occurrence anchors (through C1 / C4 only, via
 * the resolved-evidence model).
 *
 * Membership at an instant: EXPLICIT_SET — listed in the bound definition;
 * GROUP — C4 `resolveGroupScope` at that instant (its `CATTLE_GROUP_SCOPE`
 * fingerprint is retained so every consulted resolution binds the result);
 * CRITERIA — every non-null criterion's C1 fact must be resolved (KNOWN)
 * before it is compared; a `null` criterion is not a dimension of the
 * outcome. Unresolved evidence is reported with its outcome, never as
 * NOT_MEMBER. The anchor of a DATE_OF_BIRTH schedule needs a resolved C1
 * birth date.
 */

import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import { utcStartOfCalendarDate } from "../regulatory/obligation-time";
import type { ProgrammeAction, ProgrammeApplicability } from "./programme-definition";
import { fromC1Resolution, fromC4Membership, resolvedEvidence, unresolvedEvidence, type EvidenceResolution, type UnresolvedOutcome } from "./programme-evidence";
import { groupScopeAt, type AnimalContext } from "./programme-predecessors";
import { foldOrInvalid } from "./programme-state";
import type { ProgrammeMembership, ProgrammeMembershipState } from "./programme-types";

const MEMBERSHIP_OF_OUTCOME: Record<UnresolvedOutcome, Exclude<ProgrammeMembershipState, "MEMBER" | "NOT_MEMBER">> = {
  INVALID_EVIDENCE: "INVALID",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  UNKNOWN: "UNKNOWN",
  INSUFFICIENT_EVIDENCE: "UNKNOWN",
  REVIEW_REQUIRED: "UNKNOWN",
};

export function membershipAt(applicability: ProgrammeApplicability, ctx: AnimalContext, at: string, knowledgeCutoff: string, hash: CattleHash): ProgrammeMembership {
  const of = (state: ProgrammeMembershipState, reasonCodes: readonly string[], evidenceFingerprint: ProgrammeMembership["evidenceFingerprint"]): ProgrammeMembership => ({
    state,
    basis: applicability.kind,
    at,
    reasonCodes: sortedUnique([...reasonCodes]),
    evidenceFingerprint,
  });
  switch (applicability.kind) {
    case "EXPLICIT_SET":
      return of(applicability.animalIds.includes(ctx.animalId) ? "MEMBER" : "NOT_MEMBER", [], null);
    case "GROUP": {
      // C4 only through the predecessor boundary (validated output).
      const scope = groupScopeAt(ctx, applicability.groupRef, at, knowledgeCutoff, hash);
      if (!scope.ok) return of("INVALID", scope.codes, null);
      const entry = scope.scope.animals.find((a) => a.animalId === ctx.animalId);
      if (!entry) return of("UNKNOWN", ["CATTLE_PROGRAMME_GROUP_SCOPE_ANIMAL_ABSENT"], scope.scope.fingerprint);
      const member = fromC4Membership(entry.state, entry.issues);
      return member.resolved ? of(member.value ? "MEMBER" : "NOT_MEMBER", [], scope.scope.fingerprint) : of(MEMBERSHIP_OF_OUTCOME[member.outcome], member.reasonCodes, scope.scope.fingerprint);
    }
    case "CRITERIA": {
      const snapshot = ctx.inputs.snapshotFingerprint;
      // (1) Resolve every declared dimension.
      const sex = applicability.sex === null ? null : fromC1Resolution(ctx.facts.sex, "CRITERIA_SEX");
      const born = applicability.bornOnOrAfter === null && applicability.bornBefore === null ? null : fromC1Resolution(ctx.facts.dateOfBirth, "CRITERIA_DATE_OF_BIRTH");
      const unresolved = [sex, born].filter((r): r is Extract<EvidenceResolution<unknown>, { resolved: false }> => r !== null && !r.resolved);
      if (unresolved.length > 0) {
        const worst = foldOrInvalid(unresolved.map((u) => u.outcome));
        return of(MEMBERSHIP_OF_OUTCOME[worst as UnresolvedOutcome], unresolved.flatMap((u) => u.reasonCodes), snapshot);
      }
      // (2) Match resolved values only.
      const dob = born !== null && born.resolved ? (born.value as string) : null;
      const matches =
        (sex === null || (sex.resolved && sex.value === applicability.sex)) &&
        (applicability.bornOnOrAfter === null || (dob !== null && compareStrings(dob, applicability.bornOnOrAfter) >= 0)) &&
        (applicability.bornBefore === null || (dob !== null && compareStrings(dob, applicability.bornBefore) < 0));
      return of(matches ? "MEMBER" : "NOT_MEMBER", [], snapshot);
    }
  }
}

/** The canonical anchor instant of an action for this animal (resolved C1 birth date for DATE_OF_BIRTH). */
export function anchorOf(action: ProgrammeAction, ctx: AnimalContext): EvidenceResolution<string> {
  const anchor = action.schedule.anchor;
  if (anchor.kind === "FIXED_INSTANT") return resolvedEvidence(anchor.at);
  const dob = fromC1Resolution(ctx.facts.dateOfBirth, "ANCHOR_DATE_OF_BIRTH");
  if (!dob.resolved) return dob;
  const at = utcStartOfCalendarDate(dob.value);
  return at === null ? unresolvedEvidence("INVALID_EVIDENCE", "CATTLE_PROGRAMME_ANCHOR_NOT_REPRESENTABLE") : resolvedEvidence(at);
}

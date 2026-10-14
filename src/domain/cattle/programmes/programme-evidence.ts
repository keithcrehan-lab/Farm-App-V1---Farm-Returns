/**
 * Cattle C7 — the resolved-evidence model.
 *
 * Core rule (DOMAIN_CONTRACTS "Cattle C7", predecessor evidence resolution):
 * a RESOLVED C7 outcome (COMPLETED, NOT_APPLICABLE, DUE, OVERDUE, BLOCKED, a
 * PASS gate) may depend only on predecessor evidence that is resolved for
 * every dimension required to establish it. An explicit `null` in a C7
 * definition may waive a MATCHING constraint; it never waives the
 * requirement for authoritative predecessor evidence (CAT-INV-009/014/022).
 *
 * Every matcher therefore runs two steps — (1) evidence authority /
 * resolution, (2) value matching — and only a resolved value can be matched.
 * This module holds the resolution type and the ONLY translations of frozen
 * predecessor states into it; no other C7 module interprets a C1, C3 or C4
 * state directly.
 */

import type { AnimalResolution } from "../animal-snapshot";
import type { ProductBinding, ProductVersionRef } from "../health";
import type { ScopeMembershipState } from "../weights";

/** The C7 outcome of unresolved required evidence (never a resolved-looking state). */
export type UnresolvedOutcome = "INVALID_EVIDENCE" | "EVIDENCE_CONFLICT" | "REVIEW_REQUIRED" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE";

export type EvidenceResolution<T> = { resolved: true; value: T } | { resolved: false; outcome: UnresolvedOutcome; reasonCodes: string[] };

export const resolvedEvidence = <T>(value: T): EvidenceResolution<T> => ({ resolved: true, value });
export const unresolvedEvidence = <T = never>(outcome: UnresolvedOutcome, ...reasonCodes: string[]): EvidenceResolution<T> => ({ resolved: false, outcome, reasonCodes });

/** C1: only KNOWN is resolved. */
export function fromC1Resolution<T>(r: AnimalResolution<T>, dimension: string): EvidenceResolution<T> {
  switch (r.state) {
    case "KNOWN":
      return r.value === null ? unresolvedEvidence("UNKNOWN", `CATTLE_PROGRAMME_${dimension}_UNKNOWN`) : resolvedEvidence(r.value);
    case "UNKNOWN":
      return unresolvedEvidence("UNKNOWN", `CATTLE_PROGRAMME_${dimension}_UNKNOWN`, ...r.issues);
    case "CONFLICTING_EVIDENCE":
      return unresolvedEvidence("EVIDENCE_CONFLICT", `CATTLE_PROGRAMME_${dimension}_EVIDENCE_CONFLICT`, ...r.issues);
    case "INVALID_EVIDENCE":
      return unresolvedEvidence("INVALID_EVIDENCE", `CATTLE_PROGRAMME_${dimension}_INVALID_EVIDENCE`, ...r.issues);
  }
}

/** C4: MEMBER / NOT_MEMBER are resolved (`true` / `false`); every other state is not. */
export function fromC4Membership(state: ScopeMembershipState, issues: readonly string[]): EvidenceResolution<boolean> {
  switch (state) {
    case "MEMBER":
      return resolvedEvidence(true);
    case "NOT_MEMBER":
      return resolvedEvidence(false);
    case "UNKNOWN":
      return unresolvedEvidence("UNKNOWN", "CATTLE_PROGRAMME_GROUP_MEMBERSHIP_UNKNOWN", ...issues);
    case "EVIDENCE_CONFLICT":
      return unresolvedEvidence("EVIDENCE_CONFLICT", "CATTLE_PROGRAMME_GROUP_MEMBERSHIP_EVIDENCE_CONFLICT", ...issues);
    case "INVALID":
      return unresolvedEvidence("INVALID_EVIDENCE", "CATTLE_PROGRAMME_GROUP_MEMBERSHIP_INVALID", ...issues);
  }
}

/**
 * C3 product binding: only BOUND (with its bound version) is resolved. A
 * missing medicine-ledger entry is unresolved, never "no binding needed".
 * UNSUPPORTED has no C7 equivalent and is never a match: insufficient.
 */
export function fromC3Binding(binding: ProductBinding | null): EvidenceResolution<ProductVersionRef> {
  if (binding === null) return unresolvedEvidence("INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_PRODUCT_BINDING_NOT_FOUND");
  const reason = `CATTLE_PROGRAMME_PRODUCT_BINDING_${binding.state}`;
  switch (binding.state) {
    case "BOUND":
      return binding.product === null ? unresolvedEvidence("INSUFFICIENT_EVIDENCE", "CATTLE_PROGRAMME_PRODUCT_BINDING_NOT_FOUND") : resolvedEvidence(binding.product);
    case "UNKNOWN":
    case "UNSUPPORTED":
      return unresolvedEvidence("INSUFFICIENT_EVIDENCE", reason);
    case "INVALID":
      return unresolvedEvidence("INVALID_EVIDENCE", reason);
    case "EVIDENCE_CONFLICT":
      return unresolvedEvidence("EVIDENCE_CONFLICT", reason);
    case "REVIEW_REQUIRED":
      return unresolvedEvidence("REVIEW_REQUIRED", reason);
  }
}

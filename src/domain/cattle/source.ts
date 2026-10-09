/**
 * Cattle C0 — evidence source identity, version binding and change detection.
 *
 * Additive to `source-register.ts`: `SOURCE_REGISTER`/`SourceId` stay the
 * closed register of real, already-verified sources and are not changed.
 * A cattle source has its own stable string id and records the exact
 * version and content fingerprint that was actually used, so a later change
 * to the published material is detectable rather than silently absorbed.
 * `registeredSourceId` optionally links a cattle source to an existing
 * register entry; it never creates one.
 *
 * No real source is defined here — callers (and tests) supply catalogues.
 */

import type { AssessmentFingerprint } from "../assessment-integrity";
import type { SourceId } from "../source-register";
import { computeCattleFingerprint, compareStrings, sameFingerprint, type CattleHash } from "./integrity";

export type CattleSourceAuthorityKind =
  | "LEGISLATION"
  | "REGULATORY_GUIDANCE"
  | "SCHEME_TERMS"
  | "VETERINARY_PROGRAMME"
  | "AUTHORISED_PRODUCT_INFORMATION"
  | "PEER_REVIEWED_SCIENCE"
  | "ADVISORY_SCIENCE"
  | "FARM_RECORD"
  | "ENGINE_INTERNAL";

/** ACTIVE = the version currently relied on; HISTORICAL/SUPERSEDED remain
 * addressable for audit; REVIEW_REQUIRED = a change was detected and nobody
 * has yet confirmed what it means. */
export type CattleSourceLifecycle = "ACTIVE" | "HISTORICAL" | "SUPERSEDED" | "REVIEW_REQUIRED";

export interface CattleEvidenceSource {
  /** Stable identity across versions — never reused for different material. */
  sourceId: string;
  publisher: string;
  title: string;
  authorityKind: CattleSourceAuthorityKind;
  jurisdiction: string | null;
  context: string | null;
  /** Publisher's own version label (edition, amendment, revision). */
  version: string;
  /** Fingerprint of the material actually used (`computeSourceContentFingerprint`). */
  contentFingerprint: AssessmentFingerprint;
  retrievedAt: string;
  checkedAt: string;
  lifecycle: CattleSourceLifecycle;
  supersededByVersion: string | null;
  registeredSourceId: SourceId | null;
}

/** The exact source version a rule or evidence pack is bound to. */
export interface SourceVersionRef {
  sourceId: string;
  version: string;
  contentFingerprint: AssessmentFingerprint;
}

export function sourceVersionRef(source: CattleEvidenceSource): SourceVersionRef {
  return { sourceId: source.sourceId, version: source.version, contentFingerprint: source.contentFingerprint };
}

/** Fingerprints the source material itself (text/structured extract), not
 * the catalogue metadata — retrieval/check timestamps never change it. */
export function computeSourceContentFingerprint(material: unknown, hash: CattleHash): AssessmentFingerprint {
  return computeCattleFingerprint("CATTLE_SOURCE_MATERIAL", material, hash);
}

export function compareSourceVersionRefs(a: SourceVersionRef, b: SourceVersionRef): number {
  return compareStrings(a.sourceId, b.sourceId) || compareStrings(a.version, b.version) || compareStrings(a.contentFingerprint.digest, b.contentFingerprint.digest);
}

export type SourceBindingStatus =
  | "CURRENT"
  | "SOURCE_VERSION_CHANGED"
  | "SOURCE_CONTENT_CHANGED"
  | "SOURCE_REVIEW_REQUIRED"
  | "SOURCE_NO_ACTIVE_VERSION"
  | "SOURCE_MULTIPLE_ACTIVE_VERSIONS"
  | "SOURCE_NOT_FOUND";

export interface SourceBindingCheck {
  bound: SourceVersionRef;
  status: SourceBindingStatus;
  /** The active catalogue entry compared against, when exactly one exists. */
  current: SourceVersionRef | null;
}

/**
 * Compares a bound source version with the catalogue's current state.
 * Only an exact match with exactly one ACTIVE entry is CURRENT; every other
 * case is a change/review state. Never mutates the binding or the catalogue.
 */
export function checkSourceBinding(bound: SourceVersionRef, catalogue: readonly CattleEvidenceSource[]): SourceBindingCheck {
  const entries = catalogue.filter((s) => s.sourceId === bound.sourceId);
  if (entries.length === 0) return { bound, status: "SOURCE_NOT_FOUND", current: null };
  const active = entries.filter((s) => s.lifecycle === "ACTIVE");
  if (active.length > 1) return { bound, status: "SOURCE_MULTIPLE_ACTIVE_VERSIONS", current: null };
  if (active.length === 0) {
    const reviewing = entries.some((s) => s.lifecycle === "REVIEW_REQUIRED");
    return { bound, status: reviewing ? "SOURCE_REVIEW_REQUIRED" : "SOURCE_NO_ACTIVE_VERSION", current: null };
  }
  const current = sourceVersionRef(active[0]);
  if (current.version !== bound.version) return { bound, status: "SOURCE_VERSION_CHANGED", current };
  if (!sameFingerprint(current.contentFingerprint, bound.contentFingerprint)) return { bound, status: "SOURCE_CONTENT_CHANGED", current };
  return { bound, status: "CURRENT", current };
}

/** Exact historical lookup: the catalogue entry for this id + version +
 * fingerprint, whatever its lifecycle, or `null`. */
export function findSourceVersion(ref: SourceVersionRef, catalogue: readonly CattleEvidenceSource[]): CattleEvidenceSource | null {
  return (
    catalogue.find(
      (s) => s.sourceId === ref.sourceId && s.version === ref.version && sameFingerprint(s.contentFingerprint, ref.contentFingerprint),
    ) ?? null
  );
}

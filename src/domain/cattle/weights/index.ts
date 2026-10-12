/**
 * Cattle C4 — canonical weight observations and group-scope resolution.
 * Pure, deterministic engine and contracts only; no ADG, gain, trend or
 * target logic (C5), no weight conversion factor beyond the kilogram
 * identity, and no group truth (C1 owns it). See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C4").
 */

// The canonical projections (`projectCanonicalWeightSeries`,
// `resolveValidScope`, `readScopeRequest`) trust already-canonical input and
// are module-internal: the public paths are `projectWeightSeries`,
// `resolveGroupScope` and `buildWeightReadContract`, which run the canonical
// boundary first (CAT-INV-001/002).
export * from "./weight-observation";
export * from "./weight-integrity";
export {
  latestKnownWeightOf,
  projectWeightSeries,
  weightSeriesPayload,
  type AnimalWeightSeries,
  type LatestKnownWeight,
  type LatestWeightReasonCode,
  type LatestWeightState,
  type WeightCompetition,
  type WeightIssue,
  type WeightObservationStatus,
  type WeightProjectionQuery,
  type WeightRequestIssueCode,
  type WeightSeriesEntry,
  type WeightSeriesProjection,
  type WeightSeriesRequest,
  type WeightSeriesResult,
} from "./weight-series";
export {
  resolveGroupScope,
  scopeResolutionPayload,
  type GroupScopeRequest,
  type MembershipSegment,
  type ScopeAnimalEntry,
  type ScopeHistory,
  type ScopeIssue,
  type ScopeIssueCode,
  type ScopeKind,
  type ScopeMembership,
  type ScopeMembershipState,
  type ScopeQuery,
  type ScopeResolution,
  type ScopeResult,
  type ScopeSpec,
} from "./group-scope";
export * from "./weight-read-contract";

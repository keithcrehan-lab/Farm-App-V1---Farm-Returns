/**
 * Scientific engine V3 foundation — the Recommendation Audit Trace record
 * shapes. Phase 1 (see `src/domain/evidence.ts`'s header for the phase
 * note — imported by nothing existing yet).
 *
 * Every interface below mirrors, field for field,
 * `docs/scientific-engine/v3/schemas/recommendation_trace.schema.json`,
 * `schemas/peer_review.schema.json` and `reports/report_field_contract.csv`
 * — cross-checked against the worked example in
 * `reports/sample_recommendation_audit.json`. Field names here are
 * camelCase (this codebase's house style, e.g. `calculationVersion` in
 * `types.ts`); each carries a comment naming its snake_case schema/CSV
 * counterpart, so a future JSON/CSV exporter is a mechanical rename, not a
 * redesign.
 *
 * Nothing in this file computes an agronomic, regulatory or financial
 * number — it only gives a *shape* for a future gate/calculation to record
 * its own numbers into, and two small deterministic utilities
 * (`canonicalJsonStringify`, `computeTraceSha256`) needed to make that
 * record's integrity hash reproducible.
 */

import type { EvidenceState } from "./evidence";
import type { RulesetVersion, SourceId } from "./source-register";

// ---------------------------------------------------------------------------
// Decision record and its children
// ---------------------------------------------------------------------------

/** `decision_type` enum, `recommendation_trace.schema.json`. */
export type DecisionType =
  | "ACTION_RECOMMENDATION"
  | "NO_ACTION_RECOMMENDED"
  | "LEGAL_PROHIBITION"
  | "DATA_REQUEST"
  | "ESTIMATE"
  | "WARNING"
  | "BLOCKED_INSUFFICIENT_EVIDENCE"
  | "ALTERNATIVE_SCENARIO";

/** For every input a decision used — schema's `inputs[]`,
 * `report_field_contract.csv`'s `InputEvidence` rows. */
export interface InputEvidence {
  name: string;
  /** raw_value — preserve source precision, e.g. `8.01`, never rounded to
   * force a classification (spec B1). */
  rawValue: unknown;
  /** normalised_value — the typed, unit-canonicalised value actually used. */
  normalisedValue: unknown;
  unit?: string | null;
  /** source_kind, `report_field_contract.csv` InputEvidence rows +
   * `sample_recommendation_audit.json`'s own `FIELD_OR_WEATHER_ASSESSMENT`. */
  sourceKind: "LAB" | "FARMER" | "MAP" | "API" | "IRISH_DEFAULT" | "DERIVED" | "FIELD_OR_WEATHER_ASSESSMENT";
  evidenceState: EvidenceState;
  recordedAt?: string;
  /** override — never omitted; `false` for every input that wasn't a
   * farmer override of a computed/default value. */
  override: boolean;
  originalValueBeforeOverride?: unknown;
  sourceDocument?: string;
}

/** One ordered arithmetic/rule transformation — schema's
 * `calculation_steps[]`. */
export interface CalculationStep {
  sequence: number;
  /** formula_rule_id — should name a known `calculation_contracts.csv` id
   * (e.g. `"COMPLIANCE_MANURE_NP"`) once a gate emits these for real; not
   * runtime-enforced here (that registry doesn't exist as code yet), so
   * only documented as the convention to follow. */
  formulaRuleId: string;
  description: string;
  /** formula_expression — human-readable, e.g. `"10 m3 x 2.4 kg N/m3"`. */
  formulaExpression: string;
  substitutedValues?: Record<string, unknown>;
  /** result_value */
  result: unknown;
  unit?: string;
  roundingRule?: string;
  sourceIds: SourceId[];
}

/** One relevant legal/regulatory check — schema's `compliance_checks[]`. */
export interface ComplianceCheck {
  checkId: string;
  rule: string;
  evaluatedValue?: unknown;
  result: "PASS" | "FAIL" | "UNKNOWN" | "NOT_APPLICABLE";
  /** consequence — non-empty even on PASS (e.g. `"No action required"`),
   * per the report spec's "list every relevant check, including passing
   * checks". */
  consequence: string;
  instrument?: string;
  effectiveDate?: string;
  sourceId: SourceId;
}

/**
 * Covers both the schema's `assumptions[]` (a default that was used) and
 * `data_gaps[]` (evidence that was missing, blocking an output) — same
 * field shape in the report spec's §4G/§4J, `kind` disambiguates which
 * array it belongs in when serialised later.
 */
export interface AssumptionOrGap {
  kind: "DEFAULT_USED" | "MISSING_EVIDENCE";
  description: string;
  reason: string;
  sourceId?: SourceId;
  /** A default can never be labelled measured (report spec §4G) — this
   * flag is how a future UI knows to keep that distinction visible. */
  replaceableByMeasurement: boolean;
  limitation?: string;
  /** Only meaningful for `kind: "MISSING_EVIDENCE"`. */
  blockedOutput?: string;
  resolution?: string;
}

/** One entry in a decision's `sources[]` — distinct from the bibliographic
 * `SourceReference` in `source-register.ts`: this is the *citation* (which
 * source, which section, current or superseded at calculation time), not
 * the source's own metadata. */
export interface SourceCitation {
  sourceId: SourceId;
  authority: string;
  section?: string;
  effectiveStatus: "CURRENT" | "SUPERSEDED" | "HISTORICAL";
}

export interface DecisionRecord {
  /** recommendation_id */
  recommendationId: string;
  decisionType: DecisionType;
  /** scope.type / scope.id, e.g. `{type: "FIELD", id: "field-back"}`. */
  scope: { type: string; id: string };
  action: string;
  /** quantity_value / quantity_unit — CONDITIONAL: only present when the
   * decision is numeric. */
  quantity?: { value: number; unit: string };
  /** reason_codes — schema requires minItems 1; enforced again at runtime
   * by `recordDecision` below since a dynamically-built array can defeat
   * TypeScript's tuple check. */
  reasonCodes: string[];
  evidenceState: EvidenceState;
  inputs: InputEvidence[];
  calculationSteps: CalculationStep[];
  complianceChecks: ComplianceCheck[];
  /** "default was used" entries — schema's `assumptions[]`. */
  assumptions: AssumptionOrGap[];
  /** "evidence was missing" entries — schema's `data_gaps[]`. */
  dataGaps: AssumptionOrGap[];
  alternatives?: { action: string; reason: string }[];
  /** sources — schema requires minItems 1; enforced again at runtime. */
  sources: SourceCitation[];
  /** `authoritative` is always `false` here — report spec §8: the
   * structured trace is authoritative, an LLM narrative never is. No
   * builder in this phase ever populates this field with real narrative
   * text; it exists only so a later phase's shape is already correct. */
  narrativeExplanation?: { authoritative: false; text: string } | null;
}

// ---------------------------------------------------------------------------
// CalculationRun
// ---------------------------------------------------------------------------

export interface CalculationRun {
  calculationRunId: string;
  farmSnapshotId: string;
  /** calculated_at, ISO datetime. */
  calculatedAt: string;
  ruleset: RulesetVersion;
  /** "application build/commit SHA where available" — report spec §3. */
  buildSha?: string;
  decisionRecords: DecisionRecord[];
  /** Phase 1's immutability guard — see `recordDecision`/`sealCalculationRun`
   * below. Once `true`, `recordDecision` refuses to add another decision;
   * no function in this module ever sets it back to `false`. */
  sealed: boolean;
  /** integrity.trace_sha256 — only set once `sealCalculationRun` runs. */
  traceSha256?: string;
}

export interface PeerReview {
  peerReviewId: string;
  calculationRunId: string;
  recommendationId: string;
  reviewStatus: "UNREVIEWED" | "VERIFIED" | "QUESTIONED" | "REJECTED" | "SUPERSEDED";
  reviewedAt: string;
  reviewerNote?: string;
  issueCategory?: string;
  followUp?: string;
}

// ---------------------------------------------------------------------------
// Builders — pure; every function returns a NEW object rather than
// mutating its input, so a caller cannot accidentally rewrite history even
// before a run is sealed.
// ---------------------------------------------------------------------------

/**
 * `calculatedAt` is an injectable ISO datetime (defaulting to the real
 * clock), the same "injectable clock for deterministic tests" convention
 * `calculateLivestockEconomics`'s `today?: Date` option already uses in
 * this codebase — not a new pattern.
 */
export function startCalculationRun(
  calculationRunId: string,
  farmSnapshotId: string,
  ruleset: RulesetVersion,
  options: { calculatedAt?: string; buildSha?: string } = {},
): CalculationRun {
  return {
    calculationRunId,
    farmSnapshotId,
    calculatedAt: options.calculatedAt ?? new Date().toISOString(),
    ruleset,
    buildSha: options.buildSha,
    decisionRecords: [],
    sealed: false,
  };
}

/**
 * Appends one decision to a run. Throws if the run is already sealed
 * (`RECOMMENDATION_AUDIT_REPORT_SPEC.md` §1: "historical runs stay
 * unchanged") and throws if the decision's `reasonCodes`/`sources` are
 * empty — a runtime backstop for the schema's `minItems: 1`, since a
 * dynamically-constructed array (e.g. from a `.filter()`) can satisfy
 * TypeScript's `string[]` type without actually being non-empty.
 */
export function recordDecision(run: CalculationRun, decision: DecisionRecord): CalculationRun {
  if (run.sealed) {
    throw new Error(
      `Cannot record a decision on sealed CalculationRun "${run.calculationRunId}" — historical runs are immutable.`,
    );
  }
  if (decision.reasonCodes.length === 0) {
    throw new Error(`DecisionRecord "${decision.recommendationId}" must have at least one reason code.`);
  }
  if (decision.sources.length === 0) {
    throw new Error(`DecisionRecord "${decision.recommendationId}" must cite at least one source.`);
  }
  return { ...run, decisionRecords: [...run.decisionRecords, decision] };
}

/**
 * Canonicalises a value for hashing: object keys are recursively sorted;
 * array order is preserved (order is meaningful data — `calculationSteps`'
 * `sequence` relies on it); primitives pass through unchanged. Two payloads
 * that differ only in object-key insertion order canonicalise identically.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * SHA-256 over a value's canonicalised JSON form — the shared primitive
 * `computeTraceSha256` below and `audit-trace-adapters.ts`'s
 * `computeFarmSnapshotId` both build on, so there is exactly one hashing
 * implementation in this module, not two independently-written ones.
 * Uses the standard Web Crypto API (`crypto.subtle.digest`), available in
 * both the browser and the Node runtime this app already targets — no new
 * dependency.
 */
export async function canonicalSha256(value: unknown): Promise<string> {
  const canonical = canonicalJsonStringify(value);
  const bytes = new TextEncoder().encode(canonical);
  const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 over the canonicalised fingerprint of a run's actual content —
 * normalised inputs/decisions, ruleset, and build SHA (spec §7's
 * "calculation-code version") — deliberately EXCLUDING `calculatedAt`,
 * `sealed` and `traceSha256` itself: those describe when/whether the run
 * was sealed, not what it decided, so two runs with byte-identical
 * decisions computed at different wall-clock times still hash identically
 * (this is what makes the "same input twice -> same hash" determinism
 * test meaningful, and matches spec §7's own framing: "a reproducibility/
 * change-detection fingerprint, not a legal digital signature").
 *
 * Web Crypto's `digest()` is inherently Promise-based, so this function
 * (and `sealCalculationRun`) are async, a deliberate refinement from the
 * Phase 1 plan's sketched synchronous signature.
 */
export async function computeTraceSha256(run: CalculationRun): Promise<string> {
  return canonicalSha256({
    calculationRunId: run.calculationRunId,
    farmSnapshotId: run.farmSnapshotId,
    ruleset: run.ruleset,
    buildSha: run.buildSha ?? null,
    decisionRecords: run.decisionRecords,
  });
}

/**
 * Seals a run: computes and sets `traceSha256`, sets `sealed: true`.
 * Idempotent — sealing an already-sealed run returns it unchanged (no
 * recomputation, no error) rather than throwing, since `recordDecision`
 * already refuses to change a sealed run's content, so there is nothing
 * for a second seal call to do. No corresponding "unseal" function exists
 * anywhere in this module.
 */
export async function sealCalculationRun(run: CalculationRun): Promise<CalculationRun> {
  if (run.sealed) return run;
  const traceSha256 = await computeTraceSha256(run);
  return { ...run, sealed: true, traceSha256 };
}

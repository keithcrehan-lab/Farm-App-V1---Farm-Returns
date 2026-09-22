/**
 * Economic Opportunity Engine, Phase 7.1 — Canonical Integrity, Scientific
 * Provenance & Assessment Fingerprinting.
 *
 * Phase 7's own `buildAuditedWholeFarmDecisionRecord` closed a real
 * HIGH-severity attack (a forged constituent record sharing a real
 * assessment's `id`/`fieldId` but carrying materially different content)
 * using raw `JSON.stringify` structural equality. That was safe enough for
 * an in-memory check on plain JSON-safe values, but the brief is explicit
 * it must not become the DURABLE semantic-identity/persistence-integrity
 * mechanism: `JSON.stringify` has no declared schema version, no declared
 * algorithm, and (unlike a real canonical form) is not guaranteed stable
 * across engines/versions if object construction order ever changed. This
 * module replaces it with an explicit, versioned canonicalisation +
 * SHA-256 content fingerprint — a TAMPER/DIVERGENCE-DETECTION mechanism,
 * never a digital signature (see the "NOT a signature" note below).
 *
 * Pure domain, deliberately Node-independent — mirrors `market-evidence.ts`'s
 * own established "domain module builds the canonical input, the CALLER
 * (which has real `node:crypto` access) supplies the hash function" split
 * (`canonicalContentHashInput`, consumed by `src/server/market/
 * cso-fertiliser-sync.ts`'s injectable `deps.hash`). `computeAssessmentFingerprint`/
 * `verifyAssessmentFingerprint` both take `hash: (input: string) => string`
 * as a REQUIRED parameter rather than importing `node:crypto` at the top of
 * this file — this module never becomes unusable in a context without Node's
 * crypto module (this codebase already draws this exact line twice: see
 * `market-evidence.ts`'s and `market-price-resolution.ts`'s own headers).
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's nine named conditions) — resolved, not
 * triggered; see DOMAIN_CONTRACTS.md's Phase 7.1 section for the full
 * write-up this comment summarises.
 * ---------------------------------------------------------------------
 *
 * STOP A (canonicalisation cannot preserve semantic identity) — NOT
 * triggered. `SlurryDirectEconomicAssessment`/`SlurryWholeFarmAllocationResult`
 * are (per Phase 7's own header, re-verified here) entirely plain,
 * JSON-safe values — no `Decimal` instances, no `Date` objects, no
 * functions, no class instances anywhere in either shape. Every value
 * reachable from either object is a string, number, boolean, `null`, plain
 * object or array — exactly the value space `canonicalizeValue` below
 * accepts. No earlier Phase 1-6 contract needed to change.
 *
 * STOP B (scientific provenance missing) — NOT triggered. The one material
 * scientific transformation Phase 5 depends on — `resolveAvailableSlurryNutrients`
 * (`nutrients.ts`) — already carries real, specific, non-invented citations
 * for every evidenced path: "Teagasc Green Book Table 9-8 (spring
 * application, splashplate)" (`SLURRY_TABLE_9_8`), "Teagasc spring/LESS
 * cattle-slurry available-nutrient table (GFT047)"
 * (`SPRING_LESS_SLURRY_TABLE`), "Teagasc summer/LESS cattle-slurry
 * available-nutrient table (Signpost Fact Sheet 07, \"Getting the Most From
 * Your Slurry\")" (`SUMMER_LESS_SLURRY_TABLE`) — verified directly in
 * `nutrients.ts` (lines ~896-1029), not assumed from memory. This module
 * fingerprints that real citation (`scienceSupport.value.source`/`.ruleId`/
 * `.scientificBasisNote`) unchanged, exactly as Phase 5 already exposes it —
 * it invents nothing new.
 *
 * STOP C (applicability cannot be proven) — NOT triggered.
 * `resolveAvailableSlurryNutrients` already fails closed on every timing/
 * method combination lacking an evidenced table (`slurryTimingNotSupported`
 * for LESS at LATE_SUMMER/UNSUPPORTED and for splashplate outside SPRING;
 * `SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD` for `incorporate_24h`/
 * `other` at any timing) — applicability is a real, structural, already-
 * enforced gate, not a documentation-only claim. `SlurryScienceSupportOutcome`
 * (`scienceSupport` below) preserves this gate's own real status/reasonCode
 * unstripped.
 *
 * STOP D (assessment identity insufficient) — NOT triggered. Phase 7's own
 * adversarial review already proved `assessmentId` + `evaluatedActionId` +
 * `supersedesRecordId` together distinguish "same assessment recorded
 * twice" from "same action legitimately reassessed" (see
 * `audited-opportunity-record.ts`'s own header, STOP C). Fingerprinting
 * strengthens, not weakens, this: a genuine reassessment gets a NEW
 * `assessmentId` (a new real calculation) and therefore, in the overwhelming
 * majority of real cases, a new fingerprint too — but the *fingerprint*
 * itself never substitutes for `assessmentId`/`evaluatedActionId` as the
 * identity mechanism; see `buildPhase5IntegrityPayload`'s header for why
 * `assessmentId` still participates IN the fingerprint payload (brief §29
 * explicitly requires an `assessmentId` mutation to change the fingerprint)
 * while remaining a separate identity concept used for lookup.
 *
 * STOP E (material semantic input cannot be included) — NOT triggered.
 * Every field of `SlurryDirectEconomicAssessment`/`SlurryWholeFarmAllocationResult`
 * that could materially alter scientific/economic meaning participates in
 * the integrity payload below (see each payload's own field-by-field
 * justification) — the only fields deliberately EXCLUDED are pure
 * calculation-instance timestamps (`createdAt` at every level), which
 * mirrors the exact same exclusion this codebase's own Phase 2
 * `canonicalContentHashInput` (`market-evidence.ts`) already established
 * for `retrievedAt`/`ingestionBatchId` — "when this was computed/recorded"
 * is not part of "what was computed."
 *
 * STOP F (Phase 6 constituent identity cannot incorporate fingerprint
 * binding) — NOT triggered; see `buildPhase6IntegrityPayload` and
 * `audited-opportunity-record.ts`'s updated `buildAuditedWholeFarmDecisionRecord`,
 * which now verifies each constituent's Phase 5 fingerprint against the
 * one recomputed from the AUTHORITATIVE `result.selected[].assessment` —
 * strengthening, not merely replacing, the id/fieldId checks already there.
 *
 * STOP G (exact money/quantity cannot survive canonicalisation) — NOT
 * triggered. `MoneyAmount`/`evaluatedActionVolumeM3`/`volumeM3` are already
 * decimal *strings*; `canonicalizeValue` treats a string as an opaque,
 * lossless value (`JSON.stringify`'s own string-escaping, never `Number()`/
 * `parseFloat`) — proven by this module's own precision tests using a real
 * multi-decimal-place amount.
 *
 * STOP H (upstream provenance mutation) — NOT triggered.
 * `createAuditedActionOpportunityRecord`/`buildAuditedWholeFarmDecisionRecord`
 * already `structuredClone` the source assessment/result before this
 * module ever sees it (Phase 7's own STOP B resolution) — the fingerprint
 * is always computed from an already-immutable, disconnected snapshot.
 *
 * STOP I (fixing this requires changing a scientific constant) — NOT
 * triggered. Nothing in this module touches `SLURRY_TABLE_9_8`/
 * `SPRING_LESS_SLURRY_TABLE`/`SUMMER_LESS_SLURRY_TABLE` or any other
 * scientific constant — it only fingerprints the REAL, EXISTING citations
 * those tables already carry.
 *
 * ---------------------------------------------------------------------
 * NOT a digital signature (brief §6/§43): a SHA-256 content fingerprint
 * proves "this content is exactly what originally produced this
 * fingerprint" ONLY when the stored fingerprint itself is trustworthy — it
 * does NOT independently protect against an actor with unrestricted
 * ability to modify BOTH the assessment content AND its stored fingerprint
 * together (e.g. a compromised database row holding both). This phase's
 * real guarantee: "all trusted engine layers can deterministically prove
 * they are referring to exactly the same canonical audited assessment
 * content" — nothing stronger. A future persistence layer wanting real
 * tamper-resistance against a compromised store would need a server-held
 * HMAC/signature, append-only audit controls, or restricted write
 * permissions — explicitly out of scope here (brief §43), documented, not
 * implemented.
 */

import type { EngineOutcome } from "./evidence";
import type { MoneyAmount } from "./money";
import type { EconomicEffect, EconomicScenario } from "./economic-opportunity";
import type { FertiliserPlanCostAssessment } from "./fertiliser-plan-cost";
import type {
  CounterfactualInvarianceCheckResult,
  RealisationCostInput,
  SlurryDirectEconomicAssessment,
  SlurryScienceSupportOutcome,
} from "./slurry-direct-economic-assessment";
import type {
  ExcludedSlurryAllocationCandidate,
  SlurryWholeFarmAllocationResult,
} from "./slurry-whole-farm-allocation";

/**
 * The integrity schema this build of the fingerprinting logic implements —
 * which fields participate, how they're normalised, how they're ordered.
 * A future schema change increments this rather than silently altering
 * fingerprints under the same version number (brief §4): a HISTORICALLY
 * fingerprinted assessment stays verifiable under the schema version it was
 * actually fingerprinted with; `verifyAssessmentFingerprint` rejects an
 * unsupported schema version explicitly rather than attempting a
 * best-effort comparison across versions.
 */
export const ASSESSMENT_INTEGRITY_SCHEMA_VERSION = 1;

export const ASSESSMENT_FINGERPRINT_ALGORITHM = "SHA-256";

export interface AssessmentFingerprint {
  schemaVersion: number;
  algorithm: "SHA-256";
  /** Lowercase hex digest. */
  digest: string;
}

export interface FingerprintVerificationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Canonicalisation (brief §3) — a generic, domain-agnostic deterministic
// serialiser. FAILS CLOSED on anything outside the supported value space
// rather than silently omitting/coercing it (brief: "do not silently omit
// unsupported content").
//
// Explicit policy decisions (brief §3/§31), stated once here rather than
// left to accident:
//  - Object keys: sorted lexicographically — independent of insertion
//    order (brief §28/§39: canonicalisation must not depend on JS object
//    key insertion order).
//  - Arrays: NEVER reordered by this generic function — order is preserved
//    exactly as given. Whether a given array is semantically ordered
//    (e.g. `scenarios`, already-canonically-ordered `lines`) or
//    semantically unordered (e.g. `limitations`) is a DOMAIN decision made
//    by the payload builders below (`buildPhase5IntegrityPayload`/
//    `buildPhase6IntegrityPayload`), which sort the unordered ones
//    themselves before handing them to this function — this function does
//    not guess.
//  - Missing key vs. explicit `null`: DIFFERENT. A key absent from an
//    object is simply absent from the canonical string; `null` appears as
//    literal `"key":null`. Every integrity payload type below is designed
//    with NO optional fields (nullable facts use `null` explicitly), so
//    this ambiguity cannot arise from the payload types themselves — only
//    from genuinely-optional upstream sub-objects (e.g.
//    `CounterfactualInvarianceCheckResult.reasonCode?`), where "absent"
//    correctly means "not applicable" (e.g. a `valid: true` result
//    genuinely has no reason code to report).
//  - `undefined`: REJECTED outright (fail closed) — never silently treated
//    as `null` or omitted mid-object. If a real value could legitimately
//    be `undefined`, the payload type must model it as an explicitly
//    absent key or an explicit `null`, never leave `undefined` to reach
//    this function.
//  - Differently-scaled equal decimal strings (e.g. `"0"` vs `"0.00"`,
//    `"200"` vs `"200.0"`): treated as DIFFERENT canonical values — a
//    DELIBERATE choice, not an oversight (brief §31 requires an explicit
//    decision here). `money.ts`'s own established contract already states
//    `MoneyAmount.amount` is "not byte-canonical across scale" and
//    mandates `equalsMoney`/`compareMoney` — never string/`JSON.stringify`
//    equality — for ECONOMIC comparison. This fingerprint is deliberately
//    a stricter, lower-level CONTENT/byte fingerprint, not an economic-
//    equality check: every real calculation path in this codebase produces
//    a given amount through exactly one deterministic arithmetic function
//    (`addMoney`/`subtractMoney`/`multiplyMoney`), so the SAME real
//    calculation re-run on the SAME real inputs always produces the same
//    scale — two different scale representations of an economically equal
//    amount can therefore only arise from a genuinely different
//    computation path or a substituted value, which is exactly the
//    divergence this mechanism exists to catch, not smooth over.
// ---------------------------------------------------------------------------

export function canonicalizeValue(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null) return "null";
  const type = typeof value;

  if (type === "string") return JSON.stringify(value);
  if (type === "boolean") return value ? "true" : "false";

  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(
        `canonicalizeValue: unsupported numeric value (${String(value)}) — NaN/Infinity have no canonical decimal representation and cannot be fingerprinted; use an exact decimal string instead`,
      );
    }
    return JSON.stringify(value);
  }

  if (type === "undefined") {
    throw new Error(
      "canonicalizeValue: undefined is not a supported value — the caller's payload type must model this fact as an explicitly absent key or an explicit null, never a literal undefined reaching canonicalisation",
    );
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new Error("canonicalizeValue: circular reference detected inside an array — cannot canonicalise cyclic structures");
    }
    seen.add(value);
    const items = value.map((item) => canonicalizeValue(item, seen));
    seen.delete(value);
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      const ctorName = (value as { constructor?: { name?: string } }).constructor?.name ?? "unknown";
      throw new Error(
        `canonicalizeValue: unsupported object type (constructor: ${ctorName}) — only plain objects (and arrays/strings/finite numbers/booleans/null within them) are supported; Date/Map/Set/class instances/functions are rejected rather than silently omitted or coerced`,
      );
    }
    if (seen.has(value)) {
      throw new Error("canonicalizeValue: circular reference detected inside an object — cannot canonicalise cyclic structures");
    }
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(obj[key], seen)}`);
    seen.delete(value);
    return `{${parts.join(",")}}`;
  }

  // function, symbol, bigint.
  throw new Error(`canonicalizeValue: unsupported value type "${type}" — only plain JSON-safe values are supported`);
}

/** The full payload, wrapped with its own declared schema version, is what
 * actually gets canonicalised and hashed — never the bare payload alone —
 * so a schema-version bump always changes every fingerprint computed under
 * it, even if every OTHER field happened to canonicalise identically. */
function canonicalizeIntegrityPayload(payload: unknown): string {
  return canonicalizeValue({ integritySchemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION, payload });
}

// ---------------------------------------------------------------------------
// Fingerprint construction / verification (brief §22/§23) — the declared
// pipeline: trusted authoritative object -> explicit integrity payload ->
// canonicalise -> hash -> attach fingerprint metadata. Never a raw object
// piped straight into a hash function.
// ---------------------------------------------------------------------------

export function computeAssessmentFingerprint(payload: unknown, hash: (input: string) => string): AssessmentFingerprint {
  const canonical = canonicalizeIntegrityPayload(payload);
  return {
    schemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION,
    algorithm: ASSESSMENT_FINGERPRINT_ALGORITHM,
    digest: hash(canonical),
  };
}

/**
 * Validates a claimed fingerprint against a freshly recomputed one.
 * NEVER silently regenerates/replaces a mismatching stored fingerprint —
 * a mismatch is always reported as a real, explicit failure (brief §23:
 * "mismatch must fail closed").
 */
export function verifyAssessmentFingerprint(
  payload: unknown,
  expected: AssessmentFingerprint,
  hash: (input: string) => string,
): FingerprintVerificationResult {
  if (expected.schemaVersion !== ASSESSMENT_INTEGRITY_SCHEMA_VERSION) {
    return {
      valid: false,
      reasonCode: "ASSESSMENT_INTEGRITY_UNSUPPORTED_SCHEMA_VERSION",
      detail: `expected fingerprint declares integrity schema version ${expected.schemaVersion}; this build only verifies against version ${ASSESSMENT_INTEGRITY_SCHEMA_VERSION}`,
    };
  }
  if (expected.algorithm !== ASSESSMENT_FINGERPRINT_ALGORITHM) {
    return {
      valid: false,
      reasonCode: "ASSESSMENT_INTEGRITY_UNSUPPORTED_ALGORITHM",
      detail: `expected fingerprint declares algorithm "${expected.algorithm}"; this build only verifies against "${ASSESSMENT_FINGERPRINT_ALGORITHM}"`,
    };
  }
  const recomputed = computeAssessmentFingerprint(payload, hash);
  if (recomputed.digest !== expected.digest) {
    return {
      valid: false,
      reasonCode: "ASSESSMENT_INTEGRITY_FINGERPRINT_MISMATCH",
      detail: "the recomputed content fingerprint does not match the expected fingerprint — the canonical content has diverged from what originally produced the expected fingerprint",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Phase 5 integrity payload (brief §8).
//
// Field-by-field justification (brief: "document why each fingerprinted
// field matters", "do not copy fields simply because they exist"):
//  - engineVersion/assessmentId/evaluatedActionId/fieldId/asOfDate/knownAt:
//    the assessment's own core identity/decision-context facts — brief §21
//    explicitly requires each of these to be independently mutation-tested.
//  - scenarios: the two named counterfactual scenarios this assessment
//    compares — always exactly [baseline, intervention] in that fixed,
//    MEANINGFUL order (preserved, never reordered).
//  - scienceSupport: the complete real scientific outcome (status,
//    ruleId, source citation, applicability method/timing, whether a
//    default was assumed, the soil-index adjustment applied) — the exact
//    fact the whole assessment's validity rests on (brief §16/§B).
//  - counterfactualInvariance: whether the baseline/intervention pair was
//    actually proven to differ only in the evaluated action — a
//    structural validity fact, not decoration.
//  - evaluatedActionVolumeM3: the real physical volume this specific
//    assessment represents (Phase 6's own adversarial-review finding).
//  - baselineFertiliserPlanCost/interventionFertiliserPlanCost: the
//    complete real product/quantity/price/cost content that PROVES the
//    counterfactual comparison — embedded whole (minus each one's own
//    `createdAt`, a pure calculation-instance timestamp — see
//    `costAssessmentContent` below) rather than hand-picked leaf fields,
//    so no materially significant nested fact (a product, a price
//    observation's identity, a CATEGORY_BENCHMARK proxy limitation) can be
//    accidentally left out of the fingerprint.
//  - directCostDifference/directCostDifferenceDirection/effect/
//    realisationCost/netEconomicResult: the assessment's real economic
//    conclusion, in full.
//  - limitations: every real disclosed caveat — SORTED (brief §30: a
//    semantically unordered set of distinct strings; sorting makes the
//    fingerprint independent of the order the source code happened to
//    push them in, without weakening what's captured).
//
// EXCLUDED: `assessment.createdAt` and each nested
// `FertiliserPlanCostAssessment.createdAt` — pure calculation-instance
// timestamps (mirrors this codebase's own Phase 2
// `canonicalContentHashInput` excluding `retrievedAt`/`ingestionBatchId`
// from CSO observation content identity). Two runs of the SAME real
// science/prices/quantities at two different literal clock times represent
// the same audited CONTENT (brief §11: "is this the same audited
// assessment content, not: is this literally the same database row").
// ---------------------------------------------------------------------------

type FertiliserPlanCostAssessmentContent = Omit<FertiliserPlanCostAssessment, "createdAt">;

/** Explicit field-by-field copy (rather than a destructure-to-omit) so no
 * lint rule flags an intentionally-discarded `createdAt` binding. */
function costAssessmentContent(cost: FertiliserPlanCostAssessment): FertiliserPlanCostAssessmentContent {
  return {
    id: cost.id,
    engineVersion: cost.engineVersion,
    asOfDate: cost.asOfDate,
    knownAt: cost.knownAt,
    lines: cost.lines,
    aggregateOutcome: cost.aggregateOutcome,
    limitations: cost.limitations,
  };
}

export interface Phase5AssessmentIntegrityPayload {
  schemaVersion: number;
  engineVersion: string;
  assessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  asOfDate: string;
  knownAt: string;
  scenarios: EconomicScenario[];
  scienceSupport: SlurryScienceSupportOutcome;
  counterfactualInvariance: CounterfactualInvarianceCheckResult;
  evaluatedActionVolumeM3: string;
  baselineFertiliserPlanCost: FertiliserPlanCostAssessmentContent;
  interventionFertiliserPlanCost: FertiliserPlanCostAssessmentContent;
  directCostDifference: EngineOutcome<MoneyAmount>;
  directCostDifferenceDirection: "benefit" | "cost" | "zero" | null;
  effect: EconomicEffect | null;
  realisationCost: RealisationCostInput;
  netEconomicResult: { direction: "benefit" | "cost" | "zero" | null; amount: EngineOutcome<MoneyAmount> };
  limitations: string[];
}

export function buildPhase5IntegrityPayload(assessment: SlurryDirectEconomicAssessment): Phase5AssessmentIntegrityPayload {
  return {
    schemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION,
    engineVersion: assessment.engineVersion,
    assessmentId: assessment.id,
    evaluatedActionId: assessment.evaluatedActionId,
    fieldId: assessment.fieldId,
    asOfDate: assessment.asOfDate,
    knownAt: assessment.knownAt,
    scenarios: assessment.scenarios,
    scienceSupport: assessment.scienceSupport,
    counterfactualInvariance: assessment.counterfactualInvariance,
    evaluatedActionVolumeM3: assessment.evaluatedActionVolumeM3,
    baselineFertiliserPlanCost: costAssessmentContent(assessment.baselineFertiliserPlanCost),
    interventionFertiliserPlanCost: costAssessmentContent(assessment.interventionFertiliserPlanCost),
    directCostDifference: assessment.directCostDifference,
    directCostDifferenceDirection: assessment.directCostDifferenceDirection,
    effect: assessment.effect,
    realisationCost: assessment.realisationCost,
    netEconomicResult: assessment.netEconomicResult,
    limitations: [...assessment.limitations].sort(),
  };
}

export function computePhase5AssessmentFingerprint(
  assessment: SlurryDirectEconomicAssessment,
  hash: (input: string) => string,
): AssessmentFingerprint {
  return computeAssessmentFingerprint(buildPhase5IntegrityPayload(assessment), hash);
}

// ---------------------------------------------------------------------------
// Phase 6 integrity payload (brief §9/§37).
//
// Constituent binding: for each selected candidate, this payload includes
// its identity (evaluatedActionId/fieldId), its own volume/net/gross
// contribution (data PHASE 6 ITSELF already computed — never re-derived
// from the Phase 5 record), AND the constituent's own Phase 5
// `assessmentFingerprint` (brief §9: "constituent Phase 5 fingerprints") —
// never the full duplicated Phase 5 assessment content (brief §37: "do not
// calculate child economics independently"; Phase 7's own "one canonical
// source of truth per fact" design). A caller supplies the map of already-
// computed constituent fingerprints (each one already computed via
// `computePhase5AssessmentFingerprint` when that action's own
// `AuditedActionOpportunityRecord` was built) — this function never
// recomputes a Phase 5 fingerprint itself, mirroring "Phase 6 never
// recreates Phase 5's own calculation."
//
// EXCLUDED: `result.createdAt` — same pure-instance-timestamp exclusion as
// Phase 5's payload, for the identical reason.
// ---------------------------------------------------------------------------

export interface Phase6SelectedIntegrityEntry {
  evaluatedActionId: string;
  fieldId: string;
  volumeM3: string;
  netDirection: "benefit" | "cost" | "zero";
  netAmount: MoneyAmount;
  grossDirection: "benefit" | "cost" | "zero";
  grossAmount: MoneyAmount;
  constituentAssessmentId: string;
  constituentFingerprint: AssessmentFingerprint;
}

export interface Phase6AssessmentIntegrityPayload {
  schemaVersion: number;
  engineVersion: string;
  assessmentId: string;
  asOfDate: string;
  knownAt: string;
  availableVolumeM3: string;
  selectedVolumeM3: string;
  remainingVolumeM3: string;
  selected: Phase6SelectedIntegrityEntry[];
  excluded: ExcludedSlurryAllocationCandidate[];
  totalGrossDirection: "benefit" | "cost" | "zero" | null;
  totalGrossAmount: EngineOutcome<MoneyAmount>;
  totalNetDirection: "benefit" | "cost" | "zero" | null;
  totalNetAmount: EngineOutcome<MoneyAmount>;
  limitations: string[];
}

export interface BuildPhase6IntegrityPayloadResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
  payload?: Phase6AssessmentIntegrityPayload;
}

/**
 * Requires one already-computed constituent Phase 5 fingerprint (keyed by
 * `evaluatedActionId`) for EVERY selected candidate — a missing entry is a
 * real, reported failure (never silently skipped or treated as a zero
 * fingerprint), matching this whole engine's "unknown is never silently
 * dropped" discipline.
 */
export function buildPhase6IntegrityPayload(
  result: SlurryWholeFarmAllocationResult,
  constituentFingerprints: ReadonlyMap<string, AssessmentFingerprint>,
): BuildPhase6IntegrityPayloadResult {
  const missing: string[] = [];
  const selected: Phase6SelectedIntegrityEntry[] = [...result.selected]
    .sort((a, b) => (a.evaluatedActionId < b.evaluatedActionId ? -1 : a.evaluatedActionId > b.evaluatedActionId ? 1 : 0))
    .map((s) => {
      const fingerprint = constituentFingerprints.get(s.evaluatedActionId);
      if (fingerprint === undefined) {
        missing.push(s.evaluatedActionId);
        return null;
      }
      return {
        evaluatedActionId: s.evaluatedActionId,
        fieldId: s.fieldId,
        volumeM3: s.volumeM3,
        netDirection: s.netEconomicContribution.direction,
        netAmount: s.netEconomicContribution.amount,
        grossDirection: s.grossEconomicContribution.direction,
        grossAmount: s.grossEconomicContribution.amount,
        constituentAssessmentId: s.assessment.id,
        constituentFingerprint: fingerprint,
      };
    })
    .filter((entry): entry is Phase6SelectedIntegrityEntry => entry !== null);

  if (missing.length > 0) {
    return {
      valid: false,
      reasonCode: "ASSESSMENT_INTEGRITY_MISSING_CONSTITUENT_FINGERPRINT",
      detail: `no constituent Phase 5 fingerprint was supplied for selected action(s): ${missing.sort().join(", ")} — every selected candidate's own Phase 5 fingerprint must already be computed before a Phase 6 integrity payload can be built`,
    };
  }

  return {
    valid: true,
    payload: {
      schemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION,
      engineVersion: result.engineVersion,
      assessmentId: result.id,
      asOfDate: result.asOfDate,
      knownAt: result.knownAt,
      availableVolumeM3: result.availableVolumeM3,
      selectedVolumeM3: result.selectedVolumeM3,
      remainingVolumeM3: result.remainingVolumeM3,
      selected,
      excluded: [...result.excluded].sort((a, b) => (a.evaluatedActionId < b.evaluatedActionId ? -1 : a.evaluatedActionId > b.evaluatedActionId ? 1 : 0)),
      totalGrossDirection: result.totalGrossEconomicEffect.direction,
      totalGrossAmount: result.totalGrossEconomicEffect.amount,
      totalNetDirection: result.totalNetEconomicResult.direction,
      totalNetAmount: result.totalNetEconomicResult.amount,
      limitations: [...result.limitations].sort(),
    },
  };
}

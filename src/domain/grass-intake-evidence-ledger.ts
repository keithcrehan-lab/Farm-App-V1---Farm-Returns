/** Versioned parsing contract for append-only grass-intake evidence.
 * Reject unknown kinds, unverified group/field references and invalid values.
 * Persistence and time-window reconciliation remain separate release gates.
 */
export const GRASS_INTAKE_LEDGER_VERSION = "grass_intake_ledger_v1.0.0";
export type GrassIntakeEvidencePayload =
  | { kind: "cow_calf_pair"; cowGroupId: string; calfGroupId: string; calfStage: "older_grazing" | "milk_dependent"; uniquePairConfirmed: true }
  | { kind: "group_headcount_weight"; groupId: string; headCount: number; avgWeightKg: number }
  | { kind: "group_feed"; groupId: string; feedType: "none" | "concentrate" | "silage" | "other"; kgFreshPerHeadDay: number; dmFraction: number | null }
  | { kind: "dairy_stage"; groupId: string; stage: "midseason_lactating" | "early" | "late" | "dry" }
  | { kind: "cover_basis"; fieldId: string; observationId: string; basis: "measured_above_4cm" };
export interface GrassIntakeLedgerRecord {
  id: string; farmId: string; recordedAt: string; effectiveFrom: string; effectiveTo?: string;
  source: string; supersedesId?: string; payload: GrassIntakeEvidencePayload;
}
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
/** Data-sanity representability bound shared with grass_intake_evidence_num_ok; not a biological limit. */
const representable = (v: number) => v === 0 || (Math.abs(v) >= 1e-6 && Math.abs(v) <= 1e9);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v);
const MIN_DATE = Date.parse("1970-01-01T00:00:00Z"); // matches grass_intake_evidence_effective_range
const MAX_DATE = Date.parse("2200-01-01T00:00:00Z");
const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v));
const effectiveDate = (v: unknown): v is string => date(v) && Date.parse(v) >= MIN_DATE && Date.parse(v) < MAX_DATE;
const positive = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 && representable(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
// Canonical lowercase only (as PostgREST returns uuid columns), matching the DB check.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** Exact key set per kind; must match grass_intake_evidence_payload_valid in
 * supabase/migrations/20261117150000_grass_intake_evidence.sql. An extra key is
 * rejected so unreviewed fields can never ride along as evidence. */
const PAYLOAD_KEYS: Record<GrassIntakeEvidencePayload["kind"], readonly string[]> = {
  cow_calf_pair: ["calfGroupId", "calfStage", "cowGroupId", "kind", "uniquePairConfirmed"],
  group_headcount_weight: ["avgWeightKg", "groupId", "headCount", "kind"],
  group_feed: ["dmFraction", "feedType", "groupId", "kgFreshPerHeadDay", "kind"],
  dairy_stage: ["groupId", "kind", "stage"],
  cover_basis: ["basis", "fieldId", "kind", "observationId"],
};
const exactKeys = (p: Record<string, unknown>, expected: readonly string[]) => {
  const keys = Object.keys(p).sort();
  return keys.length === expected.length && keys.every((k, i) => k === expected[i]);
};
export function parseGrassIntakeEvidence(raw: unknown): GrassIntakeLedgerRecord {
  if (!object(raw)) throw new Error("invalidEvidenceRecord");
  const { id, farmId, recordedAt, effectiveFrom, effectiveTo, source, supersedesId, payload } = raw;
  if (![id, farmId, source].every(text) || !date(recordedAt) || !effectiveDate(effectiveFrom) || !/[A-Za-z0-9]/.test(source as string) || [...(source as string)].length > 300
    || (effectiveTo !== undefined && (!effectiveDate(effectiveTo) || Date.parse(effectiveTo) <= Date.parse(effectiveFrom)))
    || (supersedesId !== undefined && (!text(supersedesId) || supersedesId === id))
    || !object(payload)) throw new Error("invalidEvidenceEnvelope");
  const p = payload;
  const expectedKeys = typeof p.kind === "string" && Object.hasOwn(PAYLOAD_KEYS, p.kind) ? PAYLOAD_KEYS[p.kind as GrassIntakeEvidencePayload["kind"]] : null;
  if (!expectedKeys) throw new Error("unknownEvidenceKind");
  if (!exactKeys(p, expectedKeys)) throw new Error("invalidEvidencePayloadKeys");
  switch (p.kind) {
    case "cow_calf_pair":
      if (!uuid(p.cowGroupId) || !uuid(p.calfGroupId) || p.cowGroupId === p.calfGroupId || p.uniquePairConfirmed !== true || !oneOf(p.calfStage, ["older_grazing", "milk_dependent"])) throw new Error("invalidPairEvidence");
      break;
    case "group_headcount_weight":
      if (!uuid(p.groupId) || !Number.isInteger(p.headCount) || !positive(p.headCount) || !positive(p.avgWeightKg)) throw new Error("invalidAnimalEvidence");
      break;
    case "group_feed":
      if (!uuid(p.groupId) || !oneOf(p.feedType, ["none", "concentrate", "silage", "other"]) || typeof p.kgFreshPerHeadDay !== "number" || !Number.isFinite(p.kgFreshPerHeadDay) || !representable(p.kgFreshPerHeadDay) || p.kgFreshPerHeadDay < 0 || (p.feedType === "none" && p.kgFreshPerHeadDay !== 0) || (p.feedType !== "none" && p.kgFreshPerHeadDay <= 0) || (p.dmFraction !== null && (typeof p.dmFraction !== "number" || !Number.isFinite(p.dmFraction) || p.dmFraction <= 0 || p.dmFraction > 1 || !representable(p.dmFraction)))) throw new Error("invalidFeedEvidence");
      break;
    case "dairy_stage":
      if (!uuid(p.groupId) || !oneOf(p.stage, ["midseason_lactating", "early", "late", "dry"])) throw new Error("invalidDairyStage");
      break;
    case "cover_basis":
      if (!uuid(p.fieldId) || !uuid(p.observationId) || p.basis !== "measured_above_4cm") throw new Error("invalidCoverBasis");
      break;
    default: throw new Error("unknownEvidenceKind");
  }
  return raw as unknown as GrassIntakeLedgerRecord;
}

/**
 * Explicit evidence gates for source-scoped grazing calculations. Pure and NOT wired
 * to sessions. No defaults: missing, stale, cross-farm or unlinked evidence fails closed.
 * An accepted planning allocation must never be silently treated as measured disappearance.
 */
import { calculateSucklerPairAllocation, type SucklerPairResult } from "./teagasc-suckler-paddock-intake";
import { estimateDairyMidseasonIntake, type DairyMidseasonIntake } from "./teagasc-dairy-midseason-intake";

export const GRASS_INTAKE_EVIDENCE_GATE_VERSION = "grass_intake_evidence_gate_v1.0.0";
export interface Evidence<T> {
  value: T;
  farmId: string;
  recordedAt: string;
  source: string;
}
export type GateResult<T> =
  | { status: "READY"; calculation: T; evidenceDates: readonly string[]; gateVersion: typeof GRASS_INTAKE_EVIDENCE_GATE_VERSION }
  | { status: "HELD"; reasons: readonly string[] };

type RequiredEvidence<T> = Evidence<T> | undefined;
const present = <T>(item: RequiredEvidence<T>, farmId: string, asOf: string, maxAgeDays: number): boolean => {
  if (!item || item.farmId !== farmId || !item.source.trim()) return false;
  const at = Date.parse(item.recordedAt);
  const now = Date.parse(asOf);
  return Number.isFinite(at) && Number.isFinite(now) && at <= now && now - at <= maxAgeDays * 86_400_000;
};
function collect(name: string, item: RequiredEvidence<unknown>, farmId: string, asOf: string, maxAgeDays: number, missing: string[]): boolean {
  if (present(item, farmId, asOf, maxAgeDays)) return true;
  missing.push(name);
  return false;
}
const validIdentity = (farmId: string, asOf: string) => farmId.trim().length > 0 && Number.isFinite(Date.parse(asOf));

export interface SucklerEvidenceInput {
  farmId: string; asOf: string;
  /** Pair IDs must be a unique, explicit farmer-confirmed linkage, not inferred from field co-location. */
  pairLink: RequiredEvidence<{ cowGroupId: string; calfGroupId: string; calfNotCountedElsewhere: boolean }>;
  cowHeadCount: RequiredEvidence<number>;
  calfHeadCount: RequiredEvidence<number>;
  cowAverageWeightKg: RequiredEvidence<number>;
  calfAverageWeightKg: RequiredEvidence<number>;
  calfStage: RequiredEvidence<"older_grazing" | "milk_dependent">;
  noSupplementaryFeed: RequiredEvidence<boolean>;
}
export function gateSucklerAllocation(input: SucklerEvidenceInput): GateResult<SucklerPairResult & { status: "READY" }> {
  const missing: string[] = [];
  if (!validIdentity(input.farmId, input.asOf)) return { status: "HELD", reasons: ["invalidFarmOrDate"] };
  const keys = ["pairLink", "cowHeadCount", "calfHeadCount", "cowAverageWeightKg", "calfAverageWeightKg", "calfStage", "noSupplementaryFeed"] as const;
  // Short-lived operational records; older weights need a separate explicit policy before activation.
  for (const key of keys) collect(key, input[key], input.farmId, input.asOf, 30, missing);
  if (missing.length) return { status: "HELD", reasons: missing };
  const pair = input.pairLink!.value;
  if (!pair.cowGroupId.trim() || !pair.calfGroupId.trim() || pair.cowGroupId === pair.calfGroupId || pair.calfNotCountedElsewhere !== true) {
    return { status: "HELD", reasons: ["unverifiedUniqueCowCalfPair"] };
  }
  const calculation = calculateSucklerPairAllocation({
    cowHeadCount: input.cowHeadCount!.value,
    calfHeadCount: input.calfHeadCount!.value,
    cowAverageWeightKg: input.cowAverageWeightKg!.value,
    calfAverageWeightKg: input.calfAverageWeightKg!.value,
    calfStage: input.calfStage!.value,
    supplementaryFeedRecordedNone: input.noSupplementaryFeed!.value,
  });
  if (calculation.status !== "READY") return { status: "HELD", reasons: calculation.status === "INCOMPLETE" ? calculation.missing : [calculation.reason] };
  return { status: "READY", calculation, evidenceDates: keys.map((key) => input[key]!.recordedAt), gateVersion: GRASS_INTAKE_EVIDENCE_GATE_VERSION };
}

export interface DairyEvidenceInput {
  farmId: string; asOf: string;
  headCount: RequiredEvidence<number>;
  lactationStage: RequiredEvidence<"midseason_lactating" | "early" | "late" | "dry">;
  /** Above-4cm verified pre-grazing basis, not generic satellite/estimated cover. */
  preGrazingCover: RequiredEvidence<{ kgDmHa: number; basis: "measured_above_4cm" | "other" }>;
  /** Explicit fresh kg per cow per day; zero must be recorded, never assumed. */
  concentrate: RequiredEvidence<{ kgFreshPerHeadDay: number; dmFraction: number }>;
}
export function gateDairyMidseasonIntake(input: DairyEvidenceInput): GateResult<DairyMidseasonIntake & { status: "READY" }> {
  const missing: string[] = [];
  if (!validIdentity(input.farmId, input.asOf)) return { status: "HELD", reasons: ["invalidFarmOrDate"] };
  collect("headCount", input.headCount, input.farmId, input.asOf, 30, missing);
  collect("lactationStage", input.lactationStage, input.farmId, input.asOf, 30, missing);
  collect("preGrazingCover", input.preGrazingCover, input.farmId, input.asOf, 7, missing);
  collect("concentrate", input.concentrate, input.farmId, input.asOf, 7, missing);
  if (missing.length) return { status: "HELD", reasons: missing };
  if (!Number.isInteger(input.headCount!.value) || input.headCount!.value <= 0) return { status: "HELD", reasons: ["invalidHeadCount"] };
  if (input.lactationStage!.value !== "midseason_lactating") return { status: "HELD", reasons: ["unsupportedLactationStage"] };
  if (input.preGrazingCover!.value.basis !== "measured_above_4cm") return { status: "HELD", reasons: ["incompatibleCoverBasis"] };
  if (input.concentrate!.value.dmFraction !== 0.88) return { status: "HELD", reasons: ["unsupportedFeedDryMatterFraction"] };
  const calculation = estimateDairyMidseasonIntake(input.preGrazingCover!.value.kgDmHa, input.concentrate!.value.kgFreshPerHeadDay);
  if (calculation.status !== "READY") return { status: "HELD", reasons: [calculation.reason] };
  return { status: "READY", calculation, evidenceDates: [input.headCount!.recordedAt, input.lactationStage!.recordedAt, input.preGrazingCover!.recordedAt, input.concentrate!.recordedAt], gateVersion: GRASS_INTAKE_EVIDENCE_GATE_VERSION };
}

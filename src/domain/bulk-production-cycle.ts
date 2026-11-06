import {
  createFarmerEvidence,
  type CropSystem,
  type EvidenceValue,
  type FieldProductionCycle,
  type FieldProductionCycleEvidence,
} from "./fertiliser-field-evidence";

/**
 * Pure rules for the Fields "Select multiple" production-cycle actions. No
 * agronomic value is created here: a bulk crop/use change only replaces the
 * crop system the farmer chose, and a carry-forward only copies settings
 * already recorded on the field's own current cycle.
 */

export type CarryForwardEligibility = "CAN_CARRY" | "HAS_TARGET_CYCLE" | "NO_CURRENT_CYCLE";

/** An existing target-season cycle always wins: carry-forward never
 * overwrites what the farmer has already saved for that season. */
export function carryForwardEligibility(
  currentCycle: Pick<FieldProductionCycle, "id"> | null | undefined,
  targetCycle: Pick<FieldProductionCycle, "id"> | null | undefined,
): CarryForwardEligibility {
  if (targetCycle) return "HAS_TARGET_CYCLE";
  return currentCycle ? "CAN_CARRY" : "NO_CURRENT_CYCLE";
}

/** Only the crop system changes. Every other piece of evidence on the cycle
 * is kept, and the previous crop stays on the provenance chain. */
export function bulkCropSystemEvidence(
  previous: FieldProductionCycleEvidence,
  cropSystem: CropSystem,
  source: string,
  observedAt: string,
): FieldProductionCycleEvidence {
  return {
    ...previous,
    cropSystem: createFarmerEvidence(cropSystem, source, observedAt, previous.cropSystem),
  };
}

function carried<T>(evidence: EvidenceValue<T>, source: string, observedAt: string): EvidenceValue<T> {
  // The method stays as recorded: confirming a carry-forward must never
  // upgrade the strength of the evidence behind it.
  return { value: evidence.value, method: evidence.method, source, observedAt, previous: evidence };
}

function validNumber(evidence: EvidenceValue<number> | undefined, max = Infinity): evidence is EvidenceValue<number> {
  return !!evidence && Number.isFinite(evidence.value) && evidence.value >= 0 && evidence.value <= max;
}

const GRAZING_EXCEPTION_PREFIX = "Field exception · ";

/**
 * The target-season evidence for a farmer-confirmed carry-forward: the
 * cycle's crop system, production target, clover content and any field-level
 * grazing exception, each keeping its original evidence on the chain.
 *
 * Deliberately never copied: chemical N/P/K already applied and reseed dates
 * (facts about the source season, see `withFuturePlanningChemicalBaseline`),
 * and a farm-baseline grazing system, which the farm setting still owns.
 * Nothing absent from the source cycle is filled in.
 */
export function carriedForwardEvidence(
  source: Pick<FieldProductionCycle, "season" | "cropSystem" | "evidence">,
  confirmedBy: string,
  observedAt: string,
): FieldProductionCycleEvidence {
  const label = `Carried forward from ${source.season} · ${confirmedBy}`;
  const { cropSystem, productionTargetTDMHa, whiteCloverPct, grazingProductionSystem } = source.evidence;
  return {
    cropSystem:
      cropSystem?.value === source.cropSystem
        ? carried(cropSystem, label, observedAt)
        : createFarmerEvidence(source.cropSystem, label, observedAt, cropSystem),
    ...(validNumber(productionTargetTDMHa) ? { productionTargetTDMHa: carried(productionTargetTDMHa, label, observedAt) } : {}),
    ...(validNumber(whiteCloverPct, 100) ? { whiteCloverPct: carried(whiteCloverPct, label, observedAt) } : {}),
    ...(grazingProductionSystem?.method === "FARMER_DECLARED" && grazingProductionSystem.source.startsWith(GRAZING_EXCEPTION_PREFIX)
      ? { grazingProductionSystem: carried(grazingProductionSystem, `${GRAZING_EXCEPTION_PREFIX}${label}`, observedAt) }
      : {}),
  };
}

export type BulkFieldOutcomeKind = "saved" | "unchanged" | "skipped_has_target" | "skipped_no_current" | "failed";

export interface BulkOutcomeCounts {
  total: number;
  saved: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

export function countBulkOutcomes(outcomes: readonly { outcome: BulkFieldOutcomeKind }[]): BulkOutcomeCounts {
  const count = (...kinds: BulkFieldOutcomeKind[]) => outcomes.filter((item) => kinds.includes(item.outcome)).length;
  return {
    total: outcomes.length,
    saved: count("saved"),
    unchanged: count("unchanged"),
    skipped: count("skipped_has_target", "skipped_no_current"),
    failed: count("failed"),
  };
}

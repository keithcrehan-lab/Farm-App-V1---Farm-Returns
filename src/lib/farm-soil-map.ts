/**
 * The Farm map's Soil view: what each field needs, in one word and one colour,
 * and the "where to spread" summary.
 *
 * Presentation only — no figure is calculated here. Each field's need is read
 * from its canonical nutrient plan (`buildFieldNutrientPlan`): the remaining
 * chemical P and K after any planned slurry (`fieldRemainingRequirement`), the
 * soil indices the plan used, and whether chemical fertiliser is allowed at all.
 * Lime comes only from a laboratory-reported lime requirement (t/ha) — never
 * from pH alone. The index bands follow the Teagasc Green Book soil index system
 * (`docs/evidence-register.md`): Index 3 is the agronomic optimum, Index 1–2 are
 * below it (build-up), Index 4 is above it.
 *
 * Product owner decisions (2026-11-12): lime comes first; a field whose indices
 * are only estimated (no lab or farmer-entered test) stays grey ("No soil test")
 * rather than being coloured by the estimate.
 */
import type { MapTone } from "@/components/farm/FieldMap";
import type { Field, FieldNutrientRemainingArm } from "@/domain/types";
import type { FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";

export type SoilNeed =
  | "p_and_k"
  | "k"
  | "p"
  | "maintenance"
  | "none"
  | "no_soil_test"
  | "no_chemical"
  | "not_grassland"
  | "unknown";

export interface FieldSoilView {
  fieldId: string;
  name: string;
  areaHa: number;
  need: SoilNeed;
  /** A laboratory lime requirement above zero: lime comes first. */
  limeTHa?: number;
  /** That field's lime tonnes, as the farm lime requirement states it (`FieldLimeRequirement.fieldTonnes`). */
  limeT?: number;
  /** The plan's legal-limits check isn't clear (over a NAP ceiling, or not assessable): check before spreading. */
  checkLimits?: boolean;
  pIndex?: 1 | 2 | 3 | 4;
  kIndex?: 1 | 2 | 3 | 4;
  /** The plan leaves chemical P / K to apply on this field. */
  pNeeded?: boolean;
  kNeeded?: boolean;
  /** Remaining chemical P and K for the whole field, kg — only when the plan states it. */
  pKg?: number;
  kKg?: number;
}

export const SOIL_NEED_LABEL: Record<SoilNeed, string> = {
  p_and_k: "Needs P & K",
  k: "Needs K",
  p: "Needs P",
  maintenance: "Maintenance",
  none: "None needed",
  no_soil_test: "No soil test",
  no_chemical: "No fertiliser allowed",
  not_grassland: "Tillage",
  unknown: "Can't tell yet",
};

export const SOIL_NEED_TONE: Record<SoilNeed, MapTone> = {
  p_and_k: "risk",
  k: "attention",
  p: "caution",
  maintenance: "good",
  none: "info",
  no_soil_test: "neutral",
  no_chemical: "neutral",
  not_grassland: "neutral",
  unknown: "neutral",
};

/** Map marker text: lime first, otherwise the field's need. */
export function soilMarkerLabel(view: FieldSoilView): string {
  return view.limeTHa !== undefined ? `Lime first · ${SOIL_NEED_LABEL[view.need]}` : SOIL_NEED_LABEL[view.need];
}

/** A soil test the farmer can stand over: a lab result or one they entered, never an estimate. */
const known = (status: string | undefined) => status === "verified" || status === "farmer_adjusted";

/** The farm lime requirement's own row for a field (rate and tonnes), when a lab reported one. */
export interface FieldLime {
  rateTHa?: number;
  fieldTonnes?: number;
}

function remaining(arm: FieldNutrientRemainingArm): { kgHa: number; totalKg?: number } | undefined {
  if (arm.status !== "KNOWN") return undefined;
  return { kgHa: arm.kgHa, ...(arm.totalKg.status === "OK" ? { totalKg: arm.totalKg.value } : {}) };
}

export function fieldSoilView(field: Field, plan: FieldNutrientPlanResult | undefined, lime: FieldLime | undefined): FieldSoilView {
  const limeTHa = lime?.rateTHa;
  const base = {
    fieldId: field.id,
    name: field.name,
    areaHa: field.areaHa,
    ...(limeTHa !== undefined && limeTHa > 0 ? { limeTHa, ...(lime?.fieldTonnes !== undefined ? { limeT: lime.fieldTonnes } : {}) } : {}),
  };
  const p = field.fertility.pIndex;
  const k = field.fertility.kIndex;
  if (!p || !k || !known(p.status) || !known(k.status)) return { ...base, need: "no_soil_test" };
  const indices = { pIndex: p.value, kIndex: k.value };
  if (!plan) return { ...base, ...indices, need: "unknown" };

  const nutrientPlan = plan.plan;
  if (nutrientPlan.purchaseStatus.status === "PROHIBITED") return { ...base, ...indices, need: "no_chemical" };
  // The plan's own verdict that nothing needs buying (all covered, or below a product's smallest rate) wins.
  if (nutrientPlan.purchaseStatus.status === "NONE_NEEDED") return { ...base, ...indices, need: "none" };
  const nap = plan.displayedNapCompliance;
  const checkLimits = nap.status !== "OK" || !nap.value.pWithinCeiling || !nap.value.nWithinCeiling;
  const left = nutrientPlan.fieldRemainingRequirement;
  if (left.p.status === "NOT_APPLICABLE" || left.k.status === "NOT_APPLICABLE") return { ...base, ...indices, need: "not_grassland" };
  const pLeft = remaining(left.p);
  const kLeft = remaining(left.k);
  if (!pLeft || !kLeft) return { ...base, ...indices, need: "unknown" };

  // Whole kilograms, as the plan states them: a fraction of a kilo left over is not a need.
  const pNeeded = Math.round(pLeft.kgHa) > 0;
  const kNeeded = Math.round(kLeft.kgHa) > 0;
  const pBelow = pNeeded && indices.pIndex <= 2;
  const kBelow = kNeeded && indices.kIndex <= 2;
  const need: SoilNeed = pBelow && kBelow ? "p_and_k" : kBelow ? "k" : pBelow ? "p" : pNeeded || kNeeded ? "maintenance" : "none";
  return {
    ...base,
    ...indices,
    need,
    pNeeded,
    kNeeded,
    ...(checkLimits && (pNeeded || kNeeded) ? { checkLimits: true } : {}),
    ...(pNeeded && pLeft.totalKg !== undefined ? { pKg: pLeft.totalKg } : {}),
    ...(kNeeded && kLeft.totalKg !== undefined ? { kKg: kLeft.totalKg } : {}),
  };
}

export interface SoilSummaryLine {
  key: "lime" | "limits" | SoilNeed;
  label: string;
  fieldIds: string[];
  fieldNames: string[];
  areaHa: number;
  /** Lime tonnes, or chemical P / K kg across these fields — only when every field's figure is known. */
  limeT?: number;
  pKg?: number;
  kKg?: number;
  tone: MapTone;
}

const SUMMARY_ORDER: SoilNeed[] = ["p_and_k", "k", "p", "maintenance", "none", "no_soil_test", "no_chemical", "not_grassland", "unknown"];

function sumIfAll(values: Array<number | undefined>): number | undefined {
  return values.every((v) => v !== undefined) ? values.reduce<number>((total, v) => total + (v ?? 0), 0) : undefined;
}

/** The "where to spread" card: lime first, then fields grouped by need. */
export function soilSummary(views: readonly FieldSoilView[]): SoilSummaryLine[] {
  const lines: SoilSummaryLine[] = [];
  const lime = views.filter((v) => v.limeTHa !== undefined);
  if (lime.length > 0) {
    lines.push({
      key: "lime",
      label: "Lime first",
      fieldIds: lime.map((v) => v.fieldId),
      fieldNames: lime.map((v) => v.name),
      areaHa: lime.reduce((total, v) => total + v.areaHa, 0),
      // Each field's tonnes as the farm lime requirement states them (to 0.01 t); shown to 0.1 t, so their sum is close enough.
      ...(lime.every((v) => v.limeT !== undefined) ? { limeT: lime.reduce((total, v) => total + (v.limeT ?? 0), 0) } : {}),
      tone: "neutral",
    });
  }
  const limits = views.filter((v) => v.checkLimits);
  if (limits.length > 0) {
    lines.push({
      key: "limits",
      label: "Check legal limits",
      fieldIds: limits.map((v) => v.fieldId),
      fieldNames: limits.map((v) => v.name),
      areaHa: limits.reduce((total, v) => total + v.areaHa, 0),
      tone: "neutral",
    });
  }
  for (const need of SUMMARY_ORDER) {
    const group = views.filter((v) => v.need === need);
    if (group.length === 0) continue;
    // Totals only when every field in the group that needs the nutrient has a stated figure.
    // A field whose legal limits need checking gives no total to buy.
    const pFields = group.filter((v) => v.pNeeded);
    const kFields = group.filter((v) => v.kNeeded);
    const blocked = group.some((v) => v.checkLimits);
    const pKg = pFields.length > 0 && !blocked ? sumIfAll(pFields.map((v) => v.pKg)) : undefined;
    const kKg = kFields.length > 0 && !blocked ? sumIfAll(kFields.map((v) => v.kKg)) : undefined;
    lines.push({
      key: need,
      label: SOIL_NEED_LABEL[need],
      fieldIds: group.map((v) => v.fieldId),
      fieldNames: group.map((v) => v.name),
      areaHa: group.reduce((total, v) => total + v.areaHa, 0),
      ...(pKg !== undefined && pKg > 0 ? { pKg } : {}),
      ...(kKg !== undefined && kKg > 0 ? { kKg } : {}),
      tone: SOIL_NEED_TONE[need],
    });
  }
  return lines;
}

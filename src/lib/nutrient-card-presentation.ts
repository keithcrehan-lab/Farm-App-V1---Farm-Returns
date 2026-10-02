import type { NutrientPlan } from "@/domain/types";

/**
 * Per-nutrient P/K Increment 5a (`docs/farm-return-next/campaign-c/
 * PER_NUTRIENT_PK_DESIGN.md` §4 row 5, D3 wording decided 2026-10-02) —
 * which state the Nutrients cards render for a field whose soil P or K
 * Index is missing. Pure presentation selection only: it reads the engine's
 * per-nutrient outcomes (`fertilityEvidenceByNutrient`,
 * `requirementByNutrient`, `organicApplication.availableNutrientByNutrient`)
 * and never derives a number. An unknown nutrient is `null` (shown "—"),
 * never 0.
 */

type FertilityByNutrient = NutrientPlan["fertilityEvidenceByNutrient"];
type SoilNutrient = "p" | "k";

/** The mixed state: exactly one of the soil P / K Index arms is OK. */
export function mixedSoilIndex(fertility: FertilityByNutrient): { known: SoilNutrient; missing: SoilNutrient } | undefined {
  const p = fertility.p.status === "OK";
  const k = fertility.k.status === "OK";
  if (p === k) return undefined;
  return p ? { known: "p", missing: "k" } : { known: "k", missing: "p" };
}

/** Whether either soil index arm is missing (mixed or neither). */
function anySoilIndexMissing(fertility: FertilityByNutrient): boolean {
  return fertility.p.status !== "OK" || fertility.k.status !== "OK";
}

/** The source `calculateNutrientPlan` gives a calculated `requirement`; the
 * per-nutrient arms come from the same Green Book tables but carry no
 * source string (pinned against the engine in the helper's tests). */
export const REQUIREMENT_SOURCE = "Teagasc Green Book (5th Ed., 2020)";

const upper = (n: SoilNutrient) => n.toUpperCase();

export type RequirementCardPresentation =
  | { kind: "paired" }
  | {
      kind: "mixed";
      values: { n: number; p: number | null; k: number | null };
      status: "estimated";
      source: string;
      calculationVersion?: string;
      pill: string;
      line: string;
      /** Show the frozen `requirementProvisional` notice only for a
       * table-level slurry block (the N credit arm is itself unassessed);
       * the missing-index part of it is what the D3 line already says. */
      showProvisional: boolean;
    };

/**
 * Nutrient requirement card. `paired` renders exactly as before (fully
 * indexed, neither index, or any block on the known arms such as missing
 * silage evidence). `mixed` shows N and the known nutrient from
 * `requirementByNutrient` and no NPK total.
 */
export function requirementCardPresentation(plan: NutrientPlan): RequirementCardPresentation {
  const mixed = mixedSoilIndex(plan.fertilityEvidenceByNutrient);
  if (!mixed) return { kind: "paired" };
  const n = plan.requirementByNutrient.n;
  const known = plan.requirementByNutrient[mixed.known];
  if (n.status !== "OK" || known.status !== "OK") return { kind: "paired" };
  const creditN = plan.organicApplication.availableNutrientByNutrient.n.status;
  const values = { n: n.value, p: null as number | null, k: null as number | null };
  values[mixed.known] = known.value;
  return {
    kind: "mixed",
    values,
    status: "estimated",
    source: REQUIREMENT_SOURCE,
    calculationVersion: plan.requirement.calculationVersion,
    pill: `${upper(mixed.known)} shown · ${upper(mixed.missing)} needs a soil test`,
    line: `${upper(mixed.missing)} requirement isn't shown because this field's soil ${upper(mixed.missing)} Index is missing. Add a soil test to complete the plan.`,
    showProvisional: plan.requirementProvisional.isProvisional && creditN !== "OK" && creditN !== "NOT_APPLICABLE",
  };
}

export interface OrganicCardPresentation {
  /** Slurry credit, kg/ha (unrounded — the card rounds for display);
   * `null` is a withheld credit, shown "—". */
  offsets: { n: number; p: number | null; k: number | null };
  /** D3 pill/line for a mixed field whose known credit is assessed;
   * absent means the existing assessment disclosure applies. */
  mixedCredit?: { pill: string; line: string };
}

/**
 * Organic nutrients card. Fully indexed: the paired offsets, unchanged.
 * Any missing index: a P/K credit withheld by the engine is `null`
 * (no slurry allocated stays a real 0). Mixed with an assessed credit: N
 * and the known nutrient from `availableNutrientByNutrient`, with D3 wording.
 */
export function organicCardPresentation(
  organic: NutrientPlan["organicApplication"],
  fertility: FertilityByNutrient,
): OrganicCardPresentation {
  const paired = { n: organic.offsetN, p: organic.offsetP, k: organic.offsetK };
  if (!anySoilIndexMissing(fertility)) return { offsets: paired };

  const arms = organic.availableNutrientByNutrient;
  const credit = (key: SoilNutrient): number | null => {
    const arm = arms[key];
    if (arm.status === "OK") return arm.value.kgHa;
    if (arm.status === "NOT_APPLICABLE") return paired[key];
    return null;
  };

  const mixed = mixedSoilIndex(fertility);
  if (mixed && arms.n.status === "OK" && arms[mixed.known].status === "OK") {
    return {
      offsets: { n: arms.n.value.kgHa, p: credit("p"), k: credit("k") },
      mixedCredit: {
        pill: `N and ${upper(mixed.known)} credit included`,
        line: `${upper(mixed.missing)} credit isn't counted until the soil ${upper(mixed.missing)} Index is recorded.`,
      },
    };
  }
  return { offsets: { n: paired.n, p: credit("p"), k: credit("k") } };
}

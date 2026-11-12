import { describe, expect, it } from "vitest";
import type { Field, FieldNutrientRemainingArm } from "@/domain/types";
import type { FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import { fieldSoilView, soilMarkerLabel, soilSummary, SOIL_NEED_TONE } from "./farm-soil-map";

type Idx = 1 | 2 | 3 | 4;
const field = (id: string, p?: Idx, k?: Idx, status: "verified" | "estimated" | "farmer_adjusted" = "verified", areaHa = 2): Field =>
  ({
    id,
    name: id,
    areaHa,
    fertility: {
      ...(p ? { pIndex: { value: p, status, source: "lab" } } : {}),
      ...(k ? { kIndex: { value: k, status, source: "lab" } } : {}),
    },
  }) as unknown as Field;

const knownArm = (kgHa: number, areaHa = 2): FieldNutrientRemainingArm => ({
  status: "KNOWN",
  kgHa,
  totalKg: { status: "OK", value: kgHa * areaHa, evidenceState: "MEASURED" } as never,
  requirementKgHa: kgHa,
  creditKgHa: 0,
  creditBasis: "NO_SLURRY_PLANNED",
  evidenceState: "MEASURED" as never,
});
const unknownArm: FieldNutrientRemainingArm = { status: "UNKNOWN", reasonCode: "X", missingInputs: [], cause: "REQUIREMENT_UNKNOWN" };
const NAP_OK = { status: "OK", value: { nWithinCeiling: true, pWithinCeiling: true }, evidenceState: "MEASURED" };
const plan = (p: FieldNutrientRemainingArm, k: FieldNutrientRemainingArm, purchase: string = "RECOMMENDED", nap: object = NAP_OK) =>
  ({ plan: { fieldRemainingRequirement: { p, k }, purchaseStatus: { status: purchase } }, displayedNapCompliance: nap }) as unknown as FieldNutrientPlanResult;

describe("Farm map Soil view", () => {
  it("colours by what the plan leaves to spread: below-optimum P and K, K only, P only, maintenance, none", () => {
    expect(fieldSoilView(field("a", 1, 2), plan(knownArm(30), knownArm(60)), undefined).need).toBe("p_and_k");
    expect(fieldSoilView(field("b", 4, 1), plan(knownArm(0), knownArm(90)), undefined).need).toBe("k");
    expect(fieldSoilView(field("c", 2, 4), plan(knownArm(20), knownArm(0)), undefined).need).toBe("p");
    expect(fieldSoilView(field("d", 3, 3), plan(knownArm(10), knownArm(25)), undefined).need).toBe("maintenance");
    expect(fieldSoilView(field("e", 4, 4), plan(knownArm(0), knownArm(0)), undefined).need).toBe("none");
    // A low index whose need slurry already covers is not "needs".
    expect(fieldSoilView(field("f", 4, 2), plan(knownArm(0), knownArm(0)), undefined).need).toBe("none");
    // The plan's own "nothing to buy" (a remainder below a product's smallest rate) wins over a tiny remainder.
    expect(fieldSoilView(field("g", 2, 2), plan(knownArm(0.3), knownArm(0.2), "NONE_NEEDED"), undefined).need).toBe("none");
  });

  it("keeps a field grey when its indices are only estimated or missing, never coloured by a guess", () => {
    expect(fieldSoilView(field("a", 1, 1, "estimated"), plan(knownArm(30), knownArm(60)), undefined).need).toBe("no_soil_test");
    expect(fieldSoilView(field("b", 2), plan(knownArm(30), knownArm(60)), undefined).need).toBe("no_soil_test");
    expect(fieldSoilView(field("c", 2, 2, "farmer_adjusted"), plan(knownArm(30), knownArm(60)), undefined).need).toBe("p_and_k");
    expect(fieldSoilView(field("d", 2, 2, "mapped" as never), plan(knownArm(30), knownArm(60)), undefined).need).toBe("no_soil_test");
    expect(SOIL_NEED_TONE.no_soil_test).toBe("neutral");
  });

  it("says when it can't tell, when fertiliser isn't allowed, and for tillage", () => {
    expect(fieldSoilView(field("a", 2, 2), plan(unknownArm, knownArm(60)), undefined).need).toBe("unknown");
    expect(fieldSoilView(field("b", 2, 2), undefined, undefined).need).toBe("unknown");
    expect(fieldSoilView(field("c", 2, 2), plan(knownArm(30), knownArm(60), "PROHIBITED"), undefined).need).toBe("no_chemical");
    expect(fieldSoilView(field("d", 2, 2), plan({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE" }, { status: "NOT_APPLICABLE", reasonCode: "TILLAGE" }), undefined).need).toBe("not_grassland");
  });

  it("puts lime first, from a lab lime requirement only", () => {
    const limed = fieldSoilView(field("a", 4, 1), plan(knownArm(0), knownArm(90)), { rateTHa: 5, fieldTonnes: 10 });
    expect(limed).toMatchObject({ limeTHa: 5, limeT: 10 });
    expect(soilMarkerLabel(limed)).toBe("Lime first · Needs K");
    expect(fieldSoilView(field("b", 4, 1), plan(knownArm(0), knownArm(90)), { rateTHa: 0 }).limeTHa).toBeUndefined();
    expect(soilMarkerLabel(fieldSoilView(field("c", 4, 4), plan(knownArm(0), knownArm(0)), undefined))).toBe("None needed");
  });

  it("summarises where to spread: lime first, then each need with its fields, area and stated totals", () => {
    const views = [
      fieldSoilView(field("Side", 4, 1, "verified", 1.5), plan(knownArm(0, 1.5), knownArm(90, 1.5)), { rateTHa: 4, fieldTonnes: 6 }),
      fieldSoilView(field("Hill", 4, 2, "verified", 2), plan(knownArm(0, 2), knownArm(60, 2)), undefined),
      fieldSoilView(field("Back", 4, 4, "verified", 3), plan(knownArm(0, 3), knownArm(0, 3)), undefined),
      fieldSoilView(field("New", undefined, undefined, "verified", 1), undefined, undefined),
    ];
    const lines = soilSummary(views);
    expect(lines.map((l) => l.key)).toEqual(["lime", "k", "none", "no_soil_test"]);
    expect(lines[0]).toMatchObject({ fieldNames: ["Side"], areaHa: 1.5, limeT: 6 });
    expect(lines[1]).toMatchObject({ label: "Needs K", fieldNames: ["Side", "Hill"], areaHa: 3.5, kKg: 255 });
    expect(lines[1].pKg).toBeUndefined();
    expect(lines[2]).toMatchObject({ label: "None needed", areaHa: 3 });
  });

  it("leaves a total out when any field's figure isn't stated", () => {
    const noTotal: FieldNutrientRemainingArm = { ...(knownArm(60) as Extract<FieldNutrientRemainingArm, { status: "KNOWN" }>), totalKg: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_FIELD_AREA", missingInputs: [] } };
    const lines = soilSummary([
      fieldSoilView(field("a", 4, 1), plan(knownArm(0), knownArm(90)), undefined),
      fieldSoilView(field("b", 4, 1), plan(knownArm(0), noTotal), undefined),
    ]);
    expect(lines[0].key).toBe("k");
    expect(lines[0].kKg).toBeUndefined();
  });

  it("flags fields whose legal limits aren't clear, and gives no total to buy for their group", () => {
    const overP = { status: "OK", value: { nWithinCeiling: true, pWithinCeiling: false }, evidenceState: "MEASURED" };
    const stale = { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "REGULATORY_EVIDENCE_STALE", missingInputs: [] };
    const a = fieldSoilView(field("a", 2, 2), plan(knownArm(30), knownArm(60), "RECOMMENDED", overP), undefined);
    const b = fieldSoilView(field("b", 2, 2), plan(knownArm(30), knownArm(60), "RECOMMENDED", stale), undefined);
    const c = fieldSoilView(field("c", 4, 4), plan(knownArm(0), knownArm(0), "RECOMMENDED", stale), undefined);
    expect(a.checkLimits).toBe(true);
    expect(b.checkLimits).toBe(true);
    expect(c.checkLimits).toBeUndefined(); // nothing to spread, nothing to check
    const lines = soilSummary([a, b, c]);
    expect(lines.map((l) => l.key)).toEqual(["limits", "p_and_k", "none"]);
    expect(lines[0]).toMatchObject({ label: "Check legal limits first", fieldNames: ["a", "b"] });
    expect(lines[1].pKg).toBeUndefined();
    expect(lines[1].kKg).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { Field, NutrientPlan, SlurryAllocation } from "@/domain/types";
import type { SlurryComposition } from "@/domain/slurry-composition";
import {
  mixedRequirementReport,
  mixedSoilIndex,
  organicCardPresentation,
  REQUIREMENT_SOURCE,
  requirementCardPresentation,
} from "./nutrient-card-presentation";

const idx = (i: 1 | 2 | 3 | 4) => tracked(i, "verified", "Lab");
const field: Field = {
  id: "field-5a",
  farmId: "farm-5a",
  name: "Test Field",
  areaHa: 6.8,
  centroid: [0, 0],
  plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Farmer"),
  fertility: { pIndex: idx(3), kIndex: idx(3) },
  history: [],
};
const composition: SlurryComposition = {
  id: "comp-5a",
  farmId: field.farmId,
  housingId: "housing-1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-06-10",
  source: "Lab report",
  recordedAt: "2026-06-12T09:00:00.000Z",
};

function plan(
  fertility: Field["fertility"],
  opts: { method?: "LESS" | "other"; slurry?: boolean; silage?: boolean } = {},
): NutrientPlan {
  const { method = "LESS", slurry = true, silage = true } = opts;
  const slurryAllocation: SlurryAllocation | undefined = slurry
    ? {
        fieldId: field.id,
        housingId: "housing-1",
        priority: "high",
        volumeM3: 33 * field.areaHa,
        score: 90,
        applicationMethod: tracked(method, "farmer_adjusted", "Farmer"),
      }
    : undefined;
  return calculateNutrientPlan({
    field: { ...field, fertility },
    farmGrasslandAreaHa: 27,
    livestockGroups: [],
    slurryAllocation,
    silage: silage ? { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false } : undefined,
    slurryComposition: composition,
  });
}

const value = (o: { status: string; value?: unknown }) => (o.status === "OK" ? (o.value as number) : undefined);
const kgHa = (o: NutrientPlan["organicApplication"]["availableNutrientByNutrient"]["n"]) =>
  o.status === "OK" ? o.value.kgHa : undefined;

describe("mixedSoilIndex", () => {
  it("is set only when exactly one soil index arm is OK", () => {
    expect(mixedSoilIndex(plan({ pIndex: idx(2) }).fertilityEvidenceByNutrient)).toEqual({ known: "p", missing: "k" });
    expect(mixedSoilIndex(plan({ kIndex: idx(2) }).fertilityEvidenceByNutrient)).toEqual({ known: "k", missing: "p" });
    expect(mixedSoilIndex(plan({ pIndex: idx(2), kIndex: idx(2) }).fertilityEvidenceByNutrient)).toBeUndefined();
    expect(mixedSoilIndex(plan({}).fertilityEvidenceByNutrient)).toBeUndefined();
  });
});

describe("requirementCardPresentation", () => {
  it("pins the source to the engine's calculated requirement source", () => {
    expect(plan({ pIndex: idx(3), kIndex: idx(3) }).requirement.source).toBe(REQUIREMENT_SOURCE);
  });

  it("fully indexed and neither-index fields keep the paired presentation", () => {
    expect(requirementCardPresentation(plan({ pIndex: idx(3), kIndex: idx(3) }))).toEqual({ kind: "paired" });
    expect(requirementCardPresentation(plan({}))).toEqual({ kind: "paired" });
  });

  it("missing silage evidence blocks every arm, so a mixed field stays paired (insufficient evidence)", () => {
    expect(requirementCardPresentation(plan({ pIndex: idx(3) }, { silage: false }))).toEqual({ kind: "paired" });
  });

  it.each([1, 2, 3, 4] as const)("P known (Index %i) / K missing: N and P from the arms, K null, D3 wording", (i) => {
    const p = plan({ pIndex: idx(i) });
    const r = requirementCardPresentation(p);
    expect(r).toEqual({
      kind: "mixed",
      values: { n: value(p.requirementByNutrient.n), p: value(p.requirementByNutrient.p), k: null },
      status: "estimated",
      source: REQUIREMENT_SOURCE,
      calculationVersion: p.requirement.calculationVersion,
      pill: "P shown · K needs a soil test",
      line: "K requirement isn't shown because this field's soil K Index is missing. Add a soil test to complete the plan.",
      showProvisional: false,
    });
  });

  it.each([1, 2, 3, 4] as const)("K known (Index %i) / P missing: mirrored", (i) => {
    const p = plan({ kIndex: idx(i) });
    const r = requirementCardPresentation(p);
    expect(r).toMatchObject({
      kind: "mixed",
      values: { n: value(p.requirementByNutrient.n), p: null, k: value(p.requirementByNutrient.k) },
      pill: "K shown · P needs a soil test",
      line: "P requirement isn't shown because this field's soil P Index is missing. Add a soil test to complete the plan.",
      showProvisional: false,
    });
  });

  it("mixed with a table-level slurry block keeps the provisional notice", () => {
    const p = plan({ pIndex: idx(3) }, { method: "other" });
    expect(p.requirementProvisional.isProvisional).toBe(true);
    expect(requirementCardPresentation(p)).toMatchObject({ kind: "mixed", showProvisional: true });
  });
});

describe("organicCardPresentation", () => {
  const present = (p: NutrientPlan) => organicCardPresentation(p.organicApplication, p.fertilityEvidenceByNutrient);

  it("fully indexed: paired offsets, unchanged, no D3 wording", () => {
    const p = plan({ pIndex: idx(3), kIndex: idx(3) });
    const o = p.organicApplication;
    expect(present(p)).toEqual({ offsets: { n: o.offsetN, p: o.offsetP, k: o.offsetK } });
    // Fully indexed with a table block stays the paired 0 (unchanged).
    const blocked = plan({ pIndex: idx(3), kIndex: idx(3) }, { method: "other" });
    expect(present(blocked)).toEqual({ offsets: { n: 0, p: 0, k: 0 } });
  });

  it("neither index with slurry: N credit kept, P/K withheld as null, no D3 wording", () => {
    const p = plan({});
    expect(present(p)).toEqual({ offsets: { n: p.organicApplication.offsetN, p: null, k: null } });
  });

  it("no slurry allocated: a real zero credit, never null", () => {
    expect(present(plan({}, { slurry: false }))).toEqual({ offsets: { n: 0, p: 0, k: 0 } });
    expect(present(plan({ pIndex: idx(3) }, { slurry: false }))).toEqual({ offsets: { n: 0, p: 0, k: 0 } });
  });

  it.each([1, 2, 3, 4] as const)("P known (Index %i) / K missing: N and P from the per-nutrient arms, K null, D3 wording", (i) => {
    const p = plan({ pIndex: idx(i) });
    const arms = p.organicApplication.availableNutrientByNutrient;
    expect(present(p)).toEqual({
      offsets: { n: kgHa(arms.n), p: kgHa(arms.p), k: null },
      mixedCredit: { pill: "N and P credit included", line: "K credit isn't counted until the soil K Index is recorded." },
    });
  });

  it.each([1, 2, 3, 4] as const)("K known (Index %i) / P missing: mirrored", (i) => {
    const p = plan({ kIndex: idx(i) });
    const arms = p.organicApplication.availableNutrientByNutrient;
    expect(present(p)).toEqual({
      offsets: { n: kgHa(arms.n), p: null, k: kgHa(arms.k) },
      mixedCredit: { pill: "N and K credit included", line: "P credit isn't counted until the soil P Index is recorded." },
    });
  });

  it("mixed with a table-level block: no D3 claim, P/K withheld as null, N the paired offset", () => {
    const p = plan({ pIndex: idx(3) }, { method: "other" });
    expect(present(p)).toEqual({ offsets: { n: p.organicApplication.offsetN, p: null, k: null } });
  });
});

describe("mixedRequirementReport", () => {
  it("fully indexed, neither index and missing silage evidence keep the paired report (undefined)", () => {
    expect(mixedRequirementReport(plan({ pIndex: idx(3), kIndex: idx(3) }))).toBeUndefined();
    expect(mixedRequirementReport(plan({}))).toBeUndefined();
    expect(mixedRequirementReport(plan({ pIndex: idx(3) }, { silage: false }))).toBeUndefined();
  });

  it.each([1, 2, 3, 4] as const)("P known (Index %i) / K missing: per-nutrient gross, credit and net; K null in every row", (i) => {
    const p = plan({ pIndex: idx(i) });
    const arms = p.organicApplication.availableNutrientByNutrient;
    expect(mixedRequirementReport(p)).toMatchObject({
      known: "p",
      missing: "k",
      gross: { n: value(p.requirementByNutrient.n), p: value(p.requirementByNutrient.p), k: null },
      organicOffset: { n: Math.round(kgHa(arms.n)!), p: Math.round(kgHa(arms.p)!), k: null },
      net: { n: value(p.netRequirementByNutrient.n), p: value(p.netRequirementByNutrient.p), k: null },
      line: "K requirement isn't shown because this field's soil K Index is missing. Add a soil test to complete the plan.",
    });
    expect(kgHa(arms.p)).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4] as const)("K known (Index %i) / P missing: mirrored", (i) => {
    const p = plan({ kIndex: idx(i) });
    const arms = p.organicApplication.availableNutrientByNutrient;
    expect(mixedRequirementReport(p)).toMatchObject({
      known: "k",
      missing: "p",
      gross: { n: value(p.requirementByNutrient.n), p: null, k: value(p.requirementByNutrient.k) },
      organicOffset: { n: Math.round(kgHa(arms.n)!), p: null, k: Math.round(kgHa(arms.k)!) },
      net: { n: value(p.netRequirementByNutrient.n), p: null, k: value(p.netRequirementByNutrient.k) },
      line: "P requirement isn't shown because this field's soil P Index is missing. Add a soil test to complete the plan.",
    });
  });

  it("no slurry allocated: the known credit is a real 0; the missing nutrient stays null", () => {
    const r = mixedRequirementReport(plan({ pIndex: idx(3) }, { slurry: false }));
    expect(r?.organicOffset).toEqual({ n: 0, p: 0, k: null });
    expect(r?.net.k).toBeNull();
  });

  it("table-level slurry block: every credit and net arm withheld, gross still shown", () => {
    const p = plan({ pIndex: idx(3) }, { method: "other" });
    const r = mixedRequirementReport(p);
    expect(r?.gross).toEqual({ n: value(p.requirementByNutrient.n), p: value(p.requirementByNutrient.p), k: null });
    expect(r?.organicOffset).toEqual({ n: null, p: null, k: null });
    expect(r?.net).toEqual({ n: null, p: null, k: null });
    expect(r?.provisional).toEqual({ headline: p.requirementProvisional.headline, detail: p.requirementProvisional.detail });
    expect(r?.provisional?.detail).toBeTruthy();
  });

  it("audit F001: carries the plan's engine version, evidence states and slurry evidence unchanged", () => {
    const p = plan({ pIndex: idx(3) });
    const r = mixedRequirementReport(p);
    expect(r?.status).toBe("estimated");
    expect(r?.source).toBe(REQUIREMENT_SOURCE);
    expect(r?.calculationVersion).toBe(p.calculationVersion);
    expect(r?.calculationVersion).toMatch(/^nutrient_engine_v/);
    expect(r?.evidence).toEqual({
      fertilityEvidenceByNutrient: p.fertilityEvidenceByNutrient,
      soilIndexProvenance: p.soilIndexProvenance,
      requirementByNutrient: p.requirementByNutrient,
      availableNutrientByNutrient: p.organicApplication.availableNutrientByNutrient,
      netRequirementByNutrient: p.netRequirementByNutrient,
      slurryDmPct: p.organicApplication.dmPct,
      slurryDmPctEvidence: p.organicApplication.dmPctEvidence,
    });
    expect(r?.evidence.fertilityEvidenceByNutrient.p).toMatchObject({ status: "OK", evidenceState: "MEASURED" });
    expect(r?.evidence.requirementByNutrient.p).toMatchObject({ status: "OK", evidenceState: expect.any(String) });
    expect(r?.evidence.slurryDmPctEvidence).toMatchObject({ status: "verified", compositionRecordId: composition.id });
    expect(r?.provisional).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  aggregateFarmFertiliserPurchasing,
  buildFarmFertiliserQuoteBasket,
  type FarmFertiliserAggregation,
  type FarmFertiliserAggregationFieldInput,
  type FarmFertiliserQuoteBasket,
} from "./fertiliser-plan";
import {
  createFertiliserQuoteRequestDraft,
  markFertiliserQuoteRequestReady,
  recordFertiliserQuoteDeliveryAttempt,
  renderFertiliserQuoteRequestText,
  setQuoteRequestDetails,
  setRequestedQuantity,
  type FertiliserQuoteRequest,
} from "./fertiliser-quote-request";
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { tracked } from "./types";
import type { Field, FieldPurchaseStatus, LivestockGroup, NutrientPlan, SlurryAllocation } from "./types";
import type { SlurryComposition } from "./slurry-composition";
import { basketCostSummary, basketStatusPresentation, basketStatusCounts, emptyRequirementMessage, farmFieldGroups } from "@/lib/farm-fertiliser-basket-presentation";
import { quoteCoverageNotice, requestedQuantityNote } from "@/lib/fertiliser-quote-request-presentation";

// Fertiliser Vertical v1 — FV Session 5 end-to-end QA. Every scenario runs
// the real chain: `calculateNutrientPlan` (field requirement → slurry credit →
// remaining → products) → `aggregateFarmFertiliserPurchasing` →
// `buildFarmFertiliserQuoteBasket` → `createFertiliserQuoteRequestDraft` →
// `renderFertiliserQuoteRequestText`. No field plan is hand-built except the
// one unknown-price case (J), which only blanks an engine product's price.

type Idx = 1 | 2 | 3 | 4;
type PlanInput = Parameters<typeof calculateNutrientPlan>[0];

const FARM_ID = "farm-e2e";
const AS_OF = "2026-10-03";
const BASKET_META = { farmId: FARM_ID, createdAt: "2026-10-06T09:00:00.000Z" };
const REQUEST_META = { requestId: "req-e2e", createdAt: "2026-10-06T09:05:00.000Z" };

const herd: LivestockGroup[] = [
  { id: "g1", farmId: FARM_ID, category: "suckler_cow", label: "Cows", count: tracked(40, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];

function field(id: string, p: Idx | undefined, k: Idx | undefined, extra: Partial<Field> = {}): Field {
  return {
    id,
    farmId: FARM_ID,
    name: `Field ${id}`,
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: { ...(p !== undefined ? { pIndex: tracked(p, "verified", "Lab") } : {}), ...(k !== undefined ? { kIndex: tracked(k, "verified", "Lab") } : {}) },
    history: [],
    ...extra,
  };
}

const composition: SlurryComposition = {
  id: "comp-e2e",
  farmId: FARM_ID,
  housingId: "h1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-06-10",
  source: "Lab report",
  laboratory: "Lab",
  recordedAt: "2026-06-12T09:00:00.000Z",
};

function slurry(fieldId: string, method: "LESS" | "splashplate", date: string, m3PerHa = 30, areaHa = 5): SlurryAllocation {
  return {
    fieldId,
    housingId: "h1",
    priority: "high",
    volumeM3: m3PerHa * areaHa,
    score: 90,
    applicationMethod: tracked(method, "farmer_adjusted", "F"),
    applicationDate: tracked(date, "farmer_adjusted", "F"),
  };
}

interface FieldCase {
  field: Field;
  extra?: Partial<PlanInput>;
}

const GRASSLAND_HA = 20;

function plan({ field: f, extra }: FieldCase): NutrientPlan {
  return calculateNutrientPlan({ field: f, farmGrasslandAreaHa: GRASSLAND_HA, livestockGroups: herd, slurryComposition: composition, asOfDate: AS_OF, ...extra });
}

interface Chain {
  plans: NutrientPlan[];
  inputs: FarmFertiliserAggregationFieldInput[];
  aggregation: FarmFertiliserAggregation;
  basket: FarmFertiliserQuoteBasket;
  request: FertiliserQuoteRequest | null;
  requestIssues: string[];
}

function chainFromPlans(fields: Field[], plans: NutrientPlan[]): Chain {
  const inputs = plans.map((p, i) => ({ fieldId: fields[i].id, fieldName: fields[i].name, plan: p }));
  const aggregation = aggregateFarmFertiliserPurchasing(inputs);
  const basket = buildFarmFertiliserQuoteBasket(aggregation, BASKET_META);
  const draft = createFertiliserQuoteRequestDraft(basket, REQUEST_META);
  return { plans, inputs, aggregation, basket, request: draft.ok ? draft.value : null, requestIssues: draft.ok ? [] : draft.issues };
}

function chain(cases: FieldCase[]): Chain {
  return chainFromPlans(
    cases.map((c) => c.field),
    cases.map(plan),
  );
}

function withDetails(request: FertiliserQuoteRequest): FertiliserQuoteRequest {
  const result = setQuoteRequestDetails(request, { deliveryLocation: "Farm yard", contact: "Pat 087", recipients: [{ name: "Agri Store" }] });
  if (!result.ok) throw new Error(result.issues.join(","));
  return result.value;
}

/** Field-level kg per product key, summed only over fields whose canonical
 * status is a sized blend — the expected farm total. */
function expectedProductKg(c: Chain): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of c.plans) {
    if (p.purchaseStatus.status !== "RECOMMENDED" && p.purchaseStatus.status !== "RECOMMENDED_CREDIT_NOT_COUNTED") continue;
    for (const prod of p.purchasedProducts) out.set(`${prod.name}|${prod.npkAnalysis}`, (out.get(`${prod.name}|${prod.npkAnalysis}`) ?? 0) + prod.totalKg);
  }
  return out;
}

/** The global invariants every scenario must satisfy. */
function expectInvariants(c: Chain) {
  const { plans, inputs, aggregation, basket, request } = c;

  // Whole-farm totals derive only from field purchaseStatus + purchasedProducts:
  // stripping every other plan output yields the identical aggregation.
  const stripped = aggregateFarmFertiliserPurchasing(
    inputs.map((i) => ({ ...i, plan: { purchaseStatus: i.plan.purchaseStatus, purchasedProducts: i.plan.purchasedProducts, calculationVersion: i.plan.calculationVersion } })),
  );
  expect(stripped).toEqual(aggregation);

  // field → farm reconciliation (exact, unrounded) and display never below canonical.
  const expected = expectedProductKg(c);
  expect(new Set(aggregation.products.map((p) => p.productKey))).toEqual(new Set(expected.keys()));
  for (const p of aggregation.products) {
    expect(p.totalKg).toBeCloseTo(expected.get(p.productKey)!, 9);
    expect(p.contributions.reduce((s, x) => s + x.quantityKg, 0)).toBeCloseTo(p.totalKg, 9);
    expect(p.displayTonnes * 1000).toBeGreaterThanOrEqual(p.totalKg - 1e-6);
  }

  // UNKNOWN never zero: an unresolved field contributes nothing and is named.
  for (const f of aggregation.fields) {
    const contributes = aggregation.products.some((p) => p.contributions.some((x) => x.fieldId === f.fieldId));
    expect(contributes).toBe(f.purchaseClass === "INCLUDED");
    if (f.purchaseClass === "UNRESOLVED") expect(basket.unresolvedFields.map((u) => u.fieldId)).toContain(f.fieldId);
  }
  for (const p of plans) {
    for (const arm of [p.fieldRequirement.n, p.fieldRequirement.p, p.fieldRequirement.k]) {
      if (arm.status === "UNKNOWN") expect("kgHa" in arm).toBe(false);
    }
  }

  // farm → basket → request: identical canonical quantities and costs.
  expect(basket.lines.map((l) => [l.productKey, l.quantityKg, l.displayTonnes, l.estimatedCostEur, l.provisional])).toEqual(
    aggregation.products.map((p) => [p.productKey, p.totalKg, p.displayTonnes, p.estimatedCostEur, p.provisional]),
  );
  expect(basket.knownCostSubtotalEur).toBe(aggregation.knownCostSubtotalEur);
  expect(basket.estimatedTotalCostEur).toBe(aggregation.estimatedTotalCostEur);
  if (request) {
    expect(request.lines.map((l) => [l.productKey, l.canonicalQuantityKg, l.canonicalDisplayTonnes, l.estimatedCostEur, l.provisional])).toEqual(
      basket.lines.map((l) => [l.productKey, l.quantityKg, l.displayTonnes, l.estimatedCostEur, l.provisional]),
    );
    for (const l of request.lines) expect(l.requestedQuantityKg).toBeGreaterThanOrEqual(l.canonicalQuantityKg - 1e-6);
  }

  // Basket integrity.
  const unresolved = aggregation.fields.filter((f) => f.purchaseClass === "UNRESOLVED").length;
  switch (basket.status) {
    case "READY":
      expect(unresolved).toBe(0);
      expect(basket.provisionalFieldCount).toBe(0);
      expect(basket.isCompleteFarmRequirement).toBe(true);
      break;
    case "READY_WITH_PROVISIONAL_ITEMS":
      expect(unresolved).toBe(0);
      expect(basket.provisionalFieldCount).toBeGreaterThan(0);
      expect(basket.lines.some((l) => l.provisional)).toBe(true);
      break;
    case "INCOMPLETE":
      expect(unresolved + basket.unsupportedProducts.length).toBeGreaterThan(0);
      expect(basket.isCompleteFarmRequirement).toBe(false);
      break;
  }

  // Quote integrity: coverage follows the basket, nothing is ever SENT here.
  if (request) {
    expect(request.coverage).toBe({ READY: "WHOLE_FARM", READY_WITH_PROVISIONAL_ITEMS: "WHOLE_FARM_PROVISIONAL", INCOMPLETE: "PARTIAL" }[basket.status]);
    const text = renderFertiliserQuoteRequestText(request);
    expect(text.includes("(partial)")).toBe(basket.status === "INCOMPLETE");
    expect(text.includes("Some quantities are provisional")).toBe(request.lines.some((l) => l.provisional));
    const ready = markFertiliserQuoteRequestReady(withDetails(request), "2026-10-06T09:10:00.000Z");
    expect(ready.ok && ready.value.status).toBe("READY_TO_SEND");
    if (ready.ok) {
      // No provider reference → never SENT.
      const attempt = recordFertiliserQuoteDeliveryAttempt(ready.value, {
        attemptedAt: "2026-10-06T09:11:00.000Z",
        recipientName: "Agri Store",
        outcome: "SUCCEEDED",
        providerReference: null,
        failureReason: null,
      });
      expect(attempt.ok).toBe(false);
    }
  }
}

describe("Fertiliser Vertical v1 — end-to-end scenarios (real engine → quote request)", () => {
  it("engine and contract versions are the canonical v1 set", () => {
    const c = chain([{ field: field("a1", 2, 2) }]);
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.5.0");
    expect(c.basket).toMatchObject({ basketVersion: "farm_fertiliser_quote_basket_v1.0.0", aggregationVersion: "farm_fertiliser_aggregation_v1.0.0", engineVersions: ["nutrient_engine_v1.5.0"] });
    expect(c.request).toMatchObject({ requestVersion: "fertiliser_quote_request_v1.0.0", engineVersions: ["nutrient_engine_v1.5.0"] });
  });

  it("A: fully supported grassland farm with credited slurry — requirement → slurry → remaining → products → farm → basket → request reconcile", () => {
    const cases: FieldCase[] = [
      { field: field("a1", 1, 1), extra: { slurryAllocation: slurry("a1", "splashplate", "2027-03-15") } },
      { field: field("a2", 2, 2, { areaHa: 4.3 }) },
      { field: field("a3", 3, 2, { areaHa: 7.1 }), extra: { slurryAllocation: slurry("a3", "LESS", "2027-03-15", 30, 7.1) } },
    ];
    const c = chain(cases);
    expect(c.plans.map((p) => p.purchaseStatus.status)).toEqual(["RECOMMENDED", "RECOMMENDED", "RECOMMENDED"]);

    // Slurry contribution is counted and the remaining requirement is requirement − credit.
    for (const i of [0, 2]) {
      const p = c.plans[i];
      for (const nut of ["n", "p", "k"] as const) {
        const req = p.fieldRequirement[nut];
        const rem = p.fieldRemainingRequirement[nut];
        expect(req.status).toBe("KNOWN");
        expect(rem.status).toBe("KNOWN");
        if (req.status === "KNOWN" && rem.status === "KNOWN") {
          expect(rem.creditBasis).toBe("SLURRY_CREDIT");
          expect(rem.requirementKgHa).toBe(req.kgHa);
          expect(rem.kgHa).toBeCloseTo(Math.max(0, req.kgHa - rem.creditKgHa), 9);
        }
      }
      expect(c.plans[i].fieldRemainingRequirement.n.status === "KNOWN" && c.plans[i].fieldRemainingRequirement.n.creditKgHa).toBeGreaterThan(0);
    }

    expect(c.basket.status).toBe("READY");
    expect(c.request?.coverage).toBe("WHOLE_FARM");
    expect(c.basket.lines.length).toBeGreaterThan(0);
    const text = renderFertiliserQuoteRequestText(c.request!);
    for (const line of c.request!.lines) expect(text).toContain(`Product: ${line.name} (N-P-K ${line.npkAnalysis}) — Quantity: ${line.requestedTonnes.toFixed(2)} tonnes`);
    expect(text).not.toMatch(/partial|provisional|€/i);
    expectInvariants(c);
  });

  it("B: no slurry planned — no fabricated credit, remaining equals requirement, products and basket correct", () => {
    const c = chain([{ field: field("b1", 2, 2) }, { field: field("b2", 1, 3) }]);
    for (const p of c.plans) {
      expect(p.purchaseStatus.status).toBe("RECOMMENDED");
      expect(p.organicApplication.availableNutrientByNutrient.n.status).toBe("NOT_APPLICABLE");
      for (const nut of ["n", "p", "k"] as const) {
        const req = p.fieldRequirement[nut];
        const rem = p.fieldRemainingRequirement[nut];
        expect(rem).toMatchObject({ status: "KNOWN", creditKgHa: 0, creditBasis: "NO_SLURRY_PLANNED" });
        if (req.status === "KNOWN" && rem.status === "KNOWN") expect(rem.kgHa).toBe(req.kgHa);
      }
    }
    expect(c.basket.status).toBe("READY");
    expectInvariants(c);
  });

  it("C: provisional slurry credit — demand counted, provisional through basket and request, no verified/complete wording", () => {
    const c = chain([{ field: field("c1", 2, 2), extra: { slurryAllocation: slurry("c1", "LESS", "2027-09-10") } }, { field: field("c2", 2, 2) }]);
    expect(c.plans[0].purchaseStatus).toMatchObject({ status: "RECOMMENDED_CREDIT_NOT_COUNTED", reasonCode: "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED" });
    // Sized on the full requirement (credit not counted) — identical to the no-slurry figures.
    expect(c.plans[0].purchasedProducts).toEqual(plan({ field: field("c1", 2, 2) }).purchasedProducts);
    expect(c.aggregation.fields[0]).toMatchObject({ purchaseClass: "INCLUDED", provisional: true });
    expect(c.basket.status).toBe("READY_WITH_PROVISIONAL_ITEMS");
    expect(c.basket.provisionalFieldCount).toBe(1);
    expect(c.request?.coverage).toBe("WHOLE_FARM_PROVISIONAL");
    expect(c.request!.lines.some((l) => l.provisional)).toBe(true);
    const text = renderFertiliserQuoteRequestText(c.request!);
    expect(text).toContain("Some quantities are provisional and may change.");
    expect(text).not.toMatch(/verified|partial/i);
    const notice = quoteCoverageNotice(c.request!);
    expect(notice.title).toBe("Provisional quantities");
    expect(notice.message).not.toMatch(/every field is resolved|full fertiliser requirement/i);
    expect(basketStatusPresentation(c.basket.status, basketStatusCounts(c.basket)).label).toBe("Ready — provisional items");
    expectInvariants(c);
  });

  it("D: mixed P/K — withheld, known nutrient evidence preserved, no speculative quantity, basket INCOMPLETE, known subtotal, request partial", () => {
    const c = chain([{ field: field("d1", 2, undefined) }, { field: field("d2", 2, 2) }]);
    const mixed = c.plans[0];
    expect(mixed.purchaseStatus).toEqual({ status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: ["fertility.kIndex"] });
    expect(mixed.purchasedProducts).toEqual([]);
    expect(mixed.fieldRequirement.p.status).toBe("KNOWN");
    expect(mixed.fieldRemainingRequirement.p.status).toBe("KNOWN");
    expect(mixed.fieldRemainingRequirement.k.status).toBe("UNKNOWN");
    expect(c.basket.status).toBe("INCOMPLETE");
    expect(c.basket.isCompleteFarmRequirement).toBe(false);
    expect(c.basket.knownCostSubtotalEur).toBeGreaterThan(0);
    expect(c.basket.lines.every((l) => l.contributingFieldCount === 1)).toBe(true);
    expect(c.basket.unresolvedFields).toEqual([{ fieldId: "d1", fieldName: "Field d1", status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE" }]);
    expect(basketCostSummary(c.basket).label).toBe("Known subtotal (incomplete)");
    expect(c.request?.coverage).toBe("PARTIAL");
    expect(renderFertiliserQuoteRequestText(c.request!)).toContain("This request covers only part of the farm's fertiliser requirement");
    expectInvariants(c);
  });

  it("E: unknown field — UNKNOWN never 0, no fabricated demand, basket INCOMPLETE, reason propagates to the request", () => {
    const c = chain([{ field: field("e1", undefined, undefined) }, { field: field("e2", 2, 2) }]);
    const unknown = c.plans[0];
    expect(unknown.purchaseStatus).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
    expect(unknown.fieldRequirement.p.status).toBe("UNKNOWN");
    expect(unknown.fieldRequirement.k.status).toBe("UNKNOWN");
    expect(c.aggregation.counts).toMatchObject({ unknown: 1, unresolved: 1, noPurchase: 0 });
    expect(c.basket.status).toBe("INCOMPLETE");
    expect(c.request!.unresolvedFields).toEqual([{ fieldId: "e1", fieldName: "Field e1", status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" }]);
    expect(quoteCoverageNotice(c.request!).message).toContain("Field e1");
    // A farm whose only field is unknown has no basket to quote — never a €0 / empty "whole farm" request.
    const only = chain([{ field: field("e1", undefined, undefined) }]);
    expect(only.basket.lines).toEqual([]);
    expect(only.requestIssues).toEqual(["EMPTY_BASKET"]);
    expect(emptyRequirementMessage(only.aggregation)).toMatch(/^No fertiliser can be totalled yet/);
    expectInvariants(c);
    expectInvariants(only);
  });

  it("F: NONE_NEEDED — assessed, no product, distinct from UNKNOWN, farm still READY", () => {
    const noneNeeded: FieldCase = {
      field: field("f1", 4, 4),
      extra: { silage: { cutNumber: 2, expectedYieldTDMha: 0, wasGrazedPreviousYear: false }, slurryAllocation: slurry("f1", "LESS", "2027-03-15", 100) },
    };
    const c = chain([noneNeeded, { field: field("f2", 2, 2) }]);
    expect(c.plans[0].purchaseStatus).toEqual({ status: "NONE_NEEDED", basis: "REMAINING_ZERO" });
    expect(c.aggregation.fields[0].purchaseClass).toBe("NO_PURCHASE");
    expect(c.aggregation.counts).toMatchObject({ noPurchase: 1, unknown: 0, unresolved: 0 });
    expect(c.basket.status).toBe("READY");
    expect(c.basket.noPurchaseFieldCount).toBe(1);
    expect(c.basket.unresolvedFields).toEqual([]);
    expect(farmFieldGroups(c.aggregation).map((g) => g.key)).toEqual(["none_needed"]);
    expect(emptyRequirementMessage(chain([noneNeeded]).aggregation)).toBe("No fertiliser purchase is currently needed on this farm.");
    expectInvariants(c);
  });

  it("G: PROHIBITED — no product, engine reason survives verbatim to the basket, no statutory rule re-run downstream", () => {
    const commonage = field("g1", 2, 2, { commonageStatus: tracked("commonage", "verified", "Farmer") });
    const buffer = field("g2", 2, 2, {
      waterBufferContext: tracked({ featureType: "surface_water" as const, distanceM: 2, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "F"),
    });
    const c = chain([{ field: commonage }, { field: buffer }, { field: field("g3", 2, 2) }]);
    expect(c.plans.slice(0, 2).map((p) => p.purchaseStatus)).toEqual([
      { status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" },
      { status: "PROHIBITED", reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" },
    ]);
    expect(c.basket.excludedFields).toEqual([
      { fieldId: "g1", fieldName: "Field g1", status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" },
      { fieldId: "g2", fieldName: "Field g2", status: "PROHIBITED", reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" },
    ]);
    expect(c.aggregation.counts.prohibited).toBe(2);
    expect(c.basket.status).toBe("READY");
    // The aggregation trusts the engine's decision: the same status with any
    // products attached still contributes nothing (no downstream re-evaluation).
    const forged = aggregateFarmFertiliserPurchasing([{ ...c.inputs[0], plan: { ...c.plans[0], purchasedProducts: c.plans[2].purchasedProducts } }]);
    expect(forged.products).toEqual([]);
    expectInvariants(c);
  });

  it("H: tillage NOT_APPLICABLE — no grassland purchase fabricated, excluded, never worded as 'no fertiliser needed'", () => {
    const tillage = field("h1", 2, 2, { plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") });
    const c = chain([{ field: tillage }, { field: field("h2", 2, 2) }]);
    expect(c.plans[0].purchaseStatus).toEqual({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
    expect(c.plans[0].purchasedProducts).toEqual([]);
    expect(c.aggregation.fields[0].purchaseClass).toBe("EXCLUDED");
    expect(c.aggregation.counts).toMatchObject({ notApplicable: 1, noPurchase: 0 });
    const groups = farmFieldGroups(c.aggregation);
    expect(groups.map((g) => g.key)).toEqual(["excluded"]);
    expect(groups[0].fields[0].detail).toMatch(/tillage/);
    expect(groups[0].fields[0].detail).not.toMatch(/nothing to buy|no fertiliser (is )?(needed|purchase)|needs? no fertiliser|requirement already met/i);
    expect(groups[0].heading).toBe("1 field excluded from purchasing");
    const tillageOnly = chain([{ field: tillage }]);
    expect(emptyRequirementMessage(tillageOnly.aggregation)).not.toMatch(/no fertiliser purchase is currently needed/i);
    expectInvariants(c);
    expectInvariants(tillageOnly);
  });

  it("I: no livestock / no usable grassland — no legacy fabricated purchase, canonical UNKNOWN survives", () => {
    const fields = [field("i1", 2, 2), field("i2", 1, 1)];
    const noLivestock = chainFromPlans(
      fields,
      fields.map((f) => calculateNutrientPlan({ field: f, farmGrasslandAreaHa: GRASSLAND_HA, livestockGroups: [], asOfDate: AS_OF })),
    );
    for (const p of noLivestock.plans) {
      expect(p.purchaseStatus).toEqual({ status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] });
      expect(p.purchasedProducts).toEqual([]);
    }
    expect(noLivestock.aggregation.counts).toMatchObject({ unknown: 2, unresolved: 2 });
    expect(noLivestock.basket.status).toBe("INCOMPLETE");
    expect(noLivestock.requestIssues).toEqual(["EMPTY_BASKET"]);
    expect(noLivestock.basket.unresolvedFields.map((u) => u.reasonCode)).toEqual(["MISSING_LIVESTOCK_DATA", "MISSING_LIVESTOCK_DATA"]);

    const noGrassland = chainFromPlans(
      fields,
      fields.map((f) => calculateNutrientPlan({ field: f, farmGrasslandAreaHa: 0, livestockGroups: herd, asOfDate: AS_OF })),
    );
    expect(noGrassland.basket.unresolvedFields.map((u) => u.reasonCode)).toEqual(["MISSING_GRASSLAND_AREA", "MISSING_GRASSLAND_AREA"]);
    expect(noGrassland.basket.lines).toEqual([]);
    expectInvariants(noLivestock);
    expectInvariants(noGrassland);
  });

  it("J: unknown product cost — quantity kept, cost null, known costs kept, total never €0", () => {
    const fields = [field("j1", 2, 2), field("j2", 1, 1)];
    const plans = fields.map((f) => plan({ field: f }));
    // A missing market price: the engine's own product, price blanked.
    const priced = plans[1];
    const blanked: NutrientPlan = { ...priced, purchasedProducts: priced.purchasedProducts.map((p, i) => (i === 0 ? { ...p, costEur: Number.NaN } : p)) };
    const c = chainFromPlans(fields, [plans[0], blanked]);
    const key = `${priced.purchasedProducts[0].name}|${priced.purchasedProducts[0].npkAnalysis}`;
    const line = c.basket.lines.find((l) => l.productKey === key)!;
    expect(line.quantityKg).toBeCloseTo(expectedProductKg(c).get(key)!, 9);
    expect(line.estimatedCostEur).toBeNull();
    expect(c.basket.estimatedTotalCostEur).toBeNull();
    expect(c.basket.productsWithUnknownCost).toEqual([key]);
    const knownSum = c.aggregation.products.reduce((s, p) => s + p.knownCostEur, 0);
    expect(c.basket.knownCostSubtotalEur).toBeCloseTo(knownSum, 9);
    expect(c.basket.knownCostSubtotalEur).toBeGreaterThan(0);
    // Quantity readiness is independent of price.
    expect(c.basket.status).toBe("READY");
    const cost = basketCostSummary(c.basket);
    expect(cost.label).toBe("Known subtotal (incomplete)");
    expect(cost.unknownNote).toContain(priced.purchasedProducts[0].name);
    expect(c.request!.lines.find((l) => l.productKey === key)!.estimatedCostEur).toBeNull();
    expect(renderFertiliserQuoteRequestText(c.request!)).not.toMatch(/€|0\.00 EUR/);
    expectInvariants(c);
  });

  it("K: farmer edits a requested quantity — canonical unchanged, requested stored separately, below-canonical disclosed, text uses requested", () => {
    const c = chain([{ field: field("k1", 2, 2) }, { field: field("k2", 1, 1) }]);
    const basketBefore = structuredClone(c.basket);
    const plansBefore = structuredClone(c.plans);
    const line = c.request!.lines[0];
    const below = Math.max(0.01, Math.floor(line.canonicalDisplayTonnes * 100 - 1) / 100);
    const edited = setRequestedQuantity(c.request!, line.productKey, below);
    if (!edited.ok) throw new Error(edited.issues.join(","));
    const after = edited.value.lines[0];
    expect(after.canonicalQuantityKg).toBe(line.canonicalQuantityKg);
    expect(after.canonicalDisplayTonnes).toBe(line.canonicalDisplayTonnes);
    expect(after.requestedTonnes).toBe(below);
    expect(after.requestedQuantityKg).toBe(Math.round(below * 100) * 10);
    expect(after.requestedBelowCanonical).toBe(true);
    expect(requestedQuantityNote(after)).toBe("Below the calculated requirement.");
    expect(renderFertiliserQuoteRequestText(edited.value)).toContain(`Quantity: ${below.toFixed(2)} tonnes`);
    // The original request, basket and engine plans are untouched.
    expect(c.request!.lines[0]).toEqual(line);
    expect(c.basket).toEqual(basketBefore);
    expect(c.plans).toEqual(plansBefore);
    // Raising above canonical is allowed and not flagged as below.
    const above = setRequestedQuantity(edited.value, line.productKey, line.canonicalDisplayTonnes + 1);
    expect(above.ok && above.value.lines[0].requestedBelowCanonical).toBe(false);
  });

  it("L: incomplete + provisional — both warnings survive aggregation → basket → request → final review text", () => {
    const c = chain([
      { field: field("l1", 2, 2), extra: { slurryAllocation: slurry("l1", "LESS", "2027-09-10") } },
      { field: field("l2", 2, undefined) },
      { field: field("l3", undefined, undefined) },
    ]);
    expect(c.plans.map((p) => p.purchaseStatus.status)).toEqual(["RECOMMENDED_CREDIT_NOT_COUNTED", "WITHHELD_MIXED_EVIDENCE", "UNKNOWN"]);
    expect(c.aggregation.status).toBe("INCOMPLETE");
    expect(c.aggregation.counts).toMatchObject({ provisional: 1, withheld: 1, unknown: 1, unresolved: 2 });
    expect(c.basket).toMatchObject({ status: "INCOMPLETE", provisionalFieldCount: 1, isCompleteFarmRequirement: false });
    expect(c.basket.lines.every((l) => l.provisional)).toBe(true);
    expect(c.request).toMatchObject({ coverage: "PARTIAL", basketStatus: "INCOMPLETE" });
    expect(c.request!.lines.every((l) => l.provisional)).toBe(true);
    const ready = markFertiliserQuoteRequestReady(withDetails(c.request!), "2026-10-06T09:10:00.000Z");
    if (!ready.ok) throw new Error(ready.issues.join(","));
    const text = renderFertiliserQuoteRequestText(ready.value);
    expect(text.split("\n")[0]).toBe("Farm Return fertiliser quote request (partial)");
    expect(text).toContain("This request covers only part of the farm's fertiliser requirement; further quantities may follow.");
    expect(text).toContain("Some quantities are provisional and may change.");
    const notice = quoteCoverageNotice(ready.value);
    expect(notice.title).toBe("Partial request");
    expect(notice.message).toMatch(/provisional/);
    expect(notice.message).toMatch(/Field l2, Field l3/);
    expect(farmFieldGroups(c.aggregation).map((g) => g.key)).toEqual(["awaiting", "provisional"]);
    expectInvariants(c);
  });
});

describe("Fertiliser Vertical v1 — global invariants across every purchase status", () => {
  const all: FieldCase[] = [
    { field: field("s1", 2, 2) },
    { field: field("s2", 2, 2), extra: { slurryAllocation: slurry("s2", "LESS", "2027-09-10") } },
    { field: field("s3", 4, 4), extra: { silage: { cutNumber: 2, expectedYieldTDMha: 0, wasGrazedPreviousYear: false }, slurryAllocation: slurry("s3", "LESS", "2027-03-15", 100) } },
    { field: field("s4", 2, 2, { commonageStatus: tracked("commonage", "verified", "Farmer") }) },
    { field: field("s5", 2, undefined) },
    { field: field("s6", undefined, undefined) },
    { field: field("s7", 2, 2, { plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") }) },
  ];

  it("the seven purchase statuses never collapse into the same meaning", () => {
    const c = chain(all);
    const statuses: FieldPurchaseStatus["status"][] = c.plans.map((p) => p.purchaseStatus.status);
    expect(statuses).toEqual(["RECOMMENDED", "RECOMMENDED_CREDIT_NOT_COUNTED", "NONE_NEEDED", "PROHIBITED", "WITHHELD_MIXED_EVIDENCE", "UNKNOWN", "NOT_APPLICABLE"]);
    expect(c.aggregation.fields.map((f) => [f.purchaseClass, f.provisional])).toEqual([
      ["INCLUDED", false],
      ["INCLUDED", true],
      ["NO_PURCHASE", false],
      ["EXCLUDED", false],
      ["UNRESOLVED", false],
      ["UNRESOLVED", false],
      ["EXCLUDED", false],
    ]);
    expect(c.aggregation.counts).toEqual({ included: 2, provisional: 1, noPurchase: 1, prohibited: 1, notApplicable: 1, withheld: 1, unknown: 1, unresolved: 2 });
    // Each status keeps its own verbatim engine status (and reason) in the aggregation.
    expect(c.aggregation.fields.map((f) => f.purchaseStatus)).toEqual(c.plans.map((p) => p.purchaseStatus));
    expect(c.basket.status).toBe("INCOMPLETE");
    expectInvariants(c);
  });

  it("the chain never mutates or recomputes an engine plan", () => {
    const plans = all.map(plan);
    const before = structuredClone(plans);
    const frozen = plans.map((p, i) => ({ fieldId: all[i].field.id, fieldName: all[i].field.name, plan: Object.freeze(structuredClone(p)) }));
    const basket = buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing(frozen), BASKET_META);
    const basketBefore = structuredClone(basket);
    const draft = createFertiliserQuoteRequestDraft(basket, REQUEST_META);
    if (!draft.ok) throw new Error(draft.issues.join(","));
    setRequestedQuantity(draft.value, draft.value.lines[0].productKey, 99);
    expect(basket).toEqual(basketBefore);
    expect(plans).toEqual(before);
    // Re-running the engine for the same inputs gives the same plans (deterministic).
    expect(all.map(plan)).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { buildProductionAdvisoryVM, type GroupAnimalFact, type ProductionAdvisoryInput } from "./production-advisory";

const AS_OF = "2026-11-04";

const animal = (o: Partial<GroupAnimalFact> = {}): GroupAnimalFact => ({
  dateOfBirth: "2026-03-01",
  sex: "MALE",
  breedKnown: true,
  latestWeightKg: 300,
  latestWeighedAt: "2026-10-30T10:00:00Z",
  weighings: 2,
  ...o,
});

const input = (o: Partial<ProductionAdvisoryInput> = {}): ProductionAdvisoryInput => ({
  category: "weanling",
  goal: "grow",
  system: "housed",
  animals: { state: "KNOWN", animals: [animal(), animal({ dateOfBirth: "2026-02-01", latestWeightKg: 320 })] },
  currentFieldRecorded: false,
  plan: { feedingSituation: "housed_grass_silage", silageQualityBasis: "lab_analysis" },
  asOfDate: AS_OF,
  ...o,
});

const codes = (items: readonly { code: string }[]) => items.map((i) => i.code);

describe("production advisory — readiness", () => {
  it("incomplete core facts: no path, and exactly the missing items with their actions", () => {
    const vm = buildProductionAdvisoryVM(
      input({ animals: { state: "KNOWN", animals: [animal({ dateOfBirth: null }), animal({ latestWeightKg: null, latestWeighedAt: null })] } }),
    );
    expect(vm.state).toBe("ALMOST_READY");
    expect(vm.title).toBe("Almost ready");
    expect(vm.readiness.label).toBe("Almost ready");
    expect(codes(vm.required)).toEqual(["AGE", "LIVEWEIGHT"]);
    expect(vm.required[0].value).toBe("Date of birth recorded for 1 of 2 animals");
    // No edit route for an existing animal's date of birth: say what must be recorded, never invent a route.
    expect(vm.required[0].action.kind).toBe("INSTRUCTION");
    expect(vm.required[1]).toMatchObject({ value: "1 of 2 animals weighed", action: { kind: "LINK", href: "#group-animals" } });
    expect(vm.reasons).toEqual([]);
    expect(vm.confidence.label).toBe("Confidence not assessed");
    expect(vm.title).not.toMatch(/kg\/day/);
  });

  it("a group without individual animals and without group facts links to Add cattle", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: undefined }));
    expect(vm.state).toBe("ALMOST_READY");
    expect(codes(vm.required)).toEqual(["AGE", "LIVEWEIGHT"]);
    expect(vm.required.every((i) => i.action.kind === "LINK" && i.action.href === "/cattle/manage")).toBe(true);
  });

  it("unreadable animal records are never read as absent animals", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: { state: "UNAVAILABLE" } }));
    expect(vm.required.map((i) => i.value)).toEqual(["Animal records couldn't be read", "Animal records couldn't be read"]);
  });

  it("group record facts satisfy readiness without re-entry", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: undefined, groupAvgAgeMonths: 8, groupAverageWeightKg: 290, groupAverageWeightSource: "Farmer" }));
    expect(vm.state).toBe("READY");
    expect(vm.core.find((i) => i.code === "AGE")?.value).toBe("8 months average · group record");
    expect(vm.core.find((i) => i.code === "LIVEWEIGHT")?.value).toBe("290 kg average · Farmer");
  });

  it("ready core facts: a recommended path with reasons, from the encoded Teagasc class guideline", () => {
    const vm = buildProductionAdvisoryVM(input());
    expect(vm.state).toBe("READY");
    expect(vm.readiness.label).toBe("Ready");
    expect(vm.title).toBe("Grow on as weanlings at about 0.6 kg/day this winter");
    expect(vm.required).toEqual([]);
    expect(vm.reasons[0]).toMatch(/Teagasc DairyBeef 500 guideline gain for weanlings .* 0\.6 kg\/day/);
    expect(vm.reasons).toContain("Age: 8 months – 9 months · from 2 dates of birth.");
    expect(vm.reasons.some((r) => r.startsWith("Liveweight: 300–320 kg"))).toBe(true);
    expect(vm.evidence[0].url).toContain("teagasc.ie");
    expect(vm.alternatives).toMatch(/aren't ranked yet/);
    expect(vm.actionNote).toMatch(/^Advisory only/);
  });

  it("finishing steers and heifers need the finish goal; otherwise the path is not covered (not guessed)", () => {
    expect(buildProductionAdvisoryVM(input({ category: "steer", goal: "finish_slaughter" })).title).toBe("Finish the steers at about 1.0 kg/day");
    expect(buildProductionAdvisoryVM(input({ category: "heifer", goal: "finish_slaughter" })).title).toBe("Finish the heifers at about 0.9 kg/day");
    const store = buildProductionAdvisoryVM(input({ category: "steer", goal: "sell_store" }));
    expect(store.state).toBe("NOT_COVERED");
    expect(store.reasons).toEqual([]);
    expect(buildProductionAdvisoryVM(input({ category: "suckler_cow", goal: "breed" })).state).toBe("NOT_COVERED");
  });
});

describe("production advisory — confidence", () => {
  it("all supporting evidence in place → High", () => {
    const vm = buildProductionAdvisoryVM(input({ groupBreed: "Angus" }));
    expect(vm.confidence.label).toBe("High confidence");
    expect(vm.improve).toEqual([]);
  });

  it("optional evidence absent → reduced confidence, and each gap is listed as an improvement (never blocking)", () => {
    const vm = buildProductionAdvisoryVM(
      input({
        animals: { state: "KNOWN", animals: [animal({ breedKnown: false, weighings: 1, sex: null }), animal({ weighings: 1 })] },
        plan: {},
      }),
    );
    expect(vm.state).toBe("READY");
    expect(vm.confidence.label).toBe("Low confidence");
    expect(codes(vm.improve)).toEqual(["BREED", "SEX", "WEIGHT_HISTORY", "SILAGE_QUALITY", "FEEDING_CONFIRMED"]);
    expect(vm.improve.find((i) => i.code === "SILAGE_QUALITY")?.action.kind).toBe("OPEN_EDITOR");

    const oneGap = buildProductionAdvisoryVM(input({ plan: { feedingSituation: "housed_grass_silage" } }));
    expect(oneGap.confidence.label).toBe("Moderate confidence");
  });

  it("caps: at grass ≤ Moderate; finishing bulls Low with no invented pace", () => {
    const grazing = buildProductionAdvisoryVM(input({ system: "grazing", currentFieldRecorded: true, groupBreed: "Angus" }));
    expect(grazing.confidence.label).toBe("Moderate confidence");
    expect(grazing.confidence.detail).toMatch(/Capped at Moderate/);
    const bull = buildProductionAdvisoryVM(input({ category: "bull", goal: "finish_slaughter", groupBreed: "Angus" }));
    expect(bull.state).toBe("READY");
    expect(bull.confidence.label).toBe("Low confidence");
    expect(bull.title).not.toMatch(/kg\/day/);
  });
});

describe("production advisory — economics", () => {
  it("economics are a separate, secondary status that never blocks the biological recommendation", () => {
    const vm = buildProductionAdvisoryVM(input());
    expect(vm.state).toBe("READY");
    expect(vm.economics.label).toMatch(/^Economics (limited|not ready)$/);
    expect(vm.economics.detail).toMatch(/doesn't affect the biological recommendation/);
    const farmerPrice = buildProductionAdvisoryVM(input({ plan: { concentratePriceEurT: 380 } }));
    expect(farmerPrice.state).toBe("READY");
    expect(farmerPrice.economics.label).toBe("Economics limited");
    expect(farmerPrice.economics.detail).toMatch(/your concentrate price.*sale value isn't held/);
  });
});

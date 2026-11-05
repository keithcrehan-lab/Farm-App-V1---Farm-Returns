import { describe, expect, it } from "vitest";
import { targetADGForAnimalType } from "@/domain/livestock";
import { buildProductionAdvisoryVM, type GroupAnimalFact, type GroupAnimalFacts, type ProductionAdvisoryInput } from "./production-advisory";
import { groupLiveweightOf } from "./group-liveweight";

const AS_OF = "2026-11-04";

const animal = (o: Partial<GroupAnimalFact> = {}): GroupAnimalFact => ({
  animalId: "a-1",
  dateOfBirth: "2026-03-01",
  sex: "MALE",
  breedKnown: true,
  latestWeightKg: 300,
  latestWeighedAt: "2026-10-30T10:00:00Z",
  weighings: 2,
  ...o,
});

const herd = (...animals: GroupAnimalFact[]): GroupAnimalFacts => ({ state: "KNOWN", animals });
const TWO = herd(animal(), animal({ animalId: "a-2", dateOfBirth: "2026-02-01", latestWeightKg: 320 }));

/** Input with the liveweight resolved from the given animals (as the operations view does). */
const input = (o: Partial<ProductionAdvisoryInput> = {}): ProductionAdvisoryInput => {
  const animals = "animals" in o ? o.animals : TWO;
  return {
    category: "weanling",
    goal: "grow",
    system: "housed",
    plan: { feedingSituation: "housed_grass_silage", silageQualityBasis: "lab_analysis" },
    asOfDate: AS_OF,
    ...o,
    animals,
    liveweight: o.liveweight ?? groupLiveweightOf(animals, undefined),
  };
};

const codes = (items: readonly { code: string }[]) => items.map((i) => i.code);

describe("production advisory — readiness blocks only on facts that choose or apply a path", () => {
  it("missing age and liveweight do NOT block: they are evidence that lowers confidence, linked to the exact fix", () => {
    const vm = buildProductionAdvisoryVM(
      input({ animals: herd(animal({ animalId: "a-1", dateOfBirth: null }), animal({ animalId: "a-2", latestWeightKg: null, latestWeighedAt: null })) }),
    );
    expect(vm.state).toBe("RECOMMENDED");
    expect(vm.readiness.label).toBe("Ready");
    expect(vm.required).toEqual([]);
    const age = vm.evidenceFacts.find((i) => i.code === "AGE")!;
    expect(age).toMatchObject({ met: false, value: "Date of birth recorded for 1 of 2 animals" });
    // The exact corrective UI: the animal's own Edit animal details.
    expect(age.action).toEqual({ kind: "LINK", label: "Add the missing date of birth", href: "/cattle/animals/a-1#edit-details" });
    const weight = vm.evidenceFacts.find((i) => i.code === "LIVEWEIGHT")!;
    expect(weight).toMatchObject({ met: false, action: { kind: "LINK", href: "#group-animals" } });
    expect(weight.value).toMatch(/^1 of 2 weighed · Partial/);
    expect(codes(vm.improve)).toEqual(expect.arrayContaining(["AGE", "LIVEWEIGHT"]));
    // Age and weight are shown as evidence only, never as the cause of the path.
    expect(vm.reasons.join(" ")).toMatch(/Age \(evidence, not used by a v1 rule\)/);
  });

  it("an unresolved production system is the blocker, with a route to record a move", () => {
    const vm = buildProductionAdvisoryVM(input({ system: undefined }));
    expect(vm.state).toBe("ALMOST_READY");
    expect(codes(vm.required)).toEqual(["SYSTEM"]);
    expect(vm.required[0].action).toEqual({ kind: "OPEN_LOCATION", label: "Record a move to a field or a shed" });
    expect(vm.confidence.label).toBe("Confidence not assessed");
    expect(vm.title).not.toMatch(/kg\/day/);
  });

  it("a field-and-shed conflict leaves the system unresolved (never guessed)", () => {
    const vm = buildProductionAdvisoryVM(input({ system: undefined, locationConflict: true }));
    expect(vm.state).toBe("ALMOST_READY");
    expect(vm.required[0]).toMatchObject({ code: "SYSTEM", value: "A field and a shed are both recorded", action: { kind: "OPEN_LOCATION" } });
  });

  it("unreadable animal records are never read as absent animals", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: { state: "UNAVAILABLE" } }));
    expect(vm.evidenceFacts.find((i) => i.code === "AGE")!.value).toBe("Animal records couldn't be read");
    expect(vm.evidenceFacts.find((i) => i.code === "LIVEWEIGHT")!.value).toMatch(/^Weights couldn't be read/);
  });

  it("group record facts are used for a headcount-only group without re-entry", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: undefined, groupAvgAgeMonths: 8, liveweight: groupLiveweightOf(undefined, { kg: 290, source: "Farmer" }) }));
    expect(vm.evidenceFacts.find((i) => i.code === "AGE")).toMatchObject({ met: true, value: "8 months average · group record" });
    expect(vm.evidenceFacts.find((i) => i.code === "LIVEWEIGHT")).toMatchObject({ met: true });
    expect(vm.evidenceFacts.find((i) => i.code === "LIVEWEIGHT")!.value).toMatch(/^290 kg · Group average from the group record · Farmer/);
  });
});

describe("production advisory — evidence applicability fails closed on the management system", () => {
  it("housed weanlings on grass silage: the housed-winter DairyBeef class guideline is recommended", () => {
    const vm = buildProductionAdvisoryVM(input());
    const adg = targetADGForAnimalType("weanling");
    expect(vm.state).toBe("RECOMMENDED");
    expect(vm.title).toBe(`Grow on as weanlings at about ${adg.toFixed(1)} kg/day this winter`);
    expect(vm.paths).toEqual([expect.objectContaining({ code: "GROW_WEANLING", marker: "Only path in v1 scope", status: `Guideline pace about ${adg.toFixed(1)} kg/day`, tone: "good" })]);
    expect(vm.evidence[0].title).toMatch(/DairyBeef/);
    expect(vm.alternatives).toMatch(/Only one production path/);
  });

  it("GRAZING weanlings never receive the housed-winter ADG as a recommendation", () => {
    const vm = buildProductionAdvisoryVM(input({ system: "grazing", plan: undefined }));
    expect(vm.state).toBe("EVIDENCE_GAP");
    expect(vm.title).toBe("Grow on as weanlings · pace not covered");
    expect(vm.summary).toMatch(/current evidence doesn't extend to grazing/);
    expect(JSON.stringify(vm)).not.toMatch(/0\.6 kg\/day/);
    expect(vm.paths[0]).toMatchObject({ status: "Current evidence doesn't cover cattle at grass", tone: "review" });
    expect(vm.confidence.label).toBe("Confidence not assessed");
  });

  it("housed but on a confirmed different diet: not covered either", () => {
    const vm = buildProductionAdvisoryVM(input({ plan: { feedingSituation: "other_diet" } }));
    expect(vm.state).toBe("EVIDENCE_GAP");
    expect(vm.paths[0].status).toBe("Current evidence doesn't cover this diet");
    expect(vm.title).not.toMatch(/kg\/day/);
  });

  it("housed with the diet unconfirmed: applies with the assumption stated, and lowers confidence", () => {
    const vm = buildProductionAdvisoryVM(input({ plan: { silageQualityBasis: "lab_analysis" } }));
    expect(vm.state).toBe("RECOMMENDED");
    expect(vm.paths[0].detail).toMatch(/grass-silage diet assumed from housing, not confirmed/);
    expect(codes(vm.improve)).toContain("FEEDING_CONFIRMED");
  });
});

describe("production advisory — feasible paths and ranking", () => {
  it("steers without a goal: finishing and selling as stores are shown unranked; ranking is withheld", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "steer", goal: undefined }));
    expect(vm.state).toBe("OPTIONS");
    expect(vm.title).toBe("2 feasible paths · not ranked");
    expect(codes(vm.paths)).toEqual(["FINISH", "SELL_STORE"]);
    expect(vm.paths.every((p) => p.marker === null)).toBe(true);
    expect(vm.paths[0].status).toBe(`Guideline pace about ${targetADGForAnimalType("finishing_steer").toFixed(1)} kg/day`);
    expect(vm.paths[1].status).toBe("No published pace in v1");
    expect(vm.alternatives).toMatch(/aren't ranked/);
    expect(vm.improve[0]).toMatchObject({ code: "GOAL", action: { kind: "OPEN_EDITOR" } });
    expect(vm.confidence.label).toBe("Confidence not assessed");
    // No economics are invented to rank them.
    expect(JSON.stringify(vm)).not.toMatch(/€|margin of|profit/);
  });

  it("heifers also list keeping for breeding (not covered by v1 advice), still unranked", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "heifer", goal: undefined }));
    expect(codes(vm.paths)).toEqual(["FINISH", "SELL_STORE", "BREED"]);
    expect(vm.paths[2].status).toBe("Not covered by v1 advice");
  });

  it("a housed steer group whose goal is finishing gets the finishing pace for the chosen path", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "steer", goal: "finish_slaughter" }));
    expect(vm.state).toBe("RECOMMENDED");
    expect(vm.title).toBe(`Finish the steers at about ${targetADGForAnimalType("finishing_steer").toFixed(1)} kg/day`);
    expect(vm.paths.find((p) => p.code === "FINISH")!.marker).toBe("Your goal");
    expect(vm.alternatives).toMatch(/You chose this path/);
  });

  it("finishing heifers at grass: the finishing path is the goal but no pace is recommended", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "heifer", goal: "finish_slaughter", system: "grazing", plan: undefined }));
    expect(vm.state).toBe("EVIDENCE_GAP");
    expect(vm.title).toBe("Finish to slaughter · pace not covered");
    expect(vm.title).not.toMatch(/kg\/day/);
  });

  it("a store goal selects the store path, which has no published pace", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "steer", goal: "sell_store" }));
    expect(vm.state).toBe("EVIDENCE_GAP");
    expect(vm.paths.find((p) => p.code === "SELL_STORE")!.marker).toBe("Your goal");
  });

  it("finishing bulls: no guideline gain exists, so no pace is invented", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "bull", goal: "finish_slaughter" }));
    expect(vm.state).toBe("EVIDENCE_GAP");
    expect(vm.title).not.toMatch(/kg\/day/);
    expect(vm.evidence).toEqual([]);
  });

  it("breeding stock, calves and a breeding goal are not covered (never guessed)", () => {
    for (const o of [{ category: "suckler_cow" as const }, { category: "dairy_cow" as const }, { category: "calf" as const }, { category: "heifer" as const, goal: "breed" as const }]) {
      const vm = buildProductionAdvisoryVM(input(o));
      expect(vm.state).toBe("NOT_COVERED");
      expect(vm.paths).toEqual([]);
      expect(vm.title).not.toMatch(/kg\/day/);
    }
  });
});

describe("production advisory — confidence (only for a recommended pace)", () => {
  it("all supporting evidence in place → High", () => {
    const vm = buildProductionAdvisoryVM(input({ category: "steer", goal: "finish_slaughter", groupBreed: "Angus" }));
    expect(vm.confidence.label).toBe("High confidence");
    expect(vm.improve).toEqual([]);
  });

  it("one or two gaps → Moderate; three or more → Low; each gap listed (never blocking)", () => {
    const moderate = buildProductionAdvisoryVM(input({ plan: { feedingSituation: "housed_grass_silage" } }));
    expect(moderate.state).toBe("RECOMMENDED");
    expect(moderate.confidence.label).toBe("Moderate confidence");
    expect(codes(moderate.improve)).toEqual(["SILAGE_QUALITY"]);

    const low = buildProductionAdvisoryVM(input({ plan: undefined, animals: herd(animal({ dateOfBirth: null, weighings: 1 })) }));
    expect(low.state).toBe("RECOMMENDED");
    expect(low.confidence.label).toBe("Low confidence");
    expect(codes(low.improve)).toEqual(["AGE", "WEIGHT_HISTORY", "SILAGE_QUALITY", "FEEDING_CONFIRMED"]);
  });

  it("an unknown sex links to the exact animal to correct", () => {
    const vm = buildProductionAdvisoryVM(input({ animals: herd(animal(), animal({ animalId: "a-9", sex: null })) }));
    expect(vm.evidenceFacts.find((i) => i.code === "SEX")!.action).toEqual({ kind: "LINK", label: "Add the missing sex", href: "/cattle/animals/a-9#edit-details" });
  });
});

describe("production advisory — economics and action", () => {
  it("economics are a separate status that never blocks or ranks", () => {
    const vm = buildProductionAdvisoryVM(input({ plan: { feedingSituation: "housed_grass_silage", concentratePriceEurT: 380 } }));
    expect(vm.state).toBe("RECOMMENDED");
    expect(vm.economics.label).toBe("Economics limited");
    expect(vm.economics.detail).toMatch(/paths aren't compared on economics/);
  });

  it("advisory only: no target is derived and the reason is stated", () => {
    const vm = buildProductionAdvisoryVM(input());
    expect(vm.actionNote).toMatch(/no target weight or date can be derived from validated evidence/);
    expect(vm.trajectory).toMatch(/No target weight or date is derived/);
  });
});

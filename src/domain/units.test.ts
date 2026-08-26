import { describe, expect, it } from "vitest";
import { UNIT_REGISTRY, type Quantity } from "./units";

const QUANTITIES: Quantity[] = [
  "land_area",
  "nutrient_rate",
  "feed_dry_matter",
  "fresh_forage_mass",
  "liveweight",
  "slurry_volume",
  "lime_rate",
  "soil_P_K_Mg",
  "fertiliser_P",
  "fertiliser_K",
];

describe("UNIT_REGISTRY", () => {
  it("has all 10 quantities from unit_registry.csv", () => {
    for (const q of QUANTITIES) {
      expect(UNIT_REGISTRY[q]).toBeDefined();
      expect(UNIT_REGISTRY[q].quantity).toBe(q);
    }
  });

  it("every conversion identity-converts its own first accepted (native/canonical) unit", () => {
    // unit_registry.csv's canonicalUnit is a descriptive label (e.g. "kg
    // nutrient/ha", "kg liveweight") that doesn't always string-match the
    // shorter conventional unit string in acceptedInputUnits (e.g.
    // "kg/ha", "kg") — the first accepted unit is each conversion's own
    // native/identity unit regardless of the label text.
    for (const q of QUANTITIES) {
      const conversion = UNIT_REGISTRY[q];
      const nativeUnit = conversion.acceptedInputUnits[0];
      expect(conversion.convert(42, nativeUnit)).toBe(42);
    }
  });
});

describe("land_area", () => {
  it("converts 1 acre to 0.40468564224 ha exactly", () => {
    expect(UNIT_REGISTRY.land_area.convert(1, "acre")).toBeCloseTo(0.40468564224, 10);
  });

  it("passes ha through unchanged", () => {
    expect(UNIT_REGISTRY.land_area.convert(40, "ha")).toBe(40);
  });

  it("throws for an unlisted unit rather than guessing", () => {
    expect(() => UNIT_REGISTRY.land_area.convert(1, "square metre")).toThrow();
  });
});

describe("nutrient_rate", () => {
  it("converts kg/acre to a larger kg/ha figure (acre < hectare)", () => {
    const kgPerHa = UNIT_REGISTRY.nutrient_rate.convert(100, "kg/acre");
    expect(kgPerHa).toBeGreaterThan(100);
    expect(kgPerHa).toBeCloseTo(100 / 0.40468564224, 6);
  });

  it("round-trips through land_area's own factor", () => {
    const rateKgPerAcre = 40;
    const rateKgPerHa = UNIT_REGISTRY.nutrient_rate.convert(rateKgPerAcre, "kg/acre");
    // area x rate is invariant under a correct area-basis conversion:
    // 1 acre x rateKgPerAcre === (1 acre in ha) x rateKgPerHa
    const oneAcreInHa = UNIT_REGISTRY.land_area.convert(1, "acre");
    expect(oneAcreInHa * rateKgPerHa).toBeCloseTo(1 * rateKgPerAcre, 6);
  });
});

describe("feed_dry_matter vs fresh_forage_mass — never cross-converted", () => {
  it("feed_dry_matter converts t DM to kg DM", () => {
    expect(UNIT_REGISTRY.feed_dry_matter.convert(2.5, "t DM")).toBe(2500);
  });

  it("fresh_forage_mass converts t fresh weight to kg fresh weight", () => {
    expect(UNIT_REGISTRY.fresh_forage_mass.convert(2.5, "t fresh weight")).toBe(2500);
  });

  it("feed_dry_matter rejects a fresh-weight unit outright", () => {
    expect(() => UNIT_REGISTRY.feed_dry_matter.convert(1, "t fresh weight")).toThrow();
  });

  it("fresh_forage_mass rejects a DM unit outright", () => {
    expect(() => UNIT_REGISTRY.fresh_forage_mass.convert(1, "t DM")).toThrow();
  });
});

describe("liveweight", () => {
  it("has no conversion beyond identity", () => {
    expect(UNIT_REGISTRY.liveweight.convert(650, "kg")).toBe(650);
  });

  it("rejects any other unit", () => {
    expect(() => UNIT_REGISTRY.liveweight.convert(650, "lb")).toThrow();
  });
});

describe("slurry_volume", () => {
  it("converts litre to m3", () => {
    expect(UNIT_REGISTRY.slurry_volume.convert(1000, "litre")).toBeCloseTo(1, 10);
  });

  it("converts imperial gallon to m3 using the exact 4.54609-litre definition", () => {
    expect(UNIT_REGISTRY.slurry_volume.convert(1, "imperial gallon")).toBeCloseTo(0.00454609, 10);
  });
});

describe("lime_rate", () => {
  it("converts t/acre to a larger t/ha figure", () => {
    const tPerHa = UNIT_REGISTRY.lime_rate.convert(2, "t/acre");
    expect(tPerHa).toBeGreaterThan(2);
    expect(tPerHa).toBeCloseTo(2 / 0.40468564224, 6);
  });
});

describe("soil_P_K_Mg — deliberately no cross-method conversion", () => {
  it("passes the canonical unit through unchanged", () => {
    expect(UNIT_REGISTRY.soil_P_K_Mg.convert(8.01, "mg/L Morgan extract where source requires")).toBe(8.01);
  });

  it("refuses any other unit, including a plausible-looking one", () => {
    expect(() => UNIT_REGISTRY.soil_P_K_Mg.convert(8.01, "mg/L Olsen extract")).toThrow();
  });
});

describe("fertiliser_P — elemental P <-> P2O5", () => {
  it("passes elemental P through unchanged", () => {
    expect(UNIT_REGISTRY.fertiliser_P.convert(10, "P")).toBe(10);
  });

  it("converts P2O5 to a smaller elemental-P figure using the molar-mass ratio", () => {
    const elementalP = UNIT_REGISTRY.fertiliser_P.convert(22.9148, "P2O5");
    expect(elementalP).toBeCloseTo(10, 3);
  });
});

describe("fertiliser_K — elemental K <-> K2O", () => {
  it("passes elemental K through unchanged", () => {
    expect(UNIT_REGISTRY.fertiliser_K.convert(10, "K")).toBe(10);
  });

  it("converts K2O to a smaller elemental-K figure using the molar-mass ratio", () => {
    const elementalK = UNIT_REGISTRY.fertiliser_K.convert(12.046, "K2O");
    expect(elementalK).toBeCloseTo(10, 3);
  });
});

/**
 * Scientific engine V3 foundation — unit registry and deterministic
 * conversions. Phase 1 (see `src/domain/evidence.ts`'s header for the
 * phase note; same "imported by nothing yet" status applies here).
 *
 * Every row mirrors `docs/scientific-engine/v3/implementation/unit_registry.csv`
 * exactly (quantity / canonical unit / accepted input units / conversion
 * rule). The numeric conversion factors below are physical/mathematical
 * unit-of-measure facts (an acre's legal size in hectares, an imperial
 * gallon's legal size in litres, the molar-mass ratio between an element
 * and its fertiliser-label oxide form) — not agronomic, regulatory or
 * advisory values, and each is derived/cited in its own comment rather
 * than typed as a bare number with no source. `unit_registry.csv` itself
 * does not publish P2O5/K2O factors (only "oxide/element conversion must
 * be explicit and unit-tested"); the two used here are the standard
 * molecular-weight ratios, computed from IUPAC standard atomic weights,
 * shown in the derivation comment for each — the same convention as an
 * acre-to-hectare conversion, not a Teagasc/statutory number that could
 * be revised by a future publication.
 *
 * `convert()` throws — never silently guesses — for any unit not listed
 * in `acceptedInputUnits`, and `soil_P_K_Mg` deliberately has NO
 * cross-method conversion at all (the source registry's own rule: "do not
 * convert between test methods without validated method-specific
 * relationship").
 */

export type Quantity =
  | "land_area"
  | "nutrient_rate"
  | "feed_dry_matter"
  | "fresh_forage_mass"
  | "liveweight"
  | "slurry_volume"
  | "lime_rate"
  | "soil_P_K_Mg"
  | "fertiliser_P"
  | "fertiliser_K";

export interface UnitConversion<Q extends Quantity = Quantity> {
  quantity: Q;
  canonicalUnit: string;
  acceptedInputUnits: string[];
  /** `unit_registry.csv`'s own `conversion_rule` text — kept verbatim so a
   * calculation-trace citation can quote the exact source rule, not a
   * paraphrase of it. */
  conversionRule: string;
  /** Throws for any `fromUnit` not in `acceptedInputUnits` — never
   * silently coerces or guesses a factor. */
  convert(value: number, fromUnit: string): number;
}

function requireAcceptedUnit(conversion: UnitConversion, fromUnit: string): void {
  if (!conversion.acceptedInputUnits.includes(fromUnit)) {
    throw new Error(
      `Unit "${fromUnit}" is not an accepted input unit for ${conversion.quantity} ` +
        `(accepted: ${conversion.acceptedInputUnits.join(", ")}). Refusing to guess a conversion.`,
    );
  }
}

// ---------------------------------------------------------------------------
// land_area — 1 international/statute acre = 0.40468564224 ha, an exact
// legal/mathematical definition (4840 sq yd, 1 yd = 0.9144 m exactly).
// ---------------------------------------------------------------------------
const HA_PER_ACRE = 0.40468564224;

export const LAND_AREA: UnitConversion<"land_area"> = {
  quantity: "land_area",
  canonicalUnit: "ha",
  acceptedInputUnits: ["ha", "acre"],
  conversionRule: "1 acre = 0.40468564224 ha",
  convert(value, fromUnit) {
    requireAcceptedUnit(LAND_AREA, fromUnit);
    if (fromUnit === "ha") return value;
    return value * HA_PER_ACRE;
  },
};

// ---------------------------------------------------------------------------
// nutrient_rate — area-basis conversion using the same acre/ha definition
// above; "preserve element identity" (unit_registry.csv) means this
// converts the area basis only, never the nutrient element itself.
// ---------------------------------------------------------------------------
export const NUTRIENT_RATE: UnitConversion<"nutrient_rate"> = {
  quantity: "nutrient_rate",
  canonicalUnit: "kg nutrient/ha",
  acceptedInputUnits: ["kg/ha", "kg/acre"],
  conversionRule: "convert area basis deterministically; preserve element identity",
  convert(value, fromUnit) {
    requireAcceptedUnit(NUTRIENT_RATE, fromUnit);
    if (fromUnit === "kg/ha") return value;
    // kg/acre -> kg/ha: an acre is smaller than a hectare, so the
    // per-hectare rate is larger than the per-acre rate.
    return value / HA_PER_ACRE;
  },
};

// ---------------------------------------------------------------------------
// feed_dry_matter — 1 t = 1000 kg (SI definition).
// ---------------------------------------------------------------------------
export const FEED_DRY_MATTER: UnitConversion<"feed_dry_matter"> = {
  quantity: "feed_dry_matter",
  canonicalUnit: "kg DM",
  acceptedInputUnits: ["kg DM", "t DM"],
  conversionRule: "1 t = 1000 kg",
  convert(value, fromUnit) {
    requireAcceptedUnit(FEED_DRY_MATTER, fromUnit);
    if (fromUnit === "kg DM") return value;
    return value * 1000;
  },
};

// ---------------------------------------------------------------------------
// fresh_forage_mass — 1 t = 1000 kg. Deliberately a DISTINCT Quantity from
// feed_dry_matter — the source registry's own warning is "NEVER equate
// fresh weight to DM"; there is no conversion function anywhere in this
// module (or planned for one) that crosses between the two.
// ---------------------------------------------------------------------------
export const FRESH_FORAGE_MASS: UnitConversion<"fresh_forage_mass"> = {
  quantity: "fresh_forage_mass",
  canonicalUnit: "kg fresh weight",
  acceptedInputUnits: ["kg", "t fresh weight"],
  conversionRule: "1 t = 1000 kg; NEVER equate fresh weight to DM",
  convert(value, fromUnit) {
    requireAcceptedUnit(FRESH_FORAGE_MASS, fromUnit);
    if (fromUnit === "kg") return value;
    return value * 1000;
  },
};

// ---------------------------------------------------------------------------
// liveweight — no conversion at all (source registry: "none").
// ---------------------------------------------------------------------------
export const LIVEWEIGHT: UnitConversion<"liveweight"> = {
  quantity: "liveweight",
  canonicalUnit: "kg liveweight",
  acceptedInputUnits: ["kg"],
  conversionRule: "none",
  convert(value, fromUnit) {
    requireAcceptedUnit(LIVEWEIGHT, fromUnit);
    return value;
  },
};

// ---------------------------------------------------------------------------
// slurry_volume — 1 litre = 0.001 m3 (SI); 1 imperial gallon =
// 0.00454609 m3, the exact UK statutory/legal definition (4.54609 litres).
// ---------------------------------------------------------------------------
const M3_PER_LITRE = 0.001;
const M3_PER_IMPERIAL_GALLON = 0.00454609;

export const SLURRY_VOLUME: UnitConversion<"slurry_volume"> = {
  quantity: "slurry_volume",
  canonicalUnit: "m3",
  acceptedInputUnits: ["m3", "litre", "imperial gallon"],
  conversionRule: "explicit tested conversion only",
  convert(value, fromUnit) {
    requireAcceptedUnit(SLURRY_VOLUME, fromUnit);
    if (fromUnit === "m3") return value;
    if (fromUnit === "litre") return value * M3_PER_LITRE;
    return value * M3_PER_IMPERIAL_GALLON;
  },
};

// ---------------------------------------------------------------------------
// lime_rate — same acre/ha area-basis conversion as nutrient_rate.
// ---------------------------------------------------------------------------
export const LIME_RATE: UnitConversion<"lime_rate"> = {
  quantity: "lime_rate",
  canonicalUnit: "t/ha",
  acceptedInputUnits: ["t/ha", "t/acre"],
  conversionRule: "deterministic area conversion",
  convert(value, fromUnit) {
    requireAcceptedUnit(LIME_RATE, fromUnit);
    if (fromUnit === "t/ha") return value;
    return value / HA_PER_ACRE;
  },
};

// ---------------------------------------------------------------------------
// soil_P_K_Mg — deliberately NO cross-method conversion. The registry's
// own rule: "do not convert between test methods without validated
// method-specific relationship" — accepting only the exact lab-reported
// unit a caller already has, refusing everything else rather than
// guessing an equivalence.
// ---------------------------------------------------------------------------
export const SOIL_P_K_MG: UnitConversion<"soil_P_K_Mg"> = {
  quantity: "soil_P_K_Mg",
  canonicalUnit: "mg/L Morgan extract where source requires",
  acceptedInputUnits: ["mg/L Morgan extract where source requires"],
  conversionRule: "do not convert between test methods without validated method-specific relationship",
  convert(value, fromUnit) {
    requireAcceptedUnit(SOIL_P_K_MG, fromUnit);
    return value;
  },
};

// ---------------------------------------------------------------------------
// fertiliser_P — elemental P <-> P2O5. Standard molecular-weight ratio,
// not a Teagasc/statutory figure: P2O5 (2 P + 5 O) has molar mass
// 2*30.973762 + 5*15.9994 = 141.944524 g/mol against 2*30.973762 =
// 61.947524 g/mol of elemental P in it -> 141.944524 / 61.947524 =
// 2.29148 kg P2O5 per kg P (IUPAC standard atomic weights: P = 30.973762,
// O = 15.9994).
// ---------------------------------------------------------------------------
const P2O5_PER_P = 141.944524 / 61.947524;

export const FERTILISER_P: UnitConversion<"fertiliser_P"> = {
  quantity: "fertiliser_P",
  canonicalUnit: "P",
  acceptedInputUnits: ["P", "P2O5"],
  conversionRule: "oxide/element conversion must be explicit and unit-tested",
  convert(value, fromUnit) {
    requireAcceptedUnit(FERTILISER_P, fromUnit);
    if (fromUnit === "P") return value;
    return value / P2O5_PER_P;
  },
};

// ---------------------------------------------------------------------------
// fertiliser_K — elemental K <-> K2O. K2O (2 K + 1 O) molar mass =
// 2*39.0983 + 15.9994 = 94.1960 g/mol against 2*39.0983 = 78.1966 g/mol of
// elemental K in it -> 94.1960 / 78.1966 = 1.20461 kg K2O per kg K (IUPAC
// standard atomic weights: K = 39.0983, O = 15.9994).
// ---------------------------------------------------------------------------
const K2O_PER_K = 94.196 / 78.1966;

export const FERTILISER_K: UnitConversion<"fertiliser_K"> = {
  quantity: "fertiliser_K",
  canonicalUnit: "K",
  acceptedInputUnits: ["K", "K2O"],
  conversionRule: "oxide/element conversion must be explicit and unit-tested",
  convert(value, fromUnit) {
    requireAcceptedUnit(FERTILISER_K, fromUnit);
    if (fromUnit === "K") return value;
    return value / K2O_PER_K;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FeedBasis — required_input_fields.csv "FEED_BASIS": every feed stock/
// demand item must be tagged fresh-weight or dry-matter; a fodder balance
// mixing the two must be blocked (ENGINE_UNIT_RULE, GFT107). Kept here
// alongside FEED_DRY_MATTER/FRESH_FORAGE_MASS rather than in types.ts —
// it's the qualitative basis tag those two quantities imply, not a farm
// entity field.
// ---------------------------------------------------------------------------
export type FeedBasis = "fresh_weight" | "dry_matter";

export const UNIT_REGISTRY: Record<Quantity, UnitConversion<Quantity>> = {
  land_area: LAND_AREA,
  nutrient_rate: NUTRIENT_RATE,
  feed_dry_matter: FEED_DRY_MATTER,
  fresh_forage_mass: FRESH_FORAGE_MASS,
  liveweight: LIVEWEIGHT,
  slurry_volume: SLURRY_VOLUME,
  lime_rate: LIME_RATE,
  soil_P_K_Mg: SOIL_P_K_MG,
  fertiliser_P: FERTILISER_P,
  fertiliser_K: FERTILISER_K,
};

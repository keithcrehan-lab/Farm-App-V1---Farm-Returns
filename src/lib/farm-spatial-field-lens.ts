import { resolveFieldSlurryAllocation } from "@/domain/nutrients";
import type { DataStatus, Field, SlurryAllocation, TrackedValue } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import { landUseLabel } from "@/lib/status";
import { FARM_LENSES, type FarmLensId, type FarmLensLink } from "@/lib/farm-spatial-lenses";

/**
 * Farm Spatial V2 Phase 3 — what each lens says about one real mapped
 * field: the short marker text on the map and the facts in the field
 * drawer (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §5 / §6.2).
 * Presentation only: every value is read straight off persisted `Field`
 * data or an existing domain export (`resolveFieldSlurryAllocation`).
 * Nothing is calculated here. A value with no real source is shown as
 * "Unknown" / "Not set" / an honest note, never a default or a mock.
 *
 * The per-field `NutrientPlan` (remaining N/P/K, organic allocation) is
 * not built here: Phase 4 passes it to the drawer separately, from the
 * shared `buildFieldNutrientPlan` assembly via `fieldNutrientPlanView`.
 */

/** The field nutrient plan page for one field (Phase 4). */
export function fieldNutrientPlanHref(fieldId: string): string {
  return `/today/field/${encodeURIComponent(fieldId)}`;
}

/** Back to the spatial Farm with this field selected in the Nutrients lens. */
export function farmSpatialReturnHref(fieldId: string): string {
  return `/today?lens=nutrients&field=${encodeURIComponent(fieldId)}`;
}

/** Reads `farmSpatialReturnHref`'s query. An unknown lens is ignored; the
 * field id still has to resolve to a real mapped field on the page. */
export function parseFarmSpatialReturn(search: string): { lens?: FarmLensId; fieldId?: string } {
  const params = new URLSearchParams(search);
  const lens = params.get("lens");
  const fieldId = params.get("field") ?? undefined;
  return {
    ...(lens && FARM_LENSES.some((l) => l.id === lens) ? { lens: lens as FarmLensId } : {}),
    ...(fieldId ? { fieldId } : {}),
  };
}

export interface FarmFieldLensFact {
  label: string;
  value: string;
  /** True when the value is an honest absence ("Unknown", "Not set"). */
  missing?: boolean;
  /** Provenance of a non-lab value (e.g. "Estimated"), so a modelled or
   * farmer-entered figure is never read as a measurement. */
  basis?: string;
}

export interface FarmFieldLensView {
  /** Short real text beside the field's marker for this lens, if any. */
  markerLabel?: string;
  facts: FarmFieldLensFact[];
  /** Elements of this lens with no production source for the field. */
  unavailableNote?: string;
  /** Existing real destinations, attached to this field where possible. */
  links: FarmLensLink[];
}

/** Marker colour per lens — the same `--fr-v2-*` domain tokens as the lens
 * band's rule. Current stays neutral (MapHero's own neutral pin). */
export const FARM_LENS_MARKER_COLOR: Record<FarmLensId, string | undefined> = {
  current: undefined,
  grass: "var(--fr-v2-teal)",
  nutrients: "var(--fr-v2-harvest)",
  soil: "var(--fr-v2-clay)",
  conditions: "var(--fr-v2-cobalt)",
};

/** A tracked value's real value, or undefined when absent or explicitly
 * `"unavailable"` (whose `.value` must never be read as real — `types.ts`). */
function knownValue<T>(tracked: TrackedValue<T> | undefined): T | undefined {
  if (!tracked || tracked.status === "unavailable") return undefined;
  return tracked.value;
}

const BASIS_LABEL: Record<Exclude<DataStatus, "verified" | "unavailable">, string> = {
  estimated: "Estimated",
  farmer_adjusted: "Farmer entered",
  mapped: "Mapped",
};

function basisOf(tracked: TrackedValue<unknown> | undefined): { basis?: string } {
  if (!tracked || tracked.status === "verified" || tracked.status === "unavailable") return {};
  return { basis: BASIS_LABEL[tracked.status] };
}

/** Marker shorthand for a value that isn't a lab measurement. */
function estimatedMark(...values: (TrackedValue<unknown> | undefined)[]): string {
  return values.some((v) => v && v.status !== "verified" && v.status !== "unavailable") ? " (est.)" : "";
}

function indexFact(label: string, tracked: TrackedValue<1 | 2 | 3 | 4> | undefined): FarmFieldLensFact {
  const value = knownValue(tracked);
  return value === undefined ? { label, value: "Unknown", missing: true } : { label, value: `Index ${value}`, ...basisOf(tracked) };
}

function soilTestFact(field: Field): FarmFieldLensFact {
  const test = field.fertility.verifiedTest;
  if (!test) return { label: "Soil test", value: "No lab test", missing: true };
  const date = new Date(test.sampleDate);
  if (Number.isNaN(date.getTime())) return { label: "Soil test", value: "Date unknown", missing: true };
  return { label: "Soil test", value: date.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) };
}

function nutrientMarkerLabel(field: Field): string {
  const p = knownValue(field.fertility.pIndex);
  const k = knownValue(field.fertility.kIndex);
  if (p === undefined && k === undefined) return "P · K unknown";
  return `P${p ?? "?"} · K${k ?? "?"}${estimatedMark(field.fertility.pIndex, field.fertility.kIndex)}`;
}

export function farmFieldLensView(
  lens: FarmLensId,
  field: Field,
  context: { slurryAllocations: readonly SlurryAllocation[]; conditionsFacts?: readonly string[] },
): FarmFieldLensView {
  const fieldDetail: FarmLensLink = { href: `/fields?field=${encodeURIComponent(field.id)}`, label: "Field detail" };

  switch (lens) {
    case "current": {
      const use = knownValue(field.plannedUse);
      return {
        markerLabel: use === undefined ? undefined : landUseLabel(use),
        facts: [use === undefined ? { label: "Use", value: "Not set", missing: true } : { label: "Use", value: landUseLabel(use), ...basisOf(field.plannedUse) }],
        unavailableNote: "Livestock on this field isn't recorded yet.",
        links: [fieldDetail, { href: "/plan", label: "Planned work" }],
      };
    }
    case "grass":
      return {
        facts: [],
        unavailableNote: "Grass cover, growth and readiness aren't measured for this field yet.",
        links: [fieldDetail],
      };
    case "nutrients": {
      const allocation = resolveFieldSlurryAllocation(context.slurryAllocations, field.id);
      return {
        markerLabel: nutrientMarkerLabel(field),
        facts: [
          indexFact("P", field.fertility.pIndex),
          indexFact("K", field.fertility.kIndex),
          soilTestFact(field),
          allocation
            ? { label: "Slurry planned", value: `${formatNumber(allocation.volumeM3, 0)} m³` }
            : { label: "Slurry planned", value: "None planned", missing: true },
        ],
        links: [
          { href: `/nutrients?field=${encodeURIComponent(field.id)}`, label: "Nutrient planner" },
          { href: "/fertiliser-plan", label: "Farm nutrient plan" },
          fieldDetail,
        ],
      };
    }
    case "soil": {
      const pH = knownValue(field.fertility.pH);
      const soil = field.mappedSoil;
      return {
        markerLabel: pH === undefined ? "pH unknown" : `pH ${formatNumber(pH, 1)}${estimatedMark(field.fertility.pH)}`,
        facts: [
          pH === undefined ? { label: "pH", value: "Unknown", missing: true } : { label: "pH", value: formatNumber(pH, 1), ...basisOf(field.fertility.pH) },
          indexFact("P", field.fertility.pIndex),
          indexFact("K", field.fertility.kIndex),
          soil ? { label: "Soil type", value: soil.soilAssociation } : { label: "Soil type", value: "Not yet mapped", missing: true },
          soilTestFact(field),
        ],
        links: [fieldDetail, { href: "/soil", label: "Soil by field" }],
      };
    }
    case "conditions":
      return {
        // The farm-wide legal calendar facts the caller already shows in
        // the ambient strip — never a field-level suitability verdict.
        facts: (context.conditionsFacts ?? []).map((fact) => ({ label: "Calendar", value: fact })),
        unavailableNote: "Conditions are farm-wide. Soil moisture deficit and ground workability aren't available yet.",
        links: [fieldDetail, { href: "/spreading", label: "Spreading" }],
      };
  }
}

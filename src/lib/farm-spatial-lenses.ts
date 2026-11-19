/**
 * Farm lenses — Current, Grass, Nutrients, Conditions
 * (`docs/design/farm-fields-high-fidelity-reference.md` "Farm lenses").
 * The earlier Farm Spatial V2 Soil lens is absorbed into Nutrients: soil
 * evidence (pH, P/K index, soil type, test age) sits underneath nutrient
 * state rather than competing with it. Presentation copy and domain colour
 * only: no lens computes or invents a value. Each lens states honestly
 * which of its contract elements have a real production source today
 * (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §5) and which are not yet
 * available, so the shell never implies data it doesn't have.
 */
export type FarmLensId = "current" | "grass" | "nutrients" | "conditions";

export interface FarmLensLink {
  href: string;
  label: string;
}

export interface FarmLens {
  id: FarmLensId;
  label: string;
  /** What this lens covers (DESIGN_CONTRACT wording, sentence case). */
  caption: string;
  /** Contract elements with no production source yet — shown as an
   * explicit "not yet available" note, never as a value. */
  unavailableNote?: string;
  /** Existing real destinations for this lens's detail. */
  links: FarmLensLink[];
  /** Domain colour (DESIGN_CONTRACT §5) for the active lens's underline
   * rule and the caption's accent rule — Tailwind class names from the
   * additive `--fr-v2-*` tokens. Phase 02B: the colour is a rule, never a
   * filled active button. */
  accentClassName: string;
  /** Kicker text colour over the map photo. */
  kickerClassName: string;
}

export const FARM_LENSES: readonly FarmLens[] = [
  {
    // Farm Overview Phase 1 (2026-11-19): the internal `current` id is kept
    // (selection views, field lens views and old links all key on it) and
    // presented as Overview — the map's default view with Farm Today.
    id: "current",
    label: "Overview",
    caption: "Farm Today · field-linked actions · planned work",
    unavailableNote: "Farm-wide topics stay in Farm Today. A field is only marked when its own record carries an action.",
    links: [{ href: "/plan", label: "Planned work" }],
    accentClassName: "bg-white",
    kickerClassName: "text-white/80",
  },
  {
    id: "grass",
    label: "Grass",
    caption: "Cover · growth · readiness",
    unavailableNote: "Fields without a grass reading stay unknown; Farm Return never fills them with an assumed cover.",
    links: [{ href: "/grass", label: "Open Grass analysis" }],
    accentClassName: "bg-fr-v2-teal",
    kickerClassName: "text-fr-v2-teal-tint",
  },
  {
    id: "nutrients",
    label: "Nutrients",
    caption: "Requirement · soil evidence · organic nutrients · fertiliser",
    unavailableNote: "Markers show recorded P and K indices. Requirement, soil evidence and fertiliser stay in each field's nutrient plan.",
    links: [
      { href: "/fertiliser-plan", label: "Farm nutrient plan" },
      { href: "/nutrients", label: "Field nutrient plan" },
    ],
    accentClassName: "bg-fr-v2-harvest",
    kickerClassName: "text-fr-v2-harvest-strong",
  },
  {
    id: "conditions",
    label: "Conditions",
    caption: "Rainfall · temperature · wind · spreading calendar",
    unavailableNote: "Soil moisture deficit and ground workability aren't available yet.",
    links: [{ href: "/spreading", label: "Spreading" }],
    accentClassName: "bg-fr-v2-cobalt",
    kickerClassName: "text-fr-v2-cobalt-tint",
  },
];

/**
 * The map views the farmer can switch between, in order: Overview | Grass |
 * Soil (product owner, 2026-11-19; previously Grass | Soil, 2026-11-12).
 * Overview (internal id `current`) is the map's default view on every new
 * Farm entry; Grass and Soil open only when chosen or deep-linked.
 * Conditions is still not offered (the spreading calendar lives in the
 * conditions chip); its definition stays above so older links still open.
 */
export const MAP_LENS_IDS: readonly FarmLensId[] = ["current", "grass", "nutrients"];
/** The switch's own wording for each map view. */
export const MAP_LENS_LABEL: Partial<Record<FarmLensId, string>> = { current: "Overview", grass: "Grass", nutrients: "Soil" };

export const DEFAULT_FARM_LENS: FarmLensId = "current";

/** Deep-link aliases: `?lens=overview` and `?lens=current` open Overview;
 * links written before Soil joined Nutrients (`?lens=soil`) open the
 * Nutrients lens; links to the retired Conditions view open the map's
 * default view. Anything else unknown is ignored by the caller. */
export function resolveFarmLensId(id: string | null | undefined): FarmLensId | undefined {
  if (id === "overview") return "current";
  if (id === "soil") return "nutrients";
  if (id === "conditions") return DEFAULT_FARM_LENS;
  return MAP_LENS_IDS.some((l) => l === id) ? (id as FarmLensId) : undefined;
}

export function farmLensById(id: FarmLensId): FarmLens {
  const lens = FARM_LENSES.find((l) => l.id === id);
  if (!lens) throw new Error(`Unknown Farm lens: ${id}`);
  return lens;
}

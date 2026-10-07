/**
 * Farm Spatial V2 — the five Farm lenses (`design/farm-spatial-v2/
 * DESIGN_CONTRACT.md` "Five lenses"). Presentation copy and domain colour
 * only: no lens computes or invents a value. Each lens states honestly
 * which of its contract elements have a real production source today
 * (`docs/farm-spatial-v2/IMPLEMENTATION_MAP.md` §5) and which are not yet
 * available, so the shell never implies data it doesn't have.
 */
export type FarmLensId = "current" | "grass" | "nutrients" | "soil" | "conditions";

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
    id: "current",
    label: "Current",
    caption: "Field use · livestock · recent and planned work",
    unavailableNote: "Livestock field locations aren't recorded yet, so groups stay in the rail.",
    links: [{ href: "/plan", label: "Planned work" }],
    accentClassName: "bg-white",
    kickerClassName: "text-white/80",
  },
  {
    id: "grass",
    label: "Grass",
    caption: "Cover · growth · readiness",
    unavailableNote: "Grass measurement isn't available yet. No cover or growth figure is shown.",
    links: [],
    accentClassName: "bg-fr-v2-teal",
    kickerClassName: "text-fr-v2-teal-tint",
  },
  {
    id: "nutrients",
    label: "Nutrients",
    caption: "Requirement · organic nutrients · fertiliser",
    unavailableNote: "Markers show recorded P and K indices. Field requirement and fertiliser stay in each field's nutrient plan.",
    links: [
      { href: "/fertiliser-plan", label: "Farm nutrient plan" },
      { href: "/nutrients", label: "Field nutrient plan" },
    ],
    accentClassName: "bg-fr-v2-harvest",
    kickerClassName: "text-fr-v2-harvest-strong",
  },
  {
    id: "soil",
    label: "Soil",
    caption: "pH · P and K index · soil type · test age",
    links: [{ href: "/soil", label: "Soil by field" }],
    accentClassName: "bg-fr-v2-clay",
    kickerClassName: "text-fr-v2-clay-tint",
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

export const DEFAULT_FARM_LENS: FarmLensId = "current";

export function farmLensById(id: FarmLensId): FarmLens {
  const lens = FARM_LENSES.find((l) => l.id === id);
  if (!lens) throw new Error(`Unknown Farm lens: ${id}`);
  return lens;
}

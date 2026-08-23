/**
 * Field polygon shapes + label anchor, laid out on a 100x100 viewBox.
 * Shared by every map surface (Dashboard hero, Fields page) so a field
 * appears at the same position everywhere — see FieldMap.tsx.
 *
 * Phase 1 placeholder for real geometry (spec §5 "Geometry" layer):
 * no live mapping-provider credentials exist yet (docs/product-requirements.md
 * § open questions), so these are illustrative shapes, not survey data.
 */
export const FIELD_SHAPES: Record<string, { points: string; labelX: number; labelY: number }> = {
  "field-back": { points: "4,4 52,2 48,46 6,44", labelX: 26, labelY: 22 },
  "field-home": { points: "54,2 96,6 94,44 50,46", labelX: 74, labelY: 22 },
  "field-road": { points: "4,48 46,46 44,96 2,92", labelX: 24, labelY: 70 },
  "field-river": { points: "48,48 94,46 96,94 46,96", labelX: 70, labelY: 72 },
};

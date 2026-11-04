import type { CropSystem } from "@/domain/fertiliser-field-evidence";

/** What each field use means in practice, so the farmer can pick the one
 * that matches the field. Descriptive only — no figure is implied. */
export const CROP_SYSTEM_CONTEXT: Readonly<Record<CropSystem, string>> = Object.freeze({
  GRASS_GRAZING: "Grazed through the season with no silage or hay cut planned — e.g. paddocks in the grazing block.",
  GRASS_FIRST_CUT_SILAGE: "Closed in spring for one silage cut, then usually grazed — e.g. a field closed for first-cut pit silage or bales.",
  GRASS_SECOND_CUT_SILAGE: "Cut for silage twice this season — e.g. a silage field taken again in mid-summer.",
  GRASS_THIRD_CUT_SILAGE: "Cut for silage three times this season.",
  GRASS_HAY: "Closed for a hay cut, then usually grazed.",
  GRASS_MIXED: "Grazed for part of the season and cut for part — e.g. grazed early, closed for a June cut, grazed after.",
  GRASS_WHITE_CLOVER_GRAZING: "A grazed sward with established white clover.",
  GRASS_WHITE_CLOVER_SILAGE: "A silage sward with established white clover.",
  RED_CLOVER_SILAGE: "A red clover sward cut for silage.",
  FORAGE_KALE: "Kale sown for winter grazing or feeding.",
  FORAGE_RAPE: "Rape sown for grazing.",
  CEREAL_OTHER: "Barley, wheat, oats or another cereal.",
  HORTICULTURE_OTHER: "Vegetables, fruit or another horticultural crop.",
  OTHER_UNSUPPORTED: "Anything else, e.g. woodland, fallow or a crop not listed.",
});

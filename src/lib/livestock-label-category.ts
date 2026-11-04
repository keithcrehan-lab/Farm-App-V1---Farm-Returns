import type { LivestockCategory } from "@/domain/types";

/**
 * A group's free-text label versus the category that actually drives its
 * stocking calculations. A contradiction (a group labelled "weanlings"
 * stored as `suckler_cow`) can materially change the stocking rate, so it
 * is surfaced for the farmer to review — the farmer's data is never
 * rewritten and no category is ever inferred from the label.
 *
 * Each label term lists every category it can honestly describe, so only
 * a label that cannot describe the stored category is flagged. A label
 * with no recognised term is never flagged.
 */
const LABEL_TERMS: { pattern: RegExp; categories: LivestockCategory[] }[] = [
  { pattern: /\bweanlings?\b/, categories: ["weanling", "calf", "store"] },
  { pattern: /\bcal(f|ves)\b/, categories: ["calf", "weanling"] },
  { pattern: /\bcows?\b/, categories: ["suckler_cow", "dairy_cow"] },
  { pattern: /\bdairy\b/, categories: ["dairy_cow", "calf", "heifer"] },
  {
    pattern: /\bsucklers?\b/,
    categories: ["suckler_cow", "calf", "weanling", "heifer", "bull"],
  },
  { pattern: /\bbulls?\b/, categories: ["bull", "weanling", "calf"] },
  { pattern: /\b(bullocks?|steers?)\b/, categories: ["steer", "store"] },
  { pattern: /\bheifers?\b/, categories: ["heifer", "weanling", "store", "calf"] },
  { pattern: /\bstores?\b/, categories: ["store", "steer", "heifer", "weanling"] },
];

export interface LivestockLabelCategoryConflict {
  label: string;
  category: LivestockCategory;
}

export function livestockLabelCategoryConflict(group: {
  label: string;
  category: LivestockCategory;
}): LivestockLabelCategoryConflict | null {
  const label = group.label.toLowerCase();
  const matched = LABEL_TERMS.filter((term) => term.pattern.test(label));
  if (matched.length === 0) return null;
  const described = new Set(matched.flatMap((term) => term.categories));
  return described.has(group.category)
    ? null
    : { label: group.label, category: group.category };
}

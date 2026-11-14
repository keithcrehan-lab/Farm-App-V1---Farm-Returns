/** Farmer-facing breed entry. Common Irish breeds first, then searchable
 * alternatives. This is a UI shortlist, not a measured popularity ranking
 * or a pedigree/genotype assertion. All values stay descriptive strings.
 */
export const COMMON_CATTLE_BREEDS = [
  "Angus", "Hereford", "Limousin", "Charolais", "Simmental",
  "Belgian Blue", "Holstein-Friesian", "Shorthorn", "Aubrac",
  "Salers", "Jersey", "Blonde d'Aquitaine", "Parthenaise",
  "Montbéliarde", "Stabiliser", "Wagyu", "Dexter",
  "Piedmontese", "Irish Moiled", "Kerry", "Belted Galloway",
  "Highland", "Longhorn",
] as const;

export const MIXED_BREEDS_VALUE = "Mixed breeds";
export const MAX_BREED_LENGTH = 80;

export type BreedMode = "single" | "cross" | "complex" | "mixed" | "unknown";
export type BreedDraft = {
  mode: BreedMode;
  first: string;
  second: string;
  complex: string;
};

export function emptyBreedDraft(): BreedDraft {
  return { mode: "unknown", first: "", second: "", complex: "" };
}

export function groupBreedDraft(value: string | null, members: readonly { breed: string | null }[] = []): BreedDraft {
  const recognised = members.map((m) => m.breed?.trim()).filter((b): b is string => Boolean(b));
  const distinct = [...new Set(recognised)];
  // Individual identities are the source of truth for an entirely recorded group.
  if (members.length > 0 && distinct.length > 1) return { ...emptyBreedDraft(), mode: "mixed" };
  if (members.length > 0 && recognised.length === members.length && distinct.length === 1) {
    return groupBreedDraft(distinct[0], []);
  }
  const raw = value?.trim() ?? "";
  if (!raw) return emptyBreedDraft();
  if (raw === MIXED_BREEDS_VALUE) return { ...emptyBreedDraft(), mode: "mixed" };
  if (raw.startsWith("Complex cross: ")) return { ...emptyBreedDraft(), mode: "complex", complex: raw.slice(15) };
  const parts = raw.split(/\s*×\s*|\s+[xX]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) return { mode: "cross", first: parts[0], second: parts[1], complex: "" };
  if (parts.length > 2) return { ...emptyBreedDraft(), mode: "complex", complex: raw };
  return { ...emptyBreedDraft(), mode: "single", first: raw };
}

/** A known *cross* does not automatically imply equal genetic proportions. */
export function groupBreedValue(draft: BreedDraft): string | null | undefined {
  const first = draft.first.trim();
  const second = draft.second.trim();
  const complex = draft.complex.trim();
  let value: string | null;
  switch (draft.mode) {
    case "unknown": value = null; break;
    case "mixed": value = MIXED_BREEDS_VALUE; break;
    case "single": value = first || null; break;
    case "cross": value = first && second && first.toLowerCase() !== second.toLowerCase() ? `${first} × ${second}` : null; break;
    case "complex": value = complex ? `Complex cross: ${complex}` : null; break;
    default: return undefined;
  }
  if ((draft.mode === "single" || draft.mode === "cross" || draft.mode === "complex") && !value) return undefined;
  if (value && value.length > MAX_BREED_LENGTH) return undefined;
  return value;
}

export function individualBreedSummary(members: readonly { breed: string | null }[]): string {
  if (members.length === 0) return "No individual breed records";
  const known = members.map((m) => m.breed?.trim()).filter((b): b is string => Boolean(b));
  if (!known.length) return `Breed not recorded for ${members.length} animals`;
  const counts = new Map<string, number>();
  for (const breed of known) counts.set(breed, (counts.get(breed) ?? 0) + 1);
  const parts = [...counts.entries()].map(([breed, n]) => `${n} ${breed}`);
  if (known.length < members.length) parts.push(`${members.length - known.length} not recorded`);
  return parts.join(" · ");
}

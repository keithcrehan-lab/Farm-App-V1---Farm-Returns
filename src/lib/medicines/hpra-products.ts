import "server-only";
import data from "./hpra-vet-products.json";

/**
 * Snapshot of the HPRA "medicines for animal use" XML product list
 * (https://www.hpra.ie/find-a-medicine/for-animal-use/xml-product-list).
 * Regenerate with `python3 scripts/build-hpra-vet-products.py <latestAnimallist.xml>`.
 * The list carries no barcodes and no withdrawal periods.
 */
export interface HpraVetProduct {
  licenceNumber: string;
  name: string;
  holder: string;
  legalStatus: string;
  species: string[];
  dosageForm: string;
  activeSubstances: string[];
  registrationStatus: string;
}

type Row = [string, string, string, string, string, string, string, string];
const snapshot = data as unknown as { publishedAt: string; source: string; products: Row[] };

export const HPRA_SNAPSHOT_PUBLISHED_AT = snapshot.publishedAt;

const toProduct = (row: Row): HpraVetProduct => ({
  licenceNumber: row[0],
  name: row[1],
  holder: row[2],
  legalStatus: row[3],
  species: row[4] ? row[4].split("|") : [],
  dosageForm: row[5],
  activeSubstances: row[6] ? row[6].split("|") : [],
  registrationStatus: row[7],
});

const norm = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
const FARM_SPECIES = new Set(["cattle", "sheep", "pigs", "goats", "horses", "chickens", "turkeys"]);

const index = snapshot.products.map((row) => ({
  row,
  name: norm(row[1]),
  haystack: norm(`${row[1]} ${row[6].replace(/\|/g, " ")} ${row[0]} ${row[2]}`),
  farm: row[4].split("|").some((s) => FARM_SPECIES.has(s.toLowerCase())),
  authorised: row[7] === "AU",
}));

export function findHpraProduct(licenceNumber: string): HpraVetProduct | null {
  const row = snapshot.products.find((r) => r[0] === licenceNumber);
  return row ? toProduct(row) : null;
}

export function searchHpraProducts(query: string, limit = 15): HpraVetProduct[] {
  const q = norm(query ?? "");
  if (q.length < 2) return [];
  const tokens = q.split(" ");
  const scored: Array<{ score: number; row: Row }> = [];
  for (const item of index) {
    if (!tokens.every((t) => item.haystack.includes(t))) continue;
    let score = item.name.startsWith(q) ? 0 : item.name.split(" ").some((w) => w.startsWith(tokens[0])) ? 10 : 20;
    if (!item.farm) score += 5;
    if (!item.authorised) score += 3;
    scored.push({ score, row: item.row });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.row[1].localeCompare(b.row[1]))
    .slice(0, limit)
    .map((s) => toProduct(s.row));
}

/** True when the HPRA legal status means a veterinary prescription is required. */
export function requiresPrescription(legalStatus: string): boolean {
  return /prescription/i.test(legalStatus) && !/non.?prescription/i.test(legalStatus);
}

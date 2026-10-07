import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Farm Spatial V2 Phase 1 audit (audit-20261007T061701Z-80856) — the
 * implementation map is what later phases build from, so the data sources
 * it names for these rows must match the production code.
 */
const map = readFileSync(join(__dirname, "../../docs/farm-spatial-v2/IMPLEMENTATION_MAP.md"), "utf-8");

function row(label: string): string {
  const line = map.split("\n").find((l) => l.startsWith(`| ${label}`));
  if (!line) throw new Error(`row not found: ${label}`);
  return line;
}

describe("Farm Spatial V2 implementation map", () => {
  it("F001: 'Still to buy' is the stock shortfall, with unknown stock disclosed", () => {
    const hero = row('Hero "4.8 t Still to buy"');
    expect(hero).toContain("stockColumns");
    expect(hero).toContain("shortfallKg");
    expect(hero).toContain("not_recorded");
    expect(hero).toMatch(/must not be the source/);
  });

  it("F002: the provisional notice follows the existing conditional presentation rules", () => {
    const organic = row("Organic contribution row");
    expect(organic).toContain("requirementCardPresentation");
    expect(organic).toContain("showProvisional");
    expect(organic).not.toMatch(/must be shown when `isProvisional`/);
  });

  it("F003: the canonical quote flow and the Managed Quote Pilot are separate; the bridge is not implemented", () => {
    expect(row("Send to Market / quote basket")).toMatch(/not persisted/);
    expect(row("Managed Quote Pilot")).toContain("separate flow");
    expect(row("Basket → persisted request bridge")).toContain("PLACEHOLDER / NOT IMPLEMENTED");
    expect(map).not.toMatch(/\| Request supplier quotes \(persisted\)/);
  });

  it("F004: slurry type maps to the persisted SlurryComposition record", () => {
    const band = row("Organic application band");
    expect(band).toContain("SlurryComposition.slurryType");
    expect(band).toContain("currentSlurryCompositionByHousing");
    expect(band).not.toContain("PLACEHOLDER (slurry type)");
  });
});

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

  it("section 9 keeps every current Today capability T1–T27, each naming a real producer", () => {
    for (let n = 1; n <= 27; n++) {
      const cells = row(`T${n} |`).split("|");
      expect(cells[3].trim().length).toBeGreaterThan(0);
    }
  });

  it("section 9 producers named by the reconciliation exist in the Today sources", () => {
    const today = readFileSync(join(__dirname, "(app)/today/page.tsx"), "utf-8");
    for (const symbol of ["selectPrimaryPrompt", "handlePilotViewDetails", "onOpenField", "secondaryFeedPrompts", "canRecord={isRealMode}", "mappedFields.length > 0"]) {
      expect(today).toContain(symbol);
    }
    const sheet = readFileSync(join(__dirname, "../components/next/ExpandedPromptSheet.tsx"), "utf-8");
    expect(sheet).toContain("startJobSessionFromPromptAction");
    expect(sheet).toContain("submitPromptDecisionAction");
    const gps = readFileSync(join(__dirname, "../components/farm/GpsActivityCandidateCard.tsx"), "utf-8");
    expect(gps).toContain("startJobSessionFromPlanAction");
    expect(row("T23 |")).toContain("getMatchablePlanForFieldAction");
  });
});

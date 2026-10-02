import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SlurryDiagnosticCard } from "./SlurryDiagnosticCard";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { buildSlurryRateAllocation, type SlurryRateAllocation } from "@/domain/slurry-rate-allocation";
import { slurryDiagnosticPresentation } from "@/lib/slurry-diagnostic-presentation";
import { tracked } from "@/domain/types";
import type { Field, FieldUse } from "@/domain/types";
import type { SlurryComposition } from "@/domain/slurry-composition";

// Fertiliser Vertical Completion, Increment 2d — the read-only planned
// slurry evaluation, rendered from real canonical outputs
// (`calculateNutrientPlan` → `buildSlurryRateAllocation`), never fixtures
// of the allocation itself.

afterEach(() => {
  cleanup();
});

const baseField: Field = {
  id: "field-diag",
  farmId: "farm-test",
  name: "Diagnostic Field",
  areaHa: 5,
  centroid: [0, 0],
  plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Farmer"),
  fertility: { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") },
  history: [],
};

const lessComposition: SlurryComposition = {
  id: "comp-diag",
  farmId: baseField.farmId,
  housingId: "housing-1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-06-10",
  source: "Lab report",
  recordedAt: "2026-06-12T09:00:00.000Z",
};

interface Scenario {
  fertility?: Field["fertility"];
  rateM3ha?: number;
  method?: "LESS" | "splashplate" | "other";
  plannedUse?: FieldUse;
}

function allocationFor({ fertility = baseField.fertility, rateM3ha = 33, method = "LESS", plannedUse = "silage_1st_cut" }: Scenario = {}): SlurryRateAllocation {
  const plan = calculateNutrientPlan({
    field: { ...baseField, fertility, plannedUse: tracked(plannedUse, "farmer_adjusted", "Farmer") },
    farmGrasslandAreaHa: 20,
    livestockGroups: [],
    ...(rateM3ha > 0
      ? {
          slurryAllocation: {
            fieldId: baseField.id,
            housingId: "housing-1",
            priority: "high" as const,
            volumeM3: rateM3ha * baseField.areaHa,
            score: 90,
            applicationMethod: tracked(method, "farmer_adjusted", "Farmer"),
          },
        }
      : {}),
    ...(plannedUse === "tillage" ? {} : { silage: { cutNumber: 1 as const, expectedYieldTDMha: 5, wasGrazedPreviousYear: false } }),
    ...(method === "LESS" ? { slurryComposition: lessComposition } : {}),
  });
  return buildSlurryRateAllocation({ plan, plannedUse });
}

function row(nutrient: "N" | "P" | "K") {
  return within(screen.getByTestId(`slurry-diagnostic-${nutrient}`));
}

/** The four cells of a row, in column order. */
function cells(nutrient: "N" | "P" | "K") {
  return screen.getByTestId(`slurry-diagnostic-${nutrient}`).querySelectorAll("td");
}

const FORBIDDEN_WORDING = [/recommended slurry rate/i, /you should spread/i, /approved/i, /safe to spread/i, /legal to spread/i, /illegal/i, /unsafe/i, /prohibited/i];

const ALL_SCENARIOS: Record<string, Scenario> = {
  complete: { rateM3ha: 80 },
  noSlurry: { rateM3ha: 0 },
  pKnownKUnknown: { fertility: { pIndex: tracked(2, "verified", "Lab") } },
  pUnknownKKnown: { fertility: { kIndex: tracked(2, "verified", "Lab") }, method: "splashplate" },
  bothUnknown: { fertility: {} },
  noExcess: { rateM3ha: 33 },
  tillage: { plannedUse: "tillage" },
  unsupported: { method: "other" },
};

describe("SlurryDiagnosticCard — planned slurry evaluation from canonical outputs", () => {
  it("1 + 6: complete field with planned slurry shows rate, total, contribution, requirement, remaining and the K excess explicitly", () => {
    const allocation = allocationFor({ rateM3ha: 80 });
    const { container } = render(<SlurryDiagnosticCard allocation={allocation} />);
    expect(screen.getByText("Planned slurry evaluation")).toBeTruthy();
    expect(screen.getByText("Planned slurry")).toBeTruthy();
    expect(container.textContent).toContain("80 m³/ha");
    expect(screen.getByText(/Total for this field: 400 m³/)).toBeTruthy();
    expect(screen.getByText(/6% dry matter/)).toBeTruthy();

    // P: contribution 20, requirement 30, remaining 10, no excess.
    const p = cells("P");
    expect(p[1].textContent).toBe("20 kg/ha");
    expect(p[2].textContent).toBe("30 kg/ha");
    expect(p[3].textContent).toBe("10 kg/ha");
    expect(p[4].textContent).toBe("None");
    // K: contribution 252 > requirement 185 — excess 67 shown, remaining 0, not clamped away.
    const k = cells("K");
    expect(k[1].textContent).toBe("252 kg/ha");
    expect(k[2].textContent).toBe("185 kg/ha");
    expect(k[3].textContent).toBe("0 kg/ha");
    expect(k[4].textContent).toBe("67 kg/ha");
    expect(screen.getByText("Nutrient excess: K")).toBeTruthy();
    expect(screen.getByText(/slurry supplies more K than this field's requirement/)).toBeTruthy();
    // N row present and known.
    expect(row("N").queryByText("Unknown")).toBeNull();
  });

  it("2: no planned slurry shows a concise state, no rate and no figures", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ rateM3ha: 0 })} />);
    expect(screen.getByText("No slurry planned for this field.")).toBeTruthy();
    expect(screen.queryByText(/m³\/ha/)).toBeNull();
    expect(screen.queryByTestId("slurry-diagnostic-N")).toBeNull();
    expect(screen.queryByText(/nutrient excess/i)).toBeNull();
  });

  it("3: P known / K unknown — P evaluated, K unknown with its own reason, N independent", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ fertility: { pIndex: tracked(2, "verified", "Lab") } })} />);
    expect(cells("P")[2].textContent).toBe("30 kg/ha");
    expect(row("P").queryByText("Unknown")).toBeNull();
    expect(row("K").getAllByText("Unknown").length).toBe(4);
    expect(row("K").getAllByText("Soil K Index missing").length).toBeGreaterThan(0);
    expect(row("N").queryByText("Unknown")).toBeNull();
  });

  it("4: P unknown / K known — K evaluated, P unknown", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ fertility: { kIndex: tracked(2, "verified", "Lab") }, method: "splashplate" })} />);
    expect(row("K").queryByText("Unknown")).toBeNull();
    expect(row("P").getAllByText("Unknown").length).toBe(4);
    expect(row("P").getAllByText("Soil P Index missing").length).toBeGreaterThan(0);
    expect(row("N").queryByText("Unknown")).toBeNull();
  });

  it("5: both P and K unknown — both unknown, N still shown, diagnostic not blocked", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ fertility: {} })} />);
    expect(row("P").getAllByText("Unknown").length).toBe(4);
    expect(row("K").getAllByText("Unknown").length).toBe(4);
    expect(row("N").queryByText("Unknown")).toBeNull();
    expect(cells("N")[2].textContent).toMatch(/kg\/ha$/);
  });

  it("7: no excess — no excess pill, every excess cell 'None'", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ rateM3ha: 33 })} />);
    expect(screen.queryByText(/Nutrient excess:/)).toBeNull();
    for (const nutrient of ["N", "P", "K"] as const) expect(cells(nutrient)[4].textContent).toBe("None");
  });

  it("8: tillage uses the layer's NOT_EVALUATED status — one line, no figures", () => {
    const allocation = allocationFor({ plannedUse: "tillage" });
    expect(allocation.requirement.n.status).toBe("NOT_APPLICABLE");
    render(<SlurryDiagnosticCard allocation={allocation} />);
    expect(screen.getByText("Not evaluated")).toBeTruthy();
    expect(screen.getByText(/no nutrient requirement table for tillage ground/)).toBeTruthy();
    expect(screen.queryByTestId("slurry-diagnostic-P")).toBeNull();
    expect(screen.queryByText(/kg\/ha/)).toBeNull();
  });

  it("9: unsupported application method — requirement shown, contribution, remaining and excess unknown", () => {
    const allocation = allocationFor({ method: "other" });
    expect(allocation.plannedApplication.status).toBe("PLANNED");
    render(<SlurryDiagnosticCard allocation={allocation} />);
    for (const nutrient of ["N", "P", "K"] as const) {
      const c = cells(nutrient);
      expect(c[1].textContent).toContain("Unknown");
      expect(c[2].textContent).toMatch(/kg\/ha$/);
      expect(c[3].textContent).toContain("Unknown");
      expect(c[4].textContent).toContain("Unknown");
    }
    expect(screen.queryByText(/dry matter/)).toBeNull();
  });

  it("10: unknown is never rendered as zero", () => {
    for (const scenario of [ALL_SCENARIOS.pKnownKUnknown, ALL_SCENARIOS.pUnknownKKnown, ALL_SCENARIOS.bothUnknown, ALL_SCENARIOS.unsupported]) {
      const allocation = allocationFor(scenario);
      const { rows } = slurryDiagnosticPresentation(allocation).evaluation as { rows: { nutrient: string; contribution: { kind: string }; requirement: { kind: string }; remaining: { kind: string }; excess: { kind: string } }[] };
      render(<SlurryDiagnosticCard allocation={allocation} />);
      for (const r of rows) {
        const tds = cells(r.nutrient as "N" | "P" | "K");
        [r.contribution, r.requirement, r.remaining, r.excess].forEach((value, i) => {
          if (value.kind !== "known") {
            expect(tds[i + 1].textContent).not.toMatch(/\b0\b/);
            expect(tds[i + 1].textContent).not.toBe("None");
          }
        });
      }
      cleanup();
    }
  });

  it("11: no autonomous recommendation wording and no selected rate in any state", () => {
    for (const scenario of Object.values(ALL_SCENARIOS)) {
      const allocation = allocationFor(scenario);
      expect(allocation.finalAllowedRate.status).toBe("DEFERRED");
      const { container } = render(<SlurryDiagnosticCard allocation={allocation} />);
      const text = container.textContent ?? "";
      for (const pattern of FORBIDDEN_WORDING) expect(text).not.toMatch(pattern);
      // The only m³/ha figure is the farmer's own planned rate.
      expect((text.match(/m³\/ha/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(text).toContain("It does not set a slurry rate.");
      cleanup();
    }
  });
});

describe("SlurryDiagnosticCard — canonical provenance and limitations survive presentation (audit F001)", () => {
  it("carries requirement source, rule refs, evidence state and limitations (silage N yield scaling) and the remaining evidence state", () => {
    const allocation = allocationFor({ rateM3ha: 80 });
    const req = allocation.requirement.n;
    const rem = allocation.remainingChemicalRequirement.n;
    if (req.status !== "KNOWN" || rem.status !== "KNOWN") throw new Error("expected known N");
    expect(req.limitations).toContain("N_YIELD_SCALING_NOT_APPLIED");

    const presentation = slurryDiagnosticPresentation(allocation);
    if (presentation.evaluation.kind !== "evaluated") throw new Error("expected evaluated");
    const n = presentation.evaluation.rows.find((r) => r.nutrient === "N")!;
    if (n.requirement.kind !== "known" || n.remaining.kind !== "known") throw new Error("expected known N row");
    expect(n.requirement.evidence).toMatchObject({ evidenceState: req.evidenceState, source: req.source, ruleRefs: req.ruleRefs });
    expect(n.requirement.evidence?.limitations?.map((l) => l.code)).toEqual(req.limitations);
    expect(n.remaining.evidence?.evidenceState).toBe(rem.evidenceState);

    render(<SlurryDiagnosticCard allocation={allocation} />);
    const provenance = within(screen.getByTestId("slurry-diagnostic-provenance-N"));
    expect(provenance.getByText(/Teagasc Green Book \(5th Ed\., 2020\)/)).toBeTruthy();
    expect(provenance.getByText(/Table 12-7/)).toBeTruthy();
    expect(provenance.getByText("Silage N not adjusted for expected yield")).toBeTruthy();
    expect(provenance.getByText(/remaining requirement:/)).toBeTruthy();
    const versions = screen.getByTestId("slurry-diagnostic-versions").textContent ?? "";
    expect(versions).toContain(allocation.calculationVersion);
    expect(versions).toContain(allocation.upstreamCalculationVersion);
  });

  it("an unknown requirement shows no provenance for that nutrient", () => {
    render(<SlurryDiagnosticCard allocation={allocationFor({ fertility: { pIndex: tracked(2, "verified", "Lab") } })} />);
    expect(screen.queryByTestId("slurry-diagnostic-provenance-K")).toBeNull();
    expect(screen.getByTestId("slurry-diagnostic-provenance-P")).toBeTruthy();
  });
});

describe("slurryDiagnosticPresentation — consumes canonical outputs unchanged (12)", () => {
  it("every known figure is the allocation's own canonical value, unrounded", () => {
    for (const scenario of Object.values(ALL_SCENARIOS)) {
      const allocation = allocationFor(scenario);
      const presentation = slurryDiagnosticPresentation(allocation);
      if (presentation.evaluation.kind !== "evaluated") continue;
      for (const r of presentation.evaluation.rows) {
        const key = r.nutrient.toLowerCase() as "n" | "p" | "k";
        const req = allocation.requirement[key];
        const rem = allocation.remainingChemicalRequirement[key];
        const available = allocation.availableSlurryNutrient[r.nutrient];
        const excess = allocation.organicExcessOverRequirement[r.nutrient];
        expect(r.requirement.kind === "known" ? r.requirement.kgHa : undefined).toBe(req.status === "KNOWN" ? req.kgHa : undefined);
        expect(r.remaining.kind === "known" ? r.remaining.kgHa : undefined).toBe(rem.status === "KNOWN" ? rem.kgHa : undefined);
        expect(r.contribution.kind === "known" ? r.contribution.kgHa : undefined).toBe(available.status === "known" ? available.value : undefined);
        expect(r.excess.kind === "known" ? r.excess.kgHa : undefined).toBe(excess.status === "known" ? excess.value : undefined);
      }
    }
  });

  it("the card and helper contain no nutrient arithmetic and never call the engine", () => {
    for (const file of ["src/components/farm/SlurryDiagnosticCard.tsx", "src/lib/slurry-diagnostic-presentation.ts"]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/Math\./);
      expect(source, file).not.toMatch(/calculateNutrientPlan|buildSlurryRateAllocation\(/);
      expect(source, file).not.toMatch(/kgHa\s*[-+*/]|[-+*/]\s*[a-zA-Z.]*kgHa\b/);
    }
  });
});

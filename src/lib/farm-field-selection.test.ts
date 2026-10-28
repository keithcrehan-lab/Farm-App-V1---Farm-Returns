import { describe, expect, it } from "vitest";
import { tracked, type Field, type SlurryAllocation } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import type { FieldNutrientPlanView } from "@/lib/field-nutrient-plan-presentation";
import { farmFieldLensView } from "@/lib/farm-spatial-field-lens";
import type { FarmLensId } from "@/lib/farm-spatial-lenses";
import { farmFieldSelectionView } from "./farm-field-selection";

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "f1",
    farmId: "farm",
    name: "Long Field",
    areaHa: 3.4,
    centroid: [-8, 53],
    polygon: { type: "Polygon", coordinates: [[[-8, 53], [-8.001, 53], [-8.001, 53.001], [-8, 53]]] },
    fertility: {},
    history: [],
    ...overrides,
  } as Field;
}

const none: SlurryAllocation[] = [];

function view(lens: FarmLensId, f: Field, extra: { nutrientPlan?: FieldNutrientPlanView; leadingPrompt?: Prompt; conditionsFacts?: string[]; slurryAllocations?: SlurryAllocation[] } = {}) {
  const slurryAllocations = extra.slurryAllocations ?? none;
  return farmFieldSelectionView({
    lens,
    field: f,
    lensView: farmFieldLensView(lens, f, { slurryAllocations, conditionsFacts: extra.conditionsFacts }),
    nutrientPlan: extra.nutrientPlan,
    leadingPrompt: extra.leadingPrompt,
    conditionsFacts: extra.conditionsFacts,
    slurryAllocations,
  });
}

function availablePlan(overrides: Partial<Extract<FieldNutrientPlanView, { status: "available" }>> = {}): FieldNutrientPlanView {
  const unknown = { state: "unknown", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" } as const;
  return {
    status: "available",
    rows: [
      { id: "requirement", label: "Requirement", cells: { n: { state: "value", kgHa: 60 }, p: { state: "value", kgHa: 20 }, k: unknown } },
      { id: "organic", label: "Organic contribution", cells: { n: { state: "none" }, p: { state: "none" }, k: unknown } },
      { id: "remaining", label: "Remaining", cells: { n: { state: "value", kgHa: 59.4 }, p: { state: "value", kgHa: 20 }, k: unknown } },
    ],
    unknownReasons: ["A soil P or K Index isn't recorded — add a soil test to complete the plan."],
    organic: { state: "none" },
    solution: { kind: "unavailable", label: "Withheld", message: "Withheld" },
    legalGates: [{ id: "commonage", label: "Commonage", state: "ok", text: "Not commonage" }],
    evidence: { calculationVersion: "v", engineVersion: "e", cropBasis: "grazing", plannedUseAssumed: true, requirementRuleRefs: [], limitations: [], remainingEvidence: {} },
    ...overrides,
  };
}

const closedPrompt = {
  id: "p1",
  farmId: "farm",
  kind: "spreading_window",
  title: "Spreading window status needs review — Long Field",
  description: "Closed period.",
  basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD_CALENDAR", consequence: "closed" },
  fieldId: "f1",
  createdAt: "2026-10-27T09:00:00Z",
} as Prompt;

describe("farmFieldSelectionView — the selected field's curated, truthful panel", () => {
  it("leads with polygon-derived area and the recorded planned use, never calling it the current use", () => {
    const v = view("current", field({ plannedUse: tracked("grazing", "farmer_adjusted", "Farmer") }));
    expect(v.area).toBe("3.4 ha");
    expect(v.useLine).toBe("Planned · Grazing");
    expect(v.context[0]).toEqual({ label: "Planned use", value: "Grazing", tone: "fact" });
  });

  it("never invents a use, livestock, nutrient state, legal gate or job when nothing is recorded", () => {
    const v = view("current", field());
    expect(v.useLine).toBeUndefined();
    expect(v.statement).toEqual({ text: "No open prompt for this field.", tone: "unknown" });
    expect(v.context).toEqual([{ label: "Planned use", value: "Not set", tone: "unknown" }]);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(/livestock|cattle|weanling|kg N|legal gate|move cattle|record grazing/i);
    // Insufficient evidence: the neutral action, never inferred work.
    expect(v.primaryAction).toEqual({ label: "Open field workspace", href: "/fields?field=f1" });
  });

  it("uses the field's own real leading Prompt as the one current-state statement, marking a statutory prohibition as blocked", () => {
    const v = view("current", field(), { leadingPrompt: closedPrompt });
    expect(v.statement).toEqual({ text: closedPrompt.title, tone: "blocked" });
  });

  it("shows planned slurry only from a persisted allocation", () => {
    const allocations = [{ fieldId: "f1", housingId: "h1", volumeM3: 30.6, priority: "high" }] as SlurryAllocation[];
    expect(view("current", field(), { slurryAllocations: allocations }).context).toContainEqual({ label: "Slurry planned", value: "31 m³", tone: "fact" });
    expect(view("current", field()).context.find((r) => r.label === "Slurry planned")).toBeUndefined();
  });

  it("shows a legal gate only when the canonical plan reports one as blocking, never re-evaluated", () => {
    expect(view("current", field(), { nutrientPlan: availablePlan() }).context.find((r) => r.label === "Legal gate")).toBeUndefined();
    const blocked = availablePlan({ legalGates: [{ id: "commonage", label: "Commonage", state: "blocked", text: "Cannot determine — unknown commonage status" }] });
    expect(view("current", field(), { nutrientPlan: blocked }).context).toContainEqual({
      label: "Legal gate",
      value: "Commonage · Cannot determine — unknown commonage status",
      tone: "blocked",
    });
  });

  it("Nutrients: states the canonical remaining N and leads into the field nutrient plan", () => {
    const v = view("nutrients", field(), { nutrientPlan: availablePlan() });
    expect(v.statement).toEqual({ text: "59 kg N/ha remaining with no slurry planned.", tone: "fact" });
    const planned = availablePlan({ organic: { state: "planned", totalM3: 30, rateM3ha: 23, methodAssumed: false, timingAssumed: false, creditAssessed: true } });
    expect(view("nutrients", field(), { nutrientPlan: planned }).statement.text).toBe("59 kg N/ha remaining after planned slurry.");
    expect(v.primaryAction).toEqual({ label: "Open nutrient plan", href: "/today/field/f1" });
    expect(v.context.map((r) => r.label)).toEqual(["P", "K", "Soil test"]);
    expect(v.context[0]).toEqual({ label: "P", value: "Unknown", tone: "unknown" });
  });

  it("Nutrients: an unknown remaining N is said plainly, never shown as 0", () => {
    const unknownN = availablePlan();
    if (unknownN.status === "available") unknownN.rows[2].cells.n = { state: "unknown", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" };
    const v = view("nutrients", field(), { nutrientPlan: unknownN });
    expect(v.statement.tone).toBe("unknown");
    expect(v.statement.text).toMatch(/add a soil test/);
    expect(v.statement.text).not.toMatch(/\b0\b/);
  });

  it("Nutrients: with no plan and no lab test, offers the real soil-sampling workflow", () => {
    const v = view("nutrients", field(), { nutrientPlan: { status: "unavailable", message: "Add a livestock group." } });
    expect(v.statement).toEqual({ text: "Add a livestock group.", tone: "unknown" });
    expect(v.primaryAction).toEqual({ label: "Take soil sample", href: "/soil-sample/f1" });
  });

  it("Grass and Conditions make no per-field claim", () => {
    expect(view("grass", field()).statement.tone).toBe("unknown");
    const c = view("conditions", field(), { conditionsFacts: ["Slurry · Closed period"] });
    expect(c.statement).toEqual({ text: "Slurry · Closed period", tone: "blocked" });
    expect(c.context[0].value).toMatch(/not a field verdict/);
    expect(view("conditions", field()).statement).toEqual({ text: "Spreading calendar not assessed yet.", tone: "unknown" });
  });

  it("links deeper into the real field's workspace chapters", () => {
    const v = view("nutrients", field({ id: "a b" }), { nutrientPlan: availablePlan() });
    expect(v.secondaryLinks).toEqual([
      { label: "Open field workspace", href: "/fields?field=a%20b" },
      { label: "Nutrients", href: "/fields?field=a%20b&chapter=nutrients" },
      { label: "History", href: "/fields?field=a%20b&chapter=history" },
    ]);
  });
});

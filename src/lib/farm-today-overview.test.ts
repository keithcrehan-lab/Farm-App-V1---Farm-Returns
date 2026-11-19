import { describe, expect, it } from "vitest";
import type { Prompt } from "@/orchestration/prompt";
import type { TodayOpportunity } from "@/orchestration/prompt/today-opportunities";
import {
  FARM_TODAY_EMPTY_TEXT,
  FARM_TODAY_MAX_MAP_LABELS,
  buildFarmTodayView,
  farmTodayBadgeSignature,
  fieldActionKindForPrompt,
} from "./farm-today-overview";

const square: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

function field(id: string, name: string, mapped = true) {
  return { id, name, ...(mapped ? { polygon: square } : {}) };
}

function soilPrompt(fieldId: string, value: string, overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: `soil-${fieldId}-${Math.random()}`,
    farmId: "farm-1",
    kind: "soil_test_age",
    title: `Soil test needs renewing — ${fieldId}`,
    description: "d",
    basis: { status: "OK", value, evidenceState: "MEASURED" },
    fieldId,
    regulatory: "compliance_value",
    inputsSnapshot: { sampleDate: "2020-03-12" },
    createdAt: "2026-11-19T09:00:00Z",
    ...overrides,
  };
}

function fertPrompt(fieldId: string, status: "OK" | "BLOCKED" = "OK"): Prompt {
  return {
    id: `fert-${fieldId}`,
    farmId: "farm-1",
    kind: "fertiliser_recommendation",
    title: `Fertiliser recommended — ${fieldId}`,
    description: "d",
    basis:
      status === "OK"
        ? { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }
        : { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_INDEX", missingInputs: ["pIndex"] },
    fieldId,
    createdAt: "2026-11-19T09:00:00Z",
  } as Prompt;
}

function chemicalWindow(fieldId: string, open: boolean): Prompt {
  return {
    id: `win-${fieldId}`,
    farmId: "farm-1",
    kind: "spreading_window",
    title: "Spreading window",
    description: "d",
    basis: open
      ? { status: "OK", value: {}, evidenceState: "IRISH_MODEL" }
      : { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD_CALENDAR", consequence: "closed" },
    fieldId,
    inputsSnapshot: { material: "chemical_fertiliser" },
    createdAt: "2026-11-19T09:00:00Z",
  } as Prompt;
}

function opportunity(category: TodayOpportunity["category"], priority: TodayOpportunity["priority"], affectedFieldIds: string[] = []): TodayOpportunity {
  const labels = { slurry: "Slurry", lime: "Lime", fertiliser: "Fertiliser", soil: "Soil" } as const;
  const priorityLabels = { HIGH: "High priority", MEDIUM: "Medium priority", LOW: "Low priority", VERY_LOW: "For later" } as const;
  return {
    category,
    categoryLabel: labels[category],
    priority,
    priorityLabel: priorityLabels[priority],
    priorityReasons: [],
    blockers: priority === "MEDIUM" ? ["2 fields are in the statutory slurry closed period"] : [],
    headline: `${labels[category]} headline`,
    metrics: [],
    affectedFieldCount: affectedFieldIds.length,
    affectedFieldIds,
    fields: [],
  };
}

describe("buildFarmTodayView — states", () => {
  it("is loading until the page's post-mount producers have run (no SSR clock reads)", () => {
    const view = buildFarmTodayView({ ready: false, fields: [field("a", "A")], prompts: [soilPrompt("a", "DISREGARD")], opportunities: [] });
    expect(view.status).toBe("loading");
    expect(view.fieldGroups).toEqual([]);
    expect(view.badgeByField.size).toBe(0);
  });

  it("is honestly unavailable for a farm with no fields, never an all-clear", () => {
    const view = buildFarmTodayView({ ready: true, fields: [], prompts: [], opportunities: [] });
    expect(view.status).toBe("unavailable");
    expect(view.summary).not.toBe(FARM_TODAY_EMPTY_TEXT);
  });

  it("says no outstanding actions were identified from available records when nothing is actionable", () => {
    const view = buildFarmTodayView({
      ready: true,
      fields: [field("a", "A")],
      prompts: [soilPrompt("a", "VALID")],
      opportunities: [opportunity("soil", "LOW", ["a"])],
    });
    expect(view.status).toBe("ready");
    expect(view.summary).toBe(FARM_TODAY_EMPTY_TEXT);
    expect(view.lead).toBeUndefined();
    // A LOW topic stays on record, listed as not urgent.
    expect(view.laterTopics.map((t) => t.category)).toEqual(["soil"]);
  });
});

describe("buildFarmTodayView — farm-wide topics never mark a field", () => {
  it("keeps canonical topic order and labels them farm-wide with no field badge from affectedFieldIds", () => {
    const view = buildFarmTodayView({
      ready: true,
      fields: [field("a", "A"), field("b", "B")],
      prompts: [],
      opportunities: [opportunity("slurry", "HIGH", ["a", "b"]), opportunity("fertiliser", "MEDIUM", ["a"]), opportunity("lime", "VERY_LOW", ["b"])],
    });
    expect(view.attentionTopics.map((t) => t.category)).toEqual(["slurry", "fertiliser"]);
    expect(view.laterTopics.map((t) => t.category)).toEqual(["lime"]);
    expect(view.badgeByField.size).toBe(0);
    expect(view.labelledFieldIds).toEqual([]);
    expect(view.lead).toMatchObject({ kind: "topic", topic: { category: "slurry" } });
    expect(view.summary).toBe("2 farm-wide topics to review");
    expect(view.attentionTopics[1].blocker).toMatch(/closed period/);
  });
});

describe("fieldActionKindForPrompt — only a field's own actionable Prompt", () => {
  const open = new Map([["a", "OK" as const]]);
  const closed = new Map([["a", "LEGAL_PROHIBITION" as const]]);

  it("marks a disregarded soil test (statutory 4-year rule) but not a valid one", () => {
    expect(fieldActionKindForPrompt(soilPrompt("a", "DISREGARD"), open)).toBe("soil_test_renewal");
    expect(fieldActionKindForPrompt(soilPrompt("a", "VALID"), open)).toBeUndefined();
    expect(fieldActionKindForPrompt(soilPrompt("a", "INDEX4_PERSISTED"), open)).toBeUndefined();
  });

  it("marks a fertiliser recommendation only while that field's own chemical calendar is open", () => {
    expect(fieldActionKindForPrompt(fertPrompt("a"), open)).toBe("fertiliser_recommended");
    expect(fieldActionKindForPrompt(fertPrompt("a"), closed)).toBeUndefined();
    expect(fieldActionKindForPrompt(fertPrompt("a"), new Map())).toBeUndefined();
    expect(fieldActionKindForPrompt(fertPrompt("a", "BLOCKED"), open)).toBeUndefined();
  });

  it("never marks a field from calendar, evidence-gap or farm-level Prompts", () => {
    expect(fieldActionKindForPrompt(chemicalWindow("a", true), open)).toBeUndefined();
    expect(fieldActionKindForPrompt({ ...soilPrompt("a", "DISREGARD"), fieldId: undefined }, open)).toBeUndefined();
    expect(fieldActionKindForPrompt({ ...soilPrompt("a", "DISREGARD"), kind: "commonage_status" }, open)).toBeUndefined();
  });
});

describe("buildFarmTodayView — field actions and map indicators", () => {
  it("groups actions per field, orders by field name then id, and labels at most three mapped fields", () => {
    const fields = [field("f5", "Ash"), field("f1", "Meadow"), field("f2", "Bog"), field("f3", "Cross"), field("f4", "Ash"), field("f6", "Unmapped", false)];
    const prompts = [
      ...fields.map((f) => soilPrompt(f.id, "DISREGARD")),
      chemicalWindow("f2", true),
      fertPrompt("f2"),
      chemicalWindow("f1", false),
      fertPrompt("f1"),
    ];
    const view = buildFarmTodayView({ ready: true, fields, prompts, opportunities: [] });
    expect(view.fieldGroups.map((g) => g.fieldId)).toEqual(["f4", "f5", "f2", "f3", "f1", "f6"]);
    expect(view.fieldGroups.find((g) => g.fieldId === "f2")!.actions.map((a) => a.kind)).toEqual(["soil_test_renewal", "fertiliser_recommended"]);
    // f1's fertiliser is in the closed period: no field action for it.
    expect(view.fieldGroups.find((g) => g.fieldId === "f1")!.actions.map((a) => a.kind)).toEqual(["soil_test_renewal"]);
    expect(view.fieldActionCount).toBe(7);
    expect(view.labelledFieldIds).toHaveLength(FARM_TODAY_MAX_MAP_LABELS);
    expect(view.labelledFieldIds).toEqual(["f4", "f5", "f2"]);
    expect(view.badgeByField.get("f2")).toEqual({ count: 2, label: "New soil test needed +1" });
    expect(view.badgeByField.get("f3")).toEqual({ count: 1 });
    // An unmapped field is listed but never drawn.
    expect(view.badgeByField.has("f6")).toBe(false);
    expect(view.fieldGroups.find((g) => g.fieldId === "f6")!.mapped).toBe(false);
    expect(view.summary).toBe("7 field actions");
    expect(view.lead).toMatchObject({ kind: "field", group: { fieldId: "f4" } });
  });

  it("ignores Prompts for fields this farm doesn't list, and is deterministic across rebuilt Prompt ids", () => {
    const fields = [field("a", "A")];
    const one = buildFarmTodayView({ ready: true, fields, prompts: [soilPrompt("a", "DISREGARD"), soilPrompt("other-farm-field", "DISREGARD")], opportunities: [] });
    const two = buildFarmTodayView({ ready: true, fields, prompts: [soilPrompt("a", "DISREGARD")], opportunities: [] });
    expect(one.fieldGroups.map((g) => g.fieldId)).toEqual(["a"]);
    expect(one.fieldGroups[0].actions[0].key).toBe("soil_test_renewal:a");
    expect(farmTodayBadgeSignature(one)).toBe(farmTodayBadgeSignature(two));
  });

  it("carries real provenance for each action, never a new figure", () => {
    const view = buildFarmTodayView({ ready: true, fields: [field("a", "A")], prompts: [soilPrompt("a", "DISREGARD"), chemicalWindow("a", true), fertPrompt("a")], opportunities: [] });
    const [soil, fert] = view.fieldGroups[0].actions;
    expect(soil.evidence).toMatch(/^Lab test sampled .*2020 · statutory 4-year rule$/);
    expect(fert.evidence).toBe("Official model · nutrient plan · chemical calendar open");
    expect(soil.title).toBe("Soil test needs renewing — a");
  });
});

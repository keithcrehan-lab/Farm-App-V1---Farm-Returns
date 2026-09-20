import { describe, expect, it } from "vitest";
import { buildFertiliserOpportunity, buildLimeOpportunity, buildSlurryOpportunity, buildSoilOpportunity, buildTodayOpportunities } from "./today-opportunities";
import { countTodayPriorities } from "./today-priority";
import type { Prompt } from "./index";
import type { EngineOutcome } from "@/domain/evidence";
import type { FarmLimeRequirement } from "@/domain/fertiliser-plan";
import type { Field } from "@/domain/types";

function basisFor(status: EngineOutcome<unknown>["status"], value?: unknown): EngineOutcome<unknown> {
  switch (status) {
    case "OK":
      return { status: "OK", value: value ?? {}, evidenceState: "IRISH_MODEL" };
    case "LEGAL_PROHIBITION":
      return { status: "LEGAL_PROHIBITION", reasonCode: "R", consequence: "blocked" };
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "R", missingInputs: [] };
    case "AMBIGUOUS":
      return { status: "AMBIGUOUS", reasonCode: "R", detail: "d" };
    case "NOT_APPLICABLE":
      return { status: "NOT_APPLICABLE", reasonCode: "R" };
    case "UNKNOWN":
      return { status: "UNKNOWN", reasonCode: "R" };
  }
}

function prompt(id: string, kind: string, status: EngineOutcome<unknown>["status"], fieldId: string, overrides: Partial<Prompt> = {}): Prompt {
  return {
    id,
    farmId: "farm-1",
    kind,
    title: `Prompt ${id}`,
    description: `Real description for ${id}`,
    basis: basisFor(status),
    fieldId,
    createdAt: "2026-09-19T09:00:00.000Z",
    ...overrides,
  };
}

function slurryPrompt(id: string, fieldId: string, status: EngineOutcome<unknown>["status"]): Prompt {
  return prompt(id, "spreading_window", status, fieldId, { inputsSnapshot: { material: "organic_fertiliser_other_than_FYM" } });
}

function chemicalPrompt(id: string, fieldId: string, status: EngineOutcome<unknown>["status"]): Prompt {
  return prompt(id, "spreading_window", status, fieldId, { inputsSnapshot: { material: "chemical_fertiliser" } });
}

function fieldsFixture(ids: readonly string[]): Pick<Field, "id" | "name">[] {
  return ids.map((id) => ({ id, name: `Field ${id}` }));
}

describe("buildSlurryOpportunity — farm-topic aggregation", () => {
  it("collapses ten fields' own real closed-period Prompts into exactly ONE Slurry opportunity", () => {
    const fieldIds = Array.from({ length: 10 }, (_, i) => `field-${i}`);
    const prompts = fieldIds.map((id, i) => slurryPrompt(`slurry-${i}`, id, "LEGAL_PROHIBITION"));
    const opportunity = buildSlurryOpportunity(prompts, fieldsFixture(fieldIds));
    expect(opportunity).toBeDefined();
    expect(opportunity!.category).toBe("slurry");
    // Priority Engine V1: a real legal blocker with no field currently
    // open caps this at MEDIUM, never HIGH, solely because it's legally
    // closed (section 7 of this checkpoint's brief) — still a real,
    // meaningful, planning-relevant opportunity, kept visible.
    expect(opportunity!.priority).toBe("MEDIUM");
    expect(opportunity!.blockers).toEqual(["10 fields are in the statutory slurry closed period"]);
    expect(opportunity!.affectedFieldCount).toBe(10);
    expect(opportunity!.headline).toBe("10 fields in the slurry closed period");
  });

  it("never mixes chemical-fertiliser Prompts into the Slurry opportunity", () => {
    const prompts = [slurryPrompt("s1", "field-1", "OK"), chemicalPrompt("c1", "field-1", "LEGAL_PROHIBITION")];
    const opportunity = buildSlurryOpportunity(prompts, fieldsFixture(["field-1"]));
    // A real, currently open spreading window is this category's one
    // real time-sensitive fact -> HIGH (Priority Engine V1).
    expect(opportunity!.priority).toBe("HIGH");
    expect(opportunity!.affectedFieldCount).toBe(1);
  });

  it("CORRECTION: category membership is independent of priority — fields spanning open/closed/evidence-gap real statuses all belong to the same Slurry opportunity, not just the fields sharing whichever status ends up driving the category's own priority", () => {
    const prompts = [
      slurryPrompt("s-high-1", "field-high-1", "LEGAL_PROHIBITION"),
      slurryPrompt("s-high-2", "field-high-2", "LEGAL_PROHIBITION"),
      slurryPrompt("s-high-3", "field-high-3", "LEGAL_PROHIBITION"),
      slurryPrompt("s-med-1", "field-med-1", "OK"),
      slurryPrompt("s-med-2", "field-med-2", "OK"),
      slurryPrompt("s-med-3", "field-med-3", "OK"),
      slurryPrompt("s-med-4", "field-med-4", "OK"),
      slurryPrompt("s-med-5", "field-med-5", "OK"),
      slurryPrompt("s-low-1", "field-low-1", "AMBIGUOUS"),
      slurryPrompt("s-low-2", "field-low-2", "UNKNOWN"),
    ];
    const fieldIds = prompts.map((p) => p.fieldId!);
    const opportunity = buildSlurryOpportunity(prompts, fieldsFixture(fieldIds));
    // Priority Engine V1: at least one field with a real, currently open
    // spreading window is a genuine, real, farm-level time-sensitive
    // fact -> HIGH — a farm-level judgement about the category as a
    // whole, never "the worst field's own status" (there is no
    // `selectPrimaryPrompt` call anywhere in this builder any more).
    expect(opportunity!.priority).toBe("HIGH");
    // ALL 10 real fields — open, closed and ambiguous alike — are
    // counted and listed, exactly the aggregation correction this
    // checkpoint's brief describes; priority and membership never share
    // one filter.
    expect(opportunity!.affectedFieldCount).toBe(10);
    expect(opportunity!.affectedFieldIds.sort()).toEqual([...fieldIds].sort());
    expect(opportunity!.headline).toBe("10 fields affected");
    expect(opportunity!.priorityReasons[0]).toContain("5 of 10 fields");
  });

  it("keeps every underlying field id/name/real Prompt description available in the breakdown, not lost by aggregation", () => {
    const prompts = [slurryPrompt("s1", "field-a", "OK"), slurryPrompt("s2", "field-b", "OK")];
    const opportunity = buildSlurryOpportunity(prompts, fieldsFixture(["field-a", "field-b"]));
    expect(opportunity!.affectedFieldIds.sort()).toEqual(["field-a", "field-b"]);
    expect(opportunity!.fields.map((f) => f.fieldId).sort()).toEqual(["field-a", "field-b"]);
    for (const row of opportunity!.fields) {
      expect(row.fieldName).toBe(`Field ${row.fieldId}`);
      expect(row.detail).toContain("Real description for");
      expect(row.sourcePrompt).toBeDefined();
    }
  });

  it("only includes a volume-available metric when real storage capacity exists", () => {
    const prompts = [slurryPrompt("s1", "field-1", "OK")];
    const withStorage = buildSlurryOpportunity(prompts, fieldsFixture(["field-1"]), { totalUnallocatedM3: 120, totalCapacityM3: 300 });
    expect(withStorage!.metrics).toEqual([{ label: "Volume available to allocate", value: "120 m³" }]);

    const withoutStorage = buildSlurryOpportunity(prompts, fieldsFixture(["field-1"]), { totalUnallocatedM3: 0, totalCapacityM3: 0 });
    expect(withoutStorage!.metrics).toEqual([]);
  });

  it("returns undefined when the farm has no real slurry Prompts at all", () => {
    expect(buildSlurryOpportunity([], [])).toBeUndefined();
  });
});

describe("buildLimeOpportunity — farm-topic aggregation", () => {
  function limeRequirement(overrides: Partial<FarmLimeRequirement> = {}): FarmLimeRequirement {
    return { fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0, ...overrides };
  }

  it("collapses four fields' own real lime requirements into exactly ONE Lime opportunity", () => {
    const result = limeRequirement({
      fields: [
        { fieldId: "f1", fieldName: "Field 1", rateTHa: 2, fieldTonnes: 8, areaHa: 4 },
        { fieldId: "f2", fieldName: "Field 2", rateTHa: 1.5, fieldTonnes: 9, areaHa: 6 },
        { fieldId: "f3", fieldName: "Field 3", rateTHa: 1, fieldTonnes: 5, areaHa: 5 },
        { fieldId: "f4", fieldName: "Field 4", rateTHa: 3, fieldTonnes: 20.5, areaHa: 6.83 },
      ],
      farmTotalTonnes: 42.5,
    });
    const opportunity = buildLimeOpportunity(result);
    expect(opportunity).toBeDefined();
    expect(opportunity!.category).toBe("lime");
    expect(opportunity!.priority).toBe("MEDIUM");
    expect(opportunity!.headline).toBe("4 fields have a verified lime requirement");
    expect(opportunity!.affectedFieldCount).toBe(4);
    expect(opportunity!.metrics).toEqual([{ label: "Total requirement", value: "42.5 t" }]);
    expect(opportunity!.evidenceSummary).toBe("Verified laboratory evidence");
  });

  it("CORRECTION: a farm with BOTH real lime requirements AND missing evidence reports the union of both real, relevant groups, not just whichever was non-empty first", () => {
    const result = limeRequirement({
      fields: [
        { fieldId: "f1", fieldName: "Field 1", rateTHa: 2, fieldTonnes: 8, areaHa: 4 },
        { fieldId: "f2", fieldName: "Field 2", areaHa: 3 },
        { fieldId: "f3", fieldName: "Field 3", areaHa: 5 },
      ],
      farmTotalTonnes: 8,
      fieldsWithoutLimeEvidence: 2,
    });
    const opportunity = buildLimeOpportunity(result);
    // MEDIUM wins (existing precedence, unchanged) because a real
    // requirement exists...
    expect(opportunity!.priority).toBe("MEDIUM");
    // ...but membership includes the real-requirement field AND the two
    // evidence-gap fields — three real, relevant fields, not one.
    expect(opportunity!.affectedFieldCount).toBe(3);
    expect(opportunity!.affectedFieldIds.sort()).toEqual(["f1", "f2", "f3"]);
    expect(opportunity!.headline).toBe("3 fields affected");
    expect(opportunity!.fields.find((f) => f.fieldId === "f2")?.detail).toBe("No real laboratory lime figure on file");
  });

  it("keeps every field's own real rate/tonnes/area in the breakdown, verified-lab provenance stated", () => {
    const result = limeRequirement({ fields: [{ fieldId: "f1", fieldName: "Field 1", rateTHa: 2, fieldTonnes: 8, areaHa: 4 }], farmTotalTonnes: 8 });
    const opportunity = buildLimeOpportunity(result);
    expect(opportunity!.fields).toEqual([{ fieldId: "f1", fieldName: "Field 1", detail: "Verified lab test · 2 t/ha · 8 t total (4 ha)" }]);
  });

  it("reports missing evidence as VERY_LOW with the real fields lacking it", () => {
    const result = limeRequirement({
      fields: [
        { fieldId: "f1", fieldName: "Field 1", areaHa: 4 },
        // f2 has real evidence and genuinely needs no lime (rate/tonnes
        // both 0) — must NOT count as "missing evidence", and its zero
        // real requirement must not tip the farm into MEDIUM either.
        { fieldId: "f2", fieldName: "Field 2", rateTHa: 0, fieldTonnes: 0, areaHa: 2 },
      ],
      farmTotalTonnes: 0,
      fieldsWithoutLimeEvidence: 1,
    });
    const opportunity = buildLimeOpportunity(result);
    expect(opportunity!.priority).toBe("VERY_LOW");
    expect(opportunity!.headline).toBe("1 field is missing lime evidence");
    expect(opportunity!.affectedFieldCount).toBe(1);
    expect(opportunity!.affectedFieldIds).toEqual(["f1"]);
    expect(opportunity!.evidenceSummary).toBeUndefined();
  });

  it("contributes no opportunity when evidence is complete and genuinely no lime is needed", () => {
    expect(buildLimeOpportunity(limeRequirement({ fields: [{ fieldId: "f1", fieldName: "Field 1", rateTHa: 0, fieldTonnes: 0, areaHa: 4 }] }))).toBeUndefined();
  });

  it("contributes no opportunity while lime data hasn't loaded yet", () => {
    expect(buildLimeOpportunity(undefined)).toBeUndefined();
  });

  it("CORRECTION: Lime can never reach HIGH — no real, already-computed time-based lime-urgency rule exists in this codebase, so no tonnage/deadline threshold is invented, even for a very large real requirement", () => {
    const result = limeRequirement({
      fields: [{ fieldId: "f1", fieldName: "Field 1", rateTHa: 10, fieldTonnes: 500, areaHa: 50 }],
      farmTotalTonnes: 500,
    });
    const opportunity = buildLimeOpportunity(result);
    expect(opportunity!.priority).toBe("MEDIUM");
  });
});

describe("buildFertiliserOpportunity — farm-topic aggregation", () => {
  it("collapses six fields' own real recommendations into exactly ONE Fertiliser opportunity, with the ambient closed-period status as its summary", () => {
    const fieldIds = Array.from({ length: 6 }, (_, i) => `field-${i}`);
    const prompts = fieldIds.map((id, i) => prompt(`fert-${i}`, "fertiliser_recommendation", "OK", id));
    const opportunity = buildFertiliserOpportunity(prompts, fieldsFixture(fieldIds), "Chemical fertiliser · Closed period");
    expect(opportunity!.headline).toBe("6 fields have outstanding nutrient requirements");
    expect(opportunity!.affectedFieldCount).toBe(6);
    expect(opportunity!.summary).toBe("Chemical fertiliser · Closed period");
  });

  it("Priority Engine V1: a real recommendation while chemical fertiliser is currently OPEN is a real time-sensitive fact -> HIGH", () => {
    const prompts = [prompt("fert-1", "fertiliser_recommendation", "OK", "field-1")];
    const opportunity = buildFertiliserOpportunity(prompts, fieldsFixture(["field-1"]), undefined, false);
    expect(opportunity!.priority).toBe("HIGH");
    expect(opportunity!.blockers).toEqual([]);
  });

  it("Priority Engine V1 / section 7: a real recommendation while chemical fertiliser is currently CLOSED is a real blocker, not the whole priority — stays MEDIUM and visible for planning, never HIGH solely because the need is real, and never removed from membership", () => {
    const prompts = [
      prompt("fert-1", "fertiliser_recommendation", "OK", "field-1"),
      prompt("fert-2", "fertiliser_recommendation", "OK", "field-2"),
    ];
    const opportunity = buildFertiliserOpportunity(prompts, fieldsFixture(["field-1", "field-2"]), "Chemical fertiliser · Closed period", true);
    expect(opportunity!.priority).toBe("MEDIUM");
    expect(opportunity!.affectedFieldCount).toBe(2);
    expect(opportunity!.blockers).toEqual(["Chemical fertiliser is currently in the statutory closed period"]);
    expect(opportunity!.priorityReasons[0]).toContain("2 of 2 fields have a real, calculated nutrient requirement");
  });

  it("CORRECTION: a genuine OK recommendation and a genuine evidence gap both belong to the same Fertiliser opportunity — common on a real farm with partial soil-test coverage", () => {
    const prompts = [
      prompt("fert-ok-1", "fertiliser_recommendation", "OK", "field-1"),
      prompt("fert-ok-2", "fertiliser_recommendation", "OK", "field-2"),
      prompt("fert-blocked-1", "fertiliser_recommendation", "BLOCKED_INSUFFICIENT_EVIDENCE", "field-3"),
    ];
    const opportunity = buildFertiliserOpportunity(prompts, fieldsFixture(["field-1", "field-2", "field-3"]));
    // A real, open recommendation drives this category's own priority
    // (Priority Engine V1) — a farm-level judgement, never "the worst
    // field's own status" (no `selectPrimaryPrompt` call in this
    // builder any more).
    expect(opportunity!.priority).toBe("HIGH");
    // But all three real fields are counted, not just the two sharing
    // the real OK status that drove the priority.
    expect(opportunity!.affectedFieldCount).toBe(3);
    expect(opportunity!.affectedFieldIds.sort()).toEqual(["field-1", "field-2", "field-3"]);
  });

  it("still excludes a field this Prompt kind genuinely doesn't apply to (NOT_APPLICABLE — e.g. a tillage field) from membership", () => {
    const prompts = [
      prompt("fert-ok-1", "fertiliser_recommendation", "OK", "field-1"),
      prompt("fert-na-1", "fertiliser_recommendation", "NOT_APPLICABLE", "field-2"),
    ];
    const opportunity = buildFertiliserOpportunity(prompts, fieldsFixture(["field-1", "field-2"]));
    expect(opportunity!.affectedFieldCount).toBe(1);
    expect(opportunity!.affectedFieldIds).toEqual(["field-1"]);
  });
});

describe("buildSoilOpportunity — farm-topic aggregation", () => {
  it("collapses several fields' own real evidence-gap Prompts into exactly ONE Soil opportunity", () => {
    const prompts = [
      prompt("soil-1", "soil_test_age", "BLOCKED_INSUFFICIENT_EVIDENCE", "field-1"),
      prompt("soil-2", "soil_test_age", "BLOCKED_INSUFFICIENT_EVIDENCE", "field-2"),
    ];
    const opportunity = buildSoilOpportunity(prompts, fieldsFixture(["field-1", "field-2"]));
    expect(opportunity!.priority).toBe("VERY_LOW");
    expect(opportunity!.headline).toBe("2 fields have incomplete soil evidence");
    expect(opportunity!.affectedFieldCount).toBe(2);
  });

  it("Priority Engine V1, section 4: a current/valid soil test is NOT itself an urgent opportunity — every field genuinely healthy resolves LOW, never the old transitional MEDIUM (OK -> MEDIUM is removed)", () => {
    const prompts = [
      prompt("soil-1", "soil_test_age", "OK", "field-1", { basis: { status: "OK", value: "VALID", evidenceState: "IRISH_MODEL" } }),
      prompt("soil-2", "soil_test_age", "OK", "field-2", { basis: { status: "OK", value: "INDEX4_PERSISTED", evidenceState: "IRISH_MODEL" } }),
    ];
    const opportunity = buildSoilOpportunity(prompts, fieldsFixture(["field-1", "field-2"]));
    expect(opportunity!.priority).toBe("LOW");
    expect(opportunity!.headline).toBe("2 fields have a current soil test on file");
    expect(opportunity!.blockers).toEqual([]);
    expect(opportunity!.priorityReasons).toEqual(["2 fields have a current, valid soil test on file"]);
  });

  it("CORRECTION: a real DISREGARD (needs renewal) field and a real VALID (current) field both belong to the same Soil opportunity — the specific per-field status is no longer collapsed into one farm-wide headline claim, but stays real and available on each field's own row", () => {
    const prompts = [
      prompt("soil-1", "soil_test_age", "OK", "field-1", { basis: { status: "OK", value: "DISREGARD", evidenceState: "IRISH_MODEL" } }),
      prompt("soil-2", "soil_test_age", "OK", "field-2", { basis: { status: "OK", value: "VALID", evidenceState: "IRISH_MODEL" } }),
    ];
    const opportunity = buildSoilOpportunity(prompts, fieldsFixture(["field-1", "field-2"]));
    // A real, confirmed renewal need anywhere in the category is a real,
    // actionable problem (Priority Engine V1) -> MEDIUM. Not HIGH: no
    // real, already-computed renewal deadline/"years until expiry"
    // concept exists in this codebase (see this builder's own doc
    // comment) — not invented here either.
    expect(opportunity!.priority).toBe("MEDIUM");
    expect(opportunity!.affectedFieldCount).toBe(2);
    expect(opportunity!.headline).toBe("2 fields affected");
    expect(opportunity!.priorityReasons[0]).toContain("1 of 2 fields");
    // Not lost: each row's own real Prompt (and its own real `value`) is
    // still reachable via `sourcePrompt` for the "View scientific basis"
    // drill-down, exactly which field needs renewal vs which doesn't.
    const disregardRow = opportunity!.fields.find((f) => f.fieldId === "field-1");
    const validRow = opportunity!.fields.find((f) => f.fieldId === "field-2");
    expect((disregardRow!.sourcePrompt!.basis as { value: unknown }).value).toBe("DISREGARD");
    expect((validRow!.sourcePrompt!.basis as { value: unknown }).value).toBe("VALID");
  });

  it("folds soil_test_age's own NOT_APPLICABLE (no lab test at all) into VERY_LOW, not 'no item'", () => {
    const prompts = [prompt("soil-1", "soil_test_age", "NOT_APPLICABLE", "field-1")];
    const opportunity = buildSoilOpportunity(prompts, fieldsFixture(["field-1"]));
    expect(opportunity!.priority).toBe("VERY_LOW");
    expect(opportunity!.affectedFieldCount).toBe(1);
  });

  it("CORRECTION (Priority Engine V1): a NOT_APPLICABLE field (no test at all) and a healthy OK field both belong to the same Soil opportunity, and the category's priority now reflects that a real evidence gap exists — VERY_LOW, not the old representative-based MEDIUM", () => {
    const prompts = [
      prompt("soil-1", "soil_test_age", "NOT_APPLICABLE", "field-1"),
      prompt("soil-2", "soil_test_age", "OK", "field-2", { basis: { status: "OK", value: "VALID", evidenceState: "IRISH_MODEL" } }),
    ];
    const opportunity = buildSoilOpportunity(prompts, fieldsFixture(["field-1", "field-2"]));
    // No confirmed renewal need (no DISREGARD) and not every field is
    // healthy, so the real evidence gap on field-1 is this category's
    // most significant real finding -> VERY_LOW. The old transitional
    // engine picked field-2's own OK status as "the representative" and
    // reported MEDIUM, silently hiding the real evidence gap behind a
    // healthy field — exactly the bug this checkpoint corrects.
    expect(opportunity!.priority).toBe("VERY_LOW");
    expect(opportunity!.affectedFieldCount).toBe(2);
    expect(opportunity!.affectedFieldIds.sort()).toEqual(["field-1", "field-2"]);
    expect(opportunity!.blockers).toEqual(["1 field missing soil-test evidence"]);
  });
});

describe("buildTodayOpportunities — the single source of truth for cards + tracker", () => {
  it("never returns more than one opportunity per category", () => {
    const fieldIds = ["field-1", "field-2", "field-3"];
    const opportunities = buildTodayOpportunities({
      allPrompts: [
        ...fieldIds.map((id, i) => slurryPrompt(`s${i}`, id, "LEGAL_PROHIBITION")),
        ...fieldIds.map((id, i) => prompt(`f${i}`, "fertiliser_recommendation", "OK", id)),
        ...fieldIds.map((id, i) => prompt(`soil${i}`, "soil_test_age", "BLOCKED_INSUFFICIENT_EVIDENCE", id)),
      ],
      fields: fieldsFixture(fieldIds),
      limeRequirement: { fields: [{ fieldId: "field-1", fieldName: "Field field-1", rateTHa: 1, fieldTonnes: 4, areaHa: 4 }], farmTotalTonnes: 4, fieldsWithoutLimeEvidence: 0 },
    });
    const categories = opportunities.map((o) => o.category);
    expect(new Set(categories).size).toBe(categories.length);
    expect(categories.sort()).toEqual(["fertiliser", "lime", "slurry", "soil"]);
  });

  it("sorts most urgent first (HIGH before MEDIUM before LOW before VERY_LOW)", () => {
    const opportunities = buildTodayOpportunities({
      allPrompts: [
        prompt("soil-1", "soil_test_age", "BLOCKED_INSUFFICIENT_EVIDENCE", "field-1"),
        prompt("fert-1", "fertiliser_recommendation", "OK", "field-1"),
        slurryPrompt("slurry-1", "field-1", "LEGAL_PROHIBITION"),
      ],
      fields: fieldsFixture(["field-1"]),
      limeRequirement: undefined,
    });
    expect(opportunities.map((o) => o.priority)).toEqual(["HIGH", "MEDIUM", "VERY_LOW"]);
  });

  it("returns an empty array — not a fabricated placeholder — when nothing is active in any category", () => {
    expect(buildTodayOpportunities({ allPrompts: [], fields: [], limeRequirement: undefined })).toEqual([]);
  });

  it("CORRECTION: the priority tracker still counts ONE opportunity per category, never one per affected field, even once a category's own membership spans several priority bands", () => {
    // Slurry alone has 10 real fields split 3 High / 5 Medium / 2 Low —
    // the exact scenario this checkpoint's brief describes.
    const slurryFieldIds = Array.from({ length: 10 }, (_, i) => `slurry-field-${i}`);
    const opportunities = buildTodayOpportunities({
      allPrompts: [
        ...slurryFieldIds.slice(0, 3).map((id, i) => slurryPrompt(`s-high-${i}`, id, "LEGAL_PROHIBITION")),
        ...slurryFieldIds.slice(3, 8).map((id, i) => slurryPrompt(`s-med-${i}`, id, "OK")),
        ...slurryFieldIds.slice(8, 10).map((id, i) => slurryPrompt(`s-low-${i}`, id, "AMBIGUOUS")),
      ],
      fields: fieldsFixture(slurryFieldIds),
      limeRequirement: undefined,
    });
    expect(opportunities).toHaveLength(1);
    const slurry = opportunities[0];
    expect(slurry.category).toBe("slurry");
    expect(slurry.priority).toBe("HIGH");
    expect(slurry.affectedFieldCount).toBe(10);
    // Counting priorities (what the tracker tile actually renders) still
    // yields exactly one High entry — the category, not its 10 fields.
    const counts = countTodayPriorities(opportunities.map((o) => o.priority));
    expect(counts).toEqual({ HIGH: 1, MEDIUM: 0, LOW: 0, VERY_LOW: 0 });
  });
});

// Today Map Priority Semantics Correction (2026-09-19): this file used
// to test `computeFieldPriorities` here (a farm-level-priority-inherited-
// by-field derivation for the map's own markers) — removed along with
// the function itself. See `today-opportunities.ts`'s own note at that
// former location for why: farm-level opportunity priority and
// field-level priority are different concepts, and this app has no real
// field-level ranking to derive yet.

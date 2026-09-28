import { describe, expect, it } from "vitest";
import {
  SLURRY_ORIGIN_QUESTION,
  SLURRY_ORIGIN_SUMMARY_LABEL,
  SLURRY_ORIGIN_ISSUE_COPY,
  currentSlurryOriginEvidence,
  fieldPlannedManureOrigin,
  originEvidenceAppliesTo,
  slurryOriginDeclarationNote,
  slurryOriginEvidenceHistory,
  validateNewSlurryOriginEvidenceInput,
  type SlurryOriginEvidenceRecord,
} from "./slurry-origin-evidence";
import type { SlurryAllocationRecord } from "./slurry-allocation-lifecycle";
import { applyLocalSlurryCancel, applyLocalSlurryEdit } from "./slurry-plan-lifecycle-view";
import type { Housing } from "./types";

const alloc = (overrides: Partial<SlurryAllocationRecord> = {}): SlurryAllocationRecord => ({
  id: "sa-1",
  farmId: "farm-1",
  fieldId: "field-1",
  housingId: "housing-1",
  volumeM3: 60,
  status: "planned",
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: "2026-02-01T00:00:00Z",
  planRevision: 1,
  ...overrides,
});

const decl = (overrides: Partial<SlurryOriginEvidenceRecord> = {}): SlurryOriginEvidenceRecord => ({
  id: "o-1",
  farmId: "farm-1",
  allocationId: "sa-1",
  origin: "home_produced_grazing_livestock",
  status: "farmer_adjusted",
  source: "Farmer declaration on the slurry plan",
  planRevisionAtRecord: 1,
  fieldIdAtRecord: "field-1",
  housingIdAtRecord: "housing-1",
  volumeM3AtRecord: 60,
  recordedAt: "2026-02-03T10:00:00Z",
  recordedBy: "user-1",
  ...overrides,
});

describe("validateNewSlurryOriginEvidenceInput", () => {
  const ok = { allocationId: "sa-1", planRevision: 1, origin: "imported_organic_manure" as const, status: "farmer_adjusted" as const, source: "Farmer" };
  it("accepts a well-formed declaration", () => {
    expect(validateNewSlurryOriginEvidenceInput(ok)).toEqual([]);
  });
  it("rejects a missing plan, bad revision, unknown origin/status and blank source", () => {
    expect(validateNewSlurryOriginEvidenceInput({ ...ok, allocationId: " " })).toEqual(["ALLOCATION_NOT_FOUND"]);
    for (const planRevision of [0, 1.5, Number.NaN]) expect(validateNewSlurryOriginEvidenceInput({ ...ok, planRevision })).toEqual(["PLAN_REVISION_INVALID"]);
    expect(validateNewSlurryOriginEvidenceInput({ ...ok, origin: "store_owner" as never })).toEqual(["ORIGIN_INVALID"]);
    expect(validateNewSlurryOriginEvidenceInput({ ...ok, status: "estimated" as never })).toEqual(["STATUS_INVALID"]);
    expect(validateNewSlurryOriginEvidenceInput({ ...ok, source: "  " })).toEqual(["SOURCE_REQUIRED"]);
  });
});

describe("fieldPlannedManureOrigin — explicit evidence only", () => {
  it("A/L: an existing plan with no declaration is not established (no default, no backfill)", () => {
    expect(fieldPlannedManureOrigin([alloc()], "field-1", [])).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED" });
  });

  it("no planned slurry is not an origin question", () => {
    expect(fieldPlannedManureOrigin([alloc({ status: "cancelled" })], "field-1", [decl()])).toEqual({ state: "missing", reasonCode: "NO_PLANNED_SLURRY" });
  });

  it("B: explicit home-produced grazing-livestock evidence is a known origin with its provenance", () => {
    expect(fieldPlannedManureOrigin([alloc()], "field-1", [decl()])).toEqual({
      state: "known",
      value: "home_produced_grazing_livestock",
      status: "farmer_adjusted",
      source: "Farmer declaration on the slurry plan",
      recordedAt: "2026-02-03T10:00:00Z",
      recordId: "o-1",
      freshness: "NO_FRESHNESS_POLICY",
    });
  });

  it("C/H: explicit imported evidence is imported — even though the store is the farmer's own", () => {
    expect(fieldPlannedManureOrigin([alloc()], "field-1", [decl({ origin: "imported_organic_manure" })])).toMatchObject({ state: "known", value: "imported" });
  });

  it("D: 'not sure' stays blocked", () => {
    expect(fieldPlannedManureOrigin([alloc()], "field-1", [decl({ origin: "unknown" })])).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGIN_DECLARED_UNKNOWN" });
  });

  it("E: 'mixed' without a split stays blocked — never forced into either origin", () => {
    expect(fieldPlannedManureOrigin([alloc()], "field-1", [decl({ origin: "mixed" })])).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGIN_MIXED_SPLIT_NOT_ESTABLISHED" });
  });

  it("E: two contributing plans with different known origins are mixed material — blocked, no split invented", () => {
    const allocations = [alloc(), alloc({ id: "sa-2", housingId: "housing-2", volumeM3: 40 })];
    const records = [decl(), decl({ id: "o-2", allocationId: "sa-2", housingIdAtRecord: "housing-2", volumeM3AtRecord: 40, origin: "imported_organic_manure" })];
    expect(fieldPlannedManureOrigin(allocations, "field-1", records)).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGINS_DIFFER_ACROSS_PLANS" });
  });

  it("every contributing plan must be declared; the same origin on all of them is known, weakest status kept", () => {
    const allocations = [alloc(), alloc({ id: "sa-2", housingId: "housing-2", volumeM3: 40 })];
    const second = decl({ id: "o-2", allocationId: "sa-2", housingIdAtRecord: "housing-2", volumeM3AtRecord: 40, status: "verified", source: "Adviser" });
    expect(fieldPlannedManureOrigin(allocations, "field-1", [decl()])).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED" });
    expect(fieldPlannedManureOrigin(allocations, "field-1", [decl(), second])).toMatchObject({
      state: "known",
      value: "home_produced_grazing_livestock",
      status: "farmer_adjusted",
      source: "Farmer declaration on the slurry plan; Adviser",
    });
  });

  it("M: a known origin from several plans keeps each contributing declaration's provenance", () => {
    const allocations = [alloc(), alloc({ id: "sa-2", housingId: "housing-2", volumeM3: 40 })];
    const second = decl({ id: "o-2", allocationId: "sa-2", housingIdAtRecord: "housing-2", volumeM3AtRecord: 40, status: "verified", source: "Adviser", recordedAt: "2026-02-04T10:00:00Z" });
    expect(fieldPlannedManureOrigin(allocations, "field-1", [second, decl()])).toMatchObject({
      state: "known",
      contributingDeclarations: [
        { allocationId: "sa-1", recordId: "o-1", recordedAt: "2026-02-03T10:00:00Z", status: "farmer_adjusted", source: "Farmer declaration on the slurry plan" },
        { allocationId: "sa-2", recordId: "o-2", recordedAt: "2026-02-04T10:00:00Z", status: "verified", source: "Adviser" },
      ],
    });
  });

  it("K: contradictory declarations tied on capture time fail closed as a conflict; equivalent ones collapse", () => {
    const tied = [decl({ id: "o-b", origin: "imported_organic_manure" }), decl({ id: "o-a" })];
    for (const records of [tied, [...tied].reverse()]) {
      expect(fieldPlannedManureOrigin([alloc()], "field-1", records)).toEqual({ state: "conflicting", reasonCode: "PLANNED_MANURE_ORIGIN_TIED_DECLARATIONS_CONFLICT", candidates: [] });
    }
    expect(currentSlurryOriginEvidence(alloc(), [decl({ id: "o-b" }), decl({ id: "o-a" })])).toEqual({ record: expect.objectContaining({ id: "o-a" }) });
  });

  it("the latest capture wins regardless of input order; earlier declarations stay in history", () => {
    const older = decl({ id: "o-old", origin: "unknown", recordedAt: "2026-02-03T10:00:00Z" });
    const newer = decl({ id: "o-new", origin: "imported_organic_manure", recordedAt: "2026-02-04T10:00:00Z" });
    for (const records of [[older, newer], [newer, older]]) {
      expect(fieldPlannedManureOrigin([alloc()], "field-1", records)).toMatchObject({ state: "known", value: "imported", recordId: "o-new" });
    }
    expect(slurryOriginEvidenceHistory("sa-1", [older, newer]).map((r) => r.id)).toEqual(["o-new", "o-old"]);
  });

  it("F/G: nothing but a declaration establishes origin — cattle, store ownership and composition are not inputs", () => {
    // The function's only evidence input is the declaration list; with none,
    // no allocation shape (own store, large volume, recorded composition) yields an origin.
    for (const a of [alloc(), alloc({ volumeM3: 500 }), alloc({ priority: "high", score: 99 })]) {
      expect(fieldPlannedManureOrigin([a], "field-1", []).state).toBe("missing");
    }
  });
});

describe("J/I: temporal and lifecycle integrity", () => {
  it("J: a declaration for an earlier plan revision, or another field/store/volume, never applies", () => {
    const d = decl();
    expect(originEvidenceAppliesTo(d, alloc())).toBe(true);
    expect(originEvidenceAppliesTo(d, alloc({ planRevision: 2 }))).toBe(false);
    expect(originEvidenceAppliesTo(d, alloc({ housingId: "housing-2" }))).toBe(false);
    expect(originEvidenceAppliesTo(d, alloc({ fieldId: "field-2" }))).toBe(false);
    expect(originEvidenceAppliesTo(d, alloc({ volumeM3: 61 }))).toBe(false);
    expect(originEvidenceAppliesTo(d, alloc({ id: "sa-recreated" }))).toBe(false);
    // No known revision (column not applied): nothing can be matched.
    expect(originEvidenceAppliesTo(d, alloc({ planRevision: undefined }))).toBe(false);
  });

  it("J: editing (moving) a plan bumps its revision, so its earlier declaration stops applying — even if moved back", () => {
    const housing = [
      { id: "housing-1", storageCapacityM3: 200, storageFillPct: 80 },
      { id: "housing-2", storageCapacityM3: 200, storageFillPct: 80 },
    ] as Housing[];
    const moved = applyLocalSlurryEdit(housing, ["field-1"], [alloc()], { allocationId: "sa-1", fieldId: "field-1", housingId: "housing-2", volumeM3: 60 }, "2026-02-05T00:00:00Z");
    if (moved.status !== "saved") throw new Error("edit refused");
    expect(moved.record.planRevision).toBe(2);
    expect(fieldPlannedManureOrigin(moved.records, "field-1", [decl()]).state).toBe("missing");
    const back = applyLocalSlurryEdit(housing, ["field-1"], moved.records, { allocationId: "sa-1", fieldId: "field-1", housingId: "housing-1", volumeM3: 60 }, "2026-02-06T00:00:00Z");
    if (back.status !== "saved") throw new Error("edit refused");
    expect(back.record.planRevision).toBe(3);
    expect(fieldPlannedManureOrigin(back.records, "field-1", [decl()])).toEqual({ state: "missing", reasonCode: "PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED" });
  });

  it("an edit that changes nothing material keeps the revision", () => {
    const housing = [{ id: "housing-1", storageCapacityM3: 200, storageFillPct: 80 }] as Housing[];
    const same = applyLocalSlurryEdit(housing, ["field-1"], [alloc()], { allocationId: "sa-1", fieldId: "field-1", housingId: "housing-1", volumeM3: 60 }, "2026-02-05T00:00:00Z");
    if (same.status !== "saved") throw new Error("edit refused");
    expect(same.record.planRevision).toBe(1);
  });

  it("I: completing or cancelling a plan keeps its declaration and still describes it; it just no longer feeds a planned calculation", () => {
    const cancelled = applyLocalSlurryCancel([alloc()], "sa-1", "2026-02-05T00:00:00Z", "Farmer");
    if (cancelled.status !== "saved") throw new Error("cancel refused");
    expect(cancelled.record.planRevision).toBe(1);
    expect(currentSlurryOriginEvidence(cancelled.record, [decl()])).toEqual({ record: expect.objectContaining({ id: "o-1", recordedBy: "user-1" }) });
    expect(fieldPlannedManureOrigin(cancelled.records, "field-1", [decl()])).toEqual({ state: "missing", reasonCode: "NO_PLANNED_SLURRY" });
    const completed = alloc({ status: "completed", actualVolumeM3: 55, actualSpreadDate: "2026-02-05" });
    expect(currentSlurryOriginEvidence(completed, [decl()])).toEqual({ record: expect.objectContaining({ id: "o-1" }) });
  });
});

describe("Q: farmer-facing wording", () => {
  it("never shows an internal enum or reason code", () => {
    const texts = [
      SLURRY_ORIGIN_QUESTION.prompt,
      ...SLURRY_ORIGIN_QUESTION.options.map((o) => o.label),
      ...Object.values(SLURRY_ORIGIN_SUMMARY_LABEL),
      ...Object.values(SLURRY_ORIGIN_ISSUE_COPY),
      slurryOriginDeclarationNote("mixed")!,
      slurryOriginDeclarationNote("unknown")!,
    ];
    for (const t of texts) expect(t).not.toMatch(/[a-z]+_[a-z_]+|[A-Z]{2,}_[A-Z_]+/);
    expect(slurryOriginDeclarationNote("home_produced_grazing_livestock")).toBeUndefined();
    expect(slurryOriginDeclarationNote("imported_organic_manure")).toBeUndefined();
  });

  it("offers the four answers and no default", () => {
    expect(SLURRY_ORIGIN_QUESTION.options.map((o) => o.value)).toEqual(["home_produced_grazing_livestock", "imported_organic_manure", "mixed", "unknown"]);
  });
});

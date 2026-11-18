import { describe, expect, it } from "vitest";
import { parseGrassIntakeEvidence } from "./grass-intake-evidence-ledger";
const COW = "20000000-0000-4000-8000-000000000001";
const CALF = "20000000-0000-4000-8000-000000000002";
const base = { id: "a", farmId: "farm", recordedAt: "2026-06-01T00:00:00Z", effectiveFrom: "2026-06-01T00:00:00Z", source: "farmer" };
const pair = { kind: "cow_calf_pair", cowGroupId: COW, calfGroupId: CALF, calfStage: "older_grazing", uniquePairConfirmed: true };
const feed = (feedType: string, kgFreshPerHeadDay: number) => ({ kind: "group_feed", groupId: COW, feedType, kgFreshPerHeadDay, dmFraction: null });
describe("grass intake evidence ledger contract", () => {
  it("accepts explicit unique cow/calf linkage", () => expect(parseGrassIntakeEvidence({ ...base, payload: pair }).payload.kind).toBe("cow_calf_pair"));
  it("rejects inferred or duplicate pairing", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { ...pair, calfGroupId: COW.toUpperCase() } })).toThrow("invalidPairEvidence"));
  it("requires explicit zero feeding", () => expect(parseGrassIntakeEvidence({ ...base, payload: feed("none", 0) }).payload.kind).toBe("group_feed"));
  it("rejects contradictory feeding", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: feed("none", 3) })).toThrow("invalidFeedEvidence"));
  it("rejects invalid date intervals", () => expect(() => parseGrassIntakeEvidence({ ...base, effectiveTo: base.effectiveFrom, payload: { kind: "dairy_stage", groupId: COW, stage: "dry" } })).toThrow("invalidEvidenceEnvelope"));
  it("rejects unknown kinds", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { kind: "made_up" } })).toThrow("unknownEvidenceKind"));
  it("rejects prototype keys as kinds", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { kind: "toString" } })).toThrow("unknownEvidenceKind"));
  it("rejects extra unreviewed payload keys (matches DB check)", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { ...pair, inferred: true } })).toThrow("invalidEvidencePayloadKeys"));
  it("rejects missing dmFraction rather than defaulting it", () => {
    const { dmFraction: _omit, ...noDm } = feed("silage", 20);
    void _omit;
    expect(() => parseGrassIntakeEvidence({ ...base, payload: noDm })).toThrow("invalidEvidencePayloadKeys");
  });
  it("rejects single-element arrays for enum fields (matches DB string check)", () => {
    expect(() => parseGrassIntakeEvidence({ ...base, payload: { kind: "dairy_stage", groupId: COW, stage: ["dry"] } })).toThrow("invalidDairyStage");
    expect(() => parseGrassIntakeEvidence({ ...base, payload: { ...pair, calfStage: ["older_grazing"] } })).toThrow("invalidPairEvidence");
    expect(() => parseGrassIntakeEvidence({ ...base, payload: { ...feed("silage", 20), feedType: ["silage"] } })).toThrow("invalidFeedEvidence");
  });
  it("rejects non-representable numbers (matches DB bound)", () => {
    const h = (headCount: number, avgWeightKg = 600) => ({ ...base, payload: { kind: "group_headcount_weight", groupId: COW, headCount, avgWeightKg } });
    expect(() => parseGrassIntakeEvidence(h(1e20))).toThrow("invalidAnimalEvidence");
    expect(() => parseGrassIntakeEvidence(h(5, 1e-7))).toThrow("invalidAnimalEvidence");
    expect(() => parseGrassIntakeEvidence({ ...base, payload: { ...feed("silage", 20), dmFraction: 1e-7 } })).toThrow("invalidFeedEvidence");
  });
  it("rejects out-of-range or whitespace-only envelope values (matches DB checks)", () => {
    expect(() => parseGrassIntakeEvidence({ ...base, effectiveFrom: "1969-12-31T23:59:59.999Z", payload: pair })).toThrow("invalidEvidenceEnvelope");
    expect(() => parseGrassIntakeEvidence({ ...base, source: "\t\n", payload: pair })).toThrow("invalidEvidenceEnvelope");
    expect(() => parseGrassIntakeEvidence({ ...base, source: "x".repeat(301), payload: pair })).toThrow("invalidEvidenceEnvelope");
    expect(() => parseGrassIntakeEvidence({ ...base, source: "\u00a0\ufeff", payload: pair })).toThrow("invalidEvidenceEnvelope");
    expect(parseGrassIntakeEvidence({ ...base, source: "🐄".repeat(299) + "a", payload: pair }).source).toHaveLength(599);
  });
  it("rejects non-canonical uppercase UUID references (matches DB check)", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { kind: "dairy_stage", groupId: "ABCDEF00-0000-4000-8000-00000000000A", stage: "dry" } })).toThrow("invalidDairyStage"));
  it("rejects non-UUID references (matches DB check)", () => expect(() => parseGrassIntakeEvidence({ ...base, payload: { kind: "dairy_stage", groupId: "cow", stage: "dry" } })).toThrow("invalidDairyStage"));
});

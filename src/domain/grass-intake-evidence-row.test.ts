import { describe, expect, it } from "vitest";
import { parseGrassIntakeEvidenceRow, type GrassIntakeEvidenceRow } from "./grass-intake-evidence-row";
const row: GrassIntakeEvidenceRow = {
  id: "event-1", farm_id: "farm-1", kind: "group_headcount_weight",
  payload: { kind: "group_headcount_weight", groupId: "20000000-0000-4000-8000-000000000001", headCount: 12, avgWeightKg: 450 },
  effective_from: "2026-06-01T00:00:00Z", effective_to: null,
  recorded_at: "2026-06-01T12:00:00Z", source: "farmer", supersedes_id: null,
};
describe("grass evidence persistence boundary", () => {
  it("parses valid row without inventing optional dates", () => {
    const parsed = parseGrassIntakeEvidenceRow(row, "farm-1");
    expect(parsed.payload.kind).toBe("group_headcount_weight");
    expect(parsed.effectiveTo).toBeUndefined();
  });
  it("rejects cross-farm rows even if returned by query", () => {
    expect(() => parseGrassIntakeEvidenceRow(row, "farm-2")).toThrow("grassEvidenceCrossFarmRow");
  });
  it("rejects inconsistent event kind", () => {
    expect(() => parseGrassIntakeEvidenceRow({ ...row, kind: "group_feed" }, "farm-1")).toThrow("grassEvidenceKindMismatch");
  });
  it("rejects malformed payload rather than dropping it", () => {
    expect(() => parseGrassIntakeEvidenceRow({ ...row, payload: { kind: "group_headcount_weight", groupId: "20000000-0000-4000-8000-000000000001", headCount: -1, avgWeightKg: 450 } }, "farm-1")).toThrow();
  });
  it("preserves explicit effective end and supersession", () => {
    const parsed = parseGrassIntakeEvidenceRow({ ...row, effective_to: "2026-06-03T00:00:00Z", supersedes_id: "event-0" }, "farm-1");
    expect(parsed.effectiveTo).toBe("2026-06-03T00:00:00Z");
    expect(parsed.supersedesId).toBe("event-0");
  });
});

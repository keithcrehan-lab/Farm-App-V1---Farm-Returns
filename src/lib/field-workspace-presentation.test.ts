import { describe, expect, it } from "vitest";
import type { Field } from "@/domain/types";
import { fieldHistoryEvents, plannedUseLine } from "./field-workspace-presentation";

function field(overrides: Partial<Field> = {}): Field {
  return { id: "f1", farmId: "farm", name: "Long Field", areaHa: 3.4, centroid: [-8, 53], fertility: {}, history: [], ...overrides } as Field;
}

describe("field workspace History — only records that genuinely exist", () => {
  it("is empty for a field with nothing recorded, never a fabricated entry", () => {
    expect(fieldHistoryEvents(field())).toEqual([]);
    expect(plannedUseLine(field())).toBeUndefined();
  });

  it("orders real dated records newest first and keeps undated season records last", () => {
    const events = fieldHistoryEvents(
      field({
        polygon: { type: "Polygon", coordinates: [[[-8, 53], [-8.001, 53], [-8.001, 53.001], [-8, 53]]] },
        polygonCapturedAt: "2026-09-10T10:00:00Z",
        plannedUse: { value: "grazing", status: "farmer_adjusted", source: "Mary", sourceDate: "2026-10-01" },
        fertility: {
          verifiedTest: {
            sampleDate: "2025-02-14",
            laboratory: "Lab A",
            sampleRef: "S2",
            p: 4,
            k: 80,
            pH: 6.2,
            previous: { sampleDate: "2021-01-20", laboratory: "Lab B", sampleRef: "S1", p: 3, k: 70, pH: 6 },
          },
        },
        history: [{ season: "2024", yieldTDMha: 10.5 }],
      }),
    );
    expect(events.map((e) => e.kind)).toEqual(["use", "boundary", "soil_test", "soil_test", "season"]);
    expect(events[1]).toMatchObject({ dateLabel: "10 Sept 2026", detail: "Area from the boundary: 3.4 ha" });
    expect(events[3]).toMatchObject({ title: "Laboratory soil test sampled", detail: "Lab B · pH 6" });
    expect(events[4]).toMatchObject({ dateLabel: "Season 2024", detail: "10.5 t DM/ha" });
  });

  it("says a planned use with no recorded date has no date, rather than inventing one", () => {
    const f = field({ plannedUse: { value: "tillage", status: "farmer_adjusted", source: "Farmer" } });
    expect(fieldHistoryEvents(f)[0]).toMatchObject({ dateLabel: "Date not recorded", title: "Planned use set to Tillage" });
    expect(plannedUseLine(f)).toEqual({ value: "Tillage", detail: "Farmer entered · date not recorded" });
  });

  it("never reads an explicitly unavailable planned use", () => {
    const f = field({ plannedUse: { value: "grazing", status: "unavailable", source: "none" } });
    expect(fieldHistoryEvents(f)).toEqual([]);
    expect(plannedUseLine(f)).toBeUndefined();
  });
});

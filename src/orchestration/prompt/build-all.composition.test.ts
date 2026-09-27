import { describe, expect, it, vi } from "vitest";

// Captures exactly what `buildAllRealPrompts` hands the fertiliser producer.
const calls: unknown[][] = [];
vi.mock("./fertiliser-recommendation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fertiliser-recommendation")>();
  return {
    ...actual,
    promptForFertiliserRecommendation: (...args: Parameters<typeof actual.promptForFertiliserRecommendation>) => {
      calls.push(args);
      return actual.promptForFertiliserRecommendation(...args);
    },
  };
});

import { buildAllRealPrompts } from "./build-all";
import type { Farm, Field, SlurryAllocation } from "@/domain/types";
import type { SlurryComposition } from "@/domain/slurry-composition";

const farm: Pick<Farm, "id" | "location"> = { id: "farm-1", location: { county: "Cork", centroid: [0, 0] } };
const field = { id: "field-1", farmId: "farm-1", name: "Back Meadow", areaHa: 4, centroid: [0, 0], fertility: {} } as unknown as Field;
const method = { value: "splashplate" as const, status: "farmer_adjusted" as const, source: "Keith" };
const composition = (id: string, housingId: string, dmPct: number): SlurryComposition => ({
  id,
  farmId: "farm-1",
  housingId,
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct,
  sampleDate: "2026-02-01",
  source: "Lab",
  laboratory: "Lab",
  recordedAt: "2026-02-02T00:00:00Z",
});

describe("buildAllRealPrompts — recorded slurry composition wiring (Campaign A, A2.2)", () => {
  it("passes a single store's recorded composition through", () => {
    calls.length = 0;
    const allocations: SlurryAllocation[] = [{ fieldId: "field-1", housingId: "h1", volumeM3: 50, applicationMethod: method }];
    buildAllRealPrompts(farm, [field], [], allocations, "2026-09-01T09:00:00Z", [composition("c1", "h1", 4)]);
    expect(calls).toHaveLength(1);
    expect((calls[0][8] as SlurryComposition).id).toBe("c1");
    expect(calls[0][9]).toBeUndefined();
  });

  it("flags a multi-store field with recorded composition as unresolved instead of dropping the evidence", () => {
    calls.length = 0;
    const allocations: SlurryAllocation[] = [
      { fieldId: "field-1", housingId: "h1", volumeM3: 50, applicationMethod: method },
      { fieldId: "field-1", housingId: "h2", volumeM3: 50, applicationMethod: method },
    ];
    buildAllRealPrompts(farm, [field], [], allocations, "2026-09-01T09:00:00Z", [composition("c1", "h1", 4)]);
    expect(calls[0][8]).toBeUndefined();
    expect(calls[0][9]).toEqual({ housingIds: ["h1", "h2"], compositionRecordIds: ["c1"] });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShedCard } from "./ShedCard";
import { tracked } from "@/domain/types";
import type { Housing } from "@/domain/types";

afterEach(() => {
  cleanup();
});

function makeHousing(overrides: Partial<Housing> = {}): Housing {
  return {
    id: "h1",
    farmId: "farm-1",
    shedName: "Shed 1",
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
    storageCapacityM3: 200,
    storageFillPct: 50,
    storageFillStatus: "farmer_recorded",
    storageFillRecordedAt: "2026-12-12T00:00:00.000Z",
    slurryEstimate: {
      volumeM3: tracked(0, "estimated", "slurry_engine_v1.0.0 (mock)"),
      availableN: tracked(0, "estimated", "x"),
      availableP: tracked(0, "estimated", "x"),
      availableK: tracked(0, "estimated", "x"),
      ruleSetVersion: "test",
    },
    ...overrides,
  };
}

// Phase 1A audit HIGH: the card showed the raw observation (100 m³ / 50%)
// after 60 m³ had been spread, making spread slurry look available again.
describe("ShedCard", () => {
  it("shows the reconciled fill and volume, with the last reading labelled separately", () => {
    render(<ShedCard housing={makeHousing({ storeWithdrawnSinceObservationM3: 60 })} />);
    expect(screen.getByText("20%")).toBeTruthy();
    expect(screen.getByText("40 / 200 m³")).toBeTruthy();
    expect(screen.getByText(/last reading 50%/i)).toBeTruthy();
  });

  it("shows the observation unchanged when nothing has been withdrawn", () => {
    render(<ShedCard housing={makeHousing()} />);
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText("100 / 200 m³")).toBeTruthy();
    expect(screen.queryByText(/last reading/i)).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { AlertsCard } from "./AlertsCard";
import type { Farm, Field, LivestockGroup } from "@/domain/types";
import { tracked } from "@/domain/types";

afterEach(() => {
  cleanup();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 10,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    fertility: { pIndex: tracked(3, "farmer_adjusted", "Farmer"), kIndex: tracked(3, "farmer_adjusted", "Farmer") },
    history: [],
    ...overrides,
  } as Field;
}

const LIVESTOCK_GROUPS: LivestockGroup[] = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];

function renderCard(fields: Field[], livestockGroups: LivestockGroup[]) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups, housing: [], slurryAllocations: [] }}>
      <AlertsCard />
    </FarmProvider>,
  );
}

// Codex audit HIGH (round 24): an empty `alerts` array used to render an
// unconditional all-clear even when the farm's own real NAP-ceiling and
// national-buffer checks were never actually run for a non-tillage field,
// because the farm has no recorded livestock.
describe("AlertsCard", () => {
  it("shows the real all-clear message when every real field's checks ran and found nothing", () => {
    renderCard([field()], LIVESTOCK_GROUPS);
    expect(screen.getByText(/no compliance alerts from your current farm data/i)).toBeTruthy();
  });

  it("discloses a blocked-checks message instead of a false all-clear when a non-tillage field's checks never ran due to missing livestock", () => {
    renderCard([field()], []);
    expect(screen.queryByText(/no compliance alerts from your current farm data/i)).toBeNull();
    expect(screen.getByText(/couldn.t be fully checked — missing livestock, soil, or livestock age\/sex evidence/i)).toBeTruthy();
  });

  it("never shows the blocked-checks disclosure for a tillage field — that is a genuine not-applicable case, not blocked evidence", () => {
    renderCard([field({ plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") })], []);
    expect(screen.getByText(/no compliance alerts from your current farm data/i)).toBeTruthy();
    expect(screen.queryByText(/couldn.t be fully checked/i)).toBeNull();
  });

  it("shows both a real alert and the blocked-checks disclosure at once — a farm can have both simultaneously", () => {
    const commonageField = field({ commonageStatus: tracked("commonage", "farmer_adjusted", "Farmer") });
    renderCard([commonageField], []);
    expect(screen.getByText(/chemical fertiliser blocked — commonage/i)).toBeTruthy();
    expect(screen.getByText(/couldn.t be fully checked — missing livestock, soil, or livestock age\/sex evidence/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 25): round 24's own fieldsWithBlockedChecks
  // only ever counted the missing-livestock reason — a field with real
  // livestock but a missing P/K Soil Index also has its NAP-ceiling check
  // blocked, and was silently never disclosed.
  it("discloses a blocked-checks message for a field with real livestock but a missing P/K Soil Index", () => {
    renderCard([field({ fertility: {} })], LIVESTOCK_GROUPS);
    expect(screen.getByText(/couldn.t be fully checked — missing livestock, soil, or livestock age\/sex evidence/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 26): even with real livestock and complete
  // fertility evidence, the real statutory GSR (and therefore
  // napCompliance) can still fail to resolve when a livestock group is
  // missing its own age/sex — a genuinely separate, farmer-fixable gap,
  // previously never disclosed.
  it("discloses a blocked-checks message when the real statutory GSR cannot resolve (a weanling group with no recorded age), even with complete livestock and soil evidence", () => {
    const weanlingGroups: LivestockGroup[] = [
      { id: "g1", farmId: "farm-1", category: "weanling", label: "Weanlings", count: tracked(18, "verified", "Farmer"), system: "housed", value: tracked(0, "estimated", "x") },
    ];
    renderCard([field()], weanlingGroups);
    expect(screen.getByText(/couldn.t be fully checked — missing livestock, soil, or livestock age\/sex evidence/i)).toBeTruthy();
  });
});

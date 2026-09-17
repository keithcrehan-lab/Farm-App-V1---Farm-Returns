import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

import { FarmProvider, useHousingList } from "@/store/farm-store";
import HousingPage from "./page";
import { tracked } from "@/domain/types";
import type { Farm, Housing } from "@/domain/types";

// FarmProvider's mock-mode rehydration effect reads real `localStorage`
// on mount — without clearing it between tests, one test's own
// `addHousing`/`updateHousing` call (which persists to it) would leak
// into the next test's fresh `initialState`, overwriting it.
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith",
};

function housing(overrides: Partial<Housing> = {}): Housing {
  return {
    id: "h1",
    farmId: "farm-1",
    shedName: "Shed 1",
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
    storageCapacityM3: 200,
    storageFillPct: 0,
    storageFillStatus: "estimated",
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

/** Reads the real store's own `storageFillStatus`/`storageFillPct` for
 * the first housing row directly — `ShedCard.tsx` (the pre-existing,
 * unmodified component this page reuses) has no visible fill-provenance
 * badge of its own, so this is the only way to observe the REAL state
 * `handleAddShed` actually produced, rather than asserting on UI text
 * this page was never meant to show. */
function StorageFillStatusProbe() {
  const list = useHousingList();
  const h = list[0];
  return <p data-testid="fill-status-probe">{h ? `${h.storageFillStatus}:${h.storageFillPct}` : "none"}</p>;
}

function renderPage(housingList: Housing[]) {
  return render(
    <FarmProvider initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: housingList, slurryAllocations: [] }}>
      <StorageFillStatusProbe />
      <HousingPage />
    </FarmProvider>,
  );
}

describe("HousingPage -- fill-level provenance (Codex audit CRITICAL, round 1 + 2)", () => {
  it("stores a new shed's blank fill as estimated, never a false farmer_recorded", async () => {
    renderPage([]);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Shed 1/i), { target: { value: "New Shed" } });
    fireEvent.change(screen.getByLabelText(/housing period start/i), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/housing period end/i), { target: { value: "2027-03-01" } });
    fireEvent.change(screen.getByLabelText(/slurry storage capacity/i), { target: { value: "100" } });
    // Current fill (%) deliberately left blank.
    fireEvent.click(screen.getByRole("button", { name: /^add shed$/i }));

    await waitFor(() => expect(screen.getByTestId("fill-status-probe").textContent).toBe("estimated:0"));
  });

  it("stores a new shed's explicit fill entry (including a real 0) as farmer_recorded", async () => {
    renderPage([]);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Shed 1/i), { target: { value: "Empty Tank Shed" } });
    fireEvent.change(screen.getByLabelText(/housing period start/i), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText(/housing period end/i), { target: { value: "2027-03-01" } });
    fireEvent.change(screen.getByLabelText(/slurry storage capacity/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/current fill/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /^add shed$/i }));

    await waitFor(() => expect(screen.getByTestId("fill-status-probe").textContent).toBe("farmer_recorded:0"));
  });

  it("never re-stamps an existing estimated fill as farmer_recorded when an edit never touches that field (Codex audit CRITICAL, round 2)", async () => {
    renderPage([housing({ storageFillPct: 0, storageFillStatus: "estimated" })]);
    expect(screen.getByTestId("fill-status-probe").textContent).toBe("estimated:0");

    fireEvent.click(screen.getByText(/edit this shed/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy());
    // Only rename the shed -- the fill field is prefilled but never touched.
    fireEvent.change(screen.getByDisplayValue("Shed 1"), { target: { value: "Renamed Shed" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText("Renamed Shed")).toBeTruthy());
    expect(screen.getByTestId("fill-status-probe").textContent).toBe("estimated:0");
  });

  it("stamps farmer_recorded when an edit genuinely does touch the fill field", async () => {
    renderPage([housing({ storageFillPct: 0, storageFillStatus: "estimated" })]);

    fireEvent.click(screen.getByText(/edit this shed/i));
    await waitFor(() => expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/current fill/i), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(screen.getByTestId("fill-status-probe").textContent).toBe("farmer_recorded:60"));
  });
});

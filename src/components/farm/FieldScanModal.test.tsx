import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const scanAction = vi.hoisted(() => vi.fn());
const eircodeAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/field-scan", () => ({
  scanCurrentFarmFieldsAction: scanAction,
}));
vi.mock("@/app/actions/onboarding", () => ({
  lookupExactEircodeStep: eircodeAction,
}));
vi.mock("@/lib/mapbox", () => ({
  MAPBOX_PLAIN_SATELLITE_STYLE: "mock-style",
  MAPBOX_SATELLITE_STYLE: "mock-style",
  MAPBOX_TOKEN: "mock-token",
  mapboxConfigured: false,
}));

import { FieldScanModal } from "./FieldScanModal";

const polygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.47, 53.51],
    [-8.469, 53.51],
    [-8.469, 53.511],
    [-8.47, 53.511],
    [-8.47, 53.51],
  ]],
};

describe("FieldScanModal search and fallback", () => {
  beforeEach(() => {
    scanAction.mockReset().mockResolvedValue({
      status: "UNAVAILABLE",
      reason: "No cached coverage",
    });
    eircodeAction.mockReset();
  });
  afterEach(cleanup);

  it("shows Eircode search and rescans the exact Eircode location", async () => {
    eircodeAction.mockResolvedValue({
      ok: true,
      value: {
        eircode: "V95 TY07",
        label: "Test address",
        center: [-8.42, 53.48] as [number, number],
      },
    });

    render(
      <FieldScanModal
        farmName="KC"
        centre={[-8.47, 53.51]}
        existingFields={[{ id: "field-1", name: "Home", polygon }]}
        onAddSelected={vi.fn()}
        onDrawInstead={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Search Eircode")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search Eircode"), { target: { value: "V95TY07" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    await waitFor(() => expect(eircodeAction).toHaveBeenCalledWith("V95 TY07"));
    await waitFor(() => expect(scanAction).toHaveBeenCalledWith([-8.42, 53.48]));
  });

  it("passes the current searched area into manual drawing", async () => {
    const onDrawInstead = vi.fn();
    eircodeAction.mockResolvedValue({
      ok: true,
      value: {
        eircode: "V95 TY07",
        label: "Test address",
        center: [-8.42, 53.48] as [number, number],
      },
    });

    render(
      <FieldScanModal
        farmName="KC"
        centre={[-8.47, 53.51]}
        existingFields={[{ id: "field-1", name: "Home", polygon }]}
        onAddSelected={vi.fn()}
        onDrawInstead={onDrawInstead}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search Eircode"), { target: { value: "V95 TY07" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(scanAction).toHaveBeenCalledWith([-8.42, 53.48]));

    fireEvent.click(screen.getByRole("button", { name: "Draw field instead" }));
    expect(onDrawInstead).toHaveBeenCalledWith([-8.42, 53.48]);
  });
});

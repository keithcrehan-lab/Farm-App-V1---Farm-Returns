import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/field-satellite-history", () => ({
  getFieldSatelliteHistoryAction: vi.fn(),
  getFieldNdviSeriesAction: vi.fn(),
  getFieldSatelliteImageAction: vi.fn(),
}));

vi.mock("@/lib/mapbox", () => ({
  MAPBOX_TOKEN: "pk.test",
  mapboxConfigured: true,
}));

import {
  getFieldNdviSeriesAction,
  getFieldSatelliteHistoryAction,
  getFieldSatelliteImageAction,
} from "@/app/actions/field-satellite-history";
import type { Field } from "@/domain/types";
import { FieldSatelliteHistory } from "./FieldSatelliteHistory";

const mockHistory = vi.mocked(getFieldSatelliteHistoryAction);
const mockNdvi = vi.mocked(getFieldNdviSeriesAction);
const mockImage = vi.mocked(getFieldSatelliteImageAction);

const field = {
  id: "field-1",
  farmId: "farm-1",
  name: "Top Field",
  areaHa: 2,
  polygon: {
    type: "Polygon",
    coordinates: [[[-8.5, 53], [-8.49, 53], [-8.49, 53.01], [-8.5, 53.01], [-8.5, 53]]],
  },
} as Field;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FieldSatelliteHistory", () => {
  it("loads only after opening, filters clear passes, renders NDVI trend, and switches imagery mode", async () => {
    mockHistory.mockResolvedValue({
      fieldId: field.id,
      from: "2025-10-30T08:00:00.000Z",
      to: "2026-10-30T08:00:00.000Z",
      contextBounds: [-8.5022, 52.9978, -8.4878, 53.0122],
      processingConfigured: true,
      processingBlockedReason: null,
      scenes: [
        {
          id: "scene-new",
          acquisitionTimestamp: "2026-10-23T11:30:00Z",
          platform: "sentinel-2c",
          cloudCoverPercent: 23,
          processingLevel: "L2",
          processingVersion: "05.13",
        },
        {
          id: "scene-old",
          acquisitionTimestamp: "2026-10-18T11:30:00Z",
          platform: "sentinel-2b",
          cloudCoverPercent: 15,
          processingLevel: "L2",
          processingVersion: "05.13",
        },
      ],
    });
    mockNdvi.mockResolvedValue({
      ok: true,
      points: [
        {
          intervalFrom: "2026-10-18T00:00:00Z",
          intervalTo: "2026-10-19T00:00:00Z",
          meanNdvi: 0.51,
          stDevNdvi: 0.06,
          clearPixelCount: 70,
          fieldCloudPercent: 12,
        },
        {
          intervalFrom: "2026-10-23T00:00:00Z",
          intervalTo: "2026-10-24T00:00:00Z",
          meanNdvi: 0.62,
          stDevNdvi: 0.07,
          clearPixelCount: 45,
          fieldCloudPercent: 55,
        },
      ],
    });
    mockImage.mockImplementation(async (_fieldId, timestamp, mode) => ({
      ok: true,
      dataUrl: `data:image/png;base64,${timestamp.includes("10-23") ? "new" : "old"}-${mode}`,
      bounds: [-8.5022, 52.9978, -8.4878, 53.0122],
    }));

    render(<FieldSatelliteHistory field={field} />);

    expect(screen.getByRole("button", { name: /field through time/i })).toBeTruthy();
    expect(mockHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /field through time/i }));

    await waitFor(() => expect(mockHistory).toHaveBeenCalledWith(field.id, "1Y", undefined, undefined));
    await waitFor(() => expect(screen.getByText(/1 shown · 2 passes found/i)).toBeTruthy());
    expect(screen.getByText(/Beta · work in progress/i)).toBeTruthy();
    expect(screen.getByText(/supporting context only, not as a definitive agronomic diagnosis or recommendation/i)).toBeTruthy();

    await waitFor(() => {
      expect(mockImage).toHaveBeenLastCalledWith(field.id, "2026-10-18T11:30:00Z", "natural");
      expect(screen.getByRole("img", { name: /sentinel satellite observation for top field on 18 oct 2026/i })).toBeTruthy();
    });
    expect(screen.getByRole("slider", { name: /dated satellite layer opacity/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /high-resolution satellite context for top field/i })).toBeTruthy();
    expect(screen.getByText(/Not enough clear observations to draw a trend yet/i)).toBeTruthy();
    expect(screen.getByText(/This is a vegetation signal, not a diagnosis/i)).toBeTruthy();
    expect(screen.getByText(/Satellite field signal/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All passes" }));
    expect(screen.getByText(/2 shown · 2 passes found/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /23 oct 2026/i }));
    await waitFor(() => {
      expect(mockImage).toHaveBeenLastCalledWith(field.id, "2026-10-23T11:30:00Z", "natural");
      expect(screen.getByRole("img", { name: /sentinel satellite observation for top field on 23 oct 2026/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Vegetation" }));
    expect(screen.getByRole("slider", { name: /vegetation overlay opacity/i })).toBeTruthy();
    expect(screen.getByLabelText(/vegetation signal legend/i)).toBeTruthy();
    await waitFor(() => {
      expect(mockImage).toHaveBeenLastCalledWith(field.id, "2026-10-23T11:30:00Z", "ndvi");
      expect(screen.getByRole("img", { name: /sentinel vegetation overlay for top field/i })).toBeTruthy();
    });
  });

  it("still exposes public history and truthfully blocks imagery/NDVI when OAuth credentials are absent", async () => {
    const reason = "Copernicus imagery credentials are not configured yet.";
    mockHistory.mockResolvedValue({
      fieldId: field.id,
      from: "2025-10-30T08:00:00.000Z",
      to: "2026-10-30T08:00:00.000Z",
      contextBounds: [-8.5022, 52.9978, -8.4878, 53.0122],
      processingConfigured: false,
      processingBlockedReason: reason,
      scenes: [
        {
          id: "scene",
          acquisitionTimestamp: "2026-10-23T11:30:00Z",
          platform: "sentinel-2c",
          cloudCoverPercent: 23,
          processingLevel: "L2",
          processingVersion: "05.13",
        },
      ],
    });
    mockNdvi.mockResolvedValue({ ok: false, message: reason });
    mockImage.mockResolvedValue({ ok: false, message: reason });

    render(<FieldSatelliteHistory field={field} />);
    fireEvent.click(screen.getByRole("button", { name: /field through time/i }));

    await waitFor(() => expect(screen.getByText(/1 shown · 1 passes found/i)).toBeTruthy());
    expect(screen.getByRole("img", { name: /high-resolution satellite context for top field/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Vegetation" }));
    await waitFor(() => expect(screen.getByText(/Vegetation overlay unavailable: Copernicus imagery credentials are not configured yet/i)).toBeTruthy());
  });
});

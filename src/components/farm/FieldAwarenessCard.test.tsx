import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/field-awareness", () => ({ getFieldAwarenessAction: vi.fn() }));

import { getFieldAwarenessAction } from "@/app/actions/field-awareness";
import { FieldAwarenessCard } from "./FieldAwarenessCard";
import { ok, blockedInsufficientEvidence } from "@/domain/evidence";
import type { FieldAwarenessSnapshot } from "@/domain/field-awareness";
import type { SatelliteFieldCoverage } from "@/domain/satellite-field-coverage";
import type { Field } from "@/domain/types";

const mockAction = vi.mocked(getFieldAwarenessAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Home Field",
    areaHa: 4.5,
    centroid: [0, 0],
    fertility: {},
    history: [],
    ...overrides,
  };
}

function snapshot(overrides: Partial<FieldAwarenessSnapshot> = {}): FieldAwarenessSnapshot {
  return {
    fieldId: "field-1",
    farmId: "farm-1",
    generatedAt: "2026-09-08T12:00:00.000Z",
    hasMappedBoundary: true,
    coverage: ok<SatelliteFieldCoverage>(
      {
        provider: "Copernicus Data Space Ecosystem",
        mission: "sentinel-2c",
        productId: "scene-1",
        acquisitionTimestamp: "2026-09-07T10:00:00.000Z",
        processingLevel: "L2",
        cloudCoverPercent: 5,
        algorithm: "test",
        calculationVersion: "test",
      },
      "MEASURED",
    ),
    freshness: "current",
    observationAgeDays: 1,
    confidence: "high",
    attention: "normal",
    recentActivity: [],
    warnings: [],
    ...overrides,
  };
}

describe("FieldAwarenessCard", () => {
  it("shows a loading state before the action resolves", () => {
    mockAction.mockReturnValue(new Promise(() => {})); // never resolves
    render(<FieldAwarenessCard field={field()} />);
    expect(screen.getByText(/Checking field awareness/i)).toBeTruthy();
  });

  it("renders nothing when the action resolves to null — never shows a confusing message for a signed-out/cross-farm case", async () => {
    mockAction.mockResolvedValue(null);
    const { container } = render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.queryByText(/Checking field awareness/i)).toBeNull());
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the action rejects — logs the real error, never shows a raw error to the farmer", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAction.mockRejectedValue(new Error("network down"));
    const { container } = render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.queryByText(/Checking field awareness/i)).toBeNull());
    expect(container.textContent).toBe("");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("renders a real current observation with high confidence and no attention pill", async () => {
    mockAction.mockResolvedValue(snapshot());
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/High confidence/i)).toBeTruthy());
    expect(screen.getByText(/No action is required/i)).toBeTruthy();
    expect(screen.queryByText(/Worth a look/i)).toBeNull();
  });

  it("shows the honest boundary-not-mapped message rather than a fabricated observation", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        hasMappedBoundary: false,
        coverage: blockedInsufficientEvidence("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["fieldBoundary"]),
        freshness: "unavailable",
        observationAgeDays: undefined,
        confidence: "low",
        attention: "normal",
        warnings: ["Field boundary is not mapped yet — satellite coverage cannot be checked."],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Field boundary is not mapped yet/i)).toBeTruthy());
    expect(screen.queryByText(/Worth a look/i)).toBeNull();
  });

  it("shows a 'worth a look' pill and its own plain-language reason for a stale, mapped field", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        coverage: blockedInsufficientEvidence("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["sentinel2ScenesCoveringField"]),
        freshness: "stale",
        observationAgeDays: undefined,
        confidence: "low",
        attention: "worth_checking",
        warnings: ["No usable satellite observation found in the last 30 days."],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Worth a look/i)).toBeTruthy());
    expect(screen.getByText(/haven't had a clear satellite look/i)).toBeTruthy();
  });

  it("renders real recent confirmed activity, never fabricating an entry", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        recentActivity: [{ fieldId: "field-1", activityType: "silage", completionType: "whole", confirmedAt: "2026-09-05T09:00:00.000Z" }],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Silage/i)).toBeTruthy());
  });

  it("re-fetches when the field changes, showing loading again", async () => {
    mockAction.mockResolvedValue(snapshot());
    const { rerender } = render(<FieldAwarenessCard field={field({ id: "field-1" })} />);
    await waitFor(() => expect(screen.getByText(/High confidence/i)).toBeTruthy());

    mockAction.mockReturnValue(new Promise(() => {}));
    rerender(<FieldAwarenessCard field={field({ id: "field-2" })} />);
    expect(screen.getByText(/Checking field awareness/i)).toBeTruthy();
    expect(mockAction).toHaveBeenLastCalledWith("field-2");
  });
});

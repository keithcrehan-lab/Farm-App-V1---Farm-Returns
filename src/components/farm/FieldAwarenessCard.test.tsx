import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/field-awareness", () => ({ getFieldAwarenessAction: vi.fn() }));

import { getFieldAwarenessAction } from "@/app/actions/field-awareness";
import { FieldAwarenessCard } from "./FieldAwarenessCard";
import { ok, blockedInsufficientEvidence, unknown } from "@/domain/evidence";
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
    // Codex audit LOW (round 4): production's own
    // `classifyFieldAwarenessConfidence` never returns "high" from
    // satellite evidence — "medium" is the real, reachable default for
    // this fixture. See the dedicated "high" test below for the one
    // legitimate reason the type still permits it.
    confidence: "medium",
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

  it("renders a real current observation with medium confidence and no attention pill", async () => {
    mockAction.mockResolvedValue(snapshot());
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Medium confidence/i)).toBeTruthy());
    expect(screen.getByText(/Field monitoring is up to date/i)).toBeTruthy();
    expect(screen.queryByText(/Worth a look/i)).toBeNull();
  });

  // Codex audit LOW (round 4): the type still permits "high" for a
  // genuinely different future evidence source (e.g. a farmer's own
  // ground-truth confirmation) — this is the one place that rendering
  // branch is exercised, clearly labelled as a forward-compatibility
  // case, not today's normal farmer experience.
  it("can still render 'High confidence' if a future evidence source ever legitimately supplies it — not reachable from satellite evidence today", async () => {
    mockAction.mockResolvedValue(snapshot({ confidence: "high" }));
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/High confidence/i)).toBeTruthy());
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
    // Codex audit HIGH (round 6): must never also claim monitoring is
    // "up to date" here — a direct contradiction of the boundary
    // message immediately above.
    expect(screen.queryByText(/monitoring is up to date/i)).toBeNull();
    expect(screen.getByText(/Map this field's boundary/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 6): a genuine provider outage also produces
  // "normal" attention, but must never be described as "monitoring is
  // up to date" — that's a claim about currency an outage cannot
  // support.
  it("never claims monitoring is up to date during a genuine provider outage, even though attention is 'normal'", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        coverage: unknown("SATELLITE_PROVIDER_UNAVAILABLE"),
        freshness: "unavailable",
        observationAgeDays: undefined,
        confidence: "low",
        attention: "normal",
        warnings: ["Could not reach the satellite service to check this field just now."],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Could not reach the satellite service/i)).toBeTruthy());
    expect(screen.queryByText(/monitoring is up to date/i)).toBeNull();
    expect(screen.getByText(/couldn't reach the satellite service to check this field just now/i)).toBeTruthy();
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
    expect(screen.getByText(/haven't had a usable satellite pass/i)).toBeTruthy();
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

  // Codex audit MEDIUM (round 5): showing only the first three entries
  // with no indication of the real remainder silently presented a
  // truncated list as complete.
  it("discloses how many more confirmed activities exist beyond the displayed three", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        recentActivity: [
          { fieldId: "field-1", activityType: "silage", completionType: "whole", confirmedAt: "2026-09-05T09:00:00.000Z" },
          { fieldId: "field-1", activityType: "fertiliser_spreading", completionType: "whole", confirmedAt: "2026-09-04T09:00:00.000Z" },
          { fieldId: "field-1", activityType: "field_inspection", completionType: "whole", confirmedAt: "2026-09-03T09:00:00.000Z" },
          { fieldId: "field-1", activityType: "slurry_spreading", completionType: "whole", confirmedAt: "2026-09-02T09:00:00.000Z" },
        ],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/\+ 1 more/i)).toBeTruthy());
  });

  it("re-fetches when the field changes, showing loading again", async () => {
    mockAction.mockResolvedValue(snapshot());
    const { rerender } = render(<FieldAwarenessCard field={field({ id: "field-1" })} />);
    await waitFor(() => expect(screen.getByText(/Medium confidence/i)).toBeTruthy());

    mockAction.mockReturnValue(new Promise(() => {}));
    rerender(<FieldAwarenessCard field={field({ id: "field-2" })} />);
    expect(screen.getByText(/Checking field awareness/i)).toBeTruthy();
    expect(mockAction).toHaveBeenLastCalledWith("field-2");
  });

  // Codex audit MEDIUM (round 9): effects run only after a render
  // commits, so without a render-time reset, the very first render
  // with a new `field` prop could still paint the *previous* field's
  // real satellite/activity data under the new field's identity —
  // never just a generic loading state, but genuinely wrong content
  // briefly attributed to the wrong field.
  it("never shows the previous field's own real satellite data attributed to a newly selected field — same instance, no remount", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        recentActivity: [{ fieldId: "field-1", activityType: "silage", completionType: "whole", confirmedAt: "2026-09-05T09:00:00.000Z" }],
      }),
    );
    const { rerender, container } = render(<FieldAwarenessCard field={field({ id: "field-1" })} />);
    await waitFor(() => expect(screen.getByText(/Silage/i)).toBeTruthy());

    // A real navigation to a different field, reusing this same
    // component instance — the exact real-world shape the finding
    // described (FieldDrawer is reused without a field-keyed remount).
    // Never resolves, so the assertion below is checked before any new
    // fetch could possibly complete.
    mockAction.mockReturnValue(new Promise(() => {}));
    rerender(<FieldAwarenessCard field={field({ id: "field-2" })} />);
    expect(container.textContent).not.toMatch(/Silage/i);
  });

  // Codex audit MEDIUM (round 10): a genuine defense-in-depth case —
  // field-1's own request resolves *late*, after already switching to
  // field-2, simulating a real slow-network race. Must never let
  // field-1's stale result overwrite field-2's own already-current
  // (or still-loading) state.
  it("never applies a stale field's own late-resolving fetch result after switching to a different field", async () => {
    let resolveField1: (value: FieldAwarenessSnapshot | null) => void;
    const field1Promise = new Promise<FieldAwarenessSnapshot | null>((resolve) => {
      resolveField1 = resolve;
    });
    mockAction.mockReturnValueOnce(field1Promise);

    const { rerender } = render(<FieldAwarenessCard field={field({ id: "field-1" })} />);
    expect(mockAction).toHaveBeenCalledWith("field-1");

    // Switch to field-2 before field-1's own request has resolved —
    // field-2 gets its own real, distinct, already-resolved snapshot.
    mockAction.mockResolvedValueOnce(
      snapshot({
        fieldId: "field-2",
        recentActivity: [{ fieldId: "field-2", activityType: "field_inspection", completionType: "whole", confirmedAt: "2026-09-06T09:00:00.000Z" }],
      }),
    );
    rerender(<FieldAwarenessCard field={field({ id: "field-2" })} />);
    await waitFor(() => expect(screen.getByText(/Field inspection/i)).toBeTruthy());

    // Now field-1's own real request finally resolves, late — it must
    // never overwrite field-2's own already-rendered, correct state.
    resolveField1!(
      snapshot({
        recentActivity: [{ fieldId: "field-1", activityType: "silage", completionType: "whole", confirmedAt: "2026-09-05T09:00:00.000Z" }],
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.getByText(/Field inspection/i)).toBeTruthy();
    expect(screen.queryByText(/Silage/i)).toBeNull();
  });

  // Codex audit HIGH (round 2): mapping or re-drawing a field's boundary
  // never changes its real `id` — before this fix the card kept showing
  // a stale snapshot (or "not mapped yet") after a real boundary edit.
  it("re-fetches when the same field's boundary is captured/edited (polygonCapturedAt changes), even though field.id is unchanged", async () => {
    mockAction.mockResolvedValue(
      snapshot({ hasMappedBoundary: false, warnings: ["Field boundary is not mapped yet — satellite coverage cannot be checked."] }),
    );
    const { rerender } = render(<FieldAwarenessCard field={field({ id: "field-1", polygon: undefined, polygonCapturedAt: undefined })} />);
    await waitFor(() => expect(screen.getByText(/Field boundary is not mapped yet/i)).toBeTruthy());

    mockAction.mockResolvedValue(snapshot());
    rerender(
      <FieldAwarenessCard
        field={field({
          id: "field-1",
          polygon: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
          polygonCapturedAt: "2026-09-08T09:00:00.000Z",
        })}
      />,
    );
    await waitFor(() => expect(mockAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Field boundary is not mapped yet/i)).toBeNull());
  });

  it("discloses the real scene-wide cloud-cover percentage rather than an unqualified 'usable' claim", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        coverage: ok<SatelliteFieldCoverage>(
          {
            provider: "Copernicus Data Space Ecosystem",
            mission: "sentinel-2c",
            productId: "scene-1",
            acquisitionTimestamp: "2026-09-07T10:00:00.000Z",
            processingLevel: "L2",
            cloudCoverPercent: 22.4,
            algorithm: "test",
            calculationVersion: "test",
          },
          "MEASURED",
        ),
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/scene cloud cover 22%/i)).toBeTruthy());
  });

  // Codex audit MEDIUM (round 4): this warning must reach the farmer
  // even when satellite coverage is perfectly normal/current — the
  // first version only ever surfaced it via observationSummary's own
  // fallback text, which never renders when coverage is OK.
  it("shows the activity-truncation warning even alongside completely normal, current satellite coverage", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        warnings: ["Some older confirmed activity may not be shown — your farm has a large number of confirmed jobs."],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Some older confirmed activity may not be shown/i)).toBeTruthy());
  });

  // Codex audit MEDIUM (round 7): a genuine confirmed-activity read
  // failure must still show valid satellite coverage, disclosing the
  // activity failure separately rather than discarding everything.
  it("shows a distinct warning when the confirmed-activity read itself failed, alongside otherwise-normal satellite coverage", async () => {
    mockAction.mockResolvedValue(
      snapshot({
        warnings: ["Could not check recent farm activity for this field just now."],
      }),
    );
    render(<FieldAwarenessCard field={field()} />);
    await waitFor(() => expect(screen.getByText(/Could not check recent farm activity/i)).toBeTruthy());
    expect(screen.getByText(/Medium confidence/i)).toBeTruthy();
  });
});

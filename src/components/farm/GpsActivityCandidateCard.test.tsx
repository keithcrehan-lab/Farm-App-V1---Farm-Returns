import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/app/actions/job-sessions", () => ({ startManualJobSessionAction: vi.fn() }));

// A fake LocationTrackingProvider whose Farm Awareness stream this test
// drives directly — the real browser adapter needs `navigator.geolocation`,
// which jsdom doesn't provide meaningfully.
let emitPosition: ((position: { lat: number; lng: number; accuracyMeters?: number; recordedAt: string }) => void) | undefined;
let mockPermissionState: "granted" | "denied" = "granted";
vi.mock("@/lib/location/web-location-tracking-provider", () => ({
  createWebLocationTrackingProvider: () => ({
    async getCapability() {
      return { permissionState: mockPermissionState, farmAwarenessSupported: mockPermissionState !== "denied", activeTrackingSupported: true, backgroundTrackingSupported: false, platform: "web" };
    },
    async getCurrentPosition() {
      return null;
    },
    async startFarmAwareness(onPosition: typeof emitPosition) {
      emitPosition = onPosition;
    },
    async stopFarmAwareness() {
      emitPosition = undefined;
    },
    async startActiveTracking() {},
    async stopActiveTracking() {},
    isActivelyTracking: () => false,
  }),
}));

import { FarmProvider } from "@/store/farm-store";
import { GpsActivityCandidateCard } from "./GpsActivityCandidateCard";
import { startManualJobSessionAction } from "@/app/actions/job-sessions";
import type { Farm, Field } from "@/domain/types";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";

const mockStartManualJobSession = vi.mocked(startManualJobSessionAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  emitPosition = undefined;
  mockPermissionState = "granted";
});

const REAL_FARM: Farm = {
  id: "farm-real-1",
  name: "A Real Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "A Real Farmer",
};

const HOME_FIELD: Field = {
  id: "field-home",
  farmId: "farm-real-1",
  name: "Home Field",
  areaHa: 4.8,
  centroid: [-8.0, 53.4],
  fertility: {},
  history: [],
  polygon: {
    type: "Polygon",
    coordinates: [
      [
        [-8.001, 53.399],
        [-7.999, 53.399],
        [-7.999, 53.401],
        [-8.001, 53.401],
        [-8.001, 53.399],
      ],
    ],
  },
};

async function renderReal(fields: Field[] = [HOME_FIELD]) {
  const result = render(
    <FarmProvider remote initialState={{ farm: REAL_FARM, fields, livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <GpsActivityCandidateCard fields={fields} />
    </FarmProvider>,
  );
  // The controller's own start() awaits a real getCapability() call
  // before subscribing to Farm Awareness — flush that microtask before
  // any test emits its first simulated position.
  await act(async () => {});
  return result;
}

const T0 = new Date("2026-06-15T10:00:00.000Z").getTime();
function emit(offsetSeconds: number, lat: number, lng: number) {
  act(() => {
    emitPosition?.({ lat, lng, accuracyMeters: 10, recordedAt: new Date(T0 + offsetSeconds * 1000).toISOString() });
  });
}

describe("GpsActivityCandidateCard", () => {
  it("renders nothing until real, sustained dwelling evidence exists", async () => {
    await renderReal();
    emit(0, 53.4, -8.0);
    expect(screen.queryByText(/Looks like you're starting work/)).toBeNull();
  });

  it("renders the candidate card once dwelling evidence clears the detector's own threshold, naming the real field", async () => {
    await renderReal();
    emit(0, 53.4, -8.0);
    emit(60, 53.4, -8.0);
    emit(120, 53.4, -8.0);
    emit(180, 53.4, -8.0);
    expect(screen.getByText(/Looks like you're starting work/)).toBeTruthy();
    expect(screen.getByText("Home Field")).toBeTruthy();
  });

  it("confirming starts a real, GPS-detected job session and navigates to it", async () => {
    const jobSession: JobSessionRecord = {
      id: "session-1",
      farmId: "farm-real-1",
      decisionId: "decision-1",
      activityType: "fertiliser_spreading",
      origin: "detected",
      status: "active",
      primaryFieldId: "field-home",
      fieldSegments: [],
      activeIntervals: [{ startedAt: "2026-06-15T10:03:00.000Z" }],
      interruptionGaps: [],
      createdAt: "2026-06-15T10:03:00.000Z",
      updatedAt: "2026-06-15T10:03:00.000Z",
    };
    mockStartManualJobSession.mockResolvedValue({
      decision: { id: "decision-1", farmId: "farm-real-1", promptId: "p", calculationKind: "manual_job_start", estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-06-15T10:03:00.000Z" },
      jobSession,
    });
    await renderReal();
    for (const t of [0, 60, 120, 180]) emit(t, 53.4, -8.0);
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await act(async () => {});
    expect(mockStartManualJobSession).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "fertiliser_spreading", primaryFieldId: "field-home", origin: "detected" }),
    );
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/job\//));
  });

  it("dismissing hides the card and never calls the real start action", async () => {
    await renderReal();
    for (const t of [0, 60, 120, 180]) emit(t, 53.4, -8.0);
    fireEvent.click(screen.getByRole("button", { name: /Not this job/i }));
    expect(screen.queryByText(/Looks like you're starting work/)).toBeNull();
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("Scenario E: a denied location permission fails safely and shows a dismissible, useful recovery note — never silently nothing", async () => {
    mockPermissionState = "denied";
    await renderReal();
    expect(screen.getByText(/turn on location/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/turn on location/i)).toBeNull();
  });

  it("never runs Farm Awareness detection at all outside real mode", () => {
    render(
      <FarmProvider initialState={{ farm: REAL_FARM, fields: [HOME_FIELD], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <GpsActivityCandidateCard fields={[HOME_FIELD]} />
      </FarmProvider>,
    );
    expect(emitPosition).toBeUndefined();
  });
});

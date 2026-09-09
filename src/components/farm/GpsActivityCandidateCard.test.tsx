import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

vi.mock("@/app/actions/job-sessions", () => ({ startManualJobSessionAction: vi.fn() }));
vi.mock("@/app/actions/fertiliser-plan", () => ({
  getMatchablePlanForFieldAction: vi.fn(),
  startJobSessionFromPlanAction: vi.fn(),
}));

// A fake LocationTrackingProvider whose Farm Awareness stream this test
// drives directly — the real browser adapter needs `navigator.geolocation`,
// which jsdom doesn't provide meaningfully.
let emitPosition: ((position: { lat: number; lng: number; accuracyMeters?: number; recordedAt: string }) => void) | undefined;
let mockPermissionState: "granted" | "denied" = "granted";
let mockCapabilityShouldReject = false;
vi.mock("@/lib/location/web-location-tracking-provider", () => ({
  createWebLocationTrackingProvider: () => ({
    async getCapability() {
      // Codex audit MEDIUM (round 8, 2026-09-04): the real
      // `LocationTrackingProvider` interface allows this call to
      // reject — a real test double for it, not a permanently
      // optimistic one.
      if (mockCapabilityShouldReject) throw new Error("mock: capability check failed");
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
import { getMatchablePlanForFieldAction, startJobSessionFromPlanAction } from "@/app/actions/fertiliser-plan";
import type { Farm, Field } from "@/domain/types";
import type { JobSessionRecord, DecisionRecord } from "@/lib/farm-data/mappers";

const mockStartManualJobSession = vi.mocked(startManualJobSessionAction);
const mockGetMatchablePlan = vi.mocked(getMatchablePlanForFieldAction);
const mockStartJobSessionFromPlan = vi.mocked(startJobSessionFromPlanAction);

// Fertiliser Vertical campaign — every test's default real world has no
// real planned fertiliser application yet, so `getMatchablePlanForFieldAction`
// defaults to a genuine "none" here; individual tests override this to
// exercise the real plan-linking path.
beforeEach(() => {
  mockGetMatchablePlan.mockResolvedValue({ status: "none" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  emitPosition = undefined;
  mockPermissionState = "granted";
  mockCapabilityShouldReject = false;
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
    for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
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
    for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
    // Codex audit HIGH (round 13): the real matchable-plan lookup
    // resolves asynchronously — Confirm is genuinely disabled
    // ("Checking…") until it settles, so this real interaction must
    // flush that microtask first, same as the matched/ambiguous/failed
    // tests below already do.
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
    await act(async () => {});
    expect(mockStartManualJobSession).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "fertiliser_spreading", primaryFieldId: "field-home", origin: "detected" }),
    );
    // Codex audit HIGH (round 4, 2026-09-04): the persisted evidence is
    // scoped to Home Field's own real dwelling (4 samples since it was
    // established at t=60), not the whole 5-sample window (which
    // includes the very first sample, before the field was even
    // established).
    expect(mockStartManualJobSession).toHaveBeenCalledWith(
      expect.objectContaining({ deviceMetadata: expect.objectContaining({ sampleCount: 4, firstObservedAt: "2026-06-15T10:01:00.000Z" }) }),
    );
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/job\//));
  });

  // Codex audit HIGH (round 13): while the real matchable-plan lookup is
  // still in flight, a quick tap on Confirm could previously fall
  // straight through to the unlinked manual-start branch, even though a
  // real, unambiguous plan might exist — silently abandoning the exact
  // GPS-to-plan link campaign item 10 exists to make. Confirm must be
  // genuinely disabled until the lookup settles, not merely until the
  // farmer's own submission is pending.
  it("disables Confirm while the real matchable-plan lookup is still in flight, never falling through to manual-start early", async () => {
    let resolveLookup: (result: Awaited<ReturnType<typeof getMatchablePlanForFieldAction>>) => void = () => {};
    mockGetMatchablePlan.mockReturnValue(new Promise((resolve) => (resolveLookup = resolve)));

    await renderReal();
    for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);

    const confirmButton = screen.getByRole("button", { name: /Checking/i }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    fireEvent.click(confirmButton);
    await act(async () => {});
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
    expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();

    // Once the real lookup settles, Confirm becomes real and clickable.
    await act(async () => {
      resolveLookup({ status: "none" });
    });
    expect((screen.getByRole("button", { name: /^Confirm/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("dismissing hides the card and never calls the real start action", async () => {
    await renderReal();
    for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
    fireEvent.click(screen.getByRole("button", { name: /Not this job/i }));
    expect(screen.queryByText(/Looks like you're starting work/)).toBeNull();
    expect(mockStartManualJobSession).not.toHaveBeenCalled();
  });

  it("Codex audit round 1: dismissing one candidate never suppresses a genuinely new, later one", async () => {
    await renderReal();
    for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
    expect(screen.getByText(/Looks like you're starting work/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Not this job/i }));
    expect(screen.queryByText(/Looks like you're starting work/)).toBeNull();

    // A real, later, independent detection cycle — same field, but a
    // fresh window (the controller's own reset() already clears the
    // pure detector's state on dismiss).
    for (const t of [1000, 1060, 1120, 1180, 1240]) emit(t, 53.4, -8.0);
    expect(screen.getByText(/Looks like you're starting work/)).toBeTruthy();
  });

  it("Scenario E: a denied location permission fails safely and shows a dismissible, useful recovery note — never silently nothing", async () => {
    mockPermissionState = "denied";
    await renderReal();
    expect(screen.getByText(/turn on location/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/turn on location/i)).toBeNull();
  });

  it("Codex audit round 8: a rejected periodic permission re-check is handled, not left as an unhandled rejection, and never claims a false denial", async () => {
    vi.useFakeTimers();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await renderReal();
    // Genuinely granted so far — no recovery note.
    expect(screen.queryByText(/turn on location/i)).toBeNull();

    // The periodic re-check (every 15s) now starts genuinely rejecting
    // (a transient network/platform error, not a real denial).
    mockCapabilityShouldReject = true;
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      // Flush the rejected promise's own handler.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Reaching here at all (vitest fails a test on a genuine unhandled
    // rejection) proves the rejection was handled. A failed check is
    // not itself evidence of a denied permission — never claims one.
    expect(screen.queryByText(/turn on location/i)).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
  });

  // Fertiliser Vertical campaign, item 10/11 — GPS Job Mode connecting to
  // a real, already-planned fertiliser application.
  describe("plan matching", () => {
    function fakePlan(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
      return {
        id: "decision-plan-1",
        farmId: "farm-real-1",
        promptId: "prompt-1",
        calculationKind: "fertiliser_recommendation",
        fieldId: "field-home",
        estimateSnapshot: { status: "OK", value: { fieldId: "field-home", products: [] }, evidenceState: "IRISH_MODEL" },
        outcome: "accepted",
        decidedBy: "farmer",
        decidedAt: "2026-06-15T09:00:00Z",
        createdAt: "2026-06-15T09:00:00Z",
        ...overrides,
      };
    }

    it("discloses and links to a real, unambiguous matching plan on confirm — never calls the plain manual-start action", async () => {
      mockGetMatchablePlan.mockResolvedValue({ status: "matched", plan: fakePlan() });
      const jobSession: JobSessionRecord = {
        id: "session-1",
        farmId: "farm-real-1",
        decisionId: "decision-plan-1",
        activityType: "fertiliser_spreading",
        origin: "plan",
        status: "active",
        primaryFieldId: "field-home",
        fieldSegments: [],
        activeIntervals: [{ startedAt: "2026-06-15T10:03:00.000Z" }],
        interruptionGaps: [],
        createdAt: "2026-06-15T10:03:00.000Z",
        updatedAt: "2026-06-15T10:03:00.000Z",
      };
      mockStartJobSessionFromPlan.mockResolvedValue({ decision: fakePlan(), jobSession });

      await renderReal();
      for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
      // The lookup resolves asynchronously — flush it before asserting
      // the disclosure copy appears.
      await act(async () => {});
      expect(screen.getByText(/matches your planned fertiliser application/i)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
      await act(async () => {});

      expect(mockStartJobSessionFromPlan).toHaveBeenCalledWith(
        expect.objectContaining({ planDecisionId: "decision-plan-1", fieldId: "field-home", activityType: "fertiliser_spreading" }),
      );
      expect(mockStartManualJobSession).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/job\//));
    });

    it("falls back to the existing unlinked manual start when the plan lookup is ambiguous — never guesses among multiple plans", async () => {
      mockGetMatchablePlan.mockResolvedValue({ status: "ambiguous", candidateCount: 2 });
      mockStartManualJobSession.mockResolvedValue({
        decision: { id: "decision-1", farmId: "farm-real-1", promptId: "p", calculationKind: "manual_job_start", estimateSnapshot: { status: "OK", value: null, evidenceState: "MEASURED" }, outcome: "accepted", decidedBy: "farmer", decidedAt: "2026-06-15T10:03:00.000Z" },
        jobSession: {
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
        },
      });

      await renderReal();
      for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
      await act(async () => {});
      // The default, unlinked copy still shows — no false confidence about a specific plan.
      expect(screen.queryByText(/matches your planned fertiliser application/i)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
      await act(async () => {});

      expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
      expect(mockStartManualJobSession).toHaveBeenCalledWith(expect.objectContaining({ origin: "detected", primaryFieldId: "field-home" }));
    });

    it("Codex audit MEDIUM (round 14): re-resolves the matchable plan at confirmation time — a plan that became available after the initial lookup settled is still linked, not silently bypassed", async () => {
      // The initial lookup (on mount, once the candidate settles) finds
      // nothing; between that and the farmer's tap, a real plan becomes
      // available (e.g. saved from another tab) — the second call, made
      // fresh inside confirm(), is what must actually decide the link.
      mockGetMatchablePlan.mockResolvedValueOnce({ status: "none" }).mockResolvedValueOnce({ status: "matched", plan: fakePlan() });
      const jobSession: JobSessionRecord = {
        id: "session-1",
        farmId: "farm-real-1",
        decisionId: "decision-plan-1",
        activityType: "fertiliser_spreading",
        origin: "plan",
        status: "active",
        primaryFieldId: "field-home",
        fieldSegments: [],
        activeIntervals: [{ startedAt: "2026-06-15T10:03:00.000Z" }],
        interruptionGaps: [],
        createdAt: "2026-06-15T10:03:00.000Z",
        updatedAt: "2026-06-15T10:03:00.000Z",
      };
      mockStartJobSessionFromPlan.mockResolvedValue({ decision: fakePlan(), jobSession });

      await renderReal();
      for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
      await act(async () => {});
      // The initial (now-stale) lookup found nothing, so the default,
      // unlinked copy shows at this point.
      expect(screen.queryByText(/matches your planned fertiliser application/i)).toBeNull();
      expect(mockGetMatchablePlan).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
      await act(async () => {});

      // The confirm-time re-check found the real match — links to the
      // plan, never falls through to an unlinked manual start.
      expect(mockGetMatchablePlan).toHaveBeenCalledTimes(2);
      expect(mockStartJobSessionFromPlan).toHaveBeenCalledWith(
        expect.objectContaining({ planDecisionId: "decision-plan-1", fieldId: "field-home", activityType: "fertiliser_spreading" }),
      );
      expect(mockStartManualJobSession).not.toHaveBeenCalled();
    });

    it("a failed initial plan lookup (display-only) fails safe to the default unlinked copy, not an unhandled rejection", async () => {
      mockGetMatchablePlan.mockRejectedValueOnce(new Error("network error"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await renderReal();
      for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
      await act(async () => {});
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(screen.queryByText(/matches your planned fertiliser application/i)).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    // Codex audit MEDIUM (round 20): a failed CONFIRM-TIME lookup used
    // to be silently treated as a confirmed "no plan exists" and fall
    // through to an unlinked manual start — but a rejected lookup
    // establishes no such fact, unlike a genuine "none" result, and
    // this fork is consequential (link vs. never-link). Nothing is
    // committed yet at this point, so the safe behaviour is to fail the
    // whole confirm attempt (the same real error path every other
    // failure in this function already uses), not silently choose the
    // less-safe branch on the farmer's behalf.
    it("a failed CONFIRM-TIME plan lookup fails the whole confirm attempt honestly — never silently falls through to an unlinked manual start", async () => {
      mockGetMatchablePlan.mockResolvedValueOnce({ status: "none" }).mockRejectedValueOnce(new Error("network error"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await renderReal();
      for (const t of [0, 60, 120, 180, 240]) emit(t, 53.4, -8.0);
      await act(async () => {});
      expect(screen.queryByText(/matches your planned fertiliser application/i)).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /Confirm/i }));
      await act(async () => {});

      expect(mockStartManualJobSession).not.toHaveBeenCalled();
      expect(mockStartJobSessionFromPlan).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText(/couldn't start this job/i)).toBeTruthy();

      consoleErrorSpy.mockRestore();
    });
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import type { Farm } from "@/domain/types";

// Real mode (not the bare mock <FarmProvider>) — Pause/Resume/Finish
// actions gate on useIsRealMode(), the same "no real farm to write
// against" posture ExpandedPromptSheet's own canRecord prop already
// documents, applied here via the store instead of a prop since this
// component reads farm context from useFarm()/useIsRealMode() directly.
const REAL_FARM: Farm = {
  id: "farm-1",
  name: "A Real Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "A Real Farmer",
};

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/app/actions/job-sessions", () => ({
  pauseJobSessionAction: vi.fn(),
  resumeJobSessionAction: vi.fn(),
  finishJobSessionAction: vi.fn(),
}));

vi.mock("@/components/next/ConfirmActualSheet", () => ({
  ConfirmActualSheet: ({ session }: { session: JobSessionRecord }) => (
    <div data-testid="confirm-actual-sheet">Confirm Actual for {session.id}</div>
  ),
}));

vi.mock("@/lib/offline/job-session-sync", () => ({
  enqueueJobSessionGpsObservation: vi.fn(),
  enqueueJobSessionLifecyclePatch: vi.fn(),
  flushJobSessionOutbox: vi.fn(),
  reclaimStaleOutboxItems: vi.fn(),
}));

import { finishJobSessionAction, pauseJobSessionAction, resumeJobSessionAction } from "@/app/actions/job-sessions";
import {
  enqueueJobSessionGpsObservation,
  flushJobSessionOutbox,
  reclaimStaleOutboxItems,
} from "@/lib/offline/job-session-sync";
import { ActiveJobSessionView } from "./ActiveJobSessionView";

const mockPause = vi.mocked(pauseJobSessionAction);
const mockResume = vi.mocked(resumeJobSessionAction);
const mockFinish = vi.mocked(finishJobSessionAction);
const mockFlush = vi.mocked(flushJobSessionOutbox);
const mockReclaimStale = vi.mocked(reclaimStaleOutboxItems);
const mockEnqueueGps = vi.mocked(enqueueJobSessionGpsObservation);

function setOnLine(value: boolean): void {
  Object.defineProperty(globalThis.navigator, "onLine", { value, configurable: true });
}

// Same shape as web-location-tracking-provider.test.ts's own
// `mockGeolocation` — a real `watchPosition` call that synchronously
// invokes the success callback once with one real-shaped position, so
// this file can exercise the actual GPS-observation code path (never
// reachable before this addition, since no test here had mocked
// `navigator.geolocation` at all).
/** Mocks real geolocation with one position fired immediately on
 * `watchPosition`, and returns a function the test can call to fire a
 * *further* position update later — needed for a genuine
 * reject-then-resolve sequence (Codex audit round 5 of this phase). */
function mockGeolocationWithOnePosition(): () => void {
  let capturedSuccess: PositionCallback | undefined;
  const firePositionUpdate = () => {
    capturedSuccess?.({
      coords: { latitude: 52.5, longitude: -7.9, accuracy: 5 },
      timestamp: Date.now(),
    } as GeolocationPosition);
  };
  const mock = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn((success: PositionCallback) => {
      capturedSuccess = success;
      firePositionUpdate();
      return 1;
    }),
    clearWatch: vi.fn(),
  } as unknown as Geolocation;
  Object.defineProperty(globalThis.navigator, "geolocation", { value: mock, configurable: true });
  Object.defineProperty(globalThis.navigator, "permissions", {
    value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    configurable: true,
  });
  return firePositionUpdate;
}

function removeGeolocation(): void {
  delete (globalThis.navigator as { geolocation?: Geolocation }).geolocation;
  delete (globalThis.navigator as { permissions?: Permissions }).permissions;
}

function baseSession(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
  return {
    id: "session-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    activityType: "fertiliser_spreading",
    origin: "prompt",
    status: "active",
    fieldSegments: [],
    activeIntervals: [{ startedAt: new Date(Date.now() - 60_000).toISOString() }],
    interruptionGaps: [],
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T09:00:00Z",
    ...overrides,
  };
}

function renderView(props: Partial<React.ComponentProps<typeof ActiveJobSessionView>> = {}) {
  return render(
    <FarmProvider remote initialState={{ farm: REAL_FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <ActiveJobSessionView jobSessionId="session-1" initialSession={null} demoMode={false} {...props} />
    </FarmProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setOnLine(true);
  removeGeolocation();
});

describe("ActiveJobSessionView — honest non-happy-path states", () => {
  it("shows a demo-mode message and never renders session controls", () => {
    renderView({ demoMode: true });
    expect(screen.getByText(/demo mode — job sessions/i)).toBeTruthy();
    expect(screen.queryByText(/finish job/i)).toBeNull();
  });

  it("shows an unavailable message distinct from a genuinely missing session", () => {
    renderView({ unavailable: true });
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
  });

  it("shows an honest not-found message when no session matches the id", () => {
    renderView({ initialSession: null });
    expect(screen.getByText(/no job found with id session-1/i)).toBeTruthy();
  });
});

describe("ActiveJobSessionView — a real active session", () => {
  it("renders the real activity, elapsed time, and Pause + Finish job controls", () => {
    renderView({ initialSession: baseSession({ status: "active" }) });
    // Rendered once in the mobile header, once in the desktop PageHeader
    // — the same dual-render pattern Today/Plan/Records already use.
    expect(screen.getAllByText("Fertiliser spreading").length).toBeGreaterThan(0);
    expect(screen.getByText(/pause/i)).toBeTruthy();
    expect(screen.getByText(/finish job/i)).toBeTruthy();
    expect(screen.queryByText(/resume/i)).toBeNull();
  });

  it("shows Resume, not Pause, for a paused session", () => {
    renderView({ initialSession: baseSession({ status: "paused" }) });
    expect(screen.getByText(/resume/i)).toBeTruthy();
    expect(screen.queryByText(/pause/i)).toBeNull();
    expect(screen.getByText(/finish job/i)).toBeTruthy();
  });

  it("renders no Pause/Resume/Finish controls once completed_estimated, and shows Confirm Actual instead", () => {
    renderView({ initialSession: baseSession({ status: "completed_estimated" }) });
    expect(screen.queryByText(/finish job/i)).toBeNull();
    expect(screen.getByTestId("confirm-actual-sheet")).toBeTruthy();
  });
});

describe("ActiveJobSessionView — online lifecycle actions", () => {
  it("calls pauseJobSessionAction and updates to the returned session when online", async () => {
    mockPause.mockResolvedValue(baseSession({ status: "paused" }));
    renderView({ initialSession: baseSession({ status: "active" }) });

    fireEvent.click(screen.getByText(/pause/i));

    await waitFor(() => expect(mockPause).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(screen.getByText(/resume/i)).toBeTruthy());
  });

  it("calls resumeJobSessionAction and updates to the returned session when online", async () => {
    mockResume.mockResolvedValue(baseSession({ status: "active" }));
    renderView({ initialSession: baseSession({ status: "paused" }) });

    fireEvent.click(screen.getByText(/resume/i));

    await waitFor(() => expect(mockResume).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(screen.getByText(/pause/i)).toBeTruthy());
  });

  it("calls finishJobSessionAction and shows Confirm Actual once it resolves", async () => {
    mockFinish.mockResolvedValue(baseSession({ status: "completed_estimated" }));
    renderView({ initialSession: baseSession({ status: "active" }) });

    fireEvent.click(screen.getByText(/finish job/i));

    await waitFor(() => expect(mockFinish).toHaveBeenCalledWith("session-1"));
    await waitFor(() => expect(screen.getByTestId("confirm-actual-sheet")).toBeTruthy());
  });

  it("shows a stable error message, not a raw one, when the action rejects", async () => {
    mockPause.mockRejectedValue(new Error("job_sessions: invalid status transition"));
    renderView({ initialSession: baseSession({ status: "active" }) });

    fireEvent.click(screen.getByText(/pause/i));

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(screen.queryByText(/invalid status transition/i)).toBeNull();
  });
});

describe("ActiveJobSessionView — network state (Phase B, 2026-09-03)", () => {
  it("shows the offline banner when navigator.onLine is false", () => {
    setOnLine(false);
    renderView({ initialSession: baseSession({ status: "active" }) });
    expect(screen.getByText(/offline.*will sync when connected/i)).toBeTruthy();
  });

  it("shows Online, not a false Synced/complete claim, when the network interface is up (Codex audit round 2, MEDIUM)", () => {
    setOnLine(true);
    renderView({ initialSession: baseSession({ status: "active" }) });
    // Deliberately not "Synced" — this reflects navigator.onLine's own
    // "a network interface is up" signal, never a claim that queued
    // outbox items have actually finished syncing (NetworkStateProvider's
    // own reachabilityVerified: false, and this component never awaits
    // its fire-and-forget flush calls' own result).
    expect(screen.getByText(/^online$/i)).toBeTruthy();
    expect(screen.queryByText(/synced/i)).toBeNull();
  });

  it("flushes the outbox on a genuine online transition", async () => {
    setOnLine(false);
    renderView({ initialSession: baseSession({ status: "active" }) });
    expect(mockFlush).not.toHaveBeenCalled();

    setOnLine(true);
    fireEvent(window, new Event("online"));

    await waitFor(() => expect(mockFlush).toHaveBeenCalledWith("farm-1"));
  });

  it("does not flush from the online-transition listener merely from mounting online — the separate mount-time flush (below) is what covers that case", async () => {
    setOnLine(true);
    renderView({ initialSession: baseSession({ status: "active" }) });
    // The online-transition subscription itself only reports a genuine
    // transition (see NetworkStateProvider's own "fires only on a
    // genuine transition" contract) — any flush seen at mount comes from
    // the separate mount-time effect below, not this one re-firing.
    await waitFor(() => expect(mockFlush).toHaveBeenCalledTimes(1));
  });
});

describe("ActiveJobSessionView — stale outbox reclaim + mount-time flush (Phase B, 2026-09-03)", () => {
  it("calls reclaimStaleOutboxItems exactly once on mount for a real session", async () => {
    mockReclaimStale.mockResolvedValue(0);
    renderView({ initialSession: baseSession({ status: "active" }) });
    await waitFor(() => expect(mockReclaimStale).toHaveBeenCalledWith("farm-1"));
    expect(mockReclaimStale).toHaveBeenCalledTimes(1);
  });

  it("flushes on mount when online, even if nothing was reclaimed — Codex audit round 3, MEDIUM: an ordinary already-pending item (no new GPS fix to trigger its own opportunistic flush, e.g. a paused session) must not be stranded despite the offline banner's own \"will sync when connected\" promise", async () => {
    setOnLine(true);
    mockReclaimStale.mockResolvedValue(0);
    renderView({ initialSession: baseSession({ status: "active" }) });
    await waitFor(() => expect(mockFlush).toHaveBeenCalledWith("farm-1"));
  });

  it("flushes on mount when a stale item was genuinely reclaimed too", async () => {
    setOnLine(true);
    mockReclaimStale.mockResolvedValue(1);
    renderView({ initialSession: baseSession({ status: "active" }) });
    await waitFor(() => expect(mockFlush).toHaveBeenCalledWith("farm-1"));
  });

  it("does not flush on mount while offline, reclaimed or not", async () => {
    setOnLine(false);
    mockReclaimStale.mockResolvedValue(1);
    renderView({ initialSession: baseSession({ status: "active" }) });
    await waitFor(() => expect(mockReclaimStale).toHaveBeenCalled());
    expect(mockFlush).not.toHaveBeenCalled();
  });
});

describe("ActiveJobSessionView — local storage failure honesty (Codex audit rounds 4-5, MEDIUM)", () => {
  it("shows an honest storage-error banner, not a false 'will sync when connected' claim, when a real GPS observation fails to enqueue locally", async () => {
    mockGeolocationWithOnePosition();
    mockEnqueueGps.mockRejectedValue(new Error("IndexedDB quota exceeded"));
    renderView({ initialSession: baseSession({ status: "active" }) });

    await waitFor(() => expect(mockEnqueueGps).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/some tracking data could not be saved on this device/i)).toBeTruthy());
    expect(screen.queryByText(/will sync when connected/i)).toBeNull();
    expect(screen.queryByText(/^online$/i)).toBeNull();
  });

  it("shows the normal Online text, not the storage-error banner, when every observation enqueues successfully", async () => {
    mockGeolocationWithOnePosition();
    mockEnqueueGps.mockResolvedValue(undefined);
    renderView({ initialSession: baseSession({ status: "active" }) });

    await waitFor(() => expect(mockEnqueueGps).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/^online$/i)).toBeTruthy());
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
  });

  it("keeps showing the storage-error banner even after a later enqueue succeeds — a historical fact, not a present-tense claim that could go stale (Codex audit round 5, MEDIUM)", async () => {
    const firePositionUpdate = mockGeolocationWithOnePosition();
    mockEnqueueGps.mockRejectedValueOnce(new Error("IndexedDB quota exceeded"));
    mockEnqueueGps.mockResolvedValue(undefined);
    renderView({ initialSession: baseSession({ status: "active" }) });

    await waitFor(() => expect(mockEnqueueGps).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/some tracking data could not be saved on this device/i)).toBeTruthy());

    // A further, genuinely successful enqueue must not silently imply
    // the earlier failure never happened.
    firePositionUpdate();
    await waitFor(() => expect(mockEnqueueGps).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/some tracking data could not be saved on this device/i)).toBeTruthy();
  });
});

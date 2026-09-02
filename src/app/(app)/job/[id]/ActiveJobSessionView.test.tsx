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

import { finishJobSessionAction, pauseJobSessionAction, resumeJobSessionAction } from "@/app/actions/job-sessions";
import { ActiveJobSessionView } from "./ActiveJobSessionView";

const mockPause = vi.mocked(pauseJobSessionAction);
const mockResume = vi.mocked(resumeJobSessionAction);
const mockFinish = vi.mocked(finishJobSessionAction);

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

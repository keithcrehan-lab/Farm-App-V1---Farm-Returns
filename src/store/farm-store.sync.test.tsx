import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmProvider, useFarmActions, useFieldById, useSyncStatus } from "./farm-store";
import type { Field, Farm } from "@/domain/types";
import { tracked } from "@/domain/types";

/**
 * Codex remediation Priority 5 — reliable database mutations. Proves that
 * a rejected real-mode write (1) never gets silently swallowed to just a
 * console.error, (2) is reported through `useSyncStatus()` with the real
 * action label, and (3) local state still reflects the optimistic change
 * — the UI must show BOTH "here's your change" and "it hasn't saved yet",
 * never one without the other.
 */
vi.mock("@/app/actions/farm", () => ({
  addFieldAction: vi.fn(),
  addHousingAction: vi.fn(),
  addLivestockGroupAction: vi.fn(),
  addSoilTestAction: vi.fn(),
  archiveFieldAction: vi.fn(),
  restoreFieldAction: vi.fn(),
  setFieldBoundaryAction: vi.fn(),
  updateFarmProfileAction: vi.fn(),
  updateFieldCommonageStatusAction: vi.fn(),
  updateFieldDetailsAction: vi.fn(),
  updateFieldIndexAction: vi.fn(),
  updateFieldWaterBufferContextAction: vi.fn(),
  updateHousingAction: vi.fn(),
  updateLivestockGroupAction: vi.fn(),
  updateSlurryApplicationMethodAction: vi.fn(),
}));

import { updateFieldIndexAction } from "@/app/actions/farm";
const mockUpdateFieldIndexAction = vi.mocked(updateFieldIndexAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Ballybeg Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith Crehan",
};

const FIELD: Field = {
  id: "field-1",
  farmId: "farm-1",
  name: "Home Field",
  areaHa: 5,
  centroid: [-8.49, 51.9],
  fertility: {},
  history: [],
};

/** Probe component — mirrors how a real screen would consume both the
 * mutated field and the sync-status hook simultaneously. */
function Probe() {
  const { updateFieldIndex } = useFarmActions();
  const field = useFieldById("field-1");
  const { failures, pendingCount } = useSyncStatus();

  return (
    <div>
      <p data-testid="pindex">{field?.fertility.pIndex?.value ?? "unset"}</p>
      <p data-testid="pending">{pendingCount}</p>
      <p data-testid="failure-count">{failures.length}</p>
      {failures.map((f) => (
        <div key={f.id}>
          <span data-testid="failure-label">{f.label}</span>
          <button type="button" onClick={f.retry}>
            Retry
          </button>
        </div>
      ))}
      <button type="button" onClick={() => updateFieldIndex("field-1", "pIndex", 3, "Keith")}>
        Set P Index
      </button>
    </div>
  );
}

function renderRemote() {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [FIELD], livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <Probe />
    </FarmProvider>,
  );
}

describe("farm-store real-mode mutation failures (Codex remediation Priority 5)", () => {
  it("shows the optimistic local update immediately, before the remote write resolves either way", async () => {
    mockUpdateFieldIndexAction.mockReturnValue(new Promise(() => {})); // never resolves
    renderRemote();
    fireEvent.click(screen.getByText("Set P Index"));
    expect((await screen.findByTestId("pindex")).textContent).toBe("3");
  });

  it("a rejected write is reported via useSyncStatus, not silently swallowed", async () => {
    mockUpdateFieldIndexAction.mockRejectedValue(new Error("network error"));
    renderRemote();

    await act(async () => {
      fireEvent.click(screen.getByText("Set P Index"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("pindex").textContent).toBe("3"); // local state still shows the change
    expect(screen.getByTestId("failure-count").textContent).toBe("1");
    expect(screen.getByTestId("failure-label").textContent).toBe("updateFieldIndex");
  });

  it("retrying a failed write clears the failure once it succeeds", async () => {
    mockUpdateFieldIndexAction.mockRejectedValueOnce(new Error("network error"));
    renderRemote();

    await act(async () => {
      fireEvent.click(screen.getByText("Set P Index"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("failure-count").textContent).toBe("1");

    mockUpdateFieldIndexAction.mockResolvedValueOnce({ ...FIELD, fertility: { pIndex: tracked(3, "farmer_adjusted", "Keith") } });
    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("failure-count").textContent).toBe("0");
  });
});

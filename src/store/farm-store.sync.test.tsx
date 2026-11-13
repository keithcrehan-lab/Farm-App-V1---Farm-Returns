import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/app/actions/fertiliser-field-evidence", () => ({
  loadCanonicalGrazingFieldStateAction: vi.fn(),
}));
vi.mock("@/app/actions/regulatory-evidence", () => ({
  loadRegulatoryEvidenceStateAction: vi.fn(),
}));
import { loadCanonicalGrazingFieldStateAction } from "@/app/actions/fertiliser-field-evidence";
import { loadRegulatoryEvidenceStateAction } from "@/app/actions/regulatory-evidence";
import { updateFarmProfileAction } from "@/app/actions/farm";
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
  const { failures, pendingCount, syncedCount } = useSyncStatus();

  return (
    <div>
      <p data-testid="pindex">{field?.fertility.pIndex?.value ?? "unset"}</p>
      <p data-testid="pending">{pendingCount}</p>
      <p data-testid="synced">{syncedCount}</p>
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
    <FarmProvider remote initialState={{ farm: FARM, fields: [FIELD], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
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
    // A failure alone never counts as a completed save.
    expect(screen.getByTestId("synced").textContent).toBe("0");

    mockUpdateFieldIndexAction.mockResolvedValueOnce({ ...FIELD, fertility: { pIndex: tracked(3, "farmer_adjusted", "Keith") } });
    await act(async () => {
      fireEvent.click(screen.getByText("Retry"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("failure-count").textContent).toBe("0");
    // The successful retry does — screens re-reading persisted data key off this.
    expect(screen.getByTestId("synced").textContent).toBe("1");
  });
});


// Codex independent audit F001/F002: cached field resolution must not be
// silently dropped by unrelated reads or remain trusted after a saved change.
const GRAZING_FIELD: Field = {
  ...FIELD,
  plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
  currentSeasonCropFamily: "grassland",
  grazingSward: { kind: "GRASS" },
  grazingProductionSystemResolution: {
    value: "SUCKLER_CALF_TO_WEANING",
    basis: "FARM_BASELINE",
    source: "Farm grazing system",
    limitations: [],
  },
};
const GRAZING_FARM: Farm = {
  ...FARM,
  grazingProductionSystem: tracked("SUCKLER_CALF_TO_WEANING", "farmer_adjusted", "Farmer"),
};

function GrazingResolutionProbe() {
  const { updateFarmProfile, replaceFieldFromServer, applySavedProductionCycle, refreshGrazingSystemEvidence, refreshRegulatoryEvidence } = useFarmActions();
  const field = useFieldById(GRAZING_FIELD.id);
  return (
    <>
      <output data-testid="grazing-system">{field?.grazingProductionSystemResolution?.value ?? "UNRESOLVED"}</output>
      <output data-testid="grazing-basis">{field?.grazingProductionSystemResolution?.basis ?? "NONE"}</output>
      <button onClick={() => replaceFieldFromServer({ ...GRAZING_FIELD, grazingProductionSystemResolution: undefined, grazingSward: undefined })}>Unrelated field refresh</button>
      <button onClick={() => updateFarmProfile({ grazingProductionSystem: "SUCKLER_CALF_TO_BEEF" })}>Save farm grazing system</button>
      <button onClick={() => applySavedProductionCycle(GRAZING_FIELD.id, new Date().toISOString().slice(0, 4), {
        id: "cycle-1", fieldId: GRAZING_FIELD.id, season: new Date().toISOString().slice(0, 4),
        cropSystem: "GRASS_GRAZING", status: "active", evidence: {},
        createdAt: "2026-01-01", updatedAt: "2026-11-13",
      })}>Apply saved field exception</button>
      <button onClick={() => void refreshGrazingSystemEvidence()}>Refresh after movement</button>
      <button onClick={() => void refreshRegulatoryEvidence()}>Refresh regulatory evidence</button>
    </>
  );
}

function renderGrazing() {
  render(<FarmProvider remote initialState={{
    farm: GRAZING_FARM, fields: [GRAZING_FIELD], livestockGroups: [],
    housing: [], slurryAllocations: [], slurryCompositionRecords: [],
  }}><GrazingResolutionProbe /></FarmProvider>);
}

describe("farm store field grazing-system synchronisation", () => {
  it("preserves a canonical system when a same-input direct field read has no derived metadata", () => {
    renderGrazing();
    fireEvent.click(screen.getByText("Unrelated field refresh"));
    expect(screen.getByTestId("grazing-system").textContent).toBe("SUCKLER_CALF_TO_WEANING");
    expect(screen.getByTestId("grazing-basis").textContent).toBe("FARM_BASELINE");
  });

  it("fails closed during a farm baseline update, then adopts the authorised new resolution", async () => {
    let finish!: (value: Farm) => void;
    vi.mocked(updateFarmProfileAction).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(loadCanonicalGrazingFieldStateAction).mockResolvedValue({
      farmId: "farm-1",
      fields: [{ id: "field-1", currentSeasonCropFamily: "grassland", grazingSward: { kind: "GRASS" },
        grazingProductionSystemResolution: { value: "SUCKLER_CALF_TO_BEEF", basis: "FARM_BASELINE", source: "Current farm baseline", limitations: [] } }],
    });
    renderGrazing();
    fireEvent.click(screen.getByText("Save farm grazing system"));
    expect(screen.getByTestId("grazing-system").textContent).toBe("UNRESOLVED");

    await act(async () => { finish(GRAZING_FARM); });
    await waitFor(() => expect(screen.getByTestId("grazing-system").textContent).toBe("SUCKLER_CALF_TO_BEEF"));
    expect(loadCanonicalGrazingFieldStateAction).toHaveBeenCalledOnce();
  });

  it("blocks stale field exceptions on a cycle save until authoritative resolution returns", async () => {
    let finish!: (state: Awaited<ReturnType<typeof loadCanonicalGrazingFieldStateAction>>) => void;
    vi.mocked(loadCanonicalGrazingFieldStateAction).mockReturnValue(new Promise((resolve) => { finish = resolve; }) as ReturnType<typeof loadCanonicalGrazingFieldStateAction>);
    renderGrazing();
    fireEvent.click(screen.getByText("Apply saved field exception"));
    expect(screen.getByTestId("grazing-system").textContent).toBe("UNRESOLVED");
    await act(async () => {
      finish({ farmId: "farm-1", fields: [{
        id: "field-1", currentSeasonCropFamily: "grassland", grazingSward: { kind: "GRASS" },
        grazingProductionSystemResolution: { value: "SUCKLER_CALF_TO_BEEF", basis: "FIELD_OVERRIDE", source: "Field exception", limitations: [] },
      }] });
    });
    await waitFor(() => expect(screen.getByTestId("grazing-basis").textContent).toBe("FIELD_OVERRIDE"));
  });

  it("an older regulatory read cannot roll back a newer saved farm grazing baseline", async () => {
    let finishRegulatory!: (value: Awaited<ReturnType<typeof loadRegulatoryEvidenceStateAction>>) => void;
    vi.mocked(loadRegulatoryEvidenceStateAction).mockReturnValue(
      new Promise((resolve) => { finishRegulatory = resolve; }),
    );
    vi.mocked(updateFarmProfileAction).mockResolvedValue(GRAZING_FARM);
    vi.mocked(loadCanonicalGrazingFieldStateAction).mockResolvedValue({
      farmId: "farm-1",
      fields: [{ id: "field-1", currentSeasonCropFamily: "grassland", grazingSward: { kind: "GRASS" },
        grazingProductionSystemResolution: { value: "SUCKLER_CALF_TO_BEEF", basis: "FARM_BASELINE", source: "New farm baseline", limitations: [] } }],
    });
    renderGrazing();
    fireEvent.click(screen.getByText("Refresh regulatory evidence")); // starts the slow read first
    fireEvent.click(screen.getByText("Save farm grazing system"));
    await waitFor(() => expect(screen.getByTestId("grazing-system").textContent).toBe("SUCKLER_CALF_TO_BEEF"));
    await act(async () => {
      finishRegulatory({ housing: [], fields: [GRAZING_FIELD], neatSlurryEvidenceRecords: [], spreadableAreaRecords: [] });
    });
    expect(screen.getByTestId("grazing-system").textContent).toBe("SUCKLER_CALF_TO_BEEF");
    expect(screen.getByTestId("grazing-basis").textContent).toBe("FARM_BASELINE");
  });

  it("invalidates cached resolution immediately when a cattle movement is reported", async () => {
    let finish!: (state: Awaited<ReturnType<typeof loadCanonicalGrazingFieldStateAction>>) => void;
    vi.mocked(loadCanonicalGrazingFieldStateAction).mockReturnValue(new Promise((resolve) => { finish = resolve; }) as ReturnType<typeof loadCanonicalGrazingFieldStateAction>);
    renderGrazing();
    await act(async () => { window.dispatchEvent(new Event("farm-return:grazing-moved")); });
    expect(screen.getByTestId("grazing-system").textContent).toBe("UNRESOLVED");
    await act(async () => {
      finish({ farmId: "farm-1", fields: [{
        id: "field-1", currentSeasonCropFamily: "grassland", grazingSward: { kind: "GRASS" },
        grazingProductionSystemResolution: { value: "SUCKLER_CALF_TO_BEEF", basis: "FIELD_MOVEMENTS", source: "Recorded cattle movements", limitations: [] },
      }] });
    });
    await waitFor(() => expect(screen.getByTestId("grazing-basis").textContent).toBe("FIELD_MOVEMENTS"));
  });
});

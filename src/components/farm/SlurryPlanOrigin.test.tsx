import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/actions/slurry-allocation-lifecycle", () => ({
  loadSlurryPlanStateAction: vi.fn(),
  updatePlannedSlurryAllocationAction: vi.fn(),
  cancelPlannedSlurryAllocationAction: vi.fn(),
  completePlannedSlurryAllocationAction: vi.fn(),
}));
vi.mock("@/app/actions/slurry-origin-evidence", () => ({ recordSlurryOriginDeclarationAction: vi.fn() }));

import { loadSlurryPlanStateAction } from "@/app/actions/slurry-allocation-lifecycle";
import { recordSlurryOriginDeclarationAction } from "@/app/actions/slurry-origin-evidence";
import { FarmProvider } from "@/store/farm-store";
import { mockFarm } from "@/data/mock-farm";
import type { Field, Housing } from "@/domain/types";
import type { SlurryAllocationRecord } from "@/domain/slurry-allocation-lifecycle";
import type { SlurryOriginEvidenceRecord } from "@/domain/slurry-origin-evidence";
import { SlurryPlanLifecycle } from "./SlurryPlanLifecycle";

/**
 * Campaign B — farmer-facing capture of where a planned spreading's slurry
 * came from (P: persists and reloads; Q: no internal enum/reason code).
 */
const load = vi.mocked(loadSlurryPlanStateAction);
const recordOrigin = vi.mocked(recordSlurryOriginDeclarationAction);

const STORE = {
  id: "h1",
  farmId: mockFarm.id,
  shedName: "Main tank",
  shedType: "slatted",
  linkedGroupIds: [],
  housingPeriod: { start: "2025-11-01", end: "2026-03-31" },
  slurryEstimate: {} as Housing["slurryEstimate"],
  storageCapacityM3: 200,
  storageFillPct: 50,
  storageFillStatus: "farmer_recorded",
  storageFillRecordedAt: "2026-09-20T09:00:00.000Z",
  storeObservationSeq: 1,
  storeObservedAt: "2026-09-20T09:00:00.000Z",
} as Housing;
const FIELDS = [{ id: "f1", farmId: mockFarm.id, name: "Back Field", areaHa: 4 } as Field];
const PLAN: SlurryAllocationRecord = {
  id: "a1",
  farmId: mockFarm.id,
  fieldId: "f1",
  housingId: "h1",
  volumeM3: 30,
  status: "planned",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  planRevision: 1,
};
const declaration = (patch: Partial<SlurryOriginEvidenceRecord> = {}): SlurryOriginEvidenceRecord => ({
  id: "o1",
  farmId: mockFarm.id,
  allocationId: "a1",
  origin: "imported_organic_manure",
  status: "farmer_adjusted",
  source: "Farmer declaration on the slurry plan",
  planRevisionAtRecord: 1,
  fieldIdAtRecord: "f1",
  housingIdAtRecord: "h1",
  volumeM3AtRecord: 30,
  recordedAt: "2026-09-21T10:00:00.000Z",
  ...patch,
});

const INTERNAL = /[A-Z]{2,}_[A-Z_]+|home_produced|imported_organic|grazing_livestock|farmer_adjusted/;

function renderPlan(
  records: SlurryAllocationRecord[],
  originRecords: SlurryOriginEvidenceRecord[] = [],
  serverOriginRecords: SlurryOriginEvidenceRecord[] = originRecords,
) {
  load.mockResolvedValue({ housing: [STORE], records, originRecords: serverOriginRecords });
  return render(
    <FarmProvider
      remote
      initialState={{
        farm: mockFarm,
        fields: FIELDS,
        livestockGroups: [],
        housing: [STORE],
        slurryAllocations: records.filter((r) => r.status === "planned"),
        slurryCompositionRecords: [],
        slurryAllocationRecords: records,
        slurryOriginEvidenceRecords: originRecords,
      }}
    >
      <SlurryPlanLifecycle />
    </FarmProvider>,
  );
}

const planned = () => screen.getByRole("region", { name: "Planned spreading" });

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("SlurryPlanLifecycle — where the slurry came from", () => {
  it("A: a plan with no declaration says so and never pre-selects an answer", async () => {
    renderPlan([PLAN]);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(within(planned()).getByText("Not recorded yet")).toBeTruthy();
    fireEvent.click(within(planned()).getByRole("button", { name: "Record where it came from" }));
    const dialog = await screen.findByRole("dialog");
    for (const radio of within(dialog).getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    // Saving without an answer is refused locally, nothing is sent.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save answer" }));
    expect(await within(dialog).findByText("Choose where the slurry came from.")).toBeTruthy();
    expect(recordOrigin).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("P: a saved declaration is sent against the plan revision shown, then displayed on the plan", async () => {
    recordOrigin.mockResolvedValue({ status: "saved", record: declaration({ origin: "home_produced_grazing_livestock" }) });
    renderPlan([PLAN]);
    fireEvent.click(within(planned()).getByRole("button", { name: "Record where it came from" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/Produced on this farm by my own grazing stock/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(recordOrigin).toHaveBeenCalledWith({ allocationId: "a1", planRevision: 1, origin: "home_produced_grazing_livestock" }));
    expect(await screen.findByText("Saved where the slurry for Back Field came from.")).toBeTruthy();
    expect(within(planned()).getByText("Produced on this farm by your own grazing stock")).toBeTruthy();
    expect(within(planned()).getByRole("button", { name: "Change where it came from" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("P: a persisted declaration reloads onto its plan, pre-selected for review", async () => {
    renderPlan([PLAN], [declaration()]);
    expect(within(planned()).getByText("Brought in from another farm")).toBeTruthy();
    fireEvent.click(within(planned()).getByRole("button", { name: "Change where it came from" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Brought in from another farm") as HTMLInputElement).checked).toBe(true);
  });

  it("J: a declaration made before the plan was edited is not shown as the plan's answer", async () => {
    renderPlan([{ ...PLAN, planRevision: 2 }], [declaration()]);
    expect(within(planned()).getByText("Not recorded yet")).toBeTruthy();
  });

  it("mixed / not sure are shown plainly with what they mean for the check", async () => {
    renderPlan([PLAN], [declaration({ origin: "mixed" })]);
    expect(within(planned()).getByText("A mix of your own and brought-in slurry")).toBeTruthy();
    expect(within(planned()).getByText(/can't split mixed slurry/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("a plan that changed elsewhere is refused plainly and the plan is re-read", async () => {
    recordOrigin.mockResolvedValue({ status: "rejected", issues: ["PLAN_CHANGED"] });
    renderPlan([PLAN]);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    fireEvent.click(within(planned()).getByRole("button", { name: "Record where it came from" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Not sure"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save answer" }));
    expect(await screen.findByText(/This spreading plan has changed since you opened it/)).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(within(planned()).getByText("Not recorded yet")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("a correction made elsewhere replaces the cached declaration when the plan is re-read", async () => {
    const home = declaration({ origin: "home_produced_grazing_livestock" });
    const correction = declaration({ id: "o2", origin: "unknown", recordedAt: "2026-09-22T10:00:00.000Z" });
    renderPlan([PLAN], [home], [home, correction]);
    expect(within(planned()).getByText("Produced on this farm by your own grazing stock")).toBeTruthy();
    await waitFor(() => expect(within(planned()).getByText("Not sure")).toBeTruthy());
    expect(within(planned()).queryByText("Produced on this farm by your own grazing stock")).toBeNull();
  });

  it("an answer chosen before a refresh moved the plan is never sent against the new revision", async () => {
    let resolveLoad!: (v: Awaited<ReturnType<typeof loadSlurryPlanStateAction>>) => void;
    load.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
    render(
      <FarmProvider
        remote
        initialState={{
          farm: mockFarm,
          fields: FIELDS,
          livestockGroups: [],
          housing: [STORE, { ...STORE, id: "h2", shedName: "Second tank" }],
          slurryAllocations: [PLAN],
          slurryCompositionRecords: [],
          slurryAllocationRecords: [PLAN],
          slurryOriginEvidenceRecords: [],
        }}
      >
        <SlurryPlanLifecycle />
      </FarmProvider>,
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    fireEvent.click(within(planned()).getByRole("button", { name: "Record where it came from" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/Produced on this farm by my own grazing stock/));
    // The pending mount refresh lands: the same plan, moved to another store.
    const moved = { ...PLAN, housingId: "h2", planRevision: 2 };
    await act(async () => resolveLoad({ housing: [STORE, { ...STORE, id: "h2", shedName: "Second tank" }], records: [moved], originRecords: [] }));
    const reopened = await screen.findByRole("dialog");
    for (const radio of within(reopened).getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(reopened).getByRole("button", { name: "Save answer" }));
    expect(await within(reopened).findByText("Choose where the slurry came from.")).toBeTruthy();
    expect(recordOrigin).not.toHaveBeenCalled();
  });

  it("no capture is offered when the plan's revision is unknown (migration not applied)", async () => {
    renderPlan([{ ...PLAN, planRevision: undefined }]);
    expect(within(planned()).getByText("Not recorded yet")).toBeTruthy();
    expect(within(planned()).queryByRole("button", { name: /where it came from/ })).toBeNull();
  });
});

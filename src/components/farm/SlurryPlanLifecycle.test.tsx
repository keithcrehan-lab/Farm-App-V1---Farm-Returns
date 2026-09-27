import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/actions/slurry-allocation-lifecycle", () => ({
  loadSlurryPlanStateAction: vi.fn(),
  updatePlannedSlurryAllocationAction: vi.fn(),
  cancelPlannedSlurryAllocationAction: vi.fn(),
  completePlannedSlurryAllocationAction: vi.fn(),
}));

import {
  cancelPlannedSlurryAllocationAction,
  completePlannedSlurryAllocationAction,
  loadSlurryPlanStateAction,
  updatePlannedSlurryAllocationAction,
} from "@/app/actions/slurry-allocation-lifecycle";
import { FarmProvider } from "@/store/farm-store";
import { mockFarm } from "@/data/mock-farm";
import type { Field, Housing } from "@/domain/types";
import type { SlurryAllocationRecord } from "@/domain/slurry-allocation-lifecycle";
import { SlurryPlanLifecycle } from "./SlurryPlanLifecycle";

const load = vi.mocked(loadSlurryPlanStateAction);
const edit = vi.mocked(updatePlannedSlurryAllocationAction);
const cancel = vi.mocked(cancelPlannedSlurryAllocationAction);
const complete = vi.mocked(completePlannedSlurryAllocationAction);

function store(patch: Partial<Housing> = {}): Housing {
  return {
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
    ...patch,
  };
}

function field(id: string, name: string): Field {
  return { id, farmId: mockFarm.id, name, areaHa: 4 } as Field;
}

function rec(patch: Partial<SlurryAllocationRecord> = {}): SlurryAllocationRecord {
  return {
    id: "a1",
    farmId: mockFarm.id,
    fieldId: "f1",
    housingId: "h1",
    volumeM3: 30,
    status: "planned",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

const FIELDS = [field("f1", "Back Field"), field("f2", "Road Field"), field("f3", "River Field")];

/** The server's state: every re-read returns whatever this holds now. */
let server: { housing: Housing[]; records: SlurryAllocationRecord[] };

function renderPlan(housing: Housing[], records: SlurryAllocationRecord[]) {
  server = { housing, records };
  load.mockImplementation(async () => ({ housing: server.housing, records: server.records }));
  return render(
    <FarmProvider
      remote
      initialState={{
        farm: mockFarm,
        fields: FIELDS,
        livestockGroups: [],
        housing,
        slurryAllocations: records.filter((r) => r.status === "planned"),
        slurryCompositionRecords: [],
        slurryAllocationRecords: records,
      }}
    >
      <SlurryPlanLifecycle />
    </FarmProvider>,
  );
}

function summary() {
  const card = screen.getByText("Your slurry").closest("div.rounded-fr-card") as HTMLElement;
  const stat = (label: string) => within(card).getByText(label).nextElementSibling?.textContent;
  return { current: stat("Current slurry"), reserved: stat("Reserved in plan"), unallocated: stat("Unallocated") };
}

function plannedSection() {
  return screen.getByRole("region", { name: "Planned spreading" });
}

const INTERNAL = /[A-Z]{2,}_[A-Z_]+|withdrawn_after_observation|reflected_in_observation|store_observation_seq/;

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("SlurryPlanLifecycle", () => {
  it("shows reconciled current slurry, reservations and unallocated separately, with the last reading as evidence (A, C, D, E, F, W)", async () => {
    // Reading 50% of 200 m³ = 100 m³, then 60 m³ recorded as spread.
    renderPlan([store({ storeWithdrawnSinceObservationM3: 60 })], [rec({ volumeM3: 25 }), rec({ id: "c1", fieldId: "f2", status: "completed", actualVolumeM3: 60, actualSpreadDate: "2026-09-22" })]);
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(summary()).toEqual({ current: "40 m³", reserved: "25 m³", unallocated: "15 m³" });
    expect(screen.getByText("Current estimate: 40 m³")).toBeTruthy();
    expect(screen.getByText(/Last tank reading: 50%.*100 m³ then, less slurry recorded as spread since/)).toBeTruthy();
    // The raw reading volume is never presented as the current figure.
    expect(screen.queryByText("Current estimate: 100 m³")).toBeNull();
    const planned = plannedSection();
    expect(within(planned).getByText("Back Field")).toBeTruthy();
    expect(within(planned).queryByText("Road Field")).toBeNull();
  });

  it("keeps completed and cancelled plans in history only, without lifecycle actions (B, R, S)", async () => {
    renderPlan(
      [store()],
      [
        rec({ id: "c1", status: "completed", actualVolumeM3: 27, actualSpreadDate: "2026-09-22" }),
        rec({ id: "x1", fieldId: "f2", status: "cancelled", cancelledAt: "2026-09-21T10:00:00.000Z" }),
      ],
    );
    expect(within(plannedSection()).getByText("No spreading is planned right now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /mark as spread/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();
    const history = screen.getByText(/History \(2\)/).closest("details") as HTMLElement;
    expect(within(history).getByText("Planned 30 m³ · Spread 27 m³ · 22 Sept 2026")).toBeTruthy();
    expect(within(history).getByText(/Planned 30 m³ · cancelled 21 Sept 2026/)).toBeTruthy();
    expect(within(history).getByText("Spread")).toBeTruthy();
    expect(within(history).getByText("Cancelled")).toBeTruthy();
  });

  it("an edit that succeeds shows the server's updated plan (G)", async () => {
    renderPlan([store()], [rec()]);
    edit.mockImplementation(async (input) => {
      server.records = [rec({ volumeM3: Number(input.volumeM3) })];
      return { status: "saved", value: server.records[0] };
    });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = screen.getByRole("dialog", { name: "Edit spreading plan" });
    fireEvent.change(within(dialog).getByLabelText("Planned volume (m³)"), { target: { value: "45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await screen.findByText("Spreading plan updated.");
    expect(edit).toHaveBeenCalledWith({ allocationId: "a1", fieldId: "f1", housingId: "h1", volumeM3: "45" });
    expect(within(plannedSection()).getByText("45 m³")).toBeTruthy();
    expect(summary()).toEqual({ current: "100 m³", reserved: "45 m³", unallocated: "55 m³" });
  });

  it("an over-capacity edit shows a farmer-readable error, keeps the input and changes nothing (H, T)", async () => {
    renderPlan([store()], [rec()]);
    edit.mockResolvedValue({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = screen.getByRole("dialog", { name: "Edit spreading plan" });
    const volume = within(dialog).getByLabelText("Planned volume (m³)") as HTMLInputElement;
    fireEvent.change(volume, { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("There isn't enough unallocated slurry in this store for that change.");
    expect(volume.value).toBe("500");
    expect(volume.getAttribute("aria-describedby")).toBe(alert.id);
    expect(document.body.textContent).not.toMatch(/VOLUME_EXCEEDS_AVAILABLE/);
    expect(summary().reserved).toBe("30 m³");
  });

  it("moving a plan to another store goes through the canonical edit and shows each store distinctly (U, V)", async () => {
    const lagoon = store({ id: "h2", shedName: "Lagoon", storageCapacityM3: 100, storageFillPct: 40 });
    renderPlan([store(), lagoon], [rec()]);
    edit.mockImplementation(async () => {
      server.records = [rec({ housingId: "h2" })];
      return { status: "saved", value: server.records[0] };
    });
    const stores = screen.getByRole("list", { name: "Slurry stores" });
    expect(within(stores).getByText("Reserved 30 m³ · Unallocated 70 m³")).toBeTruthy();
    expect(within(stores).getByText("Reserved 0 m³ · Unallocated 40 m³")).toBeTruthy();
    expect(within(plannedSection()).getByText("Main tank")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = screen.getByRole("dialog", { name: "Edit spreading plan" });
    fireEvent.change(within(dialog).getByLabelText("Slurry store"), { target: { value: "h2" } });
    expect(within(dialog).getByText("Up to 40 m³ in this store is free for this plan.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await screen.findByText("Spreading plan updated.");
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ housingId: "h2" }));
    expect(within(stores).getByText("Reserved 0 m³ · Unallocated 100 m³")).toBeTruthy();
    expect(within(stores).getByText("Reserved 30 m³ · Unallocated 10 m³")).toBeTruthy();
  });

  it("cancelling asks first, then moves the plan to history and frees its slurry without reducing the tank (I, J)", async () => {
    renderPlan([store()], [rec()]);
    cancel.mockImplementation(async () => {
      server.records = [rec({ status: "cancelled", cancelledAt: "2026-09-27T10:00:00.000Z" })];
      return { status: "saved", value: server.records[0] };
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    const dialog = screen.getByRole("dialog", { name: "Cancel this spreading plan?" });
    expect(within(dialog).getByText(/The slurry will become available for another field/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel plan" }));
    await screen.findByText(/Spreading plan cancelled/);
    expect(cancel).toHaveBeenCalledWith("a1");
    expect(within(plannedSection()).getByText("No spreading is planned right now.")).toBeTruthy();
    expect(screen.getByText("History (1)")).toBeTruthy();
    expect(summary()).toEqual({ current: "100 m³", reserved: "0 m³", unallocated: "100 m³" });
  });

  it.each([
    ["less than (K)", "27", "Planned 30 m³ · Spread 27 m³"],
    ["equal to (L)", "30", "Spread 30 m³"],
    ["more than (M)", "40", "Planned 30 m³ · Spread 40 m³"],
  ])("marking as spread with %s planned records the farmer's actual volume and date", async (_label, actual, historyText) => {
    renderPlan([store()], [rec()]);
    complete.mockImplementation(async (input) => {
      server.records = [rec({ status: "completed", actualVolumeM3: Number(input.actualVolumeM3), actualSpreadDate: input.actualSpreadDate, storeReconciliation: "withdrawn_after_observation", storeObservationSeq: 1 })];
      server.housing = [store({ storeWithdrawnSinceObservationM3: Number(input.actualVolumeM3) })];
      return { status: "saved", value: server.records[0] };
    });
    fireEvent.click(screen.getByRole("button", { name: /mark as spread/i }));
    const dialog = screen.getByRole("dialog", { name: "Mark as spread" });
    expect(within(dialog).getByText("30 m³")).toBeTruthy();
    const actualInput = within(dialog).getByLabelText("Actual volume spread (m³)") as HTMLInputElement;
    // The planned amount is only a starting value — nothing saved yet.
    expect(actualInput.value).toBe("30");
    expect(complete).not.toHaveBeenCalled();
    fireEvent.change(actualInput, { target: { value: actual } });
    fireEvent.change(within(dialog).getByLabelText("Spread date"), { target: { value: "2026-09-25" } });
    // Unambiguous date: no tank-reading question (Q).
    expect(within(dialog).queryByText(/included in your latest tank reading/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    await screen.findByText("Back Field recorded as spread.");
    expect(complete).toHaveBeenCalledWith({ allocationId: "a1", actualVolumeM3: actual, actualSpreadDate: "2026-09-25" });
    expect(screen.getByText(`${historyText} · 25 Sept 2026`)).toBeTruthy();
    expect(summary().current).toBe(`${100 - Number(actual)} m³`);
  });

  it("a refused over-capacity completion stays planned and says why in plain language (N, T)", async () => {
    renderPlan([store()], [rec()]);
    complete.mockResolvedValue({ status: "rejected", issues: ["VOLUME_EXCEEDS_AVAILABLE"] });
    fireEvent.click(screen.getByRole("button", { name: /mark as spread/i }));
    const dialog = screen.getByRole("dialog", { name: "Mark as spread" });
    fireEvent.change(within(dialog).getByLabelText("Actual volume spread (m³)"), { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Today" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toMatch(/There isn't enough slurry left in this store/);
    expect(alert.textContent).not.toMatch(INTERNAL);
    expect(within(plannedSection()).getByText("Back Field")).toBeTruthy();
    expect(screen.queryByText(/History/)).toBeNull();
  });

  it("a stale completion (already recorded elsewhere) refreshes to the server's state and never duplicates (O)", async () => {
    renderPlan([store()], [rec()]);
    complete.mockImplementation(async () => {
      server.records = [rec({ status: "completed", actualVolumeM3: 30, actualSpreadDate: "2026-09-24" })];
      server.housing = [store({ storeWithdrawnSinceObservationM3: 30 })];
      return { status: "rejected", issues: ["ALREADY_COMPLETED"] };
    });
    fireEvent.click(screen.getByRole("button", { name: /mark as spread/i }));
    const dialog = screen.getByRole("dialog", { name: "Mark as spread" });
    fireEvent.change(within(dialog).getByLabelText("Spread date"), { target: { value: "2026-09-25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/already changed/);
    expect(status.textContent).not.toMatch(INTERNAL);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /mark as spread/i })).toBeNull();
    expect(screen.getByText("History (1)")).toBeTruthy();
    expect(summary().current).toBe("70 m³");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("asks the plain-language tank-reading question only when the server needs it, and sends the mapped answer (P)", async () => {
    renderPlan([store()], [rec()]);
    complete.mockResolvedValueOnce({ status: "rejected", issues: ["RECONCILIATION_REQUIRED"] }).mockImplementationOnce(async (input) => {
      server.records = [rec({ status: "completed", actualVolumeM3: 30, actualSpreadDate: input.actualSpreadDate, storeReconciliation: "reflected_in_observation" })];
      return { status: "saved", value: server.records[0] };
    });
    fireEvent.click(screen.getByRole("button", { name: /mark as spread/i }));
    const dialog = screen.getByRole("dialog", { name: "Mark as spread" });
    fireEvent.change(within(dialog).getByLabelText("Spread date"), { target: { value: "2026-09-20" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    await within(dialog).findByText("Was this spreading already included in your latest tank reading?");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(dialog.textContent).not.toMatch(/withdrawn_after_observation|reflected_in_observation|RECONCILIATION/);
    fireEvent.click(within(dialog).getByLabelText("Yes, the tank reading was taken after this slurry was spread."));
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    await screen.findByText("Back Field recorded as spread.");
    expect(complete).toHaveBeenLastCalledWith({ allocationId: "a1", actualVolumeM3: "30", actualSpreadDate: "2026-09-20", storeReconciliation: "reflected_in_observation" });
  });

  it("an unexpected failure shows a generic, recoverable message and keeps the farmer's input (T)", async () => {
    renderPlan([store()], [rec()]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    complete.mockRejectedValue(new Error('duplicate key value violates unique constraint "slurry_allocations_pkey"'));
    fireEvent.click(screen.getByRole("button", { name: /mark as spread/i }));
    const dialog = screen.getByRole("dialog", { name: "Mark as spread" });
    fireEvent.change(within(dialog).getByLabelText("Actual volume spread (m³)"), { target: { value: "28" } });
    fireEvent.change(within(dialog).getByLabelText("Spread date"), { target: { value: "2026-09-25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record as spread" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Something went wrong and nothing was saved. Please try again.");
    expect(document.body.textContent).not.toMatch(/duplicate key|slurry_allocations_pkey/);
    expect((within(dialog).getByLabelText("Actual volume spread (m³)") as HTMLInputElement).value).toBe("28");
    expect(within(plannedSection()).getByText("Back Field")).toBeTruthy();
  });

  it("uses a single-column, card-based layout that fits a 390 px phone (X)", () => {
    const { container } = renderPlan([store()], [rec()]);
    expect(container.querySelector("table")).toBeNull();
    expect(container.firstElementChild?.className).toMatch(/min-w-0/);
    for (const name of [/mark as spread/i, /^edit$/i, /^cancel$/i]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/min-h-11/);
    }
    // Action buttons stack on a phone and only go side by side from `sm`.
    expect(screen.getByRole("button", { name: /mark as spread/i }).parentElement?.className).toMatch(/grid-cols-1 .*sm:grid-cols-3/);
    expect(container.innerHTML).not.toMatch(/\bw-\[\d{3,}px\]|min-w-\[\d{3,}px\]/);
  });
});

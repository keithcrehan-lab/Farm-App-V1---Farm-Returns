import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/actions/regulatory-evidence", () => ({ recordNeatSlurryDeclarationAction: vi.fn(), recordSpreadableAreaDeclarationAction: vi.fn() }));

import { recordNeatSlurryDeclarationAction } from "@/app/actions/regulatory-evidence";
import { FarmProvider, useHousingList } from "@/store/farm-store";
import { mockFarm } from "@/data/mock-farm";
import type { Housing } from "@/domain/types";
import type { NeatSlurryEvidenceRecord } from "@/domain/regulatory-evidence-records";
import { dublinDate } from "@/domain/slurry-allocation-lifecycle";
import { NeatSlurryEvidenceCard } from "./NeatSlurryEvidenceCard";

/**
 * Campaign B minimal evidence UX — regulatory neat cattle slurry capture on
 * the Housing & Slurry screen. Only the server action is mocked; the store,
 * canonical context and selectors run for real.
 */
const recordNeat = vi.mocked(recordNeatSlurryDeclarationAction);
const INTERNAL = /[A-Z]{2,}_[A-Z_]+|farmer_adjusted|unavailable\b|not_established/;
const TODAY = dublinDate(new Date());

// Fill reading well before today, so a figure dated today is comparable.
const STORE = {
  id: "h1",
  farmId: mockFarm.id,
  shedName: "Main tank",
  shedType: "slatted",
  linkedGroupIds: [],
  housingPeriod: { start: "2025-11-01", end: "2026-03-31" },
  slurryEstimate: {
    volumeM3: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated", source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  },
  storageCapacityM3: 200,
  storageFillPct: 50,
  storageFillStatus: "farmer_recorded",
  storageFillRecordedAt: "2026-01-20T09:00:00.000Z",
  storeObservationSeq: 1,
  storeObservedAt: "2026-01-20T09:00:00.000Z",
} as Housing;

const neat = (patch: Partial<NeatSlurryEvidenceRecord> = {}): NeatSlurryEvidenceRecord => ({
  id: "n1",
  farmId: mockFarm.id,
  housingId: "h1",
  status: "farmer_adjusted",
  neatVolumeM3: 60,
  effectiveDate: "2026-02-01",
  source: "Farmer declaration on the housing screen",
  recordedAt: "2026-02-01T10:00:00Z",
  ...patch,
});

function Probe() {
  const housing = useHousingList();
  return <output data-testid="fill">{`${housing[0].storageCapacityM3}/${housing[0].storageFillPct}/${housing[0].storageFillStatus}`}</output>;
}

function renderCard(records: NeatSlurryEvidenceRecord[] = [], housing: Housing = STORE) {
  return render(
    <FarmProvider
      remote
      initialState={{
        farm: mockFarm,
        fields: [],
        livestockGroups: [],
        housing: [housing],
        slurryAllocations: [],
        slurryCompositionRecords: [],
        slurryAllocationRecords: [],
        neatSlurryEvidenceRecords: records,
      }}
    >
      <NeatSlurryEvidenceCard housingId="h1" />
      <Probe />
    </FarmProvider>,
  );
}

const card = () => screen.getByRole("region", { name: "Neat cattle slurry for nitrates rules" });

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("NeatSlurryEvidenceCard", () => {
  it("A/B: no evidence stays not recorded; the form never prefills from the tank's physical volume", async () => {
    renderCard();
    expect(within(card()).getAllByText("Not recorded").length).toBeGreaterThan(0);
    // Physical volume is shown, separately labelled.
    expect(within(card()).getByText("Total slurry in the tank (a different figure)")).toBeTruthy();
    expect(within(card()).getByText("100 m³")).toBeTruthy();
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    for (const radio of within(dialog).getAllByRole("radio")) expect((radio as HTMLInputElement).checked).toBe(false);
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    expect((within(dialog).getByLabelText("Neat cattle slurry (m³)") as HTMLInputElement).value).toBe("");
    // Saving a blank figure is refused locally — never read as zero.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    expect(await within(dialog).findByText("Enter zero or a positive volume.")).toBeTruthy();
    expect(recordNeat).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("C/D/X: a saved figure is shown from the canonical context, earlier records kept, and the tank's physical volume untouched", async () => {
    recordNeat.mockResolvedValue({ status: "saved", record: neat({ id: "n2", neatVolumeM3: 80, effectiveDate: TODAY, recordedAt: new Date().toISOString() }) });
    renderCard([neat()]);
    expect(within(card()).getByText("60 m³")).toBeTruthy();
    fireEvent.click(within(card()).getByRole("button", { name: "Update neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    fireEvent.change(within(dialog).getByLabelText("Neat cattle slurry (m³)"), { target: { value: "80" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    await waitFor(() => expect(recordNeat).toHaveBeenCalledWith({ housingId: "h1", neatVolumeM3: 80, effectiveDate: TODAY }));
    expect(await within(card()).findByText("80 m³")).toBeTruthy();
    expect(within(card()).getByText("In use for nitrates calculations.")).toBeTruthy();
    expect(within(card()).getByText("Saved. Earlier figures stay on record.")).toBeTruthy();
    expect(screen.getByTestId("fill").textContent).toBe("200/50/farmer_recorded");
    expect(within(card()).getByText("100 m³")).toBeTruthy();
  });

  it("E: an explicit zero is saved and shown as a known zero", async () => {
    recordNeat.mockResolvedValue({ status: "saved", record: neat({ neatVolumeM3: 0, effectiveDate: TODAY }) });
    renderCard();
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    fireEvent.change(within(dialog).getByLabelText("Neat cattle slurry (m³)"), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    await waitFor(() => expect(recordNeat).toHaveBeenCalledWith(expect.objectContaining({ neatVolumeM3: 0 })));
    expect(await within(card()).findByText("0 m³")).toBeTruthy();
    expect(screen.getByText("In use")).toBeTruthy();
  });

  it("F: 'no figure' is sent without a volume and shown as no figure — not zero", async () => {
    recordNeat.mockResolvedValue({ status: "saved", record: neat({ status: "unavailable", neatVolumeM3: undefined, effectiveDate: TODAY }) });
    renderCard();
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("No, I don't have a figure I can stand over"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    await waitFor(() => expect(recordNeat).toHaveBeenCalledWith({ housingId: "h1", effectiveDate: TODAY }));
    expect((await within(card()).findAllByText("No figure")).length).toBeGreaterThan(0);
    expect(within(card()).queryByText("0 m³")).toBeNull();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("G/J: a figure dated before the latest fill reading stays on record but is shown as not in use, in plain words", () => {
    renderCard([neat({ effectiveDate: "2026-01-10" })]);
    expect(within(card()).getByText("60 m³")).toBeTruthy();
    expect(screen.getByText("Not in use")).toBeTruthy();
    expect(within(card()).getByText(/Kept on record but not in use/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("G: a figure saved with today's default date, on the same day as the latest fill reading, is shown as not in use — never as in use", async () => {
    const now = new Date().toISOString();
    recordNeat.mockResolvedValue({ status: "saved", record: neat({ id: "n2", neatVolumeM3: 80, effectiveDate: TODAY, recordedAt: now }) });
    renderCard([], { ...STORE, storageFillRecordedAt: now, storeObservedAt: now });
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("True as of") as HTMLInputElement).value).toBe(TODAY);
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    fireEvent.change(within(dialog).getByLabelText("Neat cattle slurry (m³)"), { target: { value: "80" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    expect(await within(card()).findByText("80 m³")).toBeTruthy();
    expect(screen.getByText("Not in use")).toBeTruthy();
    expect(within(card()).getByText(/Kept on record but not in use/)).toBeTruthy();
    expect(screen.queryByText("In use")).toBeNull();
    expect(within(card()).queryByText("In use for nitrates calculations.")).toBeNull();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("H: a refused or unavailable save shows no value and says nothing was saved", async () => {
    recordNeat.mockResolvedValueOnce({ status: "not_available" });
    renderCard();
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    fireEvent.change(within(dialog).getByLabelText("Neat cattle slurry (m³)"), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    expect(await within(dialog).findByText(/Nothing was saved/)).toBeTruthy();
    expect(within(card()).queryByText("40 m³")).toBeNull();

    recordNeat.mockRejectedValueOnce(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    expect(await within(dialog).findByText("Something went wrong and nothing was saved. Please try again.")).toBeTruthy();
    expect(within(card()).queryByText("40 m³")).toBeNull();
    // The farmer's input is kept for a retry.
    expect((within(dialog).getByLabelText("Neat cattle slurry (m³)") as HTMLInputElement).value).toBe("40");
  });

  it("I: a store the server refuses (not on this farm) is reported in plain words", async () => {
    recordNeat.mockResolvedValue({ status: "rejected", errors: [{ field: "housingId", message: "Store not found on this farm" }] });
    renderCard();
    fireEvent.click(within(card()).getByRole("button", { name: "Record neat slurry figure" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("Yes, I have a figure"));
    fireEvent.change(within(dialog).getByLabelText("Neat cattle slurry (m³)"), { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save figure" }));
    expect(await within(dialog).findByText("Store not found on this farm.")).toBeTruthy();
  });
});

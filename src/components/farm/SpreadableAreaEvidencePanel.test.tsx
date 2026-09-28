import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/app/actions/regulatory-evidence", () => ({
  loadRegulatoryEvidenceStateAction: vi.fn(),
  recordNeatSlurryDeclarationAction: vi.fn(),
  recordSpreadableAreaDeclarationAction: vi.fn(),
}));

import { loadRegulatoryEvidenceStateAction, recordSpreadableAreaDeclarationAction } from "@/app/actions/regulatory-evidence";
import { FarmProvider, useFields } from "@/store/farm-store";
import { mockFarm } from "@/data/mock-farm";
import type { Field } from "@/domain/types";
import type { SpreadableAreaRecord } from "@/domain/regulatory-evidence-records";
import { dublinDate } from "@/domain/slurry-allocation-lifecycle";
import { SpreadableAreaEvidencePanel } from "./SpreadableAreaEvidencePanel";
import { EVIDENCE_STALE_COPY } from "./NeatSlurryEvidenceCard";

/**
 * Campaign B minimal evidence UX — spreadable-area capture on the field's
 * Constraints tab. Only the server action is mocked (remote); the demo-farm
 * path runs its own validation.
 */
const recordArea = vi.mocked(recordSpreadableAreaDeclarationAction);
const INTERNAL = /[A-Z]{2,}_[A-Z_]+|farmer_adjusted|not_established/;
const TODAY = dublinDate(new Date());

const FIELD = {
  id: "f1",
  farmId: mockFarm.id,
  name: "Back Field",
  areaHa: 4,
  fertility: {
    pIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2026-03-01" },
    kIndex: { value: 3, status: "verified", source: "Lab soil test", sourceDate: "2026-03-01" },
  },
  history: [],
} as unknown as Field;

const area = (patch: Partial<SpreadableAreaRecord> = {}): SpreadableAreaRecord => ({
  id: "a1",
  farmId: mockFarm.id,
  fieldId: "f1",
  status: "farmer_adjusted",
  spreadableAreaHa: 3.5,
  grossAreaHaAtRecord: 4,
  effectiveDate: "2026-09-01",
  source: "Farmer declaration on the field's constraints",
  recordedAt: "2026-09-01T10:00:00Z",
  ...patch,
});

function Probe() {
  return <output data-testid="gross">{useFields()[0].areaHa}</output>;
}

function renderPanel(records: SpreadableAreaRecord[] = [], field: Field = FIELD, remote = true) {
  // Unless a test says otherwise, the post-save re-read returns the server
  // state: the initial records plus the last one the action saved.
  if (!vi.mocked(loadRegulatoryEvidenceStateAction).getMockImplementation()) {
    vi.mocked(loadRegulatoryEvidenceStateAction).mockImplementation(async () => {
      const last = await recordArea.mock.results.at(-1)?.value;
      return { housing: [], fields: [field], neatSlurryEvidenceRecords: [], spreadableAreaRecords: [...records, ...(last?.status === "saved" ? [last.record] : [])] };
    });
  }
  return render(
    <FarmProvider
      remote={remote}
      initialState={{
        farm: mockFarm,
        fields: [field],
        livestockGroups: [],
        housing: [],
        slurryAllocations: [],
        slurryCompositionRecords: [],
        slurryAllocationRecords: [],
        spreadableAreaRecords: records,
      }}
    >
      <SpreadableAreaEvidencePanel field={field} />
      <Probe />
    </FarmProvider>,
  );
}

const panel = () => screen.getByRole("region", { name: "Spreadable area" });

async function submitArea(value: string) {
  fireEvent.click(within(panel()).getByRole("button", { name: /spreadable area/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Spreadable area (ha)"), { target: { value } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save area" }));
  return dialog;
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("SpreadableAreaEvidencePanel", () => {
  it("K/M: no evidence is not confirmed; the gross size is shown as a separate figure and never prefills the form", async () => {
    renderPanel();
    expect(within(panel()).getAllByText("Not confirmed").length).toBeGreaterThan(0);
    expect(within(panel()).getByText("Whole field size (a different figure)")).toBeTruthy();
    expect(within(panel()).getByText("4 ha")).toBeTruthy();
    fireEvent.click(within(panel()).getByRole("button", { name: "Confirm spreadable area" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Spreadable area (ha)") as HTMLInputElement).value).toBe("");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save area" }));
    expect(await within(dialog).findByText("Enter zero or a positive area.")).toBeTruthy();
    expect(recordArea).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("L/S/Y: a declared area persists and is shown from the canonical context; the field's gross area is untouched", async () => {
    recordArea.mockResolvedValue({ status: "saved", record: area({ id: "a2", spreadableAreaHa: 3.25, effectiveDate: TODAY, recordedAt: new Date().toISOString() }) });
    renderPanel([area()]);
    expect(within(panel()).getByText("3.5 ha")).toBeTruthy();
    await submitArea("3.25");
    await waitFor(() => expect(recordArea).toHaveBeenCalledWith({ fieldId: "f1", spreadableAreaHa: 3.25, effectiveDate: TODAY }));
    expect(await within(panel()).findByText("3.25 ha")).toBeTruthy();
    expect(within(panel()).getByText("In use for slurry planning.")).toBeTruthy();
    expect(within(panel()).getByText("Saved. Earlier areas stay on record.")).toBeTruthy();
    expect(screen.getByTestId("gross").textContent).toBe("4");
  });

  it("N: an explicit zero is a known zero", async () => {
    recordArea.mockResolvedValue({ status: "saved", record: area({ spreadableAreaHa: 0, effectiveDate: TODAY }) });
    renderPanel();
    await submitArea("0");
    await waitFor(() => expect(recordArea).toHaveBeenCalledWith(expect.objectContaining({ spreadableAreaHa: 0 })));
    expect(await within(panel()).findByText("0 ha")).toBeTruthy();
    expect(within(panel()).getByText("In use")).toBeTruthy();
  });

  it("O: more than the field's size is refused, never clamped (remote refusal)", async () => {
    recordArea.mockResolvedValue({ status: "rejected", errors: [{ field: "spreadableAreaHa", message: "The spreadable area cannot be more than the field's area" }] });
    renderPanel();
    const dialog = await submitArea("5");
    expect(await within(dialog).findByText("The spreadable area cannot be more than the field's area.")).toBeTruthy();
    expect(within(panel()).queryByText("4 ha", { selector: "dd" })).toBeTruthy();
    expect(within(panel()).getAllByText("Not confirmed").length).toBeGreaterThan(0);
  });

  it("O: the demo farm applies the same refusal locally", async () => {
    renderPanel([], FIELD, false);
    const dialog = await submitArea("4.5");
    expect(await within(dialog).findByText("The spreadable area cannot be more than the field's area.")).toBeTruthy();
    expect(within(panel()).queryByText("4.5 ha")).toBeNull();
  });

  it("P: a recorded area now above the field's size stays visibly unresolved", () => {
    renderPanel([area({ spreadableAreaHa: 3.5 })], { ...FIELD, areaHa: 3 } as Field);
    expect(within(panel()).getByText("Needs checking")).toBeTruthy();
    expect(within(panel()).getByText(/more than the field's current size/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(INTERNAL);
  });

  it("P: tied contradictory areas show no single value", () => {
    renderPanel([area(), area({ id: "a2", spreadableAreaHa: 2 })]);
    expect(within(panel()).getByText("Needs checking")).toBeTruthy();
    expect(within(panel()).getAllByText("Not confirmed").length).toBeGreaterThan(0);
  });

  it("a saved area whose re-read fails is not judged against stale field state — nothing is shown as in use until a retry succeeds", async () => {
    const saved = area({ id: "a2", spreadableAreaHa: 3.25, effectiveDate: TODAY, recordedAt: new Date().toISOString() });
    recordArea.mockResolvedValue({ status: "saved", record: saved });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadRegulatoryEvidenceStateAction).mockRejectedValueOnce(new Error("network"));
    renderPanel([area()]);
    expect(within(panel()).getByText("In use")).toBeTruthy();
    await submitArea("3.25");
    expect(await within(panel()).findByText(EVIDENCE_STALE_COPY)).toBeTruthy();
    expect(within(panel()).queryByText("3.25 ha")).toBeNull();
    expect(within(panel()).queryByText("In use")).toBeNull();
    expect(within(panel()).queryByText("In use for slurry planning.")).toBeNull();
    expect(document.body.textContent).not.toMatch(INTERNAL);

    // Retry reads the server: another session shrank the field below the saved area.
    vi.mocked(loadRegulatoryEvidenceStateAction).mockResolvedValueOnce({
      housing: [],
      fields: [{ ...FIELD, areaHa: 3 } as Field],
      neatSlurryEvidenceRecords: [],
      spreadableAreaRecords: [area(), saved],
    });
    fireEvent.click(within(panel()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(panel()).queryByText(EVIDENCE_STALE_COPY)).toBeNull());
    expect(within(panel()).getByText("Needs checking")).toBeTruthy();
    expect(within(panel()).queryByText("In use")).toBeNull();
    expect(screen.getByTestId("gross").textContent).toBe("3");
  });

  it("Q: a failed write shows no value and keeps the input", async () => {
    recordArea.mockResolvedValueOnce({ status: "not_available" });
    renderPanel();
    const dialog = await submitArea("2");
    expect(await within(dialog).findByText(/Nothing was saved/)).toBeTruthy();
    expect(within(panel()).queryByText("2 ha")).toBeNull();
    expect((within(dialog).getByLabelText("Spreadable area (ha)") as HTMLInputElement).value).toBe("2");
  });
});

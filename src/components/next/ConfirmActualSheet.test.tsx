import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/job-sessions", () => ({
  confirmJobSessionActualAction: vi.fn(),
}));
vi.mock("@/lib/offline/job-session-sync", () => ({
  enqueueJobActualConfirmation: vi.fn(),
}));

import { confirmJobSessionActualAction } from "@/app/actions/job-sessions";
import { enqueueJobActualConfirmation } from "@/lib/offline/job-session-sync";
import { ConfirmActualSheet } from "./ConfirmActualSheet";
import type { JobSessionRecord } from "@/lib/farm-data/mappers";
import type { Field } from "@/domain/types";

const mockConfirm = vi.mocked(confirmJobSessionActualAction);
const mockEnqueue = vi.mocked(enqueueJobActualConfirmation);

const FIELD: Field = {
  id: "field-7",
  farmId: "farm-1",
  name: "Field 7",
  areaHa: 6.8,
  centroid: [-8.4, 51.9],
  fertility: {},
  history: [],
};

function session(overrides: Partial<JobSessionRecord> = {}): JobSessionRecord {
  return {
    id: "session-1",
    farmId: "farm-1",
    decisionId: "decision-1",
    activityType: "fertiliser_spreading",
    origin: "prompt",
    status: "completed_estimated",
    primaryFieldId: "field-7",
    fieldSegments: [],
    activeIntervals: [{ startedAt: "2026-09-02T09:00:00Z", endedAt: "2026-09-02T10:00:00Z" }],
    interruptionGaps: [],
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
    ...overrides,
  };
}

function renderSheet(props: Partial<React.ComponentProps<typeof ConfirmActualSheet>> = {}) {
  const onConfirmed = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ConfirmActualSheet
      open
      onClose={onClose}
      session={session()}
      farmId="farm-1"
      fields={[FIELD]}
      canRecord
      onConfirmed={onConfirmed}
      {...props}
    />,
  );
  return { ...utils, onConfirmed, onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
});

describe("ConfirmActualSheet — observed context", () => {
  it("shows the real field and duration Farm Return observed", () => {
    renderSheet();
    expect(screen.getByText(/Field 7/)).toBeTruthy();
    expect(screen.getByText(/1h 00m/)).toBeTruthy();
  });

  it("shows the field's own real mapped area before the farmer confirms a whole-field completion against it — numeric-truthfulness audit finding: a 'whole' completion's areaHa is always this real mapped figure, but the farmer previously had no visibility into it before submitting", () => {
    renderSheet();
    expect(screen.getByText(/6\.8 ha, mapped/)).toBeTruthy();
  });

  it("shows no mapped-area text at all for an activity with no field (livestock_work) — never fabricates a figure when none exists", () => {
    renderSheet({ session: session({ activityType: "livestock_work", primaryFieldId: undefined }) });
    expect(screen.queryByText(/mapped/)).toBeNull();
  });
});

// Fertiliser Vertical campaign, item 12 — Confirm Actual prefill from a
// real linked plan.
describe("ConfirmActualSheet — linked plan prefill", () => {
  it("prefills product/quantity from a real linked plan, and discloses what was planned", () => {
    renderSheet({
      linkedPlan: { decisionId: "decision-plan-1", fieldId: "field-7", recommendedProducts: [], plannedProduct: "18-6-12", plannedQuantityKg: 240 },
    });
    expect((screen.getByPlaceholderText(/product/i) as HTMLInputElement).value).toBe("18-6-12");
    expect((screen.getByPlaceholderText(/^quantity$/i) as HTMLInputElement).value).toBe("240");
    expect(screen.getByText(/Planned: 240 kg 18-6-12/)).toBeTruthy();
  });

  it("shows no 'Planned' line and prefills nothing when there is genuinely no linked plan", () => {
    renderSheet({ linkedPlan: null });
    expect(screen.queryByText(/Planned:/)).toBeNull();
    expect((screen.getByPlaceholderText(/product/i) as HTMLInputElement).value).toBe("");
  });

  // Codex audit HIGH (round 20): `linkedPlan === undefined` used to be
  // silently identical to "genuinely nothing to prefill from" — the
  // form was fully interactive with no indication a real plan lookup
  // was still pending or had failed. Neither state blocks submission
  // (the farmer must always be able to record a real, finished job),
  // but both must now render their own honest, distinct disclosure.
  it("discloses that the linked plan is still being checked, without blocking the fields, while linkedPlanLoading is true", () => {
    renderSheet({ linkedPlan: undefined, linkedPlanLoading: true });
    expect(screen.getByText(/checking this job's planned product\/quantity/i)).toBeTruthy();
    const productInput = screen.getByPlaceholderText(/product/i) as HTMLInputElement;
    expect(productInput.disabled).toBe(false);
  });

  it("discloses a genuine linked-plan lookup failure honestly, without blocking the fields, when linkedPlanCheckFailed is true", () => {
    renderSheet({ linkedPlan: undefined, linkedPlanCheckFailed: true });
    expect(screen.getByText(/couldn't load this job's planned product\/quantity/i)).toBeTruthy();
    const productInput = screen.getByPlaceholderText(/product/i) as HTMLInputElement;
    expect(productInput.disabled).toBe(false);
  });

  it("never overwrites a farmer's own edit once the linked plan prop changes after they've started typing", () => {
    const { rerender } = renderSheet({ linkedPlan: undefined, session: session() });
    fireEvent.change(screen.getByPlaceholderText(/product/i), { target: { value: "Protected Urea" } });
    rerender(
      <ConfirmActualSheet
        open
        onClose={vi.fn()}
        session={session()}
        farmId="farm-1"
        fields={[FIELD]}
        canRecord
        onConfirmed={vi.fn()}
        linkedPlan={{ decisionId: "decision-plan-1", fieldId: "field-7", recommendedProducts: [], plannedProduct: "18-6-12", plannedQuantityKg: 240 }}
      />,
    );
    // The farmer's own already-typed value survives — the real plan
    // arriving late must never clobber it.
    expect((screen.getByPlaceholderText(/product/i) as HTMLInputElement).value).toBe("Protected Urea");
  });
});

describe("ConfirmActualSheet — per-activity fields, not a fixed generic form", () => {
  it("shows product/quantity for fertiliser_spreading", () => {
    renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });
    expect(screen.getByPlaceholderText(/product/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/bales/i)).toBeNull();
  });

  it("shows quantity/method for slurry_spreading, not fertiliser's product field", () => {
    renderSheet({ session: session({ activityType: "slurry_spreading" }) });
    expect(screen.queryByPlaceholderText(/product/i)).toBeNull();
    expect(screen.getByText(/application method/i)).toBeTruthy();
  });

  it("shows bales/tonnes for silage", () => {
    renderSheet({ session: session({ activityType: "silage" }) });
    expect(screen.getByPlaceholderText(/bales/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/tonnes/i)).toBeTruthy();
  });

  it("shows a lightweight observation field for field_inspection, no quantity fields at all", () => {
    renderSheet({ session: session({ activityType: "field_inspection" }) });
    expect(screen.getByPlaceholderText(/what did you observe/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/quantity/i)).toBeNull();
  });

  it("shows group/action for livestock_work, with no field-area context required", () => {
    renderSheet({ session: session({ activityType: "livestock_work", primaryFieldId: undefined }) });
    expect(screen.getByPlaceholderText(/livestock group/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/action/i)).toBeTruthy();
  });
});

describe("ConfirmActualSheet — completion type", () => {
  it("hides quantity fields for did_not_happen", () => {
    renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });
    fireEvent.click(screen.getByText("Did not happen"));
    expect(screen.queryByPlaceholderText(/product/i)).toBeNull();
  });
});

describe("ConfirmActualSheet — demo mode", () => {
  it("shows an honest message and never calls the server action", async () => {
    renderSheet({ canRecord: false });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));
    await waitFor(() => expect(screen.getByText(/demo mode/i)).toBeTruthy());
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

describe("ConfirmActualSheet — online submission", () => {
  it("calls confirmJobSessionActualAction with the real field/activity/completion and navigates on success", async () => {
    mockConfirm.mockResolvedValue({ actual: { id: "actual-1" } as never });
    const { onConfirmed } = renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });

    fireEvent.change(screen.getByPlaceholderText(/product/i), { target: { value: "CAN" } });
    fireEvent.change(screen.getByPlaceholderText(/^quantity$/i), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    // No `fields` key at all -- Codex audit HIGH (round 1,
    // docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round1.md):
    // the online action no longer accepts client-supplied field areas;
    // it re-derives them itself, server-side, from real farm data.
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        jobSessionId: "session-1",
        activityType: "fertiliser_spreading",
        raw: expect.objectContaining({ completionType: "whole", product: "CAN", quantity: 250 }),
      }),
    );
    expect(mockConfirm.mock.calls[0][0]).not.toHaveProperty("fields");
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });

  it("retries once when the first attempt leaves job_sessions status unconfirmed, then succeeds (Codex audit HIGH, round 1)", async () => {
    mockConfirm
      .mockResolvedValueOnce({ actual: { id: "actual-1" } as never, sessionStatusUpdateError: "network lost" })
      .mockResolvedValueOnce({ actual: { id: "actual-1" } as never });
    const { onConfirmed } = renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });

    fireEvent.change(screen.getByPlaceholderText(/product/i), { target: { value: "CAN" } });
    fireEvent.change(screen.getByPlaceholderText(/^quantity$/i), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });

  it("shows an honest, actionable error (not a silent success) when the status still can't be confirmed after a retry", async () => {
    mockConfirm.mockResolvedValue({ actual: { id: "actual-1" } as never, sessionStatusUpdateError: "network lost" });
    const { onConfirmed } = renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });

    fireEvent.change(screen.getByPlaceholderText(/product/i), { target: { value: "CAN" } });
    fireEvent.change(screen.getByPlaceholderText(/^quantity$/i), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/try confirm actual again/i)).toBeTruthy());
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});

describe("ConfirmActualSheet — offline submission", () => {
  it("validates locally and queues via the outbox rather than calling the server action", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    const { onConfirmed } = renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });

    fireEvent.change(screen.getByPlaceholderText(/product/i), { target: { value: "CAN" } });
    fireEvent.change(screen.getByPlaceholderText(/^quantity$/i), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));

    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledTimes(1));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(
      "farm-1",
      expect.objectContaining({ jobSessionId: "session-1", completionType: "whole" }),
    );
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  });

  it("shows real validation errors and never queues an incomplete submission", async () => {
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    renderSheet({ session: session({ activityType: "fertiliser_spreading" }) });

    // No product/quantity entered.
    fireEvent.click(screen.getByRole("button", { name: "Confirm Actual" }));

    await waitFor(() => expect(screen.getByText(/product is required/i)).toBeTruthy());
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

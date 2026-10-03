import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/quote-requests", () => ({
  getQuoteRequestPrefillContextAction: vi.fn(),
  getFarmDeliveryDetailsAction: vi.fn(),
  saveFarmDeliveryDetailsAction: vi.fn(),
  submitQuoteRequestAction: vi.fn(),
}));

import {
  getFarmDeliveryDetailsAction,
  getQuoteRequestPrefillContextAction,
  saveFarmDeliveryDetailsAction,
  submitQuoteRequestAction,
} from "@/app/actions/quote-requests";
import { RequestQuoteSheet } from "./RequestQuoteSheet";
import type { QuoteRequestPrefillContext } from "@/orchestration/quotes";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";

const mockGetPrefill = vi.mocked(getQuoteRequestPrefillContextAction);
const mockGetDelivery = vi.mocked(getFarmDeliveryDetailsAction);
const mockSaveDelivery = vi.mocked(saveFarmDeliveryDetailsAction);
const mockSubmit = vi.mocked(submitQuoteRequestAction);

const EMPTY_AGGREGATION = aggregateFarmFertiliserPurchasing([]);

const EMPTY_PREFILL: QuoteRequestPrefillContext = {
  options: [],
  demandContext: {
    demand: [],
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence: 0,
    purchaseRequirementTonnes: [],
    aggregation: EMPTY_AGGREGATION,
    basket: buildFarmFertiliserQuoteBasket(EMPTY_AGGREGATION, { farmId: "farm-1", createdAt: "2026-09-11T08:00:00.000Z" }),
  },
  asOf: "2026-09-11T08:00:00.000Z",
};

beforeEach(() => {
  mockGetPrefill.mockResolvedValue(EMPTY_PREFILL);
  mockGetDelivery.mockResolvedValue(null);
  mockSaveDelivery.mockResolvedValue({
    farmId: "farm-1",
    contactName: "Test Farmer",
    contactPhone: null,
    contactEmail: null,
    addressLine1: "1 Test Road",
    addressLine2: null,
    townOrCity: "Test Town",
    county: "Cork",
    eircode: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderOpenSheet() {
  const onClose = vi.fn();
  const onSubmitted = vi.fn();
  const utils = render(<RequestQuoteSheet open onClose={onClose} onSubmitted={onSubmitted} />);
  await waitFor(() => expect(screen.getByLabelText(/product name/i)).toBeTruthy());
  return { ...utils, onClose, onSubmitted };
}

/** Fills every field `canSubmit` requires except the disclosure
 * checkbox — the one scenario-specific action (checking it, or not) is
 * left to each test. */
function fillRequiredFieldsExceptDisclosure() {
  fireEvent.change(screen.getByLabelText(/^product name$/i), { target: { value: "Protected Urea" } });
  fireEvent.change(screen.getByLabelText(/^quantity$/i), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText(/delivery window start/i), { target: { value: "2026-10-01" } });
  fireEvent.change(screen.getByLabelText(/delivery window end/i), { target: { value: "2026-10-15" } });
  fireEvent.change(screen.getByLabelText(/^contact name$/i), { target: { value: "Test Farmer" } });
  fireEvent.change(screen.getByLabelText(/^address line 1$/i), { target: { value: "1 Test Road" } });
  fireEvent.change(screen.getByLabelText(/^town or city$/i), { target: { value: "Test Town" } });
  fireEvent.change(screen.getByLabelText(/^county$/i), { target: { value: "Cork" } });
}

describe("RequestQuoteSheet", () => {
  // Codex audit HIGH (Checkpoint C round 7) — selecting a real
  // "estimated" product option must prefill the exact real
  // `remainingRequirementKg`, never a UI-rounded figure (rounding a
  // real domain-produced number inside a component is exactly the
  // calculation-in-UI `AGENTS.md` forbids).
  it("prefills the exact, unrounded real remainingRequirementKg when a real estimated product option is selected — never rounds it in the component", async () => {
    mockGetPrefill.mockResolvedValue({
      ...EMPTY_PREFILL,
      options: [{ product: "Protected Urea", remainingRequirementKg: 1234.5678901, mayUnderstate: false }],
    });
    await renderOpenSheet();

    // Codex audit HIGH (Checkpoint C round 8, and its own genuine
    // round-9 focused re-review: an earlier 6dp ceiling still truncated
    // a real value with more than 6 fractional digits) — the option
    // label itself must not approximate the real figure either, even
    // beyond 6 fractional digits.
    expect(screen.getByRole("option", { name: /1,234\.5678901 kg remaining/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/product source/i), { target: { value: "Protected Urea" } });

    expect((screen.getByLabelText(/^quantity$/i) as HTMLInputElement).value).toBe("1234.5678901");
    expect((screen.getByLabelText(/^unit$/i) as HTMLSelectElement).value).toBe("kg");
  });

  it("required acknowledgement: Submit stays disabled until the disclosure checkbox is ticked, even with every other field valid", async () => {
    await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    expect((screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("invalid input: a non-positive quantity keeps Submit disabled even once every other field (including the disclosure) is valid", async () => {
    await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText(/^quantity$/i), { target: { value: "0" } });
    expect((screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("invalid input: a delivery window with end before start keeps Submit disabled", async () => {
    await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText(/delivery window start/i), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText(/delivery window end/i), { target: { value: "2026-10-01" } });
    expect((screen.getByRole("button", { name: /submit request/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("successful submission: submits with the real disclosure version/acceptance timestamp and shows the confirmation (round-2 regression: disclosure now persisted, not only enforced client-side)", async () => {
    mockSubmit.mockResolvedValue({ ok: true, result: { requestId: "req-1", revisionId: "rev-1", revisionNumber: 1 } });
    const before = Date.now();
    const { onSubmitted } = await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [, payload] = mockSubmit.mock.calls[0];
    expect(payload).toMatchObject({
      product: "Protected Urea",
      quantity: 500,
      quantityBasis: "farmer_entered",
      disclosureVersion: "v1",
    });
    // The acceptance timestamp is real (captured at the moment the
    // checkbox was ticked during this test), not a placeholder — must
    // be a valid, parseable ISO datetime no earlier than test start.
    expect(typeof payload.disclosureAcceptedAt).toBe("string");
    expect(new Date(payload.disclosureAcceptedAt).getTime()).toBeGreaterThanOrEqual(before);

    await waitFor(() => expect(screen.getByText(/quote request has been submitted/i)).toBeTruthy());
    expect(screen.getByText(/req-1/)).toBeTruthy();
    // Codex audit MEDIUM (Checkpoint C round 1): onSubmitted must not
    // fire yet — see the dedicated describe block below for the real
    // fix and its own test.
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("failed submission: shows the server's own error message and does not call onSubmitted", async () => {
    mockSubmit.mockResolvedValue({ ok: false, error: "no real farm-wide demand exists for product" });
    const { onSubmitted } = await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/no real farm-wide demand/i);
    expect(onSubmitted).not.toHaveBeenCalled();
    // Still on the form, not the submitted confirmation.
    expect(screen.queryByText(/quote request has been submitted/i)).toBeNull();
  });

  it("failed submission: a thrown network error shows a generic, honest message rather than crashing", async () => {
    mockSubmit.mockRejectedValue(new Error("network exploded"));
    const { onSubmitted } = await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/something went wrong/i);
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint C — the real
// farm-wide lime requirement, shown for the farmer's own reference.
// Codex audit HIGH (Checkpoint C round 1): the first version
// auto-quick-filled the manual fields, then submitted the result as
// `quantityBasis: "farmer_entered"` — a real figure this app computed,
// mislabeled as if the farmer had typed it themselves. Fixed: purely
// informational, never auto-fills anything — a farmer who wants to
// request it types it into the manual fields themselves, at which
// point "farmer_entered" is genuinely, unambiguously true.
describe("RequestQuoteSheet — real lime figure (informational only, never auto-filled)", () => {
  const PREFILL_WITH_LIME: QuoteRequestPrefillContext = {
    ...EMPTY_PREFILL,
    limeOption: { farmTotalTonnes: 12.5, fieldsWithoutLimeEvidence: 1 },
  };

  it("shows no lime banner at all when the farm has no real lime evidence", async () => {
    await renderOpenSheet();
    expect(screen.queryByText(/real total lime requirement/i)).toBeNull();
    expect(screen.queryByText(/real lime total from laboratory results/i)).toBeNull();
  });

  // Codex audit HIGH (Checkpoint C round 5) — a partial total must
  // never be labelled "your farm's real total lime requirement"; the
  // same honest "real but partial" framing `FarmLimeRequirementCard.tsx`
  // (audit F5) already established.
  it("shows the real PARTIAL lime total and evidence-gap disclosure as plain information, honestly labelled as partial — never a selectable option, never auto-filling the form", async () => {
    mockGetPrefill.mockResolvedValue(PREFILL_WITH_LIME);
    await renderOpenSheet();

    expect(screen.queryByText(/real total lime requirement/i)).toBeNull();
    const banner = screen.getByText(/real but partial/i);
    expect(banner.textContent).toContain("12.5 t");
    expect(banner.textContent).toMatch(/1 field has no lime figure on file yet/i);
    // Never a dropdown option, and the manual fields stay genuinely
    // empty until the farmer types into them themselves.
    expect(screen.queryByRole("option", { name: /^Lime/ })).toBeNull();
    expect((screen.getByLabelText(/^quantity$/i) as HTMLInputElement).value).toBe("");
  });

  it("labels a COMPLETE lime total (no fields missing evidence) as the real farm total, without any partial disclosure", async () => {
    mockGetPrefill.mockResolvedValue({ ...EMPTY_PREFILL, limeOption: { farmTotalTonnes: 12.5, fieldsWithoutLimeEvidence: 0 } });
    await renderOpenSheet();

    const banner = screen.getByText(/real total lime requirement/i);
    expect(banner.textContent).toContain("12.5 t");
    expect(screen.queryByText(/real but partial/i)).toBeNull();
  });

  it("a farmer who types the real lime figure in manually submits it honestly as farmer_entered — this app never claims a false provenance for it", async () => {
    mockGetPrefill.mockResolvedValue(PREFILL_WITH_LIME);
    mockSubmit.mockResolvedValue({ ok: true, result: { requestId: "req-lime-1", revisionId: "rev-1", revisionNumber: 1 } });
    await renderOpenSheet();

    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: "Lime" } });
    fireEvent.change(screen.getByLabelText(/^quantity$/i), { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: "tonnes" } });
    fireEvent.change(screen.getByLabelText(/delivery window start/i), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(/delivery window end/i), { target: { value: "2026-10-15" } });
    fireEvent.change(screen.getByLabelText(/^contact name$/i), { target: { value: "Test Farmer" } });
    fireEvent.change(screen.getByLabelText(/^address line 1$/i), { target: { value: "1 Test Road" } });
    fireEvent.change(screen.getByLabelText(/^town or city$/i), { target: { value: "Test Town" } });
    fireEvent.change(screen.getByLabelText(/^county$/i), { target: { value: "Cork" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [, payload] = mockSubmit.mock.calls[0];
    expect(payload).toMatchObject({ product: "Lime", quantity: 12.5, unit: "tonnes", quantityBasis: "farmer_entered" });
  });
});

// Codex audit MEDIUM (Checkpoint C round 1) — the confirmation screen
// (with the real reference) must stay visible until the farmer
// dismisses it themselves; it must never be unmounted by a parent
// closing the sheet the instant submission succeeds.
describe("RequestQuoteSheet — confirmation stays visible until the farmer dismisses it", () => {
  it("does not call onSubmitted immediately on success — only once the farmer clicks Done on the confirmation screen", async () => {
    mockSubmit.mockResolvedValue({ ok: true, result: { requestId: "req-1", revisionId: "rev-1", revisionNumber: 1 } });
    const { onSubmitted } = await renderOpenSheet();
    fillRequiredFieldsExceptDisclosure();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() => expect(screen.getByText(/quote request has been submitted/i)).toBeTruthy());
    // The real reference is genuinely visible at this point.
    expect(screen.getByText(/req-1/)).toBeTruthy();
    expect(onSubmitted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^done$/i }));
    expect(onSubmitted).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan-overview", () => ({ addFertiliserStockRecordAction: vi.fn() }));

import { addFertiliserStockRecordAction } from "@/app/actions/fertiliser-plan-overview";
import { AddFertiliserStockRecordSheet } from "./AddFertiliserStockRecordSheet";

const mockAdd = vi.mocked(addFertiliserStockRecordAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AddFertiliserStockRecordSheet", () => {
  it("prefills the product/source and submits a real dated observation", async () => {
    mockAdd.mockResolvedValue({ status: "ok", record: undefined });
    const onSaved = vi.fn();
    render(
      <AddFertiliserStockRecordSheet open onClose={vi.fn()} onSaved={onSaved} products={["Urea", "18-6-12"]} defaultProduct="Urea" defaultSource="Keith — Farmer entered" />,
    );
    await waitFor(() => expect(screen.getByText(/dated observation/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/quantity in store/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    const call = mockAdd.mock.calls[0][0];
    expect(call.product).toBe("Urea");
    expect(call.quantity).toBe(100);
    expect(call.unit).toBe("kg");
    expect(call.source).toBe("Keith — Farmer entered");
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("shows real validation errors from the server action rather than closing", async () => {
    mockAdd.mockResolvedValue({ status: "validation_error", errors: [{ field: "quantity", message: "Enter a quantity greater than zero" }] });
    const onSaved = vi.fn();
    render(<AddFertiliserStockRecordSheet open onClose={vi.fn()} onSaved={onSaved} products={["Urea"]} defaultSource="Farmer entered" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText(/enter a quantity greater than zero/i)).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("lets a farmer choose 'Other product…' and type a custom name", async () => {
    mockAdd.mockResolvedValue({ status: "ok", record: undefined });
    render(<AddFertiliserStockRecordSheet open onClose={vi.fn()} onSaved={vi.fn()} products={["Urea"]} defaultSource="Farmer entered" />);
    await waitFor(() => expect(screen.getByLabelText(/^product$/i)).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/^product$/i), { target: { value: "__manual__" } });
    fireEvent.change(screen.getByPlaceholderText(/product name/i), { target: { value: "CAN 27%" } });
    fireEvent.change(screen.getByLabelText(/quantity in store/i), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    expect(mockAdd.mock.calls[0][0].product).toBe("CAN 27%");
  });

  it("recognises a differently-cased defaultProduct as the same real catalogue option (Codex audit HIGH, round 1)", async () => {
    mockAdd.mockResolvedValue({ status: "ok", record: undefined });
    render(<AddFertiliserStockRecordSheet open onClose={vi.fn()} onSaved={vi.fn()} products={["Urea"]} defaultProduct=" urea " defaultSource="Farmer entered" />);
    await waitFor(() => expect(screen.getByLabelText(/^product$/i)).toBeTruthy());

    // The canonical "Urea" option must be selected -- never silently
    // fall through to the free-text "Other product..." path.
    expect((screen.getByLabelText(/^product$/i) as HTMLSelectElement).value).toBe("Urea");
    expect(screen.queryByPlaceholderText(/product name/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/quantity in store/i), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(1));
    expect(mockAdd.mock.calls[0][0].product).toBe("Urea");
  });

  it("shows an honest failure message and re-enables Save when the server action itself rejects (Codex audit MEDIUM, round 1)", async () => {
    mockAdd.mockRejectedValueOnce(new Error("network error"));
    const onSaved = vi.fn();
    render(<AddFertiliserStockRecordSheet open onClose={vi.fn()} onSaved={onSaved} products={["Urea"]} defaultSource="Farmer entered" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/quantity in store/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText(/couldn't save this right now/i)).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
